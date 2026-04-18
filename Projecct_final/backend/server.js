/**
 * server.js — FraudGuard AI Backend
 * Express server that proxies Groq AI calls and manages
 * chat sessions via Supabase.
 *
 * Run: node server.js
 * Dev: node --watch server.js
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import aiRoutes from './routes/ai.js'
import sessionRoutes from './routes/sessions.js'

const app = express()
const PORT = process.env.PORT || 3000

// ── Security middleware ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))

// ── CORS ─────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}))

// ── Body parsing ──────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

// ── Logging ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
}

// ── General rate limit ─────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_MAX) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
})

// ── Stricter rate limit for AI routes ──────────────────────────────
const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.AI_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI rate limit exceeded. Please wait before sending more requests.' }
})

app.use(generalLimiter)

// ── Health check ───────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'FraudGuard AI Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    groqConfigured: !!process.env.GROQ_API_KEY,
    supabaseConfigured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
  })
})

// ── Routes ──────────────────────────────────────────────────────────
app.use('/api/ai', aiLimiter, aiRoutes)
app.use('/api/sessions', sessionRoutes)

// ── 404 handler ────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

// ── Global error handler ───────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const status = err.status || 500
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message

  if (status === 500) console.error('[Unhandled Error]', err)
  res.status(status).json({ error: message })
})

// ── Start server ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║    FraudGuard AI Backend · v1.0.0     ║
╠═══════════════════════════════════════╣
║  Server  : http://localhost:${PORT}       ║
║  Health  : http://localhost:${PORT}/health║
║  Env     : ${(process.env.NODE_ENV || 'development').padEnd(28)}║
║  Groq    : ${process.env.GROQ_API_KEY ? '✓ configured' : '✗ MISSING KEY  '}           ║
║  Supabase: ${process.env.SUPABASE_URL ? '✓ configured' : '✗ MISSING URL  '}           ║
╚═══════════════════════════════════════╝
  `)
})

export default app
