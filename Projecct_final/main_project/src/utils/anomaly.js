/**
 * anomaly.js
 * ─────────────────────────────────────────────────────────────
 * ML-based anomaly detection  ·  Risk scoring  ·  Real-time alerts
 * ─────────────────────────────────────────────────────────────
 *
 * All logic runs client-side (no extra backend endpoint needed).
 * It reads the incident + AI analysis results and produces:
 *   • anomalyFlags   – list of detected anomalous patterns
 *   • riskScore      – 0-100 composite risk score
 *   • riskLevel      – CRITICAL | HIGH | MEDIUM | LOW
 *   • riskBreakdown  – per-dimension scores
 *   • alerts         – real-time actionable alerts (prioritised)
 */

// ── Baseline statistics (trained on common UPI fraud patterns) ──
const BASELINES = {
  // Average amounts for different fraud types (INR)
  avgFraudAmount: 42000,
  highAmountThreshold: 100000,
  lowAmountThreshold: 500,

  // Time-sensitivity windows (minutes)
  criticalWindow: 30,
  highWindow: 120,

  // Known high-risk UPI/bank patterns
  highRiskKeywords: [
    'kyc', 'otp', 'verification', 'suspended', 'blocked', 'reward',
    'lottery', 'prize', 'cashback', 'refund', 'helpdesk', 'officer',
    'rbi', 'income tax', 'police', 'arrest', 'court', 'fake link',
    'screen share', 'anydesk', 'teamviewer', 'remote', 'qr code',
    'google pay', 'phonepe', 'paytm'
  ],

  // Social-engineering red flags
  socialEngPatterns: [
    'posing as', 'claimed to be', 'pretended', 'impersonated',
    'said they were', 'fake', 'threatened', 'urgency', 'immediate',
    'within minutes', 'or else', 'account will be'
  ]
}

// ── Feature extraction from incident ────────────────────────
function extractFeatures(incident, analysis) {
  const desc = (incident.description || '').toLowerCase()
  const amount = parseFloat(incident.amount) || 0
  const bank = (incident.bank || '').toLowerCase()
  const severity = (analysis?.severity || '').toLowerCase()
  const fraudType = (analysis?.fraudType || '').toLowerCase()
  const recoveryScore = analysis?.recoveryScore || 0

  return {
    amount,
    desc,
    bank,
    severity,
    fraudType,
    recoveryScore,

    // Keyword hits
    highRiskHits: BASELINES.highRiskKeywords.filter(k => desc.includes(k)),
    socialEngHits: BASELINES.socialEngPatterns.filter(p => desc.includes(p)),

    // Amount anomalies
    isHighAmount: amount > BASELINES.highAmountThreshold,
    isRoundAmount: amount > 0 && amount % 1000 === 0,
    isOddAmount: amount > 0 && amount % 100 !== 0 && amount < 5000,

    // Pattern flags
    hasOTP: desc.includes('otp'),
    hasRemoteAccess: ['anydesk', 'teamviewer', 'screen share', 'remote'].some(k => desc.includes(k)),
    hasImpersonation: ['officer', 'rbi', 'police', 'bank', 'kyc'].some(k => desc.includes(k)),
    hasUrgency: ['immediate', 'urgent', 'quickly', 'minutes', 'or else', 'suspended'].some(k => desc.includes(k)),
    hasQR: desc.includes('qr'),
    hasPhishing: ['fake link', 'link', 'website', 'portal', 'login'].some(k => desc.includes(k)),
    multiChannel: (desc.includes('call') || desc.includes('sms')) && (desc.includes('link') || desc.includes('app')),
  }
}

