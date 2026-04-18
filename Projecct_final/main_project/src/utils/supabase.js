import { createClient } from '@supabase/supabase-js'

// ── Supabase Config ────────────────────────────────────
// Replace these with your actual Supabase project values from:
// https://supabase.com/dashboard → your project → Settings → API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Missing env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Session helpers ────────────────────────────────────

/**
 * Save a new chat session + incident to Supabase.
 * Table: chat_sessions
 * Columns: id (uuid), created_at, victim_name, amount, bank,
 *          contact, txn_id, description, messages (jsonb),
 *          analysis (jsonb), status (text)
 */
export async function saveChatSession(sessionData) {
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert([{
      victim_name: sessionData.name || null,
      amount: sessionData.amount ? Number(sessionData.amount) : null,
      bank: sessionData.bank || null,
      contact: sessionData.contact || null,
      txn_id: sessionData.txnId || null,
      description: sessionData.description || null,
      messages: sessionData.messages || [],
      analysis: sessionData.analysis || null,
      status: 'open'
    }])
    .select()
    .single()

  if (error) {
    console.error('[Supabase] saveChatSession error:', error.message)
    return null
  }
  return data
}

/**
 * Update an existing session by id with new fields.
 */
export async function updateChatSession(id, updates) {
  const { error } = await supabase
    .from('chat_sessions')
    .update(updates)
    .eq('id', id)

  if (error) {
    console.error('[Supabase] updateChatSession error:', error.message)
    return false
  }
  return true
}

/**
 * Fetch recent sessions (latest 50).
 */
export async function fetchRecentSessions() {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[Supabase] fetchRecentSessions error:', error.message)
    return []
  }
  return data
}

/**
 * Log a single chat message to the messages column.
 */
export async function appendMessage(sessionId, message) {
  // Uses Supabase's jsonb append via rpc if you have it,
  // otherwise fetches existing and patches
  const { data: existing } = await supabase
    .from('chat_sessions')
    .select('messages')
    .eq('id', sessionId)
    .single()

  const updated = [...(existing?.messages || []), message]
  return updateChatSession(sessionId, { messages: updated })
}
