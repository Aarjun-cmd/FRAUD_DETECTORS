// fraudAnalyzer.js — calls backend /api/ai/analyze
// incidentText is the formatted string built in main.js runAgents()

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

export async function runFraudAnalyzer(incidentText, sessionId = null) {
  // incidentText is a plain string — wrap it as description for the backend
  const data = await post('/api/ai/analyze', {
    incident: { description: incidentText },
    sessionId
  })
  return data.analysis
}