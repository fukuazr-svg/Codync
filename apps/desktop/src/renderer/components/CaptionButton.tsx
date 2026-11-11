import type { ReactNode } from 'react'

/**
 * A window-bar action, drawn like T3 Code's: a 28-point ghost square (radius 8), the glyph at
 * 16 points, a tint only on hover, and the pressed scale T3's buttons use.
 */
export function CaptionButton({ title, onClick, children, pressed = false }: {
  title: string
  onClick: () => void
  children: ReactNode
  pressed?: boolean
}) {
  return (
    <button className={`caption-button ${pressed ? 'pressed' : ''}`} title={title} aria-label={title} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}
