import { useEffect, useRef, useState } from 'react'
import { IconButton } from '../../components/Controls'
import { copyText } from '../../lib/image-clipboard'
import { analytics } from '../../store/analytics'
import { copyCodeBlock } from './code-block-copy'

/**
 * A fenced code block: the code as it was written, and a button that puts it on the clipboard
 * without the fences or the language tag.
 */
export function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const done = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (done.current) clearTimeout(done.current) }, [])
  const copy = () => {
    if (done.current) clearTimeout(done.current)
    done.current = copyCodeBlock(text, {
      copy: (value) => void copyText(value),
      track: () => analytics.track({ event: 'code_block_copied' }),
      setCopied,
      schedule: (run, ms) => setTimeout(run, ms),
    })
  }
  return (
    <div className="md-code-block">
      <div className="md-code">
        <pre className="md-code-text">{text}</pre>
      </div>
      <IconButton
        className="md-code-copy"
        title={copied ? 'Copied' : 'Copy code'}
        icon={copied ? 'checkmark' : 'doc.on.doc'}
        size={24}
        onClick={copy}
      />
    </div>
  )
}
