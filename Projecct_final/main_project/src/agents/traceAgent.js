// traceAgent.js — calls backend /api/ai/trace

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

export async function runTraceAgent(incidentText, fraudAnalysis) {
  const enriched = `${incidentText}

Fraud type: ${fraudAnalysis.fraudType}
Severity: ${fraudAnalysis.severity}
Estimated recoverable: ${fraudAnalysis.estimatedRecoverable || 'unknown'}`

  const data = await post('/api/ai/trace', {
    incident: { description: enriched }
  })
  return data.trace
}