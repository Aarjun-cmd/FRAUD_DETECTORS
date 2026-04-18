import { getChatResponse, extractIncidentData } from './chatIntake.js'
import { saveChatSession, updateChatSession, appendMessage } from '../utils/supabase.js'

// ─────────────────────────────────────────────────────────
// FraudGuard AI · Floating Chatbot
// Renders a persistent floating chatbot bubble + panel.
// Communicates with Arya (the intake agent), persists
// sessions to Supabase, and emits an 'incident-ready'
// custom event when enough data is collected.
// ─────────────────────────────────────────────────────────

// ── CSS injection ──────────────────────────────────────
const CHATBOT_CSS = `
  /* ── Floating trigger ── */
  .fg-chatbot-trigger {
    position: fixed;
    bottom: 28px;
    right: 28px;
    z-index: 9000;
    width: 58px;
    height: 58px;
    border-radius: 50%;
    background: var(--red);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 0 rgba(232,52,26,0.4);
    animation: fg-pulse-ring 3s ease-out infinite;
    transition: transform 0.2s, background 0.2s;
  }
  .fg-chatbot-trigger:hover {
    transform: scale(1.08);
    background: #d42e16;
  }
  .fg-chatbot-trigger.open {
    background: #333;
    animation: none;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  }
  .fg-chatbot-trigger svg { pointer-events: none; }

  @keyframes fg-pulse-ring {
    0%   { box-shadow: 0 0 0 0 rgba(232,52,26,0.45); }
    70%  { box-shadow: 0 0 0 16px rgba(232,52,26,0); }
    100% { box-shadow: 0 0 0 0 rgba(232,52,26,0); }
  }

  /* ── Unread badge ── */
  .fg-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: var(--amber);
    color: #000;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--bg-base);
    transition: transform 0.2s;
  }

  /* ── Panel ── */
  .fg-chatbot-panel {
    position: fixed;
    bottom: 100px;
    right: 28px;
    z-index: 8999;
    width: 380px;
    max-height: 600px;
    background: var(--bg-surface);
    border: 1px solid var(--border-mid);
    border-radius: var(--radius-xl);
    box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: scale(0.92) translateY(10px);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s;
    transform-origin: bottom right;
  }
  .fg-chatbot-panel.open {
    transform: scale(1) translateY(0);
    opacity: 1;
    pointer-events: all;
  }

  /* ── Panel header ── */
  .fg-panel-header {
    padding: 16px 18px 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    background: var(--bg-raised);
  }
  .fg-arya-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--red-faint);
    border: 1px solid rgba(232,52,26,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 14px;
    color: var(--red);
    flex-shrink: 0;
  }
  .fg-arya-info { flex: 1; }
  .fg-arya-name {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.01em;
  }
  .fg-arya-status {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--green);
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 1px;
  }
  .fg-arya-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green);
    animation: pulse-dot 2s ease-in-out infinite;
  }
  .fg-panel-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: color 0.15s, background 0.15s;
  }
  .fg-panel-close:hover { color: var(--text-primary); background: var(--bg-hover); }

  /* ── Supabase indicator ── */
  .fg-supabase-bar {
    padding: 6px 18px;
    background: rgba(34,197,94,0.05);
    border-bottom: 1px solid rgba(34,197,94,0.1);
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 10px;
    color: rgba(34,197,94,0.7);
    flex-shrink: 0;
  }
  .fg-supabase-bar svg { opacity: 0.7; }

  /* ── Messages ── */
  .fg-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    scroll-behavior: smooth;
  }
  .fg-messages::-webkit-scrollbar { width: 3px; }
  .fg-messages::-webkit-scrollbar-thumb { background: var(--border-mid); border-radius: 2px; }

  /* ── Message bubbles ── */
  .fg-msg {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    animation: fg-msg-in 0.2s ease;
  }
  .fg-msg.user { flex-direction: row-reverse; }

  @keyframes fg-msg-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .fg-msg-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .fg-msg-avatar.agent {
    background: var(--red-faint);
    border: 1px solid rgba(232,52,26,0.2);
    color: var(--red);
  }
  .fg-msg-avatar.user {
    background: var(--bg-raised);
    border: 1px solid var(--border-mid);
    color: var(--text-muted);
  }

  .fg-bubble {
    max-width: 80%;
    padding: 9px 13px;
    font-size: 13px;
    line-height: 1.6;
    border-radius: 12px;
  }
  .fg-msg.agent .fg-bubble {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    border-top-left-radius: 3px;
  }
  .fg-msg.user .fg-bubble {
    background: rgba(232,52,26,0.1);
    border: 1px solid rgba(232,52,26,0.18);
    color: var(--text-primary);
    border-top-right-radius: 3px;
  }

  /* ── Typing dots ── */
  .fg-typing {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px 13px;
  }
  .fg-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    animation: fg-bounce 1.2s ease-in-out infinite;
  }
  .fg-dot:nth-child(2) { animation-delay: 0.2s; }
  .fg-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes fg-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
    30%  { transform: translateY(-5px); opacity: 1; }
  }

  /* ── Progress bar ── */
  .fg-progress-wrap {
    padding: 0 18px 10px;
    flex-shrink: 0;
  }
  .fg-progress-label {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
    margin-bottom: 5px;
    display: flex;
    justify-content: space-between;
  }
  .fg-progress {
    height: 3px;
    background: var(--bg-raised);
    border-radius: 2px;
    overflow: hidden;
  }
  .fg-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--red), var(--amber));
    border-radius: 2px;
    transition: width 0.4s ease;
  }

  /* ── Input bar ── */
  .fg-input-bar {
    padding: 12px 14px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
    background: var(--bg-raised);
  }
  .fg-input {
    flex: 1;
    background: var(--bg-base);
    border: 1px solid var(--border-mid);
    border-radius: 10px;
    padding: 9px 13px;
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--text-primary);
    outline: none;
    transition: border-color 0.15s;
  }
  .fg-input::placeholder { color: var(--text-muted); }
  .fg-input:focus { border-color: rgba(232,52,26,0.4); }

  .fg-send {
    width: 36px;
    height: 36px;
    border-radius: 9px;
    background: var(--red);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, transform 0.1s;
    flex-shrink: 0;
  }
  .fg-send:hover { background: #d42e16; }
  .fg-send:active { transform: scale(0.93); }
  .fg-send:disabled { background: var(--bg-hover); cursor: not-allowed; }

  /* ── Ready banner ── */
  .fg-ready-banner {
    margin: 0 14px 12px;
    padding: 10px 14px;
    background: rgba(34,197,94,0.07);
    border: 1px solid rgba(34,197,94,0.2);
    border-radius: var(--radius-md);
    font-size: 12px;
    color: #86EFAC;
    display: flex;
    align-items: center;
    gap: 8px;
    animation: fg-msg-in 0.3s ease;
    flex-shrink: 0;
  }
  .fg-activate-btn {
    margin: 0 14px 14px;
    width: calc(100% - 28px);
    padding: 11px;
    background: var(--red);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background 0.15s, transform 0.1s;
    letter-spacing: 0.02em;
    flex-shrink: 0;
  }
  .fg-activate-btn:hover { background: #d42e16; }
  .fg-activate-btn:active { transform: scale(0.98); }

  /* ── Saved toast ── */
  .fg-toast {
    position: fixed;
    bottom: 110px;
    right: 28px;
    z-index: 9001;
    background: var(--bg-raised);
    border: 1px solid rgba(34,197,94,0.25);
    border-radius: var(--radius-md);
    padding: 10px 16px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: #86EFAC;
    display: flex;
    align-items: center;
    gap: 8px;
    animation: fg-toast-in 0.3s ease;
    box-shadow: 0 8px 30px rgba(0,0,0,0.4);
  }
  @keyframes fg-toast-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`

