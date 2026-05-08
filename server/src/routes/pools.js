import express from 'express';
import { supabaseAdmin, getUserFromAuthHeader } from '../supabaseClient.js';

const router = express.Router();

function requireAuth(fn) {
  return async (req, res, next) => {
    try {
      const user = await getUserFromAuthHeader(req.headers.authorization || '');
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      req.user = user;
      return fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

// Create pool (authenticated)
router.post('/', requireAuth(async (req, res, next) => {
  try {
    const { title, description, status } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
    const payload = {
      owner_id: req.user.id,
      title: title.trim(),
      description: description || null,
      status: status || 'draft'
    };
    const { data, error } = await supabaseAdmin.from('pools').insert(payload).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
}));

// List current user's pools (authenticated)
router.get('/mine', requireAuth(async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('pools').select('*').eq('owner_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
}));

// Get pool by id (owner or published)
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: pool } = await supabaseAdmin.from('pools').select('*').eq('id', id).maybeSingle();
    if (!pool) return res.status(404).json({ error: 'Pool not found' });

    if (pool.status === 'published') return res.json(pool);

    // If not published, require auth and ownership
    const user = await getUserFromAuthHeader(req.headers.authorization || '');
    if (!user || user.id !== pool.owner_id) return res.status(403).json({ error: 'Forbidden' });
    res.json(pool);
  } catch (err) {
    next(err);
  }
});

// Public: get pool by share token (published only)
router.get('/share/:shareToken', async (req, res, next) => {
  try {
    const { shareToken } = req.params;
    const { data, error } = await supabaseAdmin.from('public_pools').select('*').eq('share_token', shareToken).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Public pool not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Join a pool by share token (public or authenticated)
router.post('/share/:shareToken/join', async (req, res, next) => {
  try {
    const { shareToken } = req.params;
    const { amount, contributor_label, note } = req.body;

    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be > 0' });

    // find published pool
    const { data: pool } = await supabaseAdmin.from('pools').select('*').eq('share_token', shareToken).eq('status', 'published').maybeSingle();
    if (!pool) return res.status(404).json({ error: 'Published pool not found' });

    // optional user
    let user = null;
    try { user = await getUserFromAuthHeader(req.headers.authorization || ''); } catch (e) { /* ignore */ }

    const insertPayload = {
      pool_id: pool.id,
      submitted_by: user ? user.id : null,
      contributor_label: contributor_label || (user ? user.email || user.id : 'Anonymous'),
      amount: Number(amount),
      note: note || null
    };

    const { data: contribution, error: insertErr } = await supabaseAdmin.from('pool_contributions').insert(insertPayload).select().single();
    if (insertErr) throw insertErr;

    // fetch updated pool
    const { data: updatedPool, error: poolErr } = await supabaseAdmin.from('pools').select('*').eq('id', pool.id).maybeSingle();
    if (poolErr) throw poolErr;

    res.json({ contribution, pool: updatedPool });
  } catch (err) {
    next(err);
  }
});

// Public: list published pools
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('public_pools').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
