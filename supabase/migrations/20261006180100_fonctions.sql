-- REBOOT facturation : triggers d'inaltérabilité + émission sans trou
create schema if not exists private;
revoke all on schema private from public, anon;

-- ---------- Triggers factures ----------
create or replace function private.factures_garde()
returns trigger language plpgsql set search_path = '' as $$
declare
  flag boolean := coalesce(current_setting('reboot.emission', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.statut <> 'brouillon' or new.numero is not null then
      raise exception 'Une facture se crée en brouillon, sans numéro.' using errcode = 'P0001';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.statut <> 'brouillon' then
      raise exception 'Suppression interdite : une facture émise ne se supprime jamais. Créez un avoir.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.statut = 'brouillon' then
    if (new.statut <> 'brouillon' or new.numero is distinct from old.numero) and not flag then
      raise exception 'Utilisez emettre_facture() pour émettre une facture.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if (to_jsonb(new) - 'statut' - 'payee_le' - 'pdf_path')
     is distinct from (to_jsonb(old) - 'statut' - 'payee_le' - 'pdf_path') then
    raise exception 'Modification interdite : une facture émise ne se modifie jamais. Créez un avoir.' using errcode = 'P0001';
  end if;
  if new.statut is distinct from old.statut then
    if new.statut = 'brouillon' or old.statut = 'annulee'
       or (old.statut = 'payee' and not (new.statut = 'annulee' and flag))
       or (new.statut = 'annulee' and not flag)
       or (old.statut = 'envoyee' and new.statut = 'emise') then
      raise exception 'Changement de statut interdit (% -> %).', old.statut, new.statut using errcode = 'P0001';
    end if;
  end if;
  if new.statut = 'payee' and new.payee_le is null then
    new.payee_le := (now() at time zone 'Europe/Paris')::date;
  end if;
  if new.statut <> 'payee' and new.payee_le is distinct from old.payee_le then
    raise exception 'La date de paiement n''est modifiable qu''avec le statut payée.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger factures_garde_ins before insert on public.factures
  for each row execute function private.factures_garde();
create trigger factures_garde_upd before update on public.factures
  for each row execute function private.factures_garde();
create trigger factures_garde_del before delete on public.factures
  for each row execute function private.factures_garde();

-- ---------- Triggers lignes ----------
create or replace function private.lignes_garde()
returns trigger language plpgsql security definer set search_path = '' as $$
declare fid uuid; st text;
begin
  fid := case when tg_op = 'DELETE' then old.facture_id else new.facture_id end;
  select statut into st from public.factures where id = fid;
  if st is not null and st <> 'brouillon' then
    raise exception 'Les lignes d''une facture émise ne se modifient jamais.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.facture_id is distinct from old.facture_id then
    raise exception 'Une ligne ne change pas de facture.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger lignes_garde before insert or update or delete on public.lignes_facture
  for each row execute function private.lignes_garde();

-- ---------- Émission (privé, droits élevés pour écrire le compteur) ----------
create or replace function private.emettre_facture_impl(p_facture_id uuid)
returns public.factures language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  f public.factures;
  p public.profil;
  c public.clients;
  an int;
  n int;
  v_ht numeric(12,2);
  v_tva numeric(12,2);
  v_emission date := (now() at time zone 'Europe/Paris')::date;
  v_prefix text;
  v_origine public.factures;
begin
  if uid is null then raise exception 'Connexion requise.' using errcode = '28000'; end if;

  select * into f from public.factures where id = p_facture_id and user_id = uid for update;
  if not found then raise exception 'Facture introuvable.' using errcode = 'P0002'; end if;
  if f.statut <> 'brouillon' then raise exception 'Cette facture est déjà émise.' using errcode = 'P0001'; end if;

  select * into p from public.profil where user_id = uid;
  if not found or coalesce(p.nom,'') = '' or coalesce(p.adresse,'') = '' or coalesce(p.siret,'') = ''
     or coalesce(p.tva_intracom,'') = '' or coalesce(p.iban,'') = '' then
    raise exception 'Profil incomplet : nom, adresse, SIRET, n° TVA et IBAN sont obligatoires.' using errcode = 'P0001';
  end if;
  select * into c from public.clients where id = f.client_id and user_id = uid;
  if not found or coalesce(c.adresse,'') = '' then
    raise exception 'Adresse du client obligatoire.' using errcode = 'P0001';
  end if;
  if c.type = 'entreprise' and coalesce(c.siren,'') = '' then
    raise exception 'SIREN du client obligatoire pour une entreprise.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.lignes_facture where facture_id = f.id) then
    raise exception 'Aucune ligne sur la facture.' using errcode = 'P0001';
  end if;

  if f.type = 'avoir' then
    select * into v_origine from public.factures where id = f.facture_origine_id and user_id = uid;
    if not found or v_origine.statut in ('brouillon','annulee') then
      raise exception 'Facture d''origine invalide pour cet avoir.' using errcode = 'P0001';
    end if;
  end if;

  -- Totaux : HT par ligne arrondi, TVA par taux
  select coalesce(sum(round(quantite * prix_unitaire_ht, 2)), 0) into v_ht
    from public.lignes_facture where facture_id = f.id;
  select coalesce(sum(round(g.base * g.taux / 100, 2)), 0) into v_tva from (
    select taux_tva as taux, sum(round(quantite * prix_unitaire_ht, 2)) as base
      from public.lignes_facture where facture_id = f.id group by taux_tva) g;

  -- Numéro sans trou : verrou sur la ligne du compteur
  an := extract(year from v_emission)::int;
  insert into public.compteurs (user_id, annee, type, dernier_numero)
    values (uid, an, f.type, 0) on conflict do nothing;
  select dernier_numero + 1 into n from public.compteurs
    where user_id = uid and annee = an and type = f.type for update;
  update public.compteurs set dernier_numero = n
    where user_id = uid and annee = an and type = f.type;

  v_prefix := case f.type when 'avoir' then 'AV' else 'FA' end;
  perform set_config('reboot.emission', 'on', true);

  update public.factures set
    numero = v_prefix || '-' || an || '-' || lpad(n::text, 4, '0'),
    statut = 'emise',
    date_emission = v_emission,
    date_prestation = coalesce(f.date_prestation, v_emission),
    date_echeance = case when f.type = 'avoir' then v_emission
                         else v_emission + p.delai_paiement_jours end,
    total_ht = v_ht, total_tva = v_tva, total_ttc = v_ht + v_tva,
    vendeur = jsonb_build_object(
      'nom', p.nom, 'prenom', p.prenom, 'mention_ei', p.mention_ei, 'adresse', p.adresse,
      'email', p.email, 'siret', p.siret, 'tva_intracom', p.tva_intracom, 'iban', p.iban,
      'bic', p.bic, 'delai_paiement_jours', p.delai_paiement_jours,
      'penalites_texte', p.penalites_texte),
    client = jsonb_build_object(
      'type', c.type, 'nom', c.nom, 'email', c.email, 'adresse', c.adresse,
      'siren', c.siren, 'tva_numero', c.tva_numero)
  where id = f.id
  returning * into f;

  if f.type = 'avoir' then
    update public.factures set statut = 'annulee' where id = f.facture_origine_id;
  end if;
  perform set_config('reboot.emission', 'off', true);
  return f;
end $$;

-- ---------- Création d'un avoir (brouillon avec lignes inversées) ----------
create or replace function private.creer_avoir_impl(p_facture_id uuid)
returns public.factures language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); o public.factures; a public.factures;
begin
  if uid is null then raise exception 'Connexion requise.' using errcode = '28000'; end if;
  select * into o from public.factures where id = p_facture_id and user_id = uid;
  if not found then raise exception 'Facture introuvable.' using errcode = 'P0002'; end if;
  if o.type <> 'facture' or o.statut in ('brouillon','annulee') then
    raise exception 'Un avoir se crée sur une facture émise non annulée.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.factures where facture_origine_id = o.id and statut <> 'annulee') then
    raise exception 'Un avoir existe déjà pour cette facture.' using errcode = 'P0001';
  end if;
  insert into public.factures (user_id, type, facture_origine_id, client_id, intervention_id, date_prestation)
    values (uid, 'avoir', o.id, o.client_id, o.intervention_id, o.date_prestation)
    returning * into a;
  insert into public.lignes_facture (user_id, facture_id, position, designation, quantite, prix_unitaire_ht, taux_tva)
    select uid, a.id, position, designation, -quantite, prix_unitaire_ht, taux_tva
    from public.lignes_facture where facture_id = o.id;
  return a;
end $$;

-- ---------- Points d'entrée publics (invoker, sans droit élevé exposé) ----------
create or replace function public.emettre_facture(facture_id uuid)
returns public.factures language sql security invoker set search_path = '' as $$
  select * from private.emettre_facture_impl(facture_id);
$$;
create or replace function public.creer_avoir(facture_id uuid)
returns public.factures language sql security invoker set search_path = '' as $$
  select * from private.creer_avoir_impl(facture_id);
$$;

revoke all on function public.emettre_facture(uuid), public.creer_avoir(uuid) from public, anon;
grant execute on function public.emettre_facture(uuid), public.creer_avoir(uuid) to authenticated;
revoke all on function private.emettre_facture_impl(uuid), private.creer_avoir_impl(uuid),
  private.lignes_garde(), private.factures_garde() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.emettre_facture_impl(uuid), private.creer_avoir_impl(uuid) to authenticated;
