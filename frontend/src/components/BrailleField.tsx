import { useEffect, useRef } from 'react'

const CELL = 14
const GLYPH = 0x2800
// Dot bit -> (column, row) inside the 2x4 braille cell, in bit order 1..8.
const DOTS: [number, number][] = [
  [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [0, 3], [1, 3],
]

/** Slow braille dot field behind the whole product. Deliberately almost invisible:
 *  it is texture, not something to look at. */
export default function BrailleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let stop = false

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * ratio
      canvas.height = window.innerHeight * ratio
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    const draw = (t: number) => {
      const width = window.innerWidth
      const height = window.innerHeight
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--braille').trim()
      ctx.font = `${CELL}px "IBM Plex Mono", ui-monospace, monospace`
      ctx.textBaseline = 'top'

      for (let row = 0; row * CELL < height + CELL; row++) {
        for (let col = 0; col * CELL < width + CELL; col++) {
          let bits = 0
          for (let dot = 0; dot < DOTS.length; dot++) {
            const [dx, dy] = DOTS[dot]
            const x = col * 2 + dx
            const y = row * 4 + dy
            // Two drifting waves; where they crest, the dot is on.
            const wave =
              Math.sin(x * 0.19 + t * 0.35) + Math.sin(y * 0.12 - t * 0.24) + Math.sin((x + y) * 0.07 + t * 0.13)
            if (wave > 1.55) bits |= 1 << dot
          }
          if (bits) ctx.fillText(String.fromCharCode(GLYPH + bits), col * CELL, row * CELL)
        }
      }
    }

    const loop = (now: number) => {
      if (stop) return
      draw(now / 1000)
      // ~12fps is plenty for something this slow, and costs a lot less.
      frame = window.setTimeout(() => requestAnimationFrame(loop), 80)
    }

    resize()
    window.addEventListener('resize', resize)
    if (still) draw(0)
    else requestAnimationFrame(loop)

    return () => {
      stop = true
      window.clearTimeout(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-[0.09]"
    />
  )
}
