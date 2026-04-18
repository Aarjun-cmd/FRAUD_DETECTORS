// All imports MUST be at the top — consolidated here
import { supabase } from './utils/supabase.js'
import './styles/main.css'
import { renderAnomalySection } from './utils/anomaly.js'
import { runFraudAnalyzer } from './agents/fraudAnalyzer.js'
import { runNegotiationAgent } from './agents/negotiationAgent.js'
import { runTraceAgent } from './agents/traceAgent.js'
import { getChatResponse, extractIncidentData } from './agents/chatIntake.js'
import { drawTraceGraph, drawScoreRing } from './utils/canvas.js'
import { exportComplaintPDF } from './utils/pdf.js'
import { initChatbot } from './agents/chatbot.js'

// ── Auth Guard ─────────────────────────────────────────
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = '/login.html'
}

window.__currentUser = session?.user ?? null

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    window.location.href = '/login.html'
  }
})

// ── State ──────────────────────────────────────────────
let state = {
  mode: 'chat',
  messages: [],
  extracted: {},
  incident: null,
  analysis: null,
  negotiation: null,
  trace: null,
  chatBusy: false,
  chatReady: false
}

// ── Bootstrap ──────────────────────────────────────────
document.getElementById('app').innerHTML = `
<div class="header">
  <div class="header-logo">
    <div class="logo-mark">
      <svg viewBox="0 0 18 18" fill="none">
        <path d="M9 1.5L2.25 5.25V9.75C2.25 13.41 5.19 16.815 9 17.625C12.81 16.815 15.75 13.41 15.75 9.75V5.25L9 1.5Z" fill="rgba(255,255,255,0.15)" stroke="white" stroke-width="1.2"/>
        <path d="M6 9L8 11L12 7" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="logo-text">Fraud<span>Guard</span> AI</div>
  </div>
  <div class="header-sep"></div>
  <div class="header-sub">v1.0 · Negotiator Agent</div>
  <div class="header-status">
    <div class="status-pulse"></div>
    SYSTEM ONLINE
  </div>
  <button class="btn-signout" onclick="signOut()" style="margin-left:auto;background:none;border:1px solid rgba(255,255,255,0.12);color:#A1A1AA;font-size:12px;padding:5px 12px;border-radius:6px;cursor:pointer;">Sign Out</button>
</div>
<div class="layout">
  <aside class="sidebar" id="sidebar"></aside>
  <main class="main" id="main-content">
    <div class="empty-state" id="empty-state">
      <div class="empty-icon">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 3L4 8.5V15C4 20.25 8.4 25.15 14 26.5C19.6 25.15 24 20.25 24 15V8.5L14 3Z" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
          <circle cx="14" cy="14" r="4" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>
        </svg>
      </div>
      <div class="empty-title">No incident loaded</div>
      <div class="empty-desc">Talk to Arya to describe what happened, or use the manual form.</div>
    </div>
    <div id="results-content" style="display:none"></div>
  </main>
</div>`

renderSidebar()

// ── Sign out ───────────────────────────────────────────
window.signOut = async () => {
  await supabase.auth.signOut()
  window.location.href = '/login.html'
}

// ── Init floating chatbot ──────────────────────────────
initChatbot()

// Listen for incident ready event from the floating chatbot
document.addEventListener('fg:incident-ready', (e) => {
  state.incident = e.detail
  state.extracted = { ...e.detail }
  state.mode = 'form'
  runAgents()
})

// ── Sidebar ────────────────────────────────────────────
function renderSidebar() {
  const s = state
  document.getElementById('sidebar').innerHTML = `
    <div>
      <div class="mode-toggle">
        <button class="mode-btn ${s.mode === 'chat' ? 'active' : ''}" onclick="setMode('chat')">💬 Talk to Arya</button>
        <button class="mode-btn ${s.mode === 'form' ? 'active' : ''}" onclick="setMode('form')">📋 Manual form</button>
      </div>
      ${s.mode === 'chat' ? renderChatSidebar() : renderFormSidebar()}
    </div>
    ${(s.analysis || s.negotiation || s.trace) ? `
    <div>
      <div class="section-header" style="margin-top:1.5rem">
        <span class="section-tag">AGENTS</span>
      </div>
      <div class="pipeline">
        ${pipeStep(1,'🔍','Fraud Analyzer','classify · score · assess')}
        ${pipeStep(2,'⚖️','Negotiation Agent','checklist · complaint · freeze')}
        ${pipeStep(3,'🔗','Trace Agent','money flow · freeze windows')}
      </div>
    </div>` : ''}
  `
  if (s.mode === 'chat') {
    renderMessages()
    setupInput()
  }
}

