import { useSyncExternalStore } from 'react'

/** The eight shapes a person may pick, in the order the picker lists them. */
export const DEVICE_ICON_CHOICES: { id: string; label: string }[] = [
  { id: 'nas-2bay', label: 'NAS · 双盘' },
  { id: 'nas-4bay', label: 'NAS · 四盘' },
  { id: 'server-rack', label: '机架服务器' },
  { id: 'server-tower', label: '塔式服务器' },
  { id: 'laptop', label: '笔记本' },
  { id: 'desktop', label: '台式机' },
  { id: 'mini-pc', label: '迷你主机' },
  { id: 'all-in-one', label: '一体机' },
]

let icons: Record<string, string> = {}
const listeners = new Set<() => void>()

/** Applies the host's whole map: absent ids (and unknown presets) fall back to the real device. */
export function setDeviceIcons(next: Record<string, string> | null | undefined) {
  icons = { ...(next ?? {}) }
  for (const listener of listeners) listener()
}

export function deviceIconsSnapshot() {
  return icons
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** The override picked for one computer, re-rendered whenever the host's map moves. */
export function useDeviceIcon(computerId: string | null | undefined) {
  return useSyncExternalStore(subscribe, () => (computerId ? icons[computerId] ?? null : null))
}
