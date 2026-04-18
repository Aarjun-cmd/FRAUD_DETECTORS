const NODE_COLORS = {
  victim:     { fill: '#2A1A14', stroke: '#E8341A', text: '#FCA5A5' },
  bank:       { fill: '#131C2E', stroke: '#3B82F6', text: '#93C5FD' },
  mule:       { fill: '#2A1414', stroke: '#E24B4A', text: '#FCA5A5' },
  aggregator: { fill: '#1E1A10', stroke: '#F0A500', text: '#FCD34D' },
  crypto:     { fill: '#1A1E28', stroke: '#818CF8', text: '#C7D2FE' },
  unknown:    { fill: '#18181B', stroke: '#52525B', text: '#A1A1AA' },
  freezable:  { fill: '#0F2318', stroke: '#22C55E', text: '#86EFAC' }
}

export function drawTraceGraph(canvas, nodes, edges) {
  if (!nodes || nodes.length === 0) return

  const dpr = window.devicePixelRatio || 1
  const W = canvas.offsetWidth
  const H = 200
  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.style.height = H + 'px'

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, W, H)

  const nodeR = 32
  const padding = 60
  const positions = nodes.map((_, i) => ({
    x: padding + i * (W - padding * 2) / Math.max(nodes.length - 1, 1),
    y: H / 2
  }))

  // Build lookup
  const idToIndex = {}
  nodes.forEach((n, i) => { idToIndex[n.id] = i })

  // Draw edges
  edges.forEach(edge => {
    const fi = idToIndex[edge.from]
    const ti = idToIndex[edge.to]
    if (fi === undefined || ti === undefined) return

    const from = positions[fi]
    const to = positions[ti]

    // Dashed arrow line
    ctx.beginPath()
    ctx.setLineDash([5, 4])
    ctx.moveTo(from.x, from.y)

    // Curved line
    const mx = (from.x + to.x) / 2
    const my = from.y - 35
    ctx.quadraticCurveTo(mx, my, to.x, to.y)
    ctx.strokeStyle = 'rgba(232,52,26,0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.setLineDash([])

    // Arrow head
    const angle = Math.atan2(to.y - my, to.x - mx)
    ctx.beginPath()
    ctx.moveTo(to.x, to.y)
    ctx.lineTo(to.x - 10 * Math.cos(angle - 0.4), to.y - 10 * Math.sin(angle - 0.4))
    ctx.lineTo(to.x - 10 * Math.cos(angle + 0.4), to.y - 10 * Math.sin(angle + 0.4))
    ctx.closePath()
    ctx.fillStyle = 'rgba(232,52,26,0.5)'
    ctx.fill()

    // Edge label
    if (edge.label) {
      ctx.fillStyle = 'rgba(161,161,170,0.8)'
      ctx.font = `500 10px JetBrains Mono, monospace`
      ctx.textAlign = 'center'
      ctx.fillText(edge.label, mx, my - 6)
    }
  })

  // Draw nodes
  nodes.forEach((node, i) => {
    const { x, y } = positions[i]
    const colors = NODE_COLORS[node.type] || NODE_COLORS.unknown

    // Glow for freezable
    if (node.freezable) {
      ctx.beginPath()
      ctx.arc(x, y, nodeR + 8, 0, Math.PI * 2)
      const grd = ctx.createRadialGradient(x, y, nodeR, x, y, nodeR + 10)
      grd.addColorStop(0, 'rgba(34,197,94,0.2)')
      grd.addColorStop(1, 'rgba(34,197,94,0)')
      ctx.fillStyle = grd
      ctx.fill()
    }

    // Node circle
    ctx.beginPath()
    ctx.arc(x, y, nodeR, 0, Math.PI * 2)
    ctx.fillStyle = colors.fill
    ctx.fill()
    ctx.strokeStyle = colors.stroke
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Label
    ctx.fillStyle = colors.text
    ctx.font = `700 10px JetBrains Mono, monospace`
    ctx.textAlign = 'center'
    ctx.fillText(node.label || '', x, y - 3)

    // Sublabel
    ctx.font = `400 9px JetBrains Mono, monospace`
    ctx.fillStyle = 'rgba(161,161,170,0.7)'
    ctx.fillText(node.sublabel || '', x, y + 10)

    // Below node: amount + timelag
    ctx.font = `500 10px DM Sans, sans-serif`
    ctx.fillStyle = 'rgba(161,161,170,0.9)'
    ctx.fillText(node.amount || '', x, y + nodeR + 16)

    if (node.timelag) {
      ctx.font = `400 9px JetBrains Mono, monospace`
      ctx.fillStyle = 'rgba(82,82,91,0.8)'
      ctx.fillText(node.timelag, x, y + nodeR + 27)
    }

    // Freezable tag
    if (node.freezable) {
      const tagW = 50, tagH = 14
      const tx = x - tagW / 2, ty = y - nodeR - tagH - 4
      ctx.fillStyle = 'rgba(34,197,94,0.15)'
      ctx.strokeStyle = 'rgba(34,197,94,0.4)'
      ctx.lineWidth = 0.5
      roundRect(ctx, tx, ty, tagW, tagH, 3)
      ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#86EFAC'
      ctx.font = `600 8px JetBrains Mono, monospace`
      ctx.textAlign = 'center'
      ctx.fillText('FREEZABLE', x, ty + 10)
    }
  })
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function drawScoreRing(canvas, pct) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = 120 * dpr
  canvas.height = 120 * dpr
  canvas.style.width = '120px'
  canvas.style.height = '120px'

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const cx = 60, cy = 60, r = 44, lw = 7

  // Track
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = lw
  ctx.stroke()

  // Arc
  const color = pct > 65 ? '#22C55E' : pct > 35 ? '#F0A500' : '#E8341A'
  ctx.beginPath()
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pct / 100))
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.stroke()
}