function pipeStep(n, icon, name, desc) {
  const done = (n===1&&state.analysis)||(n===2&&state.negotiation)||(n===3&&state.trace)
  const cls = done ? 'done' : ''
  return `<div class="pipe-step ${cls}">
    <div class="pipe-icon">${icon}</div>
    <div class="pipe-info">
      <div class="pipe-name">${name}</div>
      <div class="pipe-desc">${desc}</div>
      <div class="pipe-badge ${done?'done':''}">${done?'Complete ✓':'Waiting'}</div>
    </div>
  </div>`
}

// ── Chat sidebar ───────────────────────────────────────
function renderChatSidebar() {
  const ext = state.extracted
  const keys = ['name','amount','bank','contact','txnId']
  const filled = keys.filter(k => ext[k]).length
  const pct = Math.round((filled / keys.length) * 100)

  return `
    <div class="section-header">
      <span class="section-tag">INTAKE</span>
      <span class="section-title" style="font-size:11px">Arya · AI Specialist</span>
    </div>
    <div class="intake-progress"><div class="intake-progress-fill" style="width:${pct}%"></div></div>
    <div class="chat-window">
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-input-bar">
        <input class="chat-input" id="chat-input" type="text" placeholder="Describe what happened..." autocomplete="off"/>
        <button class="chat-send-btn" id="send-btn" onclick="handleSend()">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8L14 2L10 8L14 14L2 8Z" fill="white"/></svg>
        </button>
      </div>
    </div>
    ${filled > 0 ? `
    <div class="extracted-preview">
      <div class="extracted-header"><span>◆</span> Extracted from conversation</div>
      <div class="extracted-fields">
        ${[['name','Victim'],['amount','Amount'],['bank','Bank / App'],['contact','UPI ID'],['txnId','UTR / TXN']].map(([k,label]) => `
          <div class="extracted-field">
            <span class="extracted-key">${label}</span>
            <span class="extracted-val ${ext[k]?'':'missing'}">${ext[k] ? (k==='amount' ? '₹'+Number(ext[k]).toLocaleString('en-IN') : ext[k]) : '—'}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}
    ${state.chatReady ? `
    <div class="ready-banner"><span>✓</span> Ready to activate agents</div>
    <button class="btn-activate" style="margin-top:10px" onclick="handleActivateFromChat()">⚡ Activate Fraud Response</button>` : ''}
  `
}

// ── Form sidebar ───────────────────────────────────────
function renderFormSidebar() {
  const e = state.extracted
  const banks = ['PhonePe','Google Pay','Paytm','HDFC Bank','SBI','ICICI Bank','Axis Bank','Kotak Bank']
  return `
    <div class="section-header"><span class="section-tag">INCIDENT</span></div>
    <div class="form-group">
      <label class="form-label">Victim name</label>
      <input class="form-input" id="f_name" value="${e.name||'Rahul Sharma'}"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">UPI / Contact</label>
        <input class="form-input" id="f_contact" value="${e.contact||'rahul@okicici'}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Bank / App</label>
        <select class="form-select" id="f_bank">
          ${banks.map(b=>`<option${(e.bank||'HDFC Bank')===b?' selected':''}>${b}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Amount (₹)</label>
        <input class="form-input" id="f_amount" type="number" value="${e.amount||'45000'}"/>
      </div>
      <div class="form-group">
        <label class="form-label">UTR / TXN ID</label>
        <input class="form-input" id="f_txn" value="${e.txnId||'UTR348291047561'}"/>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Incident description</label>
      <textarea class="form-textarea" id="f_desc" rows="5">${e.description||'Received a call from someone posing as an HDFC Bank KYC officer. They said my account would be suspended unless I complete KYC verification. They guided me to share my OTP on a fake link. After sharing the OTP, ₹45,000 was transferred out of my account within seconds.'}</textarea>
    </div>
    <button class="btn-activate" onclick="handleActivateFromForm()">⚡ Activate Fraud Response</button>
  `
}

// ── Chat rendering ─────────────────────────────────────
function renderMessages() {
  const el = document.getElementById('chat-messages')
  if (!el) return
  el.innerHTML = state.messages.map(m => `
    <div class="chat-msg ${m.role}">
      <div class="chat-avatar ${m.role==='assistant'?'agent':'user'}">${m.role==='assistant'?'A':'U'}</div>
      <div class="chat-bubble">${m.content}</div>
    </div>`).join('')
  el.scrollTop = el.scrollHeight
}

function showTyping() {
  const el = document.getElementById('chat-messages')
  if (!el) return
  const d = document.createElement('div')
  d.id = 'typing'
  d.className = 'chat-msg agent'
  d.innerHTML = `<div class="chat-avatar agent">A</div><div class="chat-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`
  el.appendChild(d)
  el.scrollTop = el.scrollHeight
}

function hideTyping() { document.getElementById('typing')?.remove() }

function setupInput() {
  const inp = document.getElementById('chat-input')
  if (!inp) return
  inp.addEventListener('keydown', e => { if (e.key==='Enter') { e.preventDefault(); handleSend() }})
  if (state.messages.length === 0) setTimeout(startChat, 150)
}

async function startChat() {
  state.chatBusy = true
  showTyping()
  try {
    const reply = await getChatResponse([])
    hideTyping()
    state.messages.push({ role: 'assistant', content: reply })
    renderMessages()
  } catch(e) { hideTyping() }
  state.chatBusy = false
}

window.handleSend = async function() {
  if (state.chatBusy) return
  const inp = document.getElementById('chat-input')
  const text = inp?.value?.trim()
  if (!text) return
  inp.value = ''
  state.messages.push({ role: 'user', content: text })
  state.chatBusy = true
  renderMessages()
  document.getElementById('send-btn').disabled = true
  showTyping()
  try {
    const [reply, extracted] = await Promise.all([
      getChatResponse(state.messages),
      extractIncidentData(state.messages)
    ])
    hideTyping()
    state.messages.push({ role: 'assistant', content: reply })
    if (extracted) {
      Object.keys(extracted).forEach(k => {
        if (extracted[k] && k !== 'complete' && k !== 'missing' && k !== 'nextQuestion') {
          state.extracted[k] = extracted[k]
        }
      })
      state.chatReady = extracted.complete === true
    }
  } catch(err) {
    hideTyping()
    state.messages.push({ role: 'assistant', content: 'Sorry, I had a technical issue. Please try again.' })
  }
  state.chatBusy = false
  renderSidebar()
  setTimeout(() => document.getElementById('chat-input')?.focus(), 50)
}

// ── Mode switch ────────────────────────────────────────
window.setMode = function(mode) {
  state.mode = mode
  renderSidebar()
}

// ── Activate ───────────────────────────────────────────
window.handleActivateFromChat = function() {
  const e = state.extracted
  state.incident = {
    name: e.name || 'Unknown',
    contact: e.contact || '',
    bank: e.bank || 'Unknown Bank',
    amount: e.amount || '0',
    txnId: e.txnId || 'N/A',
    description: e.description || state.messages.filter(m=>m.role==='user').map(m=>m.content).join(' ')
  }
  runAgents()
}

window.handleActivateFromForm = function() {
  const name = document.getElementById('f_name')?.value?.trim()
  const contact = document.getElementById('f_contact')?.value?.trim()
  const bank = document.getElementById('f_bank')?.value
  const amount = document.getElementById('f_amount')?.value
  const txn = document.getElementById('f_txn')?.value?.trim()
  const desc = document.getElementById('f_desc')?.value?.trim()
  if (!desc||!amount||!name) { alert('Please fill name, amount, and description.'); return }
  state.incident = { name, contact, bank, amount, txnId: txn, description: desc }
  runAgents()
}

async function runAgents() {
  const i = state.incident
  const txt = `Victim: ${i.name} | UPI: ${i.contact} | Bank: ${i.bank} | Amount: ₹${i.amount} | TXN: ${i.txnId}\nDescription: ${i.description}`
  state.analysis = null; state.negotiation = null; state.trace = null
  document.getElementById('empty-state').style.display = 'none'
  document.getElementById('results-content').style.display = 'block'
  document.getElementById('results-content').innerHTML = skeleton()
  renderSidebar()
  try {
    state.analysis = await runFraudAnalyzer(txt); renderSidebar(); renderResults()
    state.negotiation = await runNegotiationAgent(txt, state.analysis); renderSidebar(); renderResults()
    state.trace = await runTraceAgent(txt, state.analysis); renderSidebar(); renderResults()
  } catch(err) {
    document.getElementById('results-content').innerHTML = `<div class="alert alert-red"><span>⚠</span> ${err.message}</div>`
    renderSidebar()
  }
}

// ── Results ────────────────────────────────────────────
function skeleton() {
  return `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-xl);padding:2rem;margin-bottom:1.5rem">
    <div class="skeleton" style="width:40%;height:18px;margin-bottom:12px"></div>
    <div class="skeleton" style="width:60%;height:12px;margin-bottom:8px"></div>
    <div class="skeleton" style="width:50%;height:12px"></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
    ${[1,2].map(()=>`<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem">${[1,2,3,4].map(()=>`<div class="skeleton" style="height:12px;margin-bottom:8px"></div>`).join('')}</div>`).join('')}
  </div>`
}

function renderResults() {
  const a = state.analysis, n = state.negotiation, t = state.trace
  const col = !a?'#52525B':a.recoveryScore>65?'#22C55E':a.recoveryScore>35?'#F0A500':'#E8341A'
  const svBadge = !a?'':({critical:'badge-red',high:'badge-red',medium:'badge-amber',low:'badge-green'}[a?.severity]||'badge-blue')

  document.getElementById('results-content').innerHTML = `
  <div class="score-hero fade-in">
    <div class="score-ring-wrap">
      <canvas id="scoreCanvas"></canvas>
      <div class="score-ring-label">
        <div class="score-pct" style="color:${col}">${a?a.recoveryScore+'%':'—'}</div>
        <div class="score-pct-sub">recovery</div>
      </div>
    </div>
    <div class="score-info">
      <div class="score-info-title">${a?a.fraudType:'Analyzing...'}</div>
      <div class="score-info-desc">${a?a.recoveryReason:'Classifying fraud type and assessing recovery probability...'}</div>
      <div class="badges">
        ${a?`<span class="badge ${svBadge}">${a.severity?.toUpperCase()} SEVERITY</span>`:''}
        ${a?`<span class="badge badge-blue">${a.subType}</span>`:''}
        ${a?`<span class="badge badge-amber">⏱ ${a.timeToAct}</span>`:''}
      </div>
    </div>
  </div>
  ${a?`${renderAnomalySection(state.incident, a)}<div class="cards-grid" style="margin-top:1.5rem">
    <div class="card">
      <div class="card-title"><span class="card-title-dot"></span>Fraud indicators</div>
      <ul style="list-style:none;display:flex;flex-direction:column;gap:7px">
        ${(a.indicators||[]).map(ind=>`<li style="font-size:13px;color:var(--text-secondary);display:flex;gap:8px;align-items:flex-start"><span style="color:var(--red);font-size:10px;margin-top:3px">◆</span>${ind}</li>`).join('')}
      </ul>
    </div>
    <div class="card">
      <div class="card-title"><span class="card-title-dot"></span>Recovery outlook</div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-bottom:10px">${a.fraudDetails}</div>
      <div style="font-size:12px;font-family:var(--font-mono);color:var(--amber)">Est. recoverable: ${a.estimatedRecoverable||'Unknown'}</div>
    </div>
    ${n?`
    <div class="card">
      <div class="card-title"><span class="card-title-dot"></span>60-second checklist</div>
      <ul class="checklist">
        ${(n.checklist||[]).map((item,i)=>`<li class="check-item"><span class="check-bullet ${item.urgent?'urgent':'normal'}">${i+1}</span><div class="check-text"><div>${item.text}</div>${item.contact?`<div style="font-size:11px;font-family:var(--font-mono);color:var(--blue);margin-top:3px">${item.contact}</div>`:''}</div></li>`).join('')}
      </ul>
    </div>
    <div class="card">
      <div class="card-title"><span class="card-title-dot"></span>Helplines</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${(n.helplines||[]).map(h=>`<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;color:var(--text-secondary)">${h.name}</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--green)">${h.number}</span></div>`).join('')}
      </div>
      <div style="margin-top:12px;padding:8px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:var(--radius-sm)">
        <a href="https://cybercrime.gov.in" target="_blank" style="font-size:12px;font-family:var(--font-mono);color:#86EFAC;text-decoration:none">→ cybercrime.gov.in</a>
      </div>
    </div>
    <div class="card full">
      <div class="card-title"><span class="card-title-dot"></span>Bank freeze request</div>
      <div class="draft-wrap" style="max-height:80px;font-size:12px">${n.bankFreezeRequest||''}</div>
    </div>
    <div class="card full">
      <div class="card-title"><span class="card-title-dot"></span>Formal complaint draft</div>
      <div class="draft-wrap" id="complaintDraft">${n.complaintDraft||''}</div>
      <div class="draft-actions">
        <button class="btn-secondary" onclick="handleCopy()">Copy text</button>
        <button class="btn-secondary" onclick="handlePDF()">Download PDF</button>
      </div>
    </div>`:`<div class="card full"><div class="card-title"><span class="card-title-dot"></span>Negotiation Agent running...</div>${[1,2,3].map(()=>`<div class="skeleton" style="height:12px;margin-bottom:8px"></div>`).join('')}</div>`}
    ${t?`
    <div class="card full">
      <div class="card-title"><span class="card-title-dot"></span>Money flow trace — ${t.riskPattern||''}</div>
      <div class="trace-canvas-wrap"><canvas id="traceCanvas"></canvas></div>
      <div class="trace-legend">
        <div class="trace-legend-item"><div class="legend-dot" style="background:#E8341A"></div>Victim / Mule</div>
        <div class="trace-legend-item"><div class="legend-dot" style="background:#3B82F6"></div>Bank</div>
        <div class="trace-legend-item"><div class="legend-dot" style="background:#22C55E"></div>Freezable</div>
        <div class="trace-legend-item"><div class="legend-dot" style="background:#818CF8"></div>Crypto / Aggregator</div>
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--text-secondary);line-height:1.7">${t.traceAnalysis}</div>
      <div style="margin-top:6px;font-size:12px;font-family:var(--font-mono);color:var(--amber)">⚠ ${t.freezeWindow}</div>
    </div>`:`<div class="card full"><div class="card-title"><span class="card-title-dot"></span>Trace Agent running...</div>${[1,2,3].map(()=>`<div class="skeleton" style="height:12px;margin-bottom:8px"></div>`).join('')}</div>`}
  </div>`:''}`

  if (a) { const sc = document.getElementById('scoreCanvas'); if(sc) drawScoreRing(sc, a.recoveryScore||0) }
  if (t) { setTimeout(()=>{ const tc=document.getElementById('traceCanvas'); if(tc) drawTraceGraph(tc,t.nodes||[],t.edges||[]) }, 50) }
}

window.handleCopy = function() {
  const text = document.getElementById('complaintDraft')?.textContent||''
  navigator.clipboard.writeText(text).then(()=>{
    const btn = document.querySelector('.draft-actions .btn-secondary')
    if(btn){btn.textContent='Copied!';setTimeout(()=>{btn.textContent='Copy text'},2000)}
  })
}

window.handlePDF = async function() {
  if(!state.incident||!state.analysis||!state.negotiation) return
  await exportComplaintPDF(state.incident, state.analysis, document.getElementById('complaintDraft')?.textContent||'')
}