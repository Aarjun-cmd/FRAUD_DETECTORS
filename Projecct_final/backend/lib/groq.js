const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant'

/**
 * Send a chat completion request to Groq.
 */
export async function groqRequest(systemPrompt, userMessage, options = {}) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured on the server')

  const {
    maxTokens = 1200,
    temperature = 0.7,
    model = MODEL
  } = options

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Groq API error: ${response.status}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

/**
 * Extract valid JSON from a raw LLM response.
 * Handles markdown fences, prose wrappers, single-quoted keys, trailing commas.
 */
export function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return null

  let cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  try { return JSON.parse(cleaned) } catch (_) {}

  const firstBrace = cleaned.search(/[{[]/)
  if (firstBrace !== -1) {
    const snippet = cleaned.slice(firstBrace)
    const open = snippet[0]
    const close = open === '{' ? '}' : ']'
    let depth = 0, end = -1
    for (let i = 0; i < snippet.length; i++) {
      if (snippet[i] === open) depth++
      else if (snippet[i] === close) {
        depth--
        if (depth === 0) { end = i; break }
      }
    }
    if (end !== -1) {
      const candidate = snippet.slice(0, end + 1)
      try { return JSON.parse(candidate) } catch (_) {}
      const repaired = candidate
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3')
        .replace(/:\s*'([^']*)'/g, ': "$1"')
      try { return JSON.parse(repaired) } catch (_) {}
    }
  }
  return null
}

/**
 * Make a Groq request that expects a JSON response, with one retry.
 */
export async function groqRequestJSON(systemPrompt, userMessage, options = {}) {
  const JSON_REMINDER = '\n\nCRITICAL: Your entire response must be a single valid JSON object. No prose before or after. No markdown fences. No backticks. Output only the raw JSON.'

  const raw1 = await groqRequest(systemPrompt + JSON_REMINDER, userMessage, options)
  const parsed1 = extractJSON(raw1)
  if (parsed1 !== null) return parsed1

  // Retry with stricter prompt + lower temperature
  const raw2 = await groqRequest(
    systemPrompt + JSON_REMINDER + '\n\nPREVIOUS OUTPUT FAILED JSON PARSE. Try again with ONLY valid JSON.',
    userMessage,
    { ...options, temperature: 0.3 }
  )
  const parsed2 = extractJSON(raw2)
  if (parsed2 !== null) return parsed2

  throw new Error(`Groq returned invalid JSON after 2 attempts. Last raw: ${raw2?.slice(0, 300)}`)
}
