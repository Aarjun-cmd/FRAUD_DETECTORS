# FraudGuard AI — Backend

Node.js/Express backend for the **FraudGuard AI** UPI fraud negotiator. It securely proxies Groq AI calls (so your API key never reaches the browser) and manages fraud incident sessions via Supabase.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| AI | Groq (llama-3.1-8b-instant) |
| Database | Supabase (PostgreSQL) |
| Security | Helmet + CORS + Rate limiting |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# → Edit .env with your real keys

# 3. Start development server (auto-restart on file changes)
npm run dev

# 4. Start production server
npm start
```

Server runs at **http://localhost:3000** by default.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | `development` or `production` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (e.g. `http://localhost:5173`) |
| `GROQ_API_KEY` | Your Groq API key (get free at console.groq.com) |
| `GROQ_MODEL` | Model to use (default: `llama-3.1-8b-instant`) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | (Optional) Service role key for admin ops |
| `RATE_LIMIT_MAX` | Max requests per minute (default: 60) |
| `AI_RATE_LIMIT_MAX` | Max AI requests per minute (default: 20) |

---

## API Reference

### Health

```
GET /health
```
Returns server status, version, and config flags.

---

### AI Endpoints — `/api/ai`

All AI endpoints are rate-limited to 20 req/min.

#### Chat with Arya (intake agent)
```
POST /api/ai/chat
Body: {
  "message": "I was scammed for ₹5000",
  "history": [{ "role": "user", "content": "..." }, ...],  // optional
  "sessionId": "uuid"  // optional — persists messages
}
Response: {
  "reply": "I'm so sorry to hear that...",
  "incidentComplete": false,
  "extractedData": null  // populated when incidentComplete = true
}
```

#### Extract incident data from transcript
```
POST /api/ai/extract
Body: { "transcript": "Victim: I lost ₹10000 to a fake job offer..." }
Response: { "data": { "name": "...", "amount": 10000, ... } }
```

#### Run fraud analyzer
```
POST /api/ai/analyze
Body: { "incident": { "name": "...", "amount": 5000, ... }, "sessionId": "uuid" }
Response: { "analysis": { "riskScore": 82, "fraudType": "...", ... } }
```

#### Run negotiation agent
```
POST /api/ai/negotiate
Body: { "incident": { ... } }
Response: { "negotiation": { "message": "...", "strategy": "...", ... } }
```

#### Run trace agent
```
POST /api/ai/trace
Body: { "incident": { ... } }
Response: { "trace": { "traceNodes": [...], "traceEdges": [...], ... } }
```

#### Run all agents in parallel (recommended)
```
POST /api/ai/run-all
Body: { "incident": { ... }, "sessionId": "uuid" }
Response: { "analysis": {...}, "negotiation": {...}, "trace": {...} }
```

---

### Session Endpoints — `/api/sessions`

#### List sessions
```
GET /api/sessions?limit=50&status=open
Response: { "sessions": [...] }
```

#### Create session
```
POST /api/sessions
Body: { "name": "Ravi", "amount": 5000, "bank": "PhonePe", ... }
Response: { "session": { "id": "uuid", ... } }
```

#### Get session
```
GET /api/sessions/:id
Response: { "session": { ... } }
```

#### Update session
```
PATCH /api/sessions/:id
Body: { "status": "resolved", "analysis": {...} }
Response: { "session": { ... } }
```

#### Append message
```
POST /api/sessions/:id/messages
Body: { "role": "user", "content": "I got a call from 9876543210" }
Response: { "session": {...}, "message": {...} }
```

#### Update status
```
PATCH /api/sessions/:id/status
Body: { "status": "resolved" }  // open | analyzing | analyzed | resolved | closed
Response: { "session": { ... } }
```

#### Delete session
```
DELETE /api/sessions/:id
Response: { "success": true, "id": "uuid" }
```

---

## Supabase Setup

Create a `chat_sessions` table in your Supabase project:

```sql
create table chat_sessions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  victim_name text,
  amount numeric,
  bank text,
  contact text,
  txn_id text,
  description text,
  messages jsonb default '[]',
  analysis jsonb,
  status text default 'open'
);

-- Optional: enable Row Level Security
alter table chat_sessions enable row level security;

-- Allow all authenticated requests (adjust to your auth strategy)
create policy "Allow all for authenticated"
  on chat_sessions
  for all
  using (true);
```

---

## Connecting the Frontend

Update your Vite frontend to point at this backend instead of calling Groq directly.

### `vite.config.js` — Add proxy
```js
export default {
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
}
```

### Update `src/utils/api.js`
Replace direct Groq calls with backend calls:
```js
// Before:
const reply = await groqRequest(system, message)

// After:
const res = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, history, sessionId })
})
const { reply } = await res.json()
```

---

## Project Structure

```
backend/
├── server.js           # Express app entry point
├── package.json
├── .env.example        # Environment variable template
├── lib/
│   ├── groq.js         # Groq API client + JSON extraction
│   └── supabase.js     # Supabase client + session helpers
└── routes/
    ├── ai.js           # AI agent endpoints
    └── sessions.js     # Session CRUD endpoints
```
