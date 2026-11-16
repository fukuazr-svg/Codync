import type { TraySymbol } from '@shared/ipc'
import type { Computer } from '@shared/models'
import { Icon } from '../components/Icon'
import { avatarColor } from '../lib/theme'
import { useDeviceIcon } from '../lib/device-icons'
import { deviceIconSvg } from '../lib/device-icon-art'
import linux from '../assets/computer-linux.svg'
import './computer-badge.css'

const SYMBOLS: Record<string, TraySymbol> = { laptop: 'laptopcomputer', macmini: 'macmini', macstudio: 'macstudio', imac: 'desktopcomputer', macpro: 'macpro.gen3', cloud: 'cloud' }

/** The SF Symbol for what a computer is, which the tray menu shows too. */
export const computerSymbol = (device?: string | null): TraySymbol => SYMBOLS[device ?? ''] ?? 'desktopcomputer'

/** A computer's icon: the preset a person picked, else what the computer really is. */
export function ComputerBadge({ computer, size = 36, iconSize }: { computer: Computer | null; size?: number; iconSize?: number }) {
  const color = computer?.color ? avatarColor(computer.color) : 'var(--text)'
  // A roster heading draws the badge at 28 points; without an explicit glyph size the frame would
  // shrink the icon to 14, which is too small to read as a device.
  const glyph = iconSize ?? size * 0.5
  const picked = useDeviceIcon(computer?.id)
  const svg = deviceIconSvg(picked)
  if (svg) {
    return (
      <span aria-hidden className="computer-badge computer-badge-picked" style={{ width: size, height: size, color }}>
        <span className="computer-badge-svg" style={{ width: glyph * 1.1, height: glyph * 1.1 }} dangerouslySetInnerHTML={{ __html: svg }} />
      </span>
    )
  }
  return (
    <span aria-hidden className="computer-badge" style={{ width: size, height: size, color }}>
      {computer?.device === 'linux' ? (
        // SF Symbols has no penguin.
        <span className="computer-badge-linux" style={{ width: glyph * 1.05, height: glyph * 1.05, backgroundColor: color, WebkitMaskImage: `url("${linux}")` }} />
      ) : (
        <Icon name={computerSymbol(computer?.device)} size={glyph} weight="medium" />
      )}
    </span>
  )
}
