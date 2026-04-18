/**
 * routes/sessions.js
 * CRUD endpoints for fraud incident chat sessions stored in Supabase.
 */

import { Router } from 'express'
import {
  createSession,
  getSession,
  updateSession,
  listSessions,
  appendMessage,
  deleteSession
} from '../lib/supabase.js'

const router = Router()

// ── GET /api/sessions ────────────────────────────────────────────────
// List recent sessions (latest 50 by default)
router.get('/', async (req, res) => {
  try {
    const { limit = 50, status } = req.query
    const sessions = await listSessions({ limit: Number(limit), status })
    res.json({ sessions })
  } catch (err) {
    console.error('[GET /sessions]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/sessions ───────────────────────────────────────────────
// Create a new session
router.post('/', async (req, res) => {
  try {
    const { name, amount, bank, contact, txnId, description, messages, analysis } = req.body

    if (!name && !description) {
      return res.status(400).json({ error: 'At least name or description is required' })
    }

    const session = await createSession({ name, amount, bank, contact, txnId, description, messages, analysis })
    res.status(201).json({ session })
  } catch (err) {
    console.error('[POST /sessions]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/sessions/:id ────────────────────────────────────────────
// Get a single session by ID
router.get('/:id', async (req, res) => {
  try {
    const session = await getSession(req.params.id)
    res.json({ session })
  } catch (err) {
    console.error('[GET /sessions/:id]', err)
    const status = err.message.includes('No rows') ? 404 : 500
    res.status(status).json({ error: status === 404 ? 'Session not found' : err.message })
  }
})

// ── PATCH /api/sessions/:id ──────────────────────────────────────────
// Partial update of a session
router.patch('/:id', async (req, res) => {
  try {
    const allowedFields = ['victim_name', 'amount', 'bank', 'contact', 'txn_id',
      'description', 'messages', 'analysis', 'status']

    const updates = {}
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field]
    }
    // Also accept camelCase keys from frontend
    if (req.body.name !== undefined) updates.victim_name = req.body.name
    if (req.body.txnId !== undefined) updates.txn_id = req.body.txnId

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    const session = await updateSession(req.params.id, updates)
    res.json({ session })
  } catch (err) {
    console.error('[PATCH /sessions/:id]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/sessions/:id/messages ──────────────────────────────────
// Append a message to a session
router.post('/:id/messages', async (req, res) => {
  try {
    const { role, content } = req.body

    if (!role || !content) {
      return res.status(400).json({ error: 'role and content are required' })
    }
    if (!['user', 'assistant', 'system'].includes(role)) {
      return res.status(400).json({ error: 'role must be user, assistant, or system' })
    }

    const message = { role, content, ts: Date.now() }
    const session = await appendMessage(req.params.id, message)
    res.json({ session, message })
  } catch (err) {
    console.error('[POST /sessions/:id/messages]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /api/sessions/:id/status ───────────────────────────────────
// Update session status (open | analyzing | analyzed | resolved | closed)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body
    const validStatuses = ['open', 'analyzing', 'analyzed', 'resolved', 'closed']

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` })
    }

    const session = await updateSession(req.params.id, { status })
    res.json({ session })
  } catch (err) {
    console.error('[PATCH /sessions/:id/status]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/sessions/:id ─────────────────────────────────────────
// Delete a session
router.delete('/:id', async (req, res) => {
  try {
    await deleteSession(req.params.id)
    res.json({ success: true, id: req.params.id })
  } catch (err) {
    console.error('[DELETE /sessions/:id]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