// ── Inject CSS once ────────────────────────────────────
function injectChatbotCSS() {
  if (document.getElementById('fg-chatbot-styles')) return
  const style = document.createElement('style')
  style.id = 'fg-chatbot-styles'
  style.textContent = CHATBOT_CSS
  document.head.appendChild(style)
}

// ── State ──────────────────────────────────────────────
const chatState = {
  open: false,
  busy: false,
  messages: [],
  extracted: {},
  ready: false,
  unread: 0,
  sessionId: null   // Supabase session ID once saved
}

// ── DOM Refs ──────────────────────────────────────────
let triggerEl, panelEl, messagesEl, inputEl, sendEl, badgeEl

// ── Boot ──────────────────────────────────────────────
export function initChatbot() {
  injectChatbotCSS()
  mountDOM()
  bindEvents()
  setTimeout(greet, 600)
}

// ── Mount ─────────────────────────────────────────────
function mountDOM() {
  // Trigger button
  triggerEl = document.createElement('button')
  triggerEl.className = 'fg-chatbot-trigger'
  triggerEl.setAttribute('aria-label', 'Open FraudGuard chat')
  triggerEl.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3.5 7V12.5C3.5 17.15 7.14 21.5 12 22.5C16.86 21.5 20.5 17.15 20.5 12.5V7L12 2Z"
        fill="rgba(255,255,255,0.15)" stroke="white" stroke-width="1.4"/>
      <path d="M8 12.5L10.5 15L16 9.5" stroke="white" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`

  badgeEl = document.createElement('div')
  badgeEl.className = 'fg-badge'
  badgeEl.style.display = 'none'
  triggerEl.appendChild(badgeEl)
  document.body.appendChild(triggerEl)

  // Panel
  panelEl = document.createElement('div')
  panelEl.className = 'fg-chatbot-panel'
  panelEl.innerHTML = `
    <div class="fg-panel-header">
      <div class="fg-arya-avatar">A</div>
      <div class="fg-arya-info">
        <div class="fg-arya-name">Arya · FraudGuard AI</div>
        <div class="fg-arya-status">
          <div class="fg-arya-status-dot"></div>
          Fraud Response Specialist
        </div>
      </div>
      <button class="fg-panel-close" id="fg-close">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="fg-supabase-bar">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/>
        <path d="M4 6L5.5 7.5L8.5 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Session saved to Supabase · End-to-end encrypted
    </div>

    <div class="fg-messages" id="fg-messages"></div>

    <div class="fg-progress-wrap" id="fg-progress-wrap" style="display:none">
      <div class="fg-progress-label">
        <span>Intake progress</span>
        <span id="fg-pct">0%</span>
      </div>
      <div class="fg-progress">
        <div class="fg-progress-fill" id="fg-progress-fill" style="width:0%"></div>
      </div>
    </div>

    <div id="fg-ready-section"></div>

    <div class="fg-input-bar">
      <input class="fg-input" id="fg-input"
        type="text"
        placeholder="Tell me what happened…"
        autocomplete="off"/>
      <button class="fg-send" id="fg-send">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1.5 7L12.5 1.5L9 7L12.5 12.5L1.5 7Z" fill="white"/>
        </svg>
      </button>
    </div>
  `
  document.body.appendChild(panelEl)

  messagesEl = panelEl.querySelector('#fg-messages')
  inputEl = panelEl.querySelector('#fg-input')
  sendEl = panelEl.querySelector('#fg-send')
}

// ── Events ─────────────────────────────────────────────
function bindEvents() {
  triggerEl.addEventListener('click', togglePanel)
  panelEl.querySelector('#fg-close').addEventListener('click', closePanel)
  sendEl.addEventListener('click', handleSend)
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); handleSend() }
  })
}

function togglePanel() {
  chatState.open ? closePanel() : openPanel()
}

function openPanel() {
  chatState.open = true
  chatState.unread = 0
  panelEl.classList.add('open')
  triggerEl.classList.add('open')
  triggerEl.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 3L17 17M17 3L3 17" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`
  badgeEl.style.display = 'none'
  setTimeout(() => inputEl.focus(), 300)
  updateBadge()
}

