# FraudGuard AI — Prototype Documentation

> A complete walkthrough of the prototype: what was built, how it works end-to-end, known limitations, and the roadmap to a production system.

---

## Table of Contents

1. [Prototype Scope](#1-prototype-scope)
2. [User Journey](#2-user-journey)
3. [Screen-by-Screen Walkthrough](#3-screen-by-screen-walkthrough)
4. [Agent Behaviors](#4-agent-behaviors)
5. [Data Flow Walkthrough](#5-data-flow-walkthrough)
6. [Supabase Integration](#6-supabase-integration)
7. [What Works Today](#7-what-works-today)
8. [Known Limitations](#8-known-limitations)
9. [Prototype vs Production Gap Analysis](#9-prototype-vs-production-gap-analysis)
10. [Roadmap](#10-roadmap)
11. [Testing the Prototype](#11-testing-the-prototype)

---

## 1. Prototype Scope

This prototype demonstrates a full end-to-end fraud response workflow — from a victim reporting an incident in plain language to receiving AI-generated analysis, negotiation scripts, and a transaction trace — all within a single browser session.

The prototype is fully functional (not a mockup or wireframe). All AI calls are live, all data is persisted to a real Supabase database, and the PDF export generates a real document.

**What this prototype proves:**
- Conversational intake is faster and more complete than a static form
- Multiple specialized AI agents running in parallel can produce useful, actionable outputs in under 30 seconds
- Real-time session persistence means no data is lost if the user closes the tab
- The UX pattern (chat → activation → analysis → export) is intuitive for non-technical fraud victims

---

## 2. User Journey

```
START
  │
  ▼
1. AUTHENTICATE
   User visits login.html
   → Signs in or creates account
   → Redirected to main app
  │
  ▼
2. REPORT INCIDENT (two paths)
   Path A: Talk to Arya (chatbot)
     → User describes fraud in natural language
     → Arya asks follow-up questions
     → Fields extracted automatically
     → Progress bar fills as fields are collected
     → "Activate Fraud Response" button appears when ready
  
   Path B: Manual Form
     → User fills in name, bank, amount, contact, txn ID, description
     → Clicks "Run Analysis"
  │
  ▼
3. ANALYSIS PHASE
   → Three AI agents run simultaneously (~10-20 seconds)
   → Loading states shown per agent
   → Results appear as they complete
  │
  ▼
4. REVIEW RESULTS
   → Fraud Analysis card: type, severity, recovery score ring
   → Negotiation card: strategy + draft bank complaint script
   → Trace card: transaction hops + recovery pathways
  │
  ▼
5. EXPORT
   → Click "Export PDF"
   → Downloads a formatted complaint document
   → Ready to submit to bank or cybercrime portal
  │
  END
```

---

## 3. Screen-by-Screen Walkthrough

### Screen 1: Login Page (`login.html`)

A dark, full-screen authentication page matching the main app's visual identity.

**Elements:**
- FraudGuard AI logo (red shield + Syne font)
- Animated grid background with red glow orb
- Sign In / Create Account tab switcher
- Email + password fields with icons
- Show/hide password toggle
- Forgot password link (sends Supabase reset email)
- "Sign In" / "Create Account" submit button with loading spinner
- Google OAuth button
- Inline error/success/info alerts
- Auto-redirect if already authenticated

**Behavior on Sign In:** Calls `supabase.auth.signInWithPassword()`. On success, redirects to `index.html` after 1 second.

**Behavior on Sign Up:** Calls `supabase.auth.signUp()` with full name in metadata. Hides the form and shows an email verification prompt. The user must click the confirmation link before they can sign in.

**Behavior on Forgot Password:** Reads email from the input field and calls `supabase.auth.resetPasswordForEmail()`. Shows a confirmation alert.

---

### Screen 2: Main Dashboard (`index.html`)

A two-column layout: sidebar on the left, main content on the right.

**Header:**
- FraudGuard AI logo
- "v1.0 · Negotiator Agent" subtitle
- "SYSTEM ONLINE" status badge with animated pulse dot

**Sidebar — Chat Mode:**
- Mode toggle: "Talk to Arya" / "Manual Form"
- When in chat mode, the sidebar shows a prompt to use the floating Arya chatbot
- Shows extracted incident fields as they are collected (live preview)

**Sidebar — Form Mode:**
- Input fields: Victim Name, Bank Name, Amount (₹), Contact Number, Transaction ID, Incident Description
- "Run Analysis" button

**Main Content — Empty State:**
- Shield icon
- "No incident loaded" message
- Instruction text

**Main Content — Results State (after analysis):**
- Fraud Analysis card with Canvas score ring
- Negotiation Strategy card
- Transaction Trace card with Canvas graph
- Export PDF button

---

### Screen 3: Arya Chatbot (floating panel)

A floating button fixed to the bottom-right corner of the screen, always accessible on top of the main dashboard.

**Floating trigger button:**
- Red circular button with shield-check icon
- Animated pulse ring to draw attention
- Unread badge (amber, shows count of unread messages)
- Transforms to an X when panel is open

**Chat panel (opens above the button):**
- Arya avatar with "Fraud Response Specialist · Online" status
- Green "Session saved to Supabase" indicator bar
- Scrollable message list
- Typing indicator (three animated dots) while waiting for response
- Intake progress bar (fills as fields are extracted)
- "Enough info gathered" green banner when all fields collected
- "Activate Fraud Response" red button
- Text input + send button

---

## 4. Agent Behaviors

### Arya — Intake Agent

Arya is prompted to act as an empathetic fraud response specialist. She asks for: the victim's name, the amount lost, the bank involved, the fraudster's contact number, the transaction ID, and a description of what happened. She collects this conversationally rather than asking all questions at once.

**Extraction runs in parallel** with the chat response. The extraction call sends the full conversation transcript and receives a JSON object with all currently known fields plus a `complete: boolean` flag.

**Progress tracking:** Five fields are tracked (name, amount, bank, contact, txnId). The progress bar percentage = (fields filled / 5) × 100.

**Activation:** The "Activate Fraud Response" button appears only when `complete === true`. Clicking it fires the `fg:incident-ready` custom event and closes the chatbot panel.

---

### Fraud Analyzer Agent

Receives a formatted incident text string. Returns:

```json
{
  "fraudType": "UPI Impersonation",
  "subType": "Bank Official Impersonation",
  "severity": "HIGH",
  "recoveryScore": 72,
  "timeToAct": "Within 24 hours",
  "estimatedRecoverable": "₹45,000"
}
```

The `recoveryScore` (0–100) is rendered as an animated Canvas arc (score ring). Color is green above 60, amber 30-60, red below 30.

---

### Negotiation Agent

Receives incident text enriched with fraud classification. Returns a negotiation strategy and a draft complaint script the victim can use when calling their bank.

The strategy includes: which department to contact, what to say, what documentation to have ready, the escalation path if the first-line response fails, and a probability of success.

---

### Trace Agent

Receives incident text enriched with fraud type and severity. Returns a list of transaction hops (account numbers, banks, timestamps), suspicious accounts flagged for reporting, jurisdictions involved, and recommended recovery pathways (RBI, NPCI, cybercrime portal, etc.).

The trace hops are rendered as a linear graph on an HTML5 Canvas element — circles connected by lines, with the origin in green, intermediate hops in amber, and the destination in red.

---

## 5. Data Flow Walkthrough

### Complete flow for a chat-initiated session:

```
1. User opens app → main.js auth guard checks Supabase session
   └── No session → redirected to login.html
   └── Session exists → app loads

2. App loads → initChatbot() runs
   └── Chatbot DOM mounted
   └── After 600ms delay → getChatResponse([]) called
   └── POST /api/ai/chat { message: '__greeting__', history: [] }
   └── Arya's opening message rendered in chat

3. User types "I lost 50000 to a fake RBI officer"
   └── pushMessage('user', text) → added to chatState.messages
   └── POST /api/ai/chat { message, history } → Arya reply
   └── POST /api/ai/extract { transcript } → partial fields
   └── Both calls run in parallel via Promise.all()

4. Extracted fields arrive: { amount: "50000", description: "..." }
   └── Merged into chatState.extracted
   └── Progress bar updated (1/5 fields = 20%)
   └── Object.keys(extracted).length > 0 → saveChatSession() called
   └── New row inserted in Supabase chat_sessions
   └── chatState.sessionId = new row UUID
   └── Toast notification: "✓ Session saved · ID: abc12345"

5. Conversation continues → 4 more fields extracted
   └── Each turn → updateChatSession() with new messages + fields
   └── Progress bar reaches 100%

6. complete: true returned by extraction
   └── chatState.ready = true
   └── renderReadyBanner() shows green banner + Activate button

7. User clicks "Activate Fraud Response"
   └── updateChatSession(id, { status: 'activated' })
   └── document.dispatchEvent('fg:incident-ready', { detail: incident })
   └── Chatbot panel closes

8. main.js receives 'fg:incident-ready'
   └── state.incident = incident data
   └── runAgents() called

9. runAgents() runs three parallel fetches:
   └── POST /api/ai/analyze  → fraudAnalysis
   └── POST /api/ai/negotiate (enriched with analysis) → negotiation
   └── POST /api/ai/trace (enriched with analysis) → trace
   └── All three via Promise.allSettled()

10. Results arrive → renderResults()
    └── DOM cards injected into #results-content
    └── drawScoreRing(canvas, recoveryScore) called
    └── drawTraceGraph(canvas, trace.hops) called
    └── updateChatSession(id, { analysis: { fraudAnalysis, negotiation, trace } })
```

---

## 6. Supabase Integration

### What is stored

Every chat session stores:
- The full conversation history (every message, both user and Arya)
- Incrementally extracted fields (name, amount, bank, etc.)
- The final combined analysis JSON (fraud classification + negotiation + trace)
- Session status (open → activated)
- Timestamps

### Real-time persistence

Sessions are saved as soon as the first extractable field appears — not at the end of the conversation. This means if the user closes the tab mid-conversation, the data is not lost. A future version could offer a "resume session" flow.

### Auth integration

The `profiles` table links to `auth.users`. A database trigger automatically inserts a profile row when a new user signs up. This enables future features like a personal case history page.

---

## 7. What Works Today

All of the following are fully functional in the current prototype:

- Complete authentication flow (sign up, sign in, forgot password, Google OAuth)
- Auth guard protecting the main app
- Arya chatbot with conversational intake
- Real-time field extraction and progress tracking
- Supabase session persistence (create + update)
- Toast notifications with session ID
- Manual form mode as fallback
- Fraud analyzer (live AI call)
- Negotiation agent (live AI call)
- Trace agent (live AI call)
- Canvas score ring visualization
- Canvas trace graph visualization
- PDF export
- All UI states (empty, loading, results, error)

---

## 8. Known Limitations

**No session resume**: If a user closes the browser mid-conversation, the session is saved to Supabase but there is no UI to resume it. The user would need to start over.

**No user-to-session linking**: Sessions are not linked to the authenticated user's ID. Any authenticated user could theoretically query any session if RLS is not configured. RLS policies should be added to `chat_sessions` before production.

**No rate limiting on the frontend**: Users can spam the send button faster than the debounce. The `chatState.busy` flag prevents duplicate in-flight requests but rapid successive sends could queue up.

**Extraction is probabilistic**: The AI extraction model may miss fields or extract incorrect values (e.g., a mentioned number not being the transaction ID). The progress bar reflects what the model extracted, not ground truth.

**No input validation on amounts**: The amount field accepts any string. Numeric validation and currency formatting should be added.

**Backend is not included in this repository**: The `vite.config.js` proxies to `localhost:3000` but the backend code is separate. The frontend will fail gracefully but all AI features require the backend to be running.

**Mobile layout not optimized**: The two-column layout is designed for desktop. The chatbot panel may overflow on small screens.

---

## 9. Prototype vs Production Gap Analysis

| Area | Prototype | Production Requirement |
|---|---|---|
| Auth | Supabase Auth, basic flow | MFA, session timeout policies, audit log |
| Database | No RLS policies | Row Level Security on all tables linking data to `auth.uid()` |
| API Security | Backend key in env | API rate limiting, IP allowlisting, request signing |
| Error Handling | Console errors + UI alerts | Structured error logging (Sentry), alerting |
| Session Resume | Not supported | Persistent session list, resume from last message |
| Mobile | Partially responsive | Fully responsive layout, PWA manifest |
| Offline | Not supported | Service worker, offline queue |
| Analytics | None | User journey tracking, agent performance metrics |
| Compliance | None | DPDPA (India) data handling, consent management |
| Testing | None | Unit tests for agents, E2E tests for auth flow |
| Monitoring | None | Uptime monitoring, Supabase health checks |
| Backup | Supabase default | Point-in-time recovery, data export |

---

## 10. Roadmap

### v1.1 — Hardening
- Add Row Level Security to `chat_sessions` (`user_id = auth.uid()`)
- Link sessions to authenticated user: add `user_id uuid references auth.users` column
- Input validation and sanitization on all form fields
- Mobile-responsive layout pass

### v1.2 — Session Management
- "My Cases" page listing all past sessions for the logged-in user
- Session resume — reload a past conversation and continue from where it left off
- Case status workflow: Open → In Progress → Escalated → Resolved

### v1.3 — Enhanced Intelligence
- Agent memory: feed previous session outcomes back into the fraud analyzer to improve recovery score accuracy over time
- Multi-language support for Arya (Hindi, Marathi, Telugu)
- Direct integration with NPCI's cybercrime reporting API

### v2.0 — Platform
- Bank integration layer — direct API connections to HDFC, SBI, ICICI dispute systems
- Victim dashboard with case timeline
- Lawyer referral network integration
- Success rate tracking per fraud type and bank

---

## 11. Testing the Prototype

### Quick start test script

Use these inputs to test the full pipeline:

**Suggested chat input for Arya:**
```
Hi, I lost ₹75,000 yesterday. A person called me claiming to be from SBI fraud department 
and said my account was compromised. He told me to transfer money to a "safe account" 
with UPI ID safezone@ybl. The transaction ID was UPI123456789. 
My name is Rahul Sharma and the fraudster's number was 9876543210.
```

After 2-3 messages, Arya should have extracted all fields and the Activate button should appear.

### Expected results

After activation you should see:
- **Fraud Type**: Vishing / Bank Official Impersonation
- **Severity**: HIGH
- **Recovery Score**: 60-80% (within 24-hour window)
- **Negotiation**: Script for calling SBI dispute resolution
- **Trace**: UPI hop from victim → safezone@ybl with flagged account

### Manual form test

Switch to "Manual Form" in the sidebar and fill in:
- Name: Test User
- Bank: HDFC Bank
- Amount: 25000
- Contact: 9999999999
- Transaction ID: TXN987654321
- Description: Received a fake KYC update SMS and clicked the link, entered OTP

---

*Document version 1.0 — FraudGuard AI Prototype*