import { useEffect, useRef, useState } from 'react'
import { IconButton } from '../../components/Controls'
import { copyText } from '../../lib/image-clipboard'

/**
 * A fenced code block: the code as it was written, and a button that puts it on the clipboard
 * without the fences or the language tag.
 */
export function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const done = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (done.current) clearTimeout(done.current) }, [])
  const copy = () => {
    void copyText(text)
    setCopied(true)
    if (done.current) clearTimeout(done.current)
    done.current = setTimeout(() => setCopied(false), 1500)
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
