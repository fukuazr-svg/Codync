import { useState } from 'react'
import type { Entry, FileDiff, PermissionOption } from '@shared/models'
import { Disclosure, Spinner } from '../../components/Controls'
import { Icon } from '../../components/Icon'
import { HStack, VStack } from '../../components/Stack'
import { Text } from '../../components/Text'
import './permission-card.css'
import { useTr } from '../../lib/use-language'
import { trNow } from '../../lib/l10n.ts'
import { fill } from '../../lib/fill.ts'


/** What the agent wants, from the tool's kind (also the notch island's headline). */
export const permissionHeadline = (toolKind?: string) => {
  switch (toolKind) {
    case 'execute':
      return trNow('Wants to run a command')
    case 'edit':
    case 'delete':
    case 'move':
      return trNow('Wants to change files')
    case 'fetch':
      return trNow('Wants to access the web')
    case 'read':
    case 'search':
      return trNow('Wants to read files')
    default:
      return trNow('Wants to use a tool')
  }
}

const rank: Record<string, number> = { allow_once: 0, allow_always: 1, reject_once: 2, reject_always: 3 }

/** Allow before deny, once before always. */
export const sortedOptions = (options: PermissionOption[]) => [...options].sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9))

export function optionLabel(o: PermissionOption) {
  switch (o.kind) {
    case 'allow_once':
      return trNow('Allow once')
    case 'allow_always':
      return trNow('Always allow')
    case 'reject_once':
      return trNow('Deny')
    case 'reject_always':
      return trNow('Never')
    default:
      return o.name
  }
}

/** Approval card in the chat: what the agent wants, where it runs, the answers. */
export function PermissionCard({ entry, hostName, answering, respond }: { entry: Entry; hostName: string; answering: string | null; respond: (option: string | null) => void }) {
  const tr = useTr()
  const [expanded, setExpanded] = useState(false)
  const d = entry.data
  const pending = d.status === 'pending'
  const hasDetail = !!d.detail || !!d.diffs?.length
  const options = sortedOptions(d.options ?? [])
  const cwd = d.cwd ? ` · ${d.cwd.split('/').filter(Boolean).pop() ?? d.cwd}` : ''
  const runsOn = fill(tr('Runs on {name}{path}'), { name: hostName, path: cwd })

  // Answered: one dim line, no card left behind (the decision is in the transcript anyway).
  if (!pending) {
    return (
      <div className="agent-inset">
        <HStack gap={6} className="permission-outcome">
          <Icon name={d.status === 'cancelled' ? 'xmark' : 'checkmark'} size={11} color="var(--tertiary)" />
          <Text size="caption" tone="tertiary" truncate>
            {outcome(entry)}{d.title ? ` · ${d.title}` : ''}
          </Text>
        </HStack>
      </div>
    )
  }

  return (
    <div className="agent-inset">
      <VStack gap={12} className="permission-card">
        <HStack gap={8}>
          <Text size="headline" tone="text">{permissionHeadline(d.toolKind)}</Text>
          <span className="permission-card-dot" />
        </HStack>
        <Text as="div" size="body" tone="secondary" lines={expanded ? undefined : 2} className="selectable permission-card-title">
          {d.title ?? ''}
        </Text>
        {d.command ? <CodeBox text={d.command} quiet /> : null}
        <HStack gap={6}>
          <Icon name="desktopcomputer" size={10} color="var(--tertiary)" />
          <Text size="caption" tone="tertiary">{runsOn}</Text>
        </HStack>
        {hasDetail ? (
          <Disclosure expanded={expanded} onToggle={() => setExpanded((e) => !e)} label={<Text size="caption" weight="medium" tone="secondary">{tr(`Details`)}</Text>}>
            <VStack gap={8} className="permission-card-details">
              {d.detail ? <CodeBox text={d.detail.slice(0, 2000)} /> : null}
              {(d.diffs ?? []).map((diff, i) => <DiffView key={i} diff={diff} />)}
            </VStack>
          </Disclosure>
        ) : null}
        <div className="permission-card-options">
          {options.map((o, i) => (
            <div key={o.optionId}>
              {i > 0 ? <div className="thread-hairline" /> : null}
              <button
                className={answering === null || answering === o.optionId ? 'permission-option' : 'permission-option dimmed'}
                disabled={answering !== null}
                onClick={() => respond(o.optionId)}
              >
                <Text size="body" weight={o.kind === 'allow_once' ? 'semibold' : 'regular'} tone={o.kind.startsWith('allow') ? 'text' : 'danger'} className="permission-option-label">{optionLabel(o)}</Text>
                {answering === o.optionId ? <Spinner size={14} /> : null}
              </button>
            </div>
          ))}
        </div>
      </VStack>
    </div>
  )
}

function outcome(entry: Entry) {
  const d = entry.data
  switch (d.status) {
    case 'answered': {
      const chosen = d.options?.find((o) => o.optionId === d.selected)
      switch (chosen?.kind) {
        case 'allow_once':
          return trNow('Allowed once')
        case 'allow_always':
          return trNow('Always allowed')
        case 'reject_once':
          return trNow('Denied')
        case 'reject_always':
          return trNow('Never allowed')
        default:
          return chosen?.name ?? trNow('Answered')
      }
    }
    case 'cancelled':
      return trNow('Cancelled')
    default:
      return trNow('Expired — the agent moved on')
  }
}

export function CodeBox({ text, quiet }: { text: string; quiet?: boolean }) {
  return (
    <div className={quiet ? 'code-box quiet' : 'code-box'}>
      <pre className="selectable code-box-text">{text}</pre>
    </div>
  )
}

export function DiffView({ diff }: { diff: FileDiff }) {
  const lines = diff.patch.split('\n').slice(0, 80)
  return (
    <VStack gap={4}>
      <HStack gap={6} className="diff-header">
        <Icon name={diff.isNew ? 'doc.badge.plus' : 'doc.text'} size={10} />
        <Text truncate grow>{diff.path.split('/').pop()}</Text>
        <Text tone="added">+{diff.added}</Text>
        <Text tone="removed">−{diff.removed}</Text>
      </HStack>
      <div className="code-box diff-box">
        <div className="code-box-text">
          {lines.map((line, i) => (
            <Text as="div" key={i} tone={line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : 'secondary'} className="diff-line">
              {line || ' '}
            </Text>
          ))}
        </div>
      </div>
    </VStack>
  )
}
