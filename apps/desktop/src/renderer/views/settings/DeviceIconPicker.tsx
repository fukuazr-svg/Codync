import { useEffect, useRef, useState } from 'react'
import type { Computer } from '@shared/models'
import { ComputerBadge } from '../ComputerBadge'
import { DEVICE_ICON_CHOICES, setDeviceIcons, useDeviceIcon } from '../../lib/device-icons'
import { deviceIconSvg } from '../../lib/device-icon-art'

type IconHost = {
  computer: Computer
  ready: () => Promise<{ call: (method: string, body: unknown) => Promise<unknown> }>
  setError?: (message: string) => void
}

/**
 * The device icon in the computer's heading. Clicking it offers the eight shapes plus "auto",
 * which drops the override and keeps what the computer really is. Saved on the host under the
 * computer's stable id, so every surface that draws this computer shows the same icon.
 */
export function DeviceIconPicker({ store, size = 26 }: { store: IconHost; size?: number }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const picked = useDeviceIcon(store.computer.id)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        setFailed(null)
      }
    }
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  const save = async (icon: string) => {
    setSaving(icon)
    setFailed(null)
    try {
      const client = await store.ready()
      const answer = (await client.call('setComputerIcon', { id: store.computer.id, icon })) as {
        computerIcons?: Record<string, string>
      }
      setDeviceIcons(answer?.computerIcons ?? {})
      setOpen(false)
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="device-icon-picker" ref={box}>
      <button
        className="device-icon-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Change this computer's icon"
        title="Change this computer's icon"
        onClick={() => {
          setOpen((o) => !o)
          setFailed(null)
        }}>
        <ComputerBadge computer={store.computer} size={size} iconSize={18} />
      </button>
      {open ? (
        <div className="device-icon-menu" role="dialog" aria-label="Device icon">
          <div className="device-icon-menu-title">设备图标</div>
          <div className="device-icon-grid">
            <button className={`device-icon-choice ${picked ? '' : 'chosen'}`} onClick={() => save('auto')} disabled={saving !== null}>
              <span className="device-icon-dot" aria-hidden>
                <ComputerBadge computer={store.computer} size={26} iconSize={18} />
              </span>
              <span>自动识别</span>
            </button>
            {DEVICE_ICON_CHOICES.map((choice) => (
              <button
                key={choice.id}
                className={`device-icon-choice ${picked === choice.id ? 'chosen' : ''}`}
                onClick={() => save(choice.id)}
                disabled={saving !== null}>
                <span className="device-icon-dot" aria-hidden dangerouslySetInnerHTML={{ __html: deviceIconSvg(choice.id) ?? '' }} />
                <span>{choice.label}</span>
              </button>
            ))}
          </div>
          <div className="device-icon-menu-foot">
            {failed ? <span className="device-icon-error">{failed}</span> : <span>只改外观，不影响设备身份与权限</span>}
          </div>
        </div>
      ) : null}
    </div>
  )
}