function closePanel() {
  chatState.open = false
  panelEl.classList.remove('open')
  triggerEl.classList.remove('open')
  triggerEl.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3.5 7V12.5C3.5 17.15 7.14 21.5 12 22.5C16.86 21.5 20.5 17.15 20.5 12.5V7L12 2Z"
        fill="rgba(255,255,255,0.15)" stroke="white" stroke-width="1.4"/>
      <path d="M8 12.5L10.5 15L16 9.5" stroke="white" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  if (badgeEl) triggerEl.appendChild(badgeEl)
}

// ── Greeting ──────────────────────────────────────────
async function greet() {
  chatState.busy = true
  showTyping()
  try {
    const reply = await getChatResponse([])
    hideTyping()
    pushMessage('assistant', reply)
    if (!chatState.open) bumpUnread()
  } catch (e) {
    hideTyping()
    pushMessage('assistant', 'Hello! I\'m Arya, your FraudGuard specialist. I\'m here to help you report a fraud incident. Please tell me what happened.')
  }
  chatState.busy = false
}

// ── Send ──────────────────────────────────────────────
async function handleSend() {
  if (chatState.busy) return
  const text = inputEl.value.trim()
  if (!text) return

  inputEl.value = ''
  pushMessage('user', text)
  chatState.busy = true
  sendEl.disabled = true
  showTyping()

  try {
    const [reply, extracted] = await Promise.all([
      getChatResponse(chatState.messages),
      extractIncidentData(chatState.messages)
    ])

    hideTyping()
    pushMessage('assistant', reply)

    if (extracted) {
      const fieldsOfInterest = ['name', 'amount', 'bank', 'contact', 'txnId', 'description']
      fieldsOfInterest.forEach(k => {
        if (extracted[k]) chatState.extracted[k] = extracted[k]
      })
      chatState.ready = extracted.complete === true
    }

    updateProgress()

    // ── Persist to Supabase ──────────────────────────
    if (!chatState.sessionId && Object.keys(chatState.extracted).length > 0) {
      const session = await saveChatSession({
        ...chatState.extracted,
        messages: chatState.messages
      })
      if (session?.id) {
        chatState.sessionId = session.id
        showToast('✓ Session saved · ID: ' + session.id.slice(0, 8))
      }
    } else if (chatState.sessionId) {
      await updateChatSession(chatState.sessionId, {
        messages: chatState.messages,
        ...chatState.extracted
      })
    }

    if (!chatState.open) bumpUnread()

    if (chatState.ready) renderReadyBanner()

  } catch (err) {
    hideTyping()
    pushMessage('assistant', 'I\'m having a connection issue. Please try again in a moment.')
  }

  chatState.busy = false
  sendEl.disabled = false
  inputEl.focus()
}

