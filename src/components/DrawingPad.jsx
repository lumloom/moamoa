import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

const COLORS = ['#24435c', '#d84b4b', '#31945e', '#e6a72c', '#815cc5', '#3c3429']

function drawCover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

const DrawingPad = forwardRef(function DrawingPad({ initialImage, initialKinds = [], initialHasArtwork = false, onChange }, ref) {
  const canvasRef = useRef(null)
  const historyRef = useRef([])
  const drawingRef = useRef(false)
  const pointRef = useRef([0, 0])
  const [color, setColor] = useState(COLORS[0])
  const [brush, setBrush] = useState(7)
  const [eraser, setEraser] = useState(false)
  const [kinds, setKinds] = useState(initialKinds)
  const [hasArtwork, setHasArtwork] = useState(initialHasArtwork || Boolean(initialImage))
  const firstImageRef = useRef(initialImage)

  const notify = (nextKinds = kinds, nextHasArtwork = hasArtwork) => {
    const canvas = canvasRef.current
    onChange?.({ artwork: canvas.toDataURL('image/jpeg', 0.84), artworkKinds: nextKinds, hasArtwork: nextHasArtwork })
  }

  useImperativeHandle(ref, () => ({
    snapshot: () => ({
      artwork: canvasRef.current.toDataURL('image/jpeg', 0.84),
      artworkKinds: kinds,
      hasArtwork,
    }),
  }), [kinds, hasArtwork])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (firstImageRef.current) {
      loadImage(firstImageRef.current).then((image) => drawCover(ctx, image, canvas.width, canvas.height)).catch(() => {})
    }
  }, [])

  const pushHistory = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (historyRef.current.length > 12) historyRef.current.shift()
  }

  const point = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return [
      (event.clientX - rect.left) * canvas.width / rect.width,
      (event.clientY - rect.top) * canvas.height / rect.height,
    ]
  }

  const start = (event) => {
    event.preventDefault()
    pushHistory()
    drawingRef.current = true
    pointRef.current = point(event)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const next = point(event)
    ctx.strokeStyle = eraser ? '#ffffff' : color
    ctx.lineWidth = eraser ? brush * 2.4 : brush
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(...pointRef.current)
    ctx.lineTo(...next)
    ctx.stroke()
    pointRef.current = next
    if (!hasArtwork) setHasArtwork(true)
    if (!kinds.includes('drawing')) setKinds((value) => [...value, 'drawing'])
  }

  const end = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const nextKinds = kinds.includes('drawing') ? kinds : [...kinds, 'drawing']
    setKinds(nextKinds)
    setHasArtwork(true)
    notify(nextKinds, true)
  }

  const importPhoto = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const image = await loadImage(reader.result)
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        pushHistory()
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        drawCover(ctx, image, canvas.width, canvas.height)
        const nextKinds = [...new Set([...kinds, 'photo'])]
        setKinds(nextKinds)
        setHasArtwork(true)
        notify(nextKinds, true)
      } catch {
        alert('이 사진은 열 수 없어요. 다른 사진을 골라 주세요.')
      }
    }
    reader.readAsDataURL(file)
  }

  const undo = () => {
    const previous = historyRef.current.pop()
    if (!previous) return
    canvasRef.current.getContext('2d').putImageData(previous, 0, 0)
    notify()
  }

  const clear = () => {
    pushHistory()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setKinds([])
    setHasArtwork(false)
    notify([], false)
  }

  const rotate = () => {
    const canvas = canvasRef.current
    const buffer = document.createElement('canvas')
    buffer.width = canvas.width
    buffer.height = canvas.height
    buffer.getContext('2d').drawImage(canvas, 0, 0)
    pushHistory()
    const ctx = canvas.getContext('2d')
    ctx.save()
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate(Math.PI / 2)
    const scale = Math.max(canvas.width / buffer.height, canvas.height / buffer.width)
    ctx.drawImage(buffer, -buffer.width * scale / 2, -buffer.height * scale / 2, buffer.width * scale, buffer.height * scale)
    ctx.restore()
    notify()
  }

  return (
    <div className="drawing-pad">
      <canvas
        ref={canvasRef}
        width="960"
        height="540"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="카드 그림판"
      />
      <div className="photo-actions">
        <label className="soft-button">📷 사진 찍기<input hidden type="file" accept="image/*" capture="environment" onChange={(event) => importPhoto(event.target.files?.[0])} /></label>
        <label className="soft-button">🖼️ 사진 고르기<input hidden type="file" accept="image/*" onChange={(event) => importPhoto(event.target.files?.[0])} /></label>
        <button className="soft-button" type="button" onClick={rotate}>↻ 사진 돌리기</button>
      </div>
      <div className="drawing-tools" aria-label="그림 도구">
        <div className="color-row">
          {COLORS.map((item) => <button key={item} type="button" aria-label={`${item} 색`} className={`color-dot ${color === item && !eraser ? 'selected' : ''}`} style={{ background: item }} onClick={() => { setColor(item); setEraser(false) }} />)}
        </div>
        <div className="tool-row">
          {[4, 8, 16].map((size) => <button key={size} type="button" className={`tool-button ${brush === size && !eraser ? 'selected' : ''}`} onClick={() => { setBrush(size); setEraser(false) }}>{size === 4 ? '가는 붓' : size === 8 ? '보통 붓' : '굵은 붓'}</button>)}
          <button type="button" className={`tool-button ${eraser ? 'selected' : ''}`} onClick={() => setEraser((value) => !value)}>지우개</button>
          <button type="button" className="tool-button" onClick={undo}>되돌리기</button>
          <button type="button" className="tool-button danger-quiet" onClick={clear}>모두 지우기</button>
        </div>
      </div>
    </div>
  )
})

export default DrawingPad
