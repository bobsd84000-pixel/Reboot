-- Tables avec RLS

create table if not exists profil (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id),
  nom text,
  siret text,
  tva_numero text,
  created_at timestamp default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  nom text not null,
  type text,
  email text,
  created_at timestamp default now()
);

create table if not exists factures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  numero text unique,
  client_id uuid references clients(id),
  statut text default 'brouillon',
  total_ttc numeric,
  date_emission date,
  created_at timestamp default now()
);

alter table profil enable row level security;
alter table clients enable row level security;
alter table factures enable row level security;

create policy "profil_self" on profil for all using (auth.uid() = user_id);
create policy "clients_self" on clients for all using (auth.uid() = user_id);
create policy "factures_self" on factures for all using (auth.uid() = user_id);
