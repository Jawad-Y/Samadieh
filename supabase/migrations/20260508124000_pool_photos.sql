alter table public.pools
add column if not exists photo_path text,
add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('pool-photos', 'pool-photos', true)
on conflict (id) do update
set name = excluded.name,
    public = true;

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
  photo_path,
  photo_url,
  created_at,
  updated_at,
  published_at,
  round((total_amount / nullif(goal_amount, 0)) * 100, 2) as progress_percent,
  greatest(goal_amount - total_amount, 0) as remaining_amount
from public.pools
where status = 'published';
