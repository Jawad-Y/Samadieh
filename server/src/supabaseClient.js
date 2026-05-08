import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let cachedSupabaseAdmin = null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. See .env.example');
}

function getSupabaseAdminClient() {
  if (cachedSupabaseAdmin) return cachedSupabaseAdmin;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. See .env.example');
  }

  cachedSupabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  return cachedSupabaseAdmin;
}

export const supabaseAdmin = new Proxy({}, {
  get(target, property) {
    const client = getSupabaseAdminClient();
    const value = client[property];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export async function getUserFromAuthHeader(authorization) {
  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) throw error;
  return data.user || null;
}
