import { useEffect, useRef } from 'react'

/**
 * Escape closes the layer `ref` names wherever the focus is (its own field, the composer, the
 * chat), once nothing else took the key: a dialog or menu opened over it (`useEscape` stops the
 * key; the account panel and the composer's reply and `/` list prevent its default), an input
 * method's candidate, or a modal that made the page under it inert.
 */
export function useEscapeLast(ref: React.RefObject<HTMLElement | null>, onEscape: () => void, active = true) {
  const handler = useRef(onEscape)
  handler.current = onEscape
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return
      // Decided once the key has reached every listener: a menu that opened after this layer hears it after this one.
      setTimeout(() => {
        if (!e.defaultPrevented && !ref.current?.closest('[inert]')) handler.current()
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ref, active])
}
