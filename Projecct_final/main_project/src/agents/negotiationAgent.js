// negotiationAgent.js — calls backend /api/ai/negotiate

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

export async function runNegotiationAgent(incidentText, fraudAnalysis) {
  const enriched = `${incidentText}

Fraud Classification:
- Type: ${fraudAnalysis.fraudType} (${fraudAnalysis.subType || ''})
- Severity: ${fraudAnalysis.severity}
- Recovery probability: ${fraudAnalysis.recoveryScore}%
- Time to act: ${fraudAnalysis.timeToAct}`

  const data = await post('/api/ai/negotiate', {
    incident: { description: enriched }
  })
  return data.negotiation
}