// ── Anomaly Detection (ML-inspired rule engine) ──────────────
export function detectAnomalies(incident, analysis) {
  const f = extractFeatures(incident, analysis)
  const flags = []

  // Amount-based anomalies
  if (f.isHighAmount) {
    flags.push({
      type: 'AMOUNT_ANOMALY',
      severity: 'high',
      message: `Unusually large amount (₹${Number(f.amount).toLocaleString('en-IN')}) — significantly above average fraud amount`,
      icon: '💰'
    })
  }
  if (f.isRoundAmount && f.amount > 5000) {
    flags.push({
      type: 'ROUND_AMOUNT',
      severity: 'medium',
      message: 'Round-figure transfer is a common social engineering signature',
      icon: '🔢'
    })
  }

  // Remote access anomaly
  if (f.hasRemoteAccess) {
    flags.push({
      type: 'REMOTE_ACCESS',
      severity: 'critical',
      message: 'Remote access tool detected — attacker may have full device control',
      icon: '🖥️'
    })
  }

  // Multi-channel attack
  if (f.multiChannel) {
    flags.push({
      type: 'MULTI_CHANNEL',
      severity: 'high',
      message: 'Multi-channel attack pattern (call + link/app) — coordinated fraud operation',
      icon: '📡'
    })
  }

  // Impersonation
  if (f.hasImpersonation) {
    flags.push({
      type: 'IMPERSONATION',
      severity: 'high',
      message: 'Authority impersonation detected — a classic vishing/social engineering vector',
      icon: '🎭'
    })
  }

  // OTP interception
  if (f.hasOTP) {
    flags.push({
      type: 'OTP_THEFT',
      severity: 'critical',
      message: 'OTP shared with attacker — transaction authentication was compromised',
      icon: '🔑'
    })
  }

  // Phishing link
  if (f.hasPhishing) {
    flags.push({
      type: 'PHISHING_LINK',
      severity: 'high',
      message: 'Phishing link/portal usage detected — credentials may be harvested',
      icon: '🎣'
    })
  }

  // QR code fraud
  if (f.hasQR) {
    flags.push({
      type: 'QR_FRAUD',
      severity: 'high',
      message: 'QR code scam pattern — victim likely scanned an attacker-controlled QR',
      icon: '📷'
    })
  }

  // Urgency engineering
  if (f.hasUrgency && f.highRiskHits.length >= 2) {
    flags.push({
      type: 'URGENCY_ENGINEERING',
      severity: 'medium',
      message: 'Artificial urgency pattern — victim was pressured to act without thinking',
      icon: '⏰'
    })
  }

  // High keyword density (sophisticated attack)
  if (f.highRiskHits.length >= 4) {
    flags.push({
      type: 'HIGH_KEYWORD_DENSITY',
      severity: 'medium',
      message: `${f.highRiskHits.length} high-risk patterns in incident description — likely a sophisticated, scripted attack`,
      icon: '🧠'
    })
  }

  // Low recovery + high amount = double anomaly
  if (f.recoveryScore < 25 && f.amount > 50000) {
    flags.push({
      type: 'LOW_RECOVERY_HIGH_AMOUNT',
      severity: 'critical',
      message: 'Large amount combined with low recovery probability — extreme financial risk',
      icon: '⚠️'
    })
  }

  return flags
}

// ── Risk Scoring System (0–100) ──────────────────────────────
export function computeRiskScore(incident, analysis, anomalyFlags) {
  const f = extractFeatures(incident, analysis)

  // Dimension scores (each 0–100)
  const dimensions = {
    financial: computeFinancialRisk(f),
    behavioral: computeBehavioralRisk(f, anomalyFlags),
    technical: computeTechnicalRisk(f, anomalyFlags),
    temporal: computeTemporalRisk(analysis),
    pattern: computePatternRisk(f, analysis)
  }

  // Weighted composite (weights sum to 1.0)
  const weights = { financial: 0.25, behavioral: 0.25, technical: 0.20, temporal: 0.15, pattern: 0.15 }
  const composite = Object.entries(dimensions).reduce((sum, [k, v]) => sum + v * weights[k], 0)
  const score = Math.round(Math.min(100, Math.max(0, composite)))

  const level = score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW'
  const color = { CRITICAL: '#E8341A', HIGH: '#F0A500', MEDIUM: '#3B82F6', LOW: '#22C55E' }[level]

  return { score, level, color, dimensions }
}

function computeFinancialRisk(f) {
  let s = 0
  if (f.amount > 200000) s += 100
  else if (f.amount > 100000) s += 80
  else if (f.amount > 50000) s += 60
  else if (f.amount > 10000) s += 40
  else if (f.amount > 1000) s += 20
  return s
}

function computeBehavioralRisk(f, flags) {
  let s = 0
  if (f.hasUrgency) s += 20
  if (f.hasImpersonation) s += 25
  if (f.socialEngHits.length >= 2) s += 20
  if (f.multiChannel) s += 15
  s += Math.min(20, flags.length * 5)
  return Math.min(100, s)
}

function computeTechnicalRisk(f, flags) {
  let s = 0
  if (f.hasRemoteAccess) s += 40
  if (f.hasOTP) s += 30
  if (f.hasPhishing) s += 20
  if (f.hasQR) s += 15
  const criticalFlags = flags.filter(fl => fl.severity === 'critical').length
  s += criticalFlags * 15
  return Math.min(100, s)
}

function computeTemporalRisk(analysis) {
  const timeToAct = (analysis?.timeToAct || '').toLowerCase()
  if (timeToAct.includes('30 min') || timeToAct.includes('immediately')) return 95
  if (timeToAct.includes('1 hour') || timeToAct.includes('60 min')) return 75
  if (timeToAct.includes('2 hour')) return 55
  if (timeToAct.includes('24 hour') || timeToAct.includes('today')) return 35
  return 40
}

