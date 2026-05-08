create extension if not exists "pgcrypto";

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_pool_timestamps()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;

  if new.status <> 'published' then
    new.published_at = null;
  end if;

  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  return new;
end;
$$;

create or replace function public.bump_pool_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pools
  set total_amount = total_amount + new.amount
  where id = new.pool_id;

  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pools (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  share_token uuid not null default gen_random_uuid(),
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  goal_amount numeric(14,2) not null default 100000 check (goal_amount = 100000),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index if not exists pools_share_token_key on public.pools (share_token);
create index if not exists pools_owner_id_idx on public.pools (owner_id);
create index if not exists pools_status_idx on public.pools (status);

create table if not exists public.pool_contributions (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  submitted_by uuid default auth.uid() references auth.users(id) on delete set null,
  contributor_label text,
  amount numeric(14,2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists pool_contributions_pool_id_idx on public.pool_contributions (pool_id);
create index if not exists pool_contributions_created_at_idx on public.pool_contributions (created_at desc);

alter table public.profiles enable row level security;
alter table public.pools enable row level security;
alter table public.pool_contributions enable row level security;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists sync_pool_timestamps on public.pools;
create trigger sync_pool_timestamps
before insert or update on public.pools
for each row execute function public.sync_pool_timestamps();

drop trigger if exists bump_pool_total on public.pool_contributions;
create trigger bump_pool_total
after insert on public.pool_contributions
for each row execute function public.bump_pool_total();

create or replace view public.public_pools
with (security_invoker = true)
as
select
  id,
  title,
  description,
  share_token,
  status,
  goal_amount,
  total_amount,
  created_at,
  updated_at,
  published_at,
  round((total_amount / nullif(goal_amount, 0)) * 100, 2) as progress_percent,
  greatest(goal_amount - total_amount, 0) as remaining_amount
from public.pools
where status = 'published';

create policy "Public can read published pools"
on public.pools
for select
using (status = 'published');

create policy "Owners can read their pools"
on public.pools
for select
to authenticated
using (auth.uid() = owner_id);

create policy "Authenticated users can create pools"
on public.pools
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "Owners can update pools"
on public.pools
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Owners can delete pools"
on public.pools
for delete
to authenticated
using (auth.uid() = owner_id);

create policy "Users can read their profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can update their profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Anyone can contribute to published pools"
on public.pool_contributions
for insert
to anon, authenticated
with check (
  (
    (
      auth.uid() is null
      and submitted_by is null
    )
    or (
      auth.uid() is not null
      and submitted_by = auth.uid()
    )
  )
  and
  exists (
    select 1
    from public.pools p
    where p.id = pool_id
      and p.status = 'published'
  )
);

create policy "Owners can read pool contributions"
on public.pool_contributions
for select
to authenticated
using (
  exists (
    select 1
    from public.pools p
    where p.id = pool_id
      and p.owner_id = auth.uid()
  )
);

grant usage on schema public to anon, authenticated;
grant select on public.public_pools to anon, authenticated;
grant select on public.pools to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert on public.pool_contributions to anon, authenticated;
grant select, insert, update, delete on public.pools to authenticated;