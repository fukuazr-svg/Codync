/** The time the copy button says "Copied" before it goes back to "Copy code". */
export const COPIED_MS = 1500

/**
 * Copy a code block's text, report the copy once, and say "Copied" until the timer clears it.
 * The text handed in is the block's code as parsed, so no fence or language tag can reach the
 * clipboard. Timers are injected so a test can drive them without waiting.
 */
export function copyCodeBlock(
  text: string,
  io: {
    copy: (text: string) => void
    track: () => void
    setCopied: (copied: boolean) => void
    schedule: (run: () => void, ms: number) => ReturnType<typeof setTimeout>
  },
): ReturnType<typeof setTimeout> {
  io.copy(text)
  io.track()
  io.setCopied(true)
  return io.schedule(() => io.setCopied(false), COPIED_MS)
}
