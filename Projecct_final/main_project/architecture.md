# FraudGuard AI — Architecture

> A detailed technical reference for the system's design, data flow, module responsibilities, and infrastructure decisions.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Agent Pipeline](#4-agent-pipeline)
5. [Data Layer](#5-data-layer)
6. [Authentication Architecture](#6-authentication-architecture)
7. [API Layer](#7-api-layer)
8. [State Management](#8-state-management)
9. [Module Reference](#9-module-reference)
10. [Design System](#10-design-system)
11. [Security Model](#11-security-model)
12. [Deployment Architecture](#12-deployment-architecture)

---

## 1. System Overview

FraudGuard AI is a **single-page application (SPA)** built with vanilla JavaScript and Vite. It follows a multi-agent architecture where specialized AI agents each handle one concern: intake, classification, negotiation, and tracing. The frontend communicates with a Node.js backend that proxies all LLM calls so API keys are never exposed to the browser.

```
Browser (Vite SPA)
    │
    ├─── Supabase (Auth + Database)   ← direct from browser (anon key only)
    │
    └─── Backend (Node.js :3000)      ← via Vite proxy at /api/*
              │
              └─── Groq API           ← server-side only (key never in browser)
```

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          BROWSER                                │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────────────────────────┐  │
│  │  login.html  │    │             index.html               │  │
│  │  (Auth page) │    │         (Main Application)           │  │
│  └──────┬───────┘    │                                      │  │
│         │            │  ┌──────────┐  ┌─────────────────┐  │  │
│         │            │  │ Header   │  │   Sidebar       │  │  │
│         │            │  │ + Status │  │   (Form/Chat)   │  │  │
│         │            │  └──────────┘  └─────────────────┘  │  │
│         │            │                                      │  │
│         │            │  ┌───────────────────────────────┐  │  │
│         │            │  │        Main Content           │  │  │
│         │            │  │  (Results: Analysis +         │  │  │
│         │            │  │   Negotiation + Trace)        │  │  │
│         │            │  └───────────────────────────────┘  │  │
│         │            │                                      │  │
│         │            │  ┌───────────────────────────────┐  │  │
│         │            │  │   Arya Floating Chatbot       │  │  │
│         │            │  │   (chatbot.js)                │  │  │
│         │            │  └───────────────────────────────┘  │  │
│         │            └──────────────────────────────────────┘  │
└─────────┼────────────────────────────────────────────────────--─┘
          │                            │
          ▼                            ▼
┌─────────────────┐         ┌──────────────────────┐
│  Supabase Auth  │         │  Supabase Database   │
│  (JWT sessions) │         │  (chat_sessions,     │
│  Google OAuth   │         │   profiles)          │
└─────────────────┘         └──────────────────────┘
                                       │
                             ┌─────────────────────┐
                             │   Node.js Backend   │
                             │   localhost:3000    │
                             │                     │
                             │  POST /api/ai/chat  │
                             │  POST /api/ai/extract│
                             │  POST /api/ai/analyze│
                             │  POST /api/ai/negotiate│
                             │  POST /api/ai/trace │
                             └──────────┬──────────┘
                                        │
                             ┌──────────────────────┐
                             │      Groq API        │
                             │  (LLaMA 3.1 70B)     │
                             └──────────────────────┘
```

---

## 3. Frontend Architecture

### Entry Points

The application has two HTML entry points:

**`login.html`** — Self-contained auth page. Loads Supabase via CDN, no Vite module imports. Handles sign-in, sign-up, password reset, and Google OAuth. On successful auth, redirects to `index.html`.

**`index.html`** — Main app shell. Loads `src/main.js` as an ES module. Contains only a single `<div id="app">` — all DOM is generated programmatically by `main.js`.

### Rendering Strategy

The app does not use a framework. All UI is rendered via template literals injected into the DOM using `innerHTML`. This was a deliberate simplicity choice — there are no components to reconcile, no virtual DOM, and no build-time JSX transform.

```
main.js
  ├── Injects full header HTML into #app
  ├── Calls renderSidebar() → injects into #sidebar
  ├── Calls initChatbot() → appends floating panel to body
  └── Listens for 'fg:incident-ready' custom event
            ↓ when fired:
       runAgents() → parallel fetch to backend
            ↓ on results:
       renderResults() → injects analysis cards into #main-content
```

### Custom Event Bus

The chatbot and the main app communicate via a DOM custom event rather than a shared module import. This keeps the chatbot decoupled:

```javascript
// chatbot.js emits:
document.dispatchEvent(new CustomEvent('fg:incident-ready', { detail: incidentData }))

// main.js listens:
document.addEventListener('fg:incident-ready', (e) => { runAgents(e.detail) })
```

---

## 4. Agent Pipeline

### Pipeline Flow

```
INTAKE PHASE
────────────
User → Arya chatbot (chatbot.js)
          │
          ├── getChatResponse()      → POST /api/ai/chat    → Arya reply text
          └── extractIncidentData()  → POST /api/ai/extract → structured JSON
                    {
                      complete: bool,
                      name, amount, bank,
                      contact, txnId, description
                    }


ANALYSIS PHASE (parallel)
──────────────────────────
Incident object
    ├──→ runFraudAnalyzer()    → POST /api/ai/analyze   → fraudAnalysis
    │         { fraudType, subType, severity,
    │           recoveryScore, timeToAct,
    │           estimatedRecoverable }
    │
    ├──→ runNegotiationAgent() → POST /api/ai/negotiate → negotiation
    │         { strategy, script, escalationPath,
    │           expectedTimeline, successProbability }
    │
    └──→ runTraceAgent()       → POST /api/ai/trace     → trace
              { hops, suspiciousAccounts,
                jurisdictions, recoveryPathways }


RENDER PHASE
────────────
All three results → renderResults() → DOM cards
                  → drawScoreRing()   → Canvas
                  → drawTraceGraph()  → Canvas
                  → updateChatSession() → Supabase
```

### Agent Responsibilities

**chatIntake.js** — Manages the conversation with Arya. Sends the full message history to the backend on each turn. Runs extraction in parallel with the chat reply so there is no extra round trip. Tracks which fields have been collected and emits a `complete: true` signal when all required fields are present.

**fraudAnalyzer.js** — Sends the formatted incident text to the backend. Receives a structured analysis object. Does not interpret or modify the result — it is passed directly to the renderer and to the other agents as enrichment context.

**negotiationAgent.js** — Receives the incident text enriched with fraud classification data. The enrichment (fraud type, severity, recovery score) is concatenated into the prompt string before sending, giving the negotiation agent more context without requiring the backend to know about inter-agent dependencies.

**traceAgent.js** — Similar enrichment pattern to the negotiation agent. Receives fraud type and severity to help focus the trace on the most likely recovery pathway.

---

## 5. Data Layer

### Supabase Schema

**`chat_sessions`** — The primary table. One row per fraud incident.

```sql
id           uuid      PRIMARY KEY
created_at   timestamptz
victim_name  text
amount       numeric
bank         text
contact      text
txn_id       text
description  text
messages     jsonb     -- Full conversation history array
analysis     jsonb     -- Combined analysis results object
status       text      -- 'open' | 'activated' | 'closed'
```

**`profiles`** — One row per authenticated user, auto-created on signup via trigger.

```sql
id         uuid  REFERENCES auth.users
full_name  text
email      text
created_at timestamptz
```

### Session Lifecycle

```
1. User sends first message with extractable data
        ↓
2. saveChatSession() called → row inserted, ID returned
        ↓
3. chatState.sessionId stored in memory
        ↓
4. Every subsequent message → updateChatSession() called
        ↓
5. User clicks Activate → status set to 'activated'
        ↓
6. Agent results arrive → analysis jsonb column updated
        ↓
7. User exports PDF → no DB interaction needed
```

### Supabase Client

The Supabase client is instantiated once in `src/utils/supabase.js` and exported. All modules import from this single instance. The client is initialized with the public anon key, which is safe to expose in the browser — Supabase Row Level Security (RLS) controls what the anon key can access.

---

## 6. Authentication Architecture

```
login.html
    │
    ├── Email/Password → supabase.auth.signInWithPassword()
    ├── Sign Up        → supabase.auth.signUp()
    ├── Forgot PW      → supabase.auth.resetPasswordForEmail()
    └── Google OAuth   → supabase.auth.signInWithOAuth({ provider: 'google' })
              │
              ▼
    Supabase issues JWT
              │
              ▼
    Browser stores session in localStorage (handled by Supabase SDK)
              │
              ▼
    Redirect to index.html
              │
              ▼
    main.js auth guard:
      supabase.auth.getSession()
        ├── session exists → proceed
        └── no session    → redirect to login.html

    supabase.auth.onAuthStateChange()
      └── SIGNED_OUT event → redirect to login.html
```

---

## 7. API Layer

All LLM requests go through the backend proxy. Vite's `server.proxy` configuration in `vite.config.js` forwards any request to `/api/*` to `http://localhost:3000` during development.

### Endpoints

| Endpoint | Input | Output | Used By |
|---|---|---|---|
| `POST /api/ai/chat` | `{ message, history, sessionId }` | `{ reply }` | chatbot.js |
| `POST /api/ai/extract` | `{ transcript }` | `{ data: {...} }` | chatIntake.js |
| `POST /api/ai/analyze` | `{ incident, sessionId }` | `{ analysis }` | fraudAnalyzer.js |
| `POST /api/ai/negotiate` | `{ incident }` | `{ negotiation }` | negotiationAgent.js |
| `POST /api/ai/trace` | `{ incident }` | `{ trace }` | traceAgent.js |

### Error Handling

All agent modules share the same `post()` helper pattern:

```javascript
async function post(endpoint, body) {
  const res = await fetch(endpoint, { method: 'POST', ... })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error: ${res.status}`)
  }
  return res.json()
}
```

Errors bubble up to `main.js` where they are caught and displayed as inline error states in the UI.

---

## 8. State Management

There is no global state store. State is managed at two levels:

**App-level state** (`main.js`):

```javascript
let state = {
  mode: 'chat' | 'form',
  messages: [],
  extracted: {},         // Parsed incident fields from chat
  incident: null,        // Final incident object sent to agents
  analysis: null,        // fraudAnalyzer result
  negotiation: null,     // negotiationAgent result
  trace: null,           // traceAgent result
  chatBusy: false,
  chatReady: false
}
```

**Chatbot-level state** (`chatbot.js`):

```javascript
const chatState = {
  open: false,
  busy: false,
  messages: [],          // Full conversation history
  extracted: {},         // Incrementally built incident fields
  ready: false,          // True when all required fields collected
  unread: 0,
  sessionId: null        // Supabase row ID
}
```

State is mutated directly (no immutability). Re-renders are triggered manually by calling render functions after state changes.

---

## 9. Module Reference

### `src/main.js`
App entry point. Injects full page HTML, initializes the chatbot, wires the sidebar form, and orchestrates the agent pipeline when `fg:incident-ready` fires. Calls `renderResults()` with the combined agent outputs.

### `src/agents/chatbot.js`
Mounts the floating chat button and panel entirely in JavaScript (CSS injected via `<style>` tag at runtime). Manages its own internal state. Calls `getChatResponse()` and `extractIncidentData()` on each user message. Persists sessions to Supabase. Emits `fg:incident-ready` when `extracted.complete === true` and the user confirms.

### `src/agents/chatIntake.js`
Two exported functions: `getChatResponse(messages)` for getting Arya's next reply, and `extractIncidentData(messages)` for parsing structured fields. Both call the API layer in `api.js`.

### `src/agents/fraudAnalyzer.js`
Single exported function `runFraudAnalyzer(incidentText, sessionId)`. Posts to `/api/ai/analyze`. Returns the analysis object.

### `src/agents/negotiationAgent.js`
Single exported function `runNegotiationAgent(incidentText, fraudAnalysis)`. Enriches the prompt with fraud analysis fields before posting to `/api/ai/negotiate`.

### `src/agents/traceAgent.js`
Single exported function `runTraceAgent(incidentText, fraudAnalysis)`. Same enrichment pattern. Posts to `/api/ai/trace`.

### `src/utils/supabase.js`
Exports the `supabase` client instance plus four helper functions: `saveChatSession()`, `updateChatSession()`, `fetchRecentSessions()`, `appendMessage()`.

### `src/utils/api.js`
Exports `callClaude()` and `callClaudeJSON()` — wrappers used by `chatIntake.js` that post to `/api/ai/chat` and `/api/ai/extract` respectively.

### `src/utils/canvas.js`
Exports `drawScoreRing(canvas, score, color)` and `drawTraceGraph(canvas, traceData)`. Pure Canvas 2D API — no external charting library.

### `src/utils/pdf.js`
Exports `exportComplaintPDF(incidentData, analysisData)`. Uses jsPDF to generate a structured complaint document with incident fields, fraud classification, and negotiation script.

---

## 10. Design System

All design tokens are defined as CSS custom properties in `src/styles/main.css`:

```css
/* Colors */
--red: #E8341A          /* Primary accent */
--red-dim: #C42C15      /* Hover/pressed state */
--red-glow: rgba(232,52,26,0.15)
--amber: #F0A500        /* Warning / unread badge */
--green: #22C55E        /* Success / online status */
--blue: #3B82F6         /* Info */

/* Backgrounds (dark surface system) */
--bg-base: #0A0A0B      /* Page background */
--bg-surface: #111113   /* Cards */
--bg-raised: #18181B    /* Inputs, panel header */
--bg-hover: #1E1E22     /* Hover states */

/* Borders */
--border: rgba(255,255,255,0.07)
--border-mid: rgba(255,255,255,0.12)
--border-strong: rgba(255,255,255,0.22)

/* Typography */
--font-display: 'Syne'           /* Headings, logo, buttons */
--font-body: 'DM Sans'           /* Body text, inputs */
--font-mono: 'JetBrains Mono'    /* Labels, status, code */

/* Border radius */
--radius-sm: 6px
--radius-md: 10px
--radius-lg: 16px
--radius-xl: 24px
```

---

## 11. Security Model

**API key protection**: The Groq API key exists only on the backend server (`backend/.env`). The frontend never has access to it. All LLM calls go through the backend proxy.

**Supabase anon key**: The Supabase anon key is safe to expose in the browser. It only allows operations permitted by Row Level Security policies. Private data is protected at the database layer.

**Authentication**: Supabase Auth issues JWTs stored in localStorage by the Supabase SDK. The auth guard in `main.js` checks for a valid session on every page load. The `onAuthStateChange` listener handles session expiry and sign-out events.

**Input sanitization**: All user-supplied content rendered into chat bubbles passes through an `escapeHtml()` function to prevent XSS.

---

## 12. Deployment Architecture

### Development

```
npm run dev
→ Vite dev server on :5173
→ Vite proxies /api/* → localhost:3000 (backend)
→ Hot module replacement enabled
```

### Production Build

```
npm run build
→ Vite bundles to dist/
→ dist/index.html + dist/login.html
→ dist/assets/ (hashed JS + CSS bundles)
```

### Recommended Hosting

| Service | Use For |
|---|---|
| Vercel / Netlify | Static frontend (dist/) |
| Railway / Render | Node.js backend |
| Supabase Cloud | Database + Auth |

### Environment Variables in Production

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your hosting platform's environment settings. These are injected at build time by Vite. The backend `VITE_GROQ_API_KEY` should be set on the backend host only and must never be in the frontend build.