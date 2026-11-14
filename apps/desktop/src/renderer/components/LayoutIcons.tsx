/**
 * The layout glyphs the window bar uses, drawn as T3 Code draws them (lucide's panel icons): a
 * rounded frame with one column filled in, so the panel's side is the shape.
 */
export function PanelIcon({ side, size = 16 }: { side: 'right' | 'left'; size?: number }) {
  const line = side === 'right' ? 15 : 9
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d={`M${line} 3v18`} />
    </svg>
  )
}

/** The sidebar's own toggle: the panel frame, plus a bracket that opens or closes with the rail. */
export function SidebarToggleIcon({ open, size = 16 }: { open: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      {open ? <path d="M15 9l-2 3 2 3" /> : <path d="M13 9l2 3-2 3" />}
    </svg>
  )
}
