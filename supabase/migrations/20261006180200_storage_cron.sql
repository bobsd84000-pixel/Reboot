-- Bucket privé + accès propriétaire ; planification des relances
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('factures', 'factures', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy factures_pdf_lecture on storage.objects for select to authenticated
  using (bucket_id = 'factures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy factures_pdf_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'factures' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- pas de update / delete : un PDF émis ne change jamais

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- Vérification du secret du cron (appelée par l'Edge Function avec la clé service)
create or replace function private.verifier_secret_cron(p_secret text)
returns boolean language sql security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets
                 where name = 'cron_secret' and decrypted_secret = p_secret);
$$;
revoke all on function private.verifier_secret_cron(text) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.verifier_secret_cron(text) to service_role;

-- 8h heure de Paris : on lance à 6h et 7h UTC, la fonction n'agit que s'il est 8h à Paris.
select cron.schedule('relances-quotidiennes', '0 6,7 * * *', $$
  select net.http_post(
    url := 'https://yfxslvpddlrdplralqpz.supabase.co/functions/v1/relances',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb);
$$);
