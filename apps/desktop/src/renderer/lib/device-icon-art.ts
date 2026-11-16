import allInOne from '../assets/device-icons/all-in-one.svg?raw'
import desktop from '../assets/device-icons/desktop.svg?raw'
import laptop from '../assets/device-icons/laptop.svg?raw'
import miniPc from '../assets/device-icons/mini-pc.svg?raw'
import nas2Bay from '../assets/device-icons/nas-2bay.svg?raw'
import nas4Bay from '../assets/device-icons/nas-4bay.svg?raw'
import serverRack from '../assets/device-icons/server-rack.svg?raw'
import serverTower from '../assets/device-icons/server-tower.svg?raw'

// The eight presets' drawings, apart from the store that remembers which one a computer has: only views that draw an
// icon need a bundler's `?raw` import, so tests of the store (and of anything that syncs it) never load an SVG.
const SVGS: Record<string, string> = {
  'nas-2bay': nas2Bay,
  'nas-4bay': nas4Bay,
  'server-rack': serverRack,
  'server-tower': serverTower,
  laptop,
  desktop,
  'mini-pc': miniPc,
  'all-in-one': allInOne,
}

/** An override's drawing, or null when it should keep the computer's real device icon. */
export function deviceIconSvg(preset: string | null | undefined) {
  return preset ? (SVGS[preset] ?? null) : null
}
