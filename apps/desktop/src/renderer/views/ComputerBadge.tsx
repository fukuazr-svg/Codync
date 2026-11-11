import type { Computer } from '@shared/models'
import { Icon } from '../components/Icon'
import { avatarColor } from '../lib/theme'
import linux from '../assets/computer-linux.svg'
import './computer-badge.css'

const symbol = (device?: string | null) =>
  ({ laptop: 'laptopcomputer', macmini: 'macmini', macstudio: 'macstudio', imac: 'desktopcomputer', macpro: 'macpro.gen3', cloud: 'cloud' })[device ?? ''] ?? 'desktopcomputer'

/** A computer's icon showing what it is (laptop, Mac mini, Linux…), in the color picked for it. */
export function ComputerBadge({ computer, size = 36, iconSize }: { computer: Computer | null; size?: number; iconSize?: number }) {
  const color = computer?.color ? avatarColor(computer.color) : 'var(--text)'
  // A roster heading draws the badge at 28 points; without an explicit glyph size the frame would
  // shrink the icon to 14, which is too small to read as a device.
  const glyph = iconSize ?? size * 0.5
  return (
    <span aria-hidden className="computer-badge" style={{ width: size, height: size, color }}>
      {computer?.device === 'linux' ? (
        // SF Symbols has no penguin.
        <span className="computer-badge-linux" style={{ width: glyph * 1.05, height: glyph * 1.05, backgroundColor: color, WebkitMaskImage: `url("${linux}")` }} />
      ) : (
        <Icon name={symbol(computer?.device)} size={glyph} weight="medium" />
      )}
    </span>
  )
}