function computePatternRisk(f, analysis) {
  let s = 0
  const sev = (analysis?.severity || '').toLowerCase()
  if (sev === 'critical') s += 80
  else if (sev === 'high') s += 60
  else if (sev === 'medium') s += 35
  else if (sev === 'low') s += 15
  if (f.highRiskHits.length > 3) s += 15
  return Math.min(100, s)
}

// ── Real-Time Alert System ────────────────────────────────────
export function generateAlerts(incident, analysis, anomalyFlags, riskResult) {
  const alerts = []
  const amount = parseFloat(incident.amount) || 0
  const sev = (analysis?.severity || '').toLowerCase()
  const desc = (incident.description || '').toLowerCase()

  // ── Priority 1: Immediate action alerts ──
  if (riskResult.score >= 80 || sev === 'critical') {
    alerts.push({
      priority: 1,
      type: 'CRITICAL_RISK',
      title: '🚨 CRITICAL — Act in the next 30 minutes',
      message: 'High-risk fraud pattern detected. Every minute reduces fund recovery chances. Call your bank NOW.',
      action: 'Call bank helpline immediately',
      color: '#E8341A',
      pulse: true
    })
  }

  // ── Priority 2: Fund freeze alert ──
  if (amount > 0 && (sev === 'critical' || sev === 'high' || riskResult.score >= 60)) {
    alerts.push({
      priority: 2,
      type: 'FREEZE_FUNDS',
      title: '🔒 Freeze Request Required',
      message: `Request an immediate freeze on ₹${Number(amount).toLocaleString('en-IN')} transfer. File cybercrime complaint at 1930 to trigger bank freeze.`,
      action: 'File complaint: 1930',
      color: '#F0A500',
      pulse: riskResult.score >= 80
    })
  }

  // ── Priority 3: Device security alert ──
  if (anomalyFlags.some(f => f.type === 'REMOTE_ACCESS')) {
    alerts.push({
      priority: 2,
      type: 'DEVICE_COMPROMISED',
      title: '💻 Device May Be Compromised',
      message: 'Remote access tool was used. Uninstall it immediately and change all banking passwords from a different device.',
      action: 'Uninstall remote access tool now',
      color: '#E8341A',
      pulse: true
    })
  }

  // ── Priority 4: OTP alert ──
  if (anomalyFlags.some(f => f.type === 'OTP_THEFT')) {
    alerts.push({
      priority: 3,
      type: 'OTP_COMPROMISED',
      title: '🔑 OTP Compromised — Change UPI PIN',
      message: 'Your OTP was shared. Change your UPI PIN, net banking password, and mPIN immediately from a secure device.',
      action: 'Change UPI PIN & banking passwords',
      color: '#F0A500',
      pulse: false
    })
  }

  // ── Priority 5: Phishing credential alert ──
  if (anomalyFlags.some(f => f.type === 'PHISHING_LINK')) {
    alerts.push({
      priority: 3,
      type: 'CREDENTIALS_AT_RISK',
      title: '🎣 Credentials May Be Stolen',
      message: 'A phishing link was used. Change all passwords on accounts you entered credentials for, and enable 2FA.',
      action: 'Change passwords & enable 2FA',
      color: '#F0A500',
      pulse: false
    })
  }

  // ── Priority 6: Cybercrime portal filing ──
  alerts.push({
    priority: 4,
    type: 'FILE_COMPLAINT',
    title: '📋 File Cybercrime Complaint',
    message: 'File a complaint at cybercrime.gov.in or call 1930. Early filing creates a legal record and triggers bank alerts.',
    action: 'Go to cybercrime.gov.in',
    actionUrl: 'https://cybercrime.gov.in',
    color: '#3B82F6',
    pulse: false
  })

  // ── Priority 7: Anomaly-specific alerts ──
  const criticalAnoms = anomalyFlags.filter(f => f.severity === 'critical' && f.type !== 'REMOTE_ACCESS' && f.type !== 'OTP_THEFT')
  if (criticalAnoms.length > 0) {
    alerts.push({
      priority: 3,
      type: 'ANOMALY_DETECTED',
      title: `⚡ ${criticalAnoms.length} Critical Anomal${criticalAnoms.length > 1 ? 'ies' : 'y'} Detected`,
      message: criticalAnoms.map(f => f.message).join(' · '),
      action: 'Review anomaly details below',
      color: '#E8341A',
      pulse: false
    })
  }

  // Sort by priority
  return alerts.sort((a, b) => a.priority - b.priority)
}

