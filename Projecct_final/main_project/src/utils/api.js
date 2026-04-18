const BASE = import.meta.env.VITE_API_URL || ''

async function post(endpoint, body) {
  const res = await fetch(\\, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || API error: \)
  }
  return res.json()
}

export async function callClaude(systemPrompt, userMessage, maxTokens = 300) {
  const data = await post('/api/ai/chat', {
    message: userMessage || '__greeting__',
    history: [],
    sessionId: null
  })
  return data.reply
}

export async function callClaudeJSON(systemPrompt, userMessage, maxTokens = 1200) {
  const data = await post('/api/ai/extract', { transcript: userMessage })
  return data.data
}

export async function runAllAgents(incident, sessionId = null) {
  return await post('/api/ai/run-all', { incident, sessionId })
}
