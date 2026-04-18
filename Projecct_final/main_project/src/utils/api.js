// All AI calls now go through your backend at /api/ai/*
// The backend holds the Groq API key — frontend never touches it directly

async function post(endpoint, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error: ${res.status}`)
  }
  return res.json()
}

// Used by chatIntake.js — sends a message to Arya and gets a plain text reply
// history = array of { role, content } objects
// sessionId = optional Supabase session ID to persist messages
export async function callClaude(systemPrompt, userMessage, maxTokens = 300) {
  // This is only called with an empty messages array for the greeting
  // In that case just hit /chat with empty history
  const data = await post('/api/ai/chat', {
    message: userMessage || '__greeting__',
    history: [],
    sessionId: null
  })
  return data.reply
}

// Used by chatIntake.js for extracting structured data from conversation
// Returns parsed JSON with { complete, name, amount, bank, contact, txnId, description }
export async function callClaudeJSON(systemPrompt, userMessage, maxTokens = 1200) {
  const data = await post('/api/ai/extract', { transcript: userMessage })
  return data.data
}

// Used by main.js runAgents() — runs all 3 agents in parallel
// incident = { name, contact, bank, amount, txnId, description }
// Returns { analysis, negotiation, trace }
export async function runAllAgents(incident, sessionId = null) {
  return await post('/api/ai/run-all', { incident, sessionId })
}