// ── HTML Renderer ─────────────────────────────────────────────
export function renderAnomalySection(incident, analysis) {
  const flags = detectAnomalies(incident, analysis)
  const risk = computeRiskScore(incident, analysis, flags)
  const alerts = generateAlerts(incident, analysis, flags, risk)

  const dimLabels = { financial: 'Financial', behavioral: 'Behavioral', technical: 'Technical', temporal: 'Temporal', pattern: 'Pattern' }
  const dimColors = (v) => v >= 75 ? '#E8341A' : v >= 50 ? '#F0A500' : v >= 25 ? '#3B82F6' : '#22C55E'

  return `
  <!-- ══ REAL-TIME ALERTS ══ -->
  ${alerts.length > 0 ? `
  <div class="ml-alerts-section fade-in" style="margin-bottom:1.5rem">
    <div class="section-label" style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted);letter-spacing:.1em;margin-bottom:10px">⚡ REAL-TIME ALERTS</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${alerts.map(a => `
      <div class="ml-alert ${a.pulse ? 'ml-alert-pulse' : ''}" style="background:${a.color}12;border:1px solid ${a.color}33;border-left:3px solid ${a.color};border-radius:var(--radius-md);padding:12px 14px;display:flex;align-items:flex-start;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:3px">${a.title}</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">${a.message}</div>
        </div>
        ${a.actionUrl
          ? `<a href="${a.actionUrl}" target="_blank" style="font-size:11px;font-family:var(--font-mono);color:${a.color};white-space:nowrap;text-decoration:none;padding:4px 8px;border:1px solid ${a.color}44;border-radius:4px;flex-shrink:0">${a.action} →</a>`
          : `<span style="font-size:11px;font-family:var(--font-mono);color:${a.color};white-space:nowrap;padding:4px 8px;border:1px solid ${a.color}44;border-radius:4px;flex-shrink:0">${a.action}</span>`
        }
      </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- ══ RISK SCORE + ANOMALIES CARD ══ -->
  <div class="cards-grid" style="margin-bottom:0">
    <!-- Risk Score Card -->
    <div class="card" style="display:flex;flex-direction:column;gap:14px">
      <div class="card-title"><span class="card-title-dot"></span>ML Risk Score</div>
      <div style="display:flex;align-items:center;gap:16px">
        <div style="position:relative;width:72px;height:72px;flex-shrink:0">
          <svg viewBox="0 0 72 72" style="width:72px;height:72px;transform:rotate(-90deg)">
            <circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" stroke-width="6"/>
            <circle cx="36" cy="36" r="30" fill="none" stroke="${risk.color}" stroke-width="6"
              stroke-dasharray="${Math.round(risk.score * 1.885)} 188.5"
              stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
            <span style="font-size:17px;font-weight:800;font-family:var(--font-display);color:${risk.color}">${risk.score}</span>
            <span style="font-size:9px;color:var(--text-muted);font-family:var(--font-mono)">/100</span>
          </div>
        </div>
        <div>
          <div style="font-size:15px;font-weight:700;color:${risk.color};font-family:var(--font-display)">${risk.level}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Composite risk level</div>
          <div style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted);margin-top:6px">${flags.length} anomalies detected</div>
        </div>
      </div>
      <!-- Dimension bars -->
      <div style="display:flex;flex-direction:column;gap:7px">
        ${Object.entries(risk.dimensions).map(([k, v]) => `
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">${dimLabels[k]}</span>
            <span style="font-size:10px;font-family:var(--font-mono);color:${dimColors(v)}">${Math.round(v)}</span>
          </div>
          <div style="height:4px;background:var(--bg-raised);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${Math.round(v)}%;background:${dimColors(v)};border-radius:2px;transition:width .6s ease"></div>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <!-- Anomaly Flags Card -->
    <div class="card" style="display:flex;flex-direction:column;gap:10px">
      <div class="card-title"><span class="card-title-dot"></span>Anomaly Detection</div>
      ${flags.length === 0
        ? `<div style="font-size:12px;color:var(--text-muted);padding:8px 0">No anomalous patterns detected.</div>`
        : flags.map(flag => `
        <div style="display:flex;gap:10px;align-items:flex-start;padding:8px;background:${{critical:'rgba(232,52,26,0.06)',high:'rgba(240,165,0,0.06)',medium:'rgba(59,130,246,0.06)'}[flag.severity]||'var(--bg-raised)'};border-radius:var(--radius-sm);border-left:2px solid ${{critical:'#E8341A',high:'#F0A500',medium:'#3B82F6',low:'#22C55E'}[flag.severity]}">
          <span style="font-size:16px;flex-shrink:0">${flag.icon}</span>
          <div>
            <div style="font-size:10px;font-family:var(--font-mono);color:${{critical:'#E8341A',high:'#F0A500',medium:'#3B82F6',low:'#22C55E'}[flag.severity]};text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">${flag.type.replace(/_/g,' ')}</div>
            <div style="font-size:11px;color:var(--text-secondary);line-height:1.5">${flag.message}</div>
          </div>
        </div>`).join('')}
    </div>
  </div>
  `
}
