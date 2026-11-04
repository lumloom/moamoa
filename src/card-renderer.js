import { getBookPattern, STAMP_META } from './model.js'

const FONT = '"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif'

function rounded(ctx, x, y, w, h, radius) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
}

function fitText(ctx, text, maxWidth, startSize, minSize = 18, weight = 800) {
  let size = startSize
  do {
    ctx.font = `${weight} ${size}px ${FONT}`
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 2
  } while (size > minSize)
  return size
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const chars = [...String(text || '')]
  const lines = []
  let line = ''
  for (const char of chars) {
    if (char === '\n' || ctx.measureText(line + char).width > maxWidth) {
      if (line) lines.push(line)
      line = char === '\n' ? '' : char
      if (lines.length === maxLines) break
    } else line += char
  }
  if (line && lines.length < maxLines) lines.push(line)
  return lines
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

function drawPattern(ctx, pattern, accent) {
  ctx.save()
  ctx.globalAlpha = .22
  ctx.strokeStyle = accent
  ctx.fillStyle = accent
  ctx.lineWidth = 5
  for (let y = 55; y < 1210; y += 58) {
    for (let x = 55 + ((y / 58) % 2) * 28; x < 850; x += 64) {
      if (pattern === 'scales') {
        ctx.beginPath(); ctx.arc(x, y, 25, 0, Math.PI); ctx.stroke()
      } else if (pattern === 'stars') {
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
        if ((x + y) % 3 < 1) { ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke() }
      } else if (pattern === 'waves') {
        ctx.beginPath(); ctx.arc(x, y, 27, Math.PI, Math.PI * 2); ctx.stroke()
      } else if (pattern === 'map') {
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 5, y); ctx.lineTo(x + 55, y + 34); ctx.stroke()
      } else if (pattern === 'leaves') {
        ctx.beginPath(); ctx.ellipse(x - 7, y, 15, 7, -.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + 8, y + 3, 15, 7, .5, 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.beginPath(); ctx.moveTo(x + 8, y - 21); ctx.lineTo(x - 8, y); ctx.lineTo(x + 4, y); ctx.lineTo(x - 9, y + 22); ctx.stroke()
      }
    }
  }
  ctx.restore()
}

export async function renderCard(card, book, size = 900) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = Math.round(size * 1.4)
  const ctx = canvas.getContext('2d')
  const scale = size / 900
  ctx.scale(scale, scale)

  const accent = book?.color || '#70c6a8'
  const gradient = ctx.createLinearGradient(0, 0, 900, 1260)
  gradient.addColorStop(0, '#fffdf5')
  gradient.addColorStop(1, '#fff4d6')
  rounded(ctx, 18, 18, 864, 1224, 42)
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.save()
  rounded(ctx, 18, 18, 864, 1224, 42)
  ctx.clip()
  drawPattern(ctx, getBookPattern(book), accent)
  ctx.restore()
  ctx.lineWidth = 20
  ctx.strokeStyle = accent
  ctx.stroke()
  ctx.lineWidth = 4
  ctx.strokeStyle = '#403829'
  rounded(ctx, 38, 38, 824, 1184, 30)
  ctx.stroke()

  ctx.fillStyle = accent
  rounded(ctx, 58, 58, 784, 112, 28)
  ctx.fill()
  ctx.fillStyle = '#2f2a22'
  ctx.textBaseline = 'middle'
  ctx.font = `800 30px ${FONT}`
  ctx.fillText(book?.emoji || '💡', 84, 114)
  ctx.font = `700 24px ${FONT}`
  ctx.fillText(book?.name || '나의 도감', 132, 114)
  ctx.textAlign = 'right'
  ctx.fillText(`No. ${String(card.serial || 1).padStart(3, '0')}`, 816, 114)
  ctx.textAlign = 'left'

  const artwork = await loadImage(card.artwork)
  rounded(ctx, 58, 190, 784, 436, 24)
  ctx.fillStyle = '#f5f0e5'
  ctx.fill()
  ctx.save()
  ctx.clip()
  if (artwork) ctx.drawImage(artwork, 58, 190, 784, 436)
  ctx.restore()
  ctx.lineWidth = 5
  ctx.strokeStyle = '#403829'
  rounded(ctx, 58, 190, 784, 436, 24)
  ctx.stroke()

  ctx.fillStyle = '#2f2a22'
  const titleSize = fitText(ctx, card.name || '새로운 발견', 770, 54, 26)
  ctx.font = `900 ${titleSize}px ${FONT}`
  ctx.fillText(card.name || '새로운 발견', 62, 690)
  ctx.fillStyle = accent
  rounded(ctx, 58, 724, 784, 6, 3)
  ctx.fill()

  ctx.fillStyle = 'rgba(255,253,247,.9)'
  rounded(ctx, 58, 744, 784, 364, 22)
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = accent
  ctx.stroke()
  ctx.fillStyle = '#2f2a22'
  ctx.font = `800 29px ${FONT}`
  ctx.fillText('나의 발견 스킬', 82, 792)
  const facts = [card.fact1, card.fact2, card.fact3].filter(Boolean)
  ctx.font = `500 28px ${FONT}`
  let y = 832
  for (let i = 0; i < Math.min(facts.length, 3); i += 1) {
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.arc(88, y - 9, 18, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2f2a22'
    ctx.font = `800 13px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(['✦', '◆', '●'][i], 88, y - 8)
    ctx.textAlign = 'left'
    ctx.font = `800 16px ${FONT}`
    ctx.fillStyle = accent
    ctx.fillText(i === 0 ? '핵심 발견' : `추가 발견 ${i}`, 122, y - 20)
    ctx.fillStyle = '#2f2a22'
    ctx.font = `500 28px ${FONT}`
    const lines = wrapText(ctx, facts[i], 710, 2)
    lines.forEach((line, lineIndex) => ctx.fillText(line, 122, y + 8 + lineIndex * 34))
    ctx.font = `900 23px ${FONT}`
    ctx.textAlign = 'right'
    ctx.fillStyle = accent
    ctx.fillText(String(Math.min(90, 30 + facts[i].length * 2)), 810, y - 8)
    ctx.textAlign = 'left'
    y += Math.max(58, lines.length * 34 + 14)
  }

  const stamps = card.stamps || []
  ctx.font = `700 20px ${FONT}`
  let stampX = 62
  const stampY = 1165
  stamps.slice(0, 4).forEach((key) => {
    const meta = STAMP_META[key]
    if (!meta) return
    const label = `${meta.icon} ${meta.label}`
    const width = ctx.measureText(label).width + 28
    if (stampX + width > 840) return
    ctx.fillStyle = `${accent}55`
    rounded(ctx, stampX, stampY - 29, width, 42, 18)
    ctx.fill()
    ctx.fillStyle = '#403829'
    ctx.fillText(label, stampX + 14, stampY - 8)
    stampX += width + 10
  })
  return canvas
}

export function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }, 'image/png')
}