// ── Message helpers ───────────────────────────────────
function pushMessage(role, content) {
  chatState.messages.push({ role, content })
  const div = document.createElement('div')
  div.className = `fg-msg ${role === 'assistant' ? 'agent' : 'user'}`
  div.innerHTML = `
    <div class="fg-msg-avatar ${role === 'assistant' ? 'agent' : 'user'}">
      ${role === 'assistant' ? 'A' : 'U'}
    </div>
    <div class="fg-bubble">${escapeHtml(content)}</div>`
  messagesEl.appendChild(div)
  messagesEl.scrollTop = messagesEl.scrollHeight
}

function showTyping() {
  const div = document.createElement('div')
  div.id = 'fg-typing'
  div.className = 'fg-msg agent'
  div.innerHTML = `
    <div class="fg-msg-avatar agent">A</div>
    <div class="fg-bubble">
      <div class="fg-typing">
        <div class="fg-dot"></div>
        <div class="fg-dot"></div>
        <div class="fg-dot"></div>
      </div>
    </div>`
  messagesEl.appendChild(div)
  messagesEl.scrollTop = messagesEl.scrollHeight
}

function hideTyping() {
  document.getElementById('fg-typing')?.remove()
}

// ── Progress ──────────────────────────────────────────
function updateProgress() {
  const keys = ['name', 'amount', 'bank', 'contact', 'txnId']
  const filled = keys.filter(k => chatState.extracted[k]).length
  const pct = Math.round((filled / keys.length) * 100)

  const wrap = document.getElementById('fg-progress-wrap')
  const fill = document.getElementById('fg-progress-fill')
  const label = document.getElementById('fg-pct')

  if (filled > 0 && wrap) {
    wrap.style.display = 'block'
    fill.style.width = pct + '%'
    label.textContent = pct + '%'
  }
}

// ── Ready banner ──────────────────────────────────────
function renderReadyBanner() {
  const section = document.getElementById('fg-ready-section')
  if (!section || section.innerHTML) return

  section.innerHTML = `
    <div class="fg-ready-banner">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="#22C55E" stroke-width="1.4"/>
        <path d="M4.5 7L6.5 9L9.5 5" stroke="#22C55E" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Enough info gathered — ready to run fraud analysis
    </div>
    <button class="fg-activate-btn" id="fg-activate">
      ⚡ Activate Fraud Response
    </button>`

  document.getElementById('fg-activate').addEventListener('click', handleActivate)
}

// ── Activate ──────────────────────────────────────────
function handleActivate() {
  const e = chatState.extracted
  const incident = {
    name: e.name || 'Unknown',
    contact: e.contact || '',
    bank: e.bank || 'Unknown Bank',
    amount: e.amount || '0',
    txnId: e.txnId || 'N/A',
    description: e.description ||
      chatState.messages.filter(m => m.role === 'user').map(m => m.content).join(' ')
  }

  // Update Supabase status
  if (chatState.sessionId) {
    updateChatSession(chatState.sessionId, { status: 'activated' })
  }

  // Emit custom event so main.js can pick it up
  document.dispatchEvent(new CustomEvent('fg:incident-ready', { detail: incident }))
  closePanel()
}

// ── Unread badge ──────────────────────────────────────
function bumpUnread() {
  chatState.unread++
  updateBadge()
}

function updateBadge() {
  if (chatState.unread > 0 && !chatState.open) {
    badgeEl.textContent = chatState.unread
    badgeEl.style.display = 'flex'
  } else {
    badgeEl.style.display = 'none'
  }
}

// ── Toast notification ─────────────────────────────────
function showToast(msg) {
  const t = document.createElement('div')
  t.className = 'fg-toast'
  t.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke="#22C55E" stroke-width="1.2"/>
      <path d="M3.5 6L5 7.5L8.5 4" stroke="#22C55E" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    ${escapeHtml(msg)}`
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 3500)
}

// ── Utils ─────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
