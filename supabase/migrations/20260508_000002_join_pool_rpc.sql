create or replace function public.join_pool_by_share_token(
  p_share_token uuid,
  p_amount numeric(14,2),
  p_contributor_label text default null,
  p_note text default null
)
returns table (
  contribution_id uuid,
  pool_id uuid,
  pool_title text,
  amount numeric(14,2),
  total_amount numeric(14,2),
  goal_amount numeric(14,2),
  remaining_amount numeric(14,2),
  progress_percent numeric(5,2),
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pool public.pools%rowtype;
  v_updated_pool public.pools%rowtype;
  v_contribution public.pool_contributions%rowtype;
begin
  select *
  into v_pool
  from public.pools
  where share_token = p_share_token
    and status = 'published'
  limit 1;

  if not found then
    raise exception 'Published pool not found for share token' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Contribution amount must be greater than zero' using errcode = '22003';
  end if;

  insert into public.pool_contributions (
    pool_id,
    submitted_by,
    contributor_label,
    amount,
    note
  )
  values (
    v_pool.id,
    auth.uid(),
    nullif(btrim(coalesce(p_contributor_label, '')), ''),
    p_amount,
    p_note
  )
  returning * into v_contribution;

  select *
  into v_updated_pool
  from public.pools
  where id = v_pool.id;

  return query
  select
    v_contribution.id,
    v_contribution.pool_id,
    v_pool.title,
    v_contribution.amount,
    v_updated_pool.total_amount,
    v_updated_pool.goal_amount,
    greatest(v_updated_pool.goal_amount - v_updated_pool.total_amount, 0),
    round((v_updated_pool.total_amount / nullif(v_updated_pool.goal_amount, 0)) * 100, 2),
    v_contribution.created_at;
end;
$$;

drop policy if exists "Anyone can contribute to published pools" on public.pool_contributions;

revoke insert on public.pool_contributions from anon, authenticated;
grant execute on function public.join_pool_by_share_token(uuid, numeric, text, text) to anon, authenticated;