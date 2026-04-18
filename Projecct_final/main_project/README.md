# FraudGuard AI — Negotiator Agent

> Real-time AI-powered fraud detection, negotiation, and recovery system for UPI and digital payment scams.

![Version](https://img.shields.io/badge/version-1.0.0-red)
![Vite](https://img.shields.io/badge/vite-5.4.21-646CFF)
![Supabase](https://img.shields.io/badge/supabase-2.45.0-3ECF8E)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## What is FraudGuard AI?

FraudGuard AI is a multi-agent web application that helps fraud victims report, analyze, and recover from UPI scams and digital payment fraud. A victim talks to **Arya** — an AI intake agent — who collects incident details conversationally. The system then runs three specialized AI agents in parallel: a Fraud Analyzer, a Negotiation Agent, and a Trace Agent. Every session is persisted to Supabase in real time.

---

## Features

- **Arya — Conversational Intake Agent**: A floating chatbot that guides victims through reporting their incident using natural language. Extracts structured data (victim name, amount, bank, transaction ID, contact) automatically.
- **Fraud Analyzer**: Classifies fraud type, severity score, and recovery probability.
- **Negotiation Agent**: Generates a bank negotiation strategy and draft scripts tailored to the specific fraud type.
- **Trace Agent**: Maps the transaction trail and identifies recovery pathways.
- **Canvas Visualizations**: Score rings and trace graph rendered on HTML5 Canvas.
- **PDF Export**: One-click complaint document generation with all incident details.
- **Supabase Persistence**: All sessions, messages, and analysis results saved to a PostgreSQL database in real time.
- **Authentication**: Supabase Auth with email/password and Google OAuth.
- **Manual Form Mode**: Alternative to chat — users can fill in incident details directly.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES Modules), HTML5, CSS3 |
| Build Tool | Vite 5 |
| AI Backend | Groq API (via proxy backend at `/api/ai/*`) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Charts | Chart.js 4 |
| PDF | jsPDF |
| Fonts | Syne, DM Sans, JetBrains Mono (Google Fonts) |

---

## Project Structure

```
main_project/
├── index.html                  # Main app entry
├── login.html                  # Authentication page
├── vite.config.js              # Vite config + proxy to backend
├── package.json
├── .env.local                  # Environment variables (never commit)
├── .env.example                # Template for env vars
└── src/
    ├── main.js                 # App bootstrap + orchestration
    ├── agents/
    │   ├── chatbot.js          # Arya floating chatbot
    │   ├── chatIntake.js       # Message handling + data extraction
    │   ├── fraudAnalyzer.js    # Fraud classification agent
    │   ├── negotiationAgent.js # Bank negotiation strategy agent
    │   └── traceAgent.js       # Transaction trace agent
    ├── utils/
    │   ├── supabase.js         # Supabase client + session helpers
    │   ├── api.js              # Backend API wrappers
    │   ├── canvas.js           # Score rings + trace graph rendering
    │   └── pdf.js              # PDF complaint export
    └── styles/
        └── main.css            # Global styles + design tokens
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A backend running at `localhost:3000` that proxies to Groq (see `vite.config.js`)

### 1. Install dependencies

```bash
cd main_project
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GROQ_API_KEY=your-groq-key
```

### 3. Set up Supabase

Run the following SQL in your Supabase SQL Editor:

```sql
-- Chat sessions table
create table public.chat_sessions (
  id           uuid default gen_random_uuid() primary key,
  created_at   timestamptz default now(),
  victim_name  text,
  amount       numeric,
  bank         text,
  contact      text,
  txn_id       text,
  description  text,
  messages     jsonb default '[]',
  analysis     jsonb,
  status       text default 'open'
);

-- Optional: user profiles
create table public.profiles (
  id         uuid references auth.users on delete cascade primary key,
  full_name  text,
  email      text,
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### 4. Enable Google OAuth (optional)

In Supabase Dashboard → Authentication → Providers → Google, add your Google OAuth credentials from [Google Cloud Console](https://console.cloud.google.com).

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:5173/login.html](http://localhost:5173/login.html) to start.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server on port 5173 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous public key |
| `VITE_GROQ_API_KEY` | Yes | Groq API key (used by backend) |

> **Security Note**: The Groq API key is only used server-side via the backend proxy (`/api/ai/*`). It is never exposed to the browser.

---

## Authentication Flow

1. User lands on `login.html`
2. Signs in or creates an account via Supabase Auth
3. Successful auth redirects to `index.html`
4. Auth guard in `main.js` blocks unauthenticated access and redirects back to `login.html`
5. Sign-out clears the Supabase session and redirects to `login.html`

---

## How the Agent Pipeline Works

```
User speaks to Arya (chatbot)
        ↓
chatIntake.js extracts incident fields
        ↓
Incident saved to Supabase (chat_sessions)
        ↓
User clicks "Activate Fraud Response"
        ↓
Three agents run in parallel:
  ├── fraudAnalyzer.js  → /api/ai/analyze
  ├── negotiationAgent.js → /api/ai/negotiate
  └── traceAgent.js    → /api/ai/trace
        ↓
Results rendered + saved to Supabase
        ↓
User exports PDF complaint
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## License

MIT © 2024 FraudGuard AI