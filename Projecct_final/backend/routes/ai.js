/**
 * routes/ai.js
 * All AI-powered endpoints: chat intake, fraud analysis,
 * negotiation agent, and trace agent.
 * FIXED: System prompt field names now match frontend expectations.
 */

import { Router } from 'express'
import { groqRequest, groqRequestJSON } from '../lib/groq.js'
import { appendMessage, updateSession } from '../lib/supabase.js'

const router = Router()

// ── System prompts ──────────────────────────────────────────────────

const ARYA_SYSTEM = `You are Arya, a compassionate and efficient AI fraud-response specialist for FraudGuard AI. Your goal is to gather complete incident information about UPI/digital payment fraud cases.

You need to collect:
1. Victim's name
2. Amount lost (in INR)
3. Bank/UPI app used (PhonePe, GPay, Paytm, BHIM, bank name, etc.)
4. Scammer's contact (phone/UPI ID/account)
5. Transaction ID (UTR number)
6. Brief description of how the fraud happened

Be empathetic, conversational, and guide them step by step. Ask for missing info naturally. Once you have ALL 6 pieces of information, end your response with exactly:
[INCIDENT_COMPLETE]

Keep responses concise (2-3 sentences max). If they seem distressed, acknowledge it briefly then refocus on gathering information.`

// FIXED: Fields now match what renderResults() reads in main.js
const FRAUD_ANALYZER_SYSTEM = `You are an expert fraud analyst specializing in UPI/digital payment scams in India. Analyze the incident and return ONLY a valid JSON object (no markdown, no backticks, just raw JSON) with this exact structure:
{
  "fraudType": "<short fraud category, e.g. Phishing, Vishing, OTP Scam, Investment Fraud>",
  "subType": "<specific sub-type, e.g. Tech Support Scam, KYC Fraud, Fake Lottery>",
  "severity": "<low|medium|high|critical>",
  "recoveryScore": <integer 0-100 representing recovery probability percentage>,
  "recoveryReason": "<2-3 sentence explanation of recovery challenge and recommended action>",
  "timeToAct": "<urgency string e.g. Act within the next 2 hours to freeze the account and increase recovery chances.>",
  "indicators": ["<fraud indicator 1>", "<fraud indicator 2>", "<fraud indicator 3>"],
  "fraudDetails": "<2-3 sentences describing how the scam worked and what happened>",
  "estimatedRecoverable": "<e.g. 30-50% of funds if frozen and reported within 2 hours>"
}`

// FIXED: Fields now match what renderResults() reads from n. in main.js
const NEGOTIATION_SYSTEM = `You are an expert fraud negotiation and victim support specialist. Analyze the fraud incident and return ONLY a valid JSON object (no markdown, no backticks, just raw JSON) with this exact structure:
{
  "checklist": [
    {"text": "<immediate action step 1>", "urgent": true, "contact": "<phone/URL if applicable or null>"},
    {"text": "<action step 2>", "urgent": true, "contact": "<phone/URL or null>"},
    {"text": "<action step 3>", "urgent": false, "contact": null},
    {"text": "<action step 4>", "urgent": false, "contact": null}
  ],
  "helplines": [
    {"name": "Cyber Crime Helpline", "number": "1930"},
    {"name": "RBI Ombudsman", "number": "14448"},
    {"name": "<Bank> 24x7 Customer Care", "number": "<bank helpline number>"},
    {"name": "<Bank> 24x7 Cybercrime Cell", "number": "<bank cybercrime number if known>"}
  ],
  "bankFreezeRequest": "<formal letter/email text to send to the bank requesting account freeze and transaction reversal>",
  "complaintDraft": "<complete formal complaint letter to file with cybercrime.gov.in, including all incident details, timeline, and relief requested>"
}`

// FIXED: Fields now match what renderResults() reads from t. in main.js
const TRACE_SYSTEM = `You are a digital forensics specialist for UPI fraud cases. Analyze the transaction trail and return ONLY a valid JSON object (no markdown, no backticks, just raw JSON) with this exact structure:
{
  "nodes": [
    {"id": "victim", "label": "<victim name>", "type": "victim"},
    {"id": "bank1", "label": "<victim bank name>", "type": "bank"},
    {"id": "txn1", "label": "UTR: <txn id>", "type": "transaction"},
    {"id": "scammer", "label": "<scammer UPI/phone>", "type": "suspect"}
  ],
  "edges": [
    {"from": "victim", "to": "bank1", "label": "Account holder"},
    {"from": "bank1", "to": "txn1", "label": "<amount transferred>"},
    {"from": "txn1", "to": "scammer", "label": "Received"}
  ],
  "riskPattern": "<short pattern name e.g. KYC Phishing > OTP Capture > Instant Transfer>",
  "traceAnalysis": "<2-3 sentences describing the transaction trail and what can be done>",
  "freezeWindow": "<e.g. Account freeze window: 24-48 hours from transaction time>"
}`

// ── POST /api/ai/chat ────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [], sessionId } = req.body

    if (!message?.trim()) {
      return res.status(400).json({ error: 'message is required' })
    }

    const historyContext = history.length > 0
      ? '\n\nConversation so far:\n' + history
          .map(m => `${m.role === 'user' ? 'Victim' : 'Arya'}: ${m.content}`)
          .join('\n')
      : ''

    const reply = await groqRequest(
      ARYA_SYSTEM,
      historyContext + `\n\nVictim: ${message}\n\nArya:`,
      { maxTokens: 300, temperature: 0.6 }
    )

    const incidentComplete = reply.includes('[INCIDENT_COMPLETE]')
    const cleanReply = reply.replace('[INCIDENT_COMPLETE]', '').trim()

    let extractedData = null
    if (incidentComplete) {
      const fullConversation = [
        ...history.map(m => `${m.role === 'user' ? 'Victim' : 'Arya'}: ${m.content}`),
        `Victim: ${message}`,
        `Arya: ${cleanReply}`
      ].join('\n')

      extractedData = await extractIncidentData(fullConversation)
    }

    if (sessionId) {
      await appendMessage(sessionId, { role: 'user', content: message, ts: Date.now() }).catch(console.error)
      await appendMessage(sessionId, { role: 'assistant', content: cleanReply, ts: Date.now() }).catch(console.error)
    }

    res.json({
      reply: cleanReply,
      incidentComplete,
      extractedData
    })
  } catch (err) {
    console.error('[POST /ai/chat]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/ai/extract ─────────────────────────────────────────────
router.post('/extract', async (req, res) => {
  try {
    const { transcript } = req.body
    if (!transcript) return res.status(400).json({ error: 'transcript is required' })

    const data = await extractIncidentData(transcript)
    res.json({ data })
  } catch (err) {
    console.error('[POST /ai/extract]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/ai/analyze ─────────────────────────────────────────────
router.post('/analyze', async (req, res) => {
  try {
    const { incident, sessionId } = req.body
    if (!incident) return res.status(400).json({ error: 'incident is required' })

    const incidentStr = formatIncident(incident)
    const analysis = await groqRequestJSON(FRAUD_ANALYZER_SYSTEM, incidentStr, { maxTokens: 1000 })

    if (sessionId) {
      await updateSession(sessionId, { analysis }).catch(console.error)
    }

    res.json({ analysis })
  } catch (err) {
    console.error('[POST /ai/analyze]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/ai/negotiate ───────────────────────────────────────────
router.post('/negotiate', async (req, res) => {
  try {
    const { incident } = req.body
    if (!incident) return res.status(400).json({ error: 'incident is required' })

    const incidentStr = formatIncident(incident)
    const negotiation = await groqRequestJSON(NEGOTIATION_SYSTEM, incidentStr, { maxTokens: 1200 })

    res.json({ negotiation })
  } catch (err) {
    console.error('[POST /ai/negotiate]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/ai/trace ───────────────────────────────────────────────
router.post('/trace', async (req, res) => {
  try {
    const { incident } = req.body
    if (!incident) return res.status(400).json({ error: 'incident is required' })

    const incidentStr = formatIncident(incident)
    const trace = await groqRequestJSON(TRACE_SYSTEM, incidentStr, { maxTokens: 800 })

    res.json({ trace })
  } catch (err) {
    console.error('[POST /ai/trace]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/ai/run-all ─────────────────────────────────────────────
router.post('/run-all', async (req, res) => {
  try {
    const { incident, sessionId } = req.body
    if (!incident) return res.status(400).json({ error: 'incident is required' })

    const incidentStr = formatIncident(incident)

    const [analysis, negotiation, trace] = await Promise.all([
      groqRequestJSON(FRAUD_ANALYZER_SYSTEM, incidentStr, { maxTokens: 1000 }),
      groqRequestJSON(NEGOTIATION_SYSTEM, incidentStr, { maxTokens: 1200 }),
      groqRequestJSON(TRACE_SYSTEM, incidentStr, { maxTokens: 800 })
    ])

    if (sessionId) {
      await updateSession(sessionId, { analysis, status: 'analyzed' }).catch(console.error)
    }

    res.json({ analysis, negotiation, trace })
  } catch (err) {
    console.error('[POST /ai/run-all]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Helpers ──────────────────────────────────────────────────────────

function formatIncident(inc) {
  return `
Incident Details:
- Victim Name: ${inc.name || inc.victimName || 'Unknown'}
- Amount Lost: ₹${inc.amount || 'Unknown'}
- Bank/UPI App: ${inc.bank || 'Unknown'}
- Scammer Contact: ${inc.contact || 'Unknown'}
- Transaction ID: ${inc.txnId || inc.txn_id || 'Unknown'}
- Description: ${inc.description || 'No description provided'}
- Date: ${inc.date || new Date().toLocaleDateString('en-IN')}
`.trim()
}

async function extractIncidentData(transcript) {
  const EXTRACT_SYSTEM = `Extract fraud incident details from a conversation transcript. Return ONLY a JSON object:
{
  "name": "<victim name or null>",
  "amount": "<number or null>",
  "bank": "<bank/UPI app or null>",
  "contact": "<scammer phone/UPI/account or null>",
  "txnId": "<transaction ID/UTR or null>",
  "description": "<brief description or null>"
}`
  return groqRequestJSON(EXTRACT_SYSTEM, `Transcript:\n${transcript}`, { maxTokens: 400, temperature: 0.2 })
}

export default router