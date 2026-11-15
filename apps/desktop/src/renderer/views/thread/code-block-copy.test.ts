import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COPIED_MS, copyCodeBlock } from './code-block-copy.ts'

test('a block copies exactly its code, reports once, and clears the copied state after 1.5 s', () => {
  const calls: string[] = []
  const later: { run?: () => void; ms?: number } = {}
  let copied = false
  const timer = copyCodeBlock('const answer = 42\nconsole.log(answer)', {
    copy: (text) => calls.push('copy:' + text),
    track: () => calls.push('track'),
    setCopied: (value) => {
      copied = value
      calls.push('copied:' + value)
    },
    schedule: (run, ms) => {
      later.run = run
      later.ms = ms
      return setTimeout(() => {}, 0)
    },
  })
  assert.deepEqual(calls, ['copy:const answer = 42\nconsole.log(answer)', 'track', 'copied:true'])
  assert.equal(copied, true)
  assert.equal(later.ms, COPIED_MS)
  later.run?.()
  assert.equal(copied, false)
  clearTimeout(timer)
})
