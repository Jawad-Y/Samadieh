import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function createTestUser(email, password) {
  // Try supabase admin API
  if (admin.auth && admin.auth.admin && typeof admin.auth.admin.createUser === 'function') {
    const res = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (res.error) throw res.error;
    return res.data;
  }

  // Fallback: try REST admin endpoint
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Failed to create admin user: ${resp.status} ${txt}`);
  }
  const body = await resp.json();
  return body;
}

async function run() {
  try {
    const testEmail = `test+${Date.now()}@example.com`;
    const testPassword = 'Test1234!';

    console.log('Creating test user:', testEmail);
    const user = await createTestUser(testEmail, testPassword);
    console.log('Created user id:', user.id || user.user?.id);
    const userId = user.id || user.user?.id;

    console.log('Creating pool as admin with owner set to test user...');
    const { data: pool, error: poolErr } = await admin
      .from('pools')
      .insert({ owner_id: userId, title: 'Test Flow Pool', description: 'E2E test pool', status: 'published' })
      .select()
      .single();
    if (poolErr) throw poolErr;
    console.log('Pool created:', pool.id, 'share_token:', pool.share_token);

    console.log('Calling RPC join_pool_by_share_token to add a contribution...');
    const amount = 123.45;
    const rpcParams = { p_share_token: pool.share_token, p_amount: amount, p_contributor_label: 'TestRunner', p_note: 'first contribution' };
    const { data: rpcRes, error: rpcErr } = await admin.rpc('join_pool_by_share_token', rpcParams);
    if (rpcErr) throw rpcErr;
    console.log('RPC response:', rpcRes);

    console.log('Verifying pool total...');
    const { data: refreshedPool, error: refreshedErr } = await admin.from('pools').select('*').eq('id', pool.id).single();
    if (refreshedErr) throw refreshedErr;

    if (Number(refreshedPool.total_amount) !== Number(amount)) {
      console.error('Total mismatch:', refreshedPool.total_amount, 'expected:', amount);
      process.exit(2);
    }

    console.log('Total verified:', refreshedPool.total_amount);

    // Add another anonymous contribution via RPC
    console.log('Adding another anonymous contribution via RPC...');
    const { data: rpcRes2, error: rpcErr2 } = await admin.rpc('join_pool_by_share_token', { p_share_token: pool.share_token, p_amount: 200 });
    if (rpcErr2) throw rpcErr2;

    const { data: finalPool } = await admin.from('pools').select('*').eq('id', pool.id).single();
    const expected = Number(amount) + 200;
    if (Number(finalPool.total_amount) !== expected) {
      console.error('Final total mismatch:', finalPool.total_amount, 'expected:', expected);
      process.exit(3);
    }

    console.log('Final total verified:', finalPool.total_amount);
    console.log('Test flow succeeded.');
    process.exit(0);
  } catch (err) {
    console.error('Test flow error:', err);
    process.exit(1);
  }
}

run();
