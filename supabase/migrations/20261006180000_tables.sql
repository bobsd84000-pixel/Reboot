-- REBOOT facturation : tables + RLS
create extension if not exists pgcrypto with schema extensions;

create table public.profil (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  nom text, prenom text,
  mention_ei text not null default 'EI',
  adresse text, email text,
  siret text, tva_intracom text,
  iban text, bic text,
  delai_paiement_jours int not null default 30 check (delai_paiement_jours between 0 and 60),
  penalites_texte text not null default 'Pénalités de retard : 3 fois le taux d''intérêt légal en vigueur',
  tarifs jsonb not null default '{"Panne":0,"Installation":0,"Maintenance":0,"Câblage":0}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('entreprise','particulier')),
  nom text not null,
  email text, adresse text,
  siren text check (siren is null or siren ~ '^[0-9]{9}$'),
  tva_numero text,
  created_at timestamptz not null default now()
);
create index on public.clients(user_id);

create table public.interventions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  local_id text,                       -- id local de l'app : évite les doublons à la synchro
  client_id uuid references public.clients(id) on delete restrict,
  site text,
  type text not null check (type in ('Panne','Installation','Maintenance','Câblage')),
  probleme text, solution text, materiel text, etat text,
  date date not null default current_date,
  rapport text,
  created_at timestamptz not null default now(),
  unique (user_id, local_id)
);
create index on public.interventions(user_id);
create index on public.interventions(client_id);

create table public.factures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero text,
  type text not null default 'facture' check (type in ('facture','avoir')),
  facture_origine_id uuid references public.factures(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  intervention_id uuid references public.interventions(id) on delete restrict,
  statut text not null default 'brouillon'
    check (statut in ('brouillon','emise','envoyee','payee','annulee')),
  date_emission date,
  date_prestation date,
  date_echeance date,
  total_ht numeric(12,2), total_tva numeric(12,2), total_ttc numeric(12,2),
  vendeur jsonb,                       -- copie figée à l'émission
  client jsonb,                        -- copie figée à l'émission
  pdf_path text,
  payee_le date,
  created_at timestamptz not null default now(),
  check (type = 'avoir' or facture_origine_id is null),
  check (statut = 'brouillon' or numero is not null)
);
create unique index factures_numero_uniq on public.factures(user_id, numero) where numero is not null;
create index on public.factures(user_id, statut);
create index on public.factures(client_id);
create index on public.factures(intervention_id);
create index on public.factures(facture_origine_id);

create table public.lignes_facture (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  facture_id uuid not null references public.factures(id) on delete cascade,
  position int not null default 0,
  designation text not null,
  quantite numeric(10,2) not null default 1,
  prix_unitaire_ht numeric(12,2) not null default 0,
  taux_tva numeric(4,2) not null default 20 check (taux_tva between 0 and 100)
);
create index on public.lignes_facture(facture_id);
create index on public.lignes_facture(user_id);

create table public.relances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  facture_id uuid not null references public.factures(id) on delete restrict,
  niveau int not null check (niveau in (1,2,3)),
  envoyee_le timestamptz not null default now(),
  resultat text,
  unique (facture_id, niveau)
);
create index on public.relances(user_id);

create table public.compteurs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  annee int not null,
  type text not null default 'facture' check (type in ('facture','avoir')),
  dernier_numero int not null default 0,
  primary key (user_id, annee, type)
);

-- Droits : rien pour anon
revoke all on public.profil, public.clients, public.interventions, public.factures,
  public.lignes_facture, public.relances, public.compteurs from anon, public;

-- RLS
alter table public.profil enable row level security;
alter table public.clients enable row level security;
alter table public.interventions enable row level security;
alter table public.factures enable row level security;
alter table public.lignes_facture enable row level security;
alter table public.relances enable row level security;
alter table public.compteurs enable row level security;

create policy profil_own on public.profil for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy clients_own on public.clients for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy interventions_own on public.interventions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and (client_id is null or exists (select 1 from public.clients c where c.id = client_id)));
create policy factures_own on public.factures for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.clients c where c.id = client_id)
    and (intervention_id is null or exists (select 1 from public.interventions i where i.id = intervention_id))
    and (facture_origine_id is null or exists (select 1 from public.factures f where f.id = facture_origine_id)));
create policy lignes_own on public.lignes_facture for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.factures f where f.id = facture_id));
create policy relances_lecture on public.relances for select to authenticated
  using (user_id = (select auth.uid()));
-- compteurs : lecture seule pour l'utilisateur, écriture par emettre_facture
create policy compteurs_lecture on public.compteurs for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.compteurs from authenticated;
revoke insert, update, delete on public.relances from authenticated;
