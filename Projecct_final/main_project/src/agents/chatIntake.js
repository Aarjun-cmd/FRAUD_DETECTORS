// chatIntake.js — Arya chat intake agent
// Now calls backend /api/ai/chat and /api/ai/extract

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

// Called with [] for greeting, or with full messages array after each user message
// Returns the plain text reply string from Arya
export async function getChatResponse(messages) {
  if (messages.length === 0) {
    // Initial greeting — no user message yet
    const data = await post('/api/ai/chat', {
      message: 'Hello',
      history: [],
      sessionId: null
    })
    return data.reply
  }

  const history = messages.slice(0, -1)  // everything except the last message
  const lastMsg = messages[messages.length - 1]

  const data = await post('/api/ai/chat', {
    message: lastMsg.content,
    history: history,
    sessionId: null
  })
  return data.reply
}

// Extracts structured incident data from the conversation
// Returns { complete, name, amount, bank, contact, txnId, description, nextQuestion, missing }
export async function extractIncidentData(messages) {
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'Victim' : 'Agent'}: ${m.content}`)
    .join('\n')

  const data = await post('/api/ai/extract', { transcript })
  return data.data
}