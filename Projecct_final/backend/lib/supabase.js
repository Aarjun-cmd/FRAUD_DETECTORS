import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Warning: SUPABASE_URL or SUPABASE_ANON_KEY not set')
}

// Public client (respects Row Level Security)
export const supabase = createClient(
  SUPABASE_URL || '',
  SUPABASE_ANON_KEY || ''
)

// Admin client (bypasses RLS — use only for server-side ops)
export const supabaseAdmin = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : supabase

// ── Session helpers ─────────────────────────────────────────────────

/**
 * Create a new fraud incident session.
 * Table: chat_sessions
 */
export async function createSession(data) {
  const { data: row, error } = await supabaseAdmin
    .from('chat_sessions')
    .insert([{
      victim_name: data.name || null,
      amount: data.amount ? Number(data.amount) : null,
      bank: data.bank || null,
      contact: data.contact || null,
      txn_id: data.txnId || null,
      description: data.description || null,
      messages: data.messages || [],
      analysis: data.analysis || null,
      status: 'open'
    }])
    .select()
    .single()

  if (error) throw new Error(error.message)
  return row
}

/**
 * Fetch a single session by ID.
 */
export async function getSession(id) {
  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  return data
}

/**
 * Update an existing session.
 */
export async function updateSession(id, updates) {
  const { data, error } = await supabaseAdmin
    .from('chat_sessions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

/**
 * Fetch recent sessions (latest 50).
 */
export async function listSessions({ limit = 50, status } = {}) {
  let query = supabaseAdmin
    .from('chat_sessions')
    .select('id, created_at, victim_name, amount, bank, txn_id, status')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

/**
 * Append a message to a session's messages array.
 */
export async function appendMessage(sessionId, message) {
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('chat_sessions')
    .select('messages')
    .eq('id', sessionId)
    .single()

  if (fetchErr) throw new Error(fetchErr.message)

  const updated = [...(existing?.messages || []), message]
  return updateSession(sessionId, { messages: updated })
}

/**
 * Delete a session.
 */
export async function deleteSession(id) {
  const { error } = await supabaseAdmin
    .from('chat_sessions')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  return true
}
