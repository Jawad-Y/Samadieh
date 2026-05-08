-- Seed example for Samadiyyah pools
-- NOTE: This file is intended to be run in the Supabase SQL editor as a project admin.
-- Replace <OWNER_USER_ID> with a real `auth.users.id` value from your Supabase project.

-- Example: create a published pool (replace owner id)
insert into public.pools (owner_id, title, description, status)
values (
  '<OWNER_USER_ID>'::uuid,
  'Seed Test Pool',
  'This pool was created by seed_example.sql',
  'published'
)
returning id, share_token, goal_amount, total_amount;

-- Example: add contributions (run after you get the pool id)
-- insert into public.pool_contributions (pool_id, submitted_by, contributor_label, amount)
-- values ('<POOL_ID>'::uuid, null, 'SeedAnonymous', 250.00);

-- After running the seed, query public.public_pools for the public view.
