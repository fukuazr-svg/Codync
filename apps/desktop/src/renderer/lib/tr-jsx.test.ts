import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Interface text that exists in a language catalog but reaches JSX as a bare string is never
// translated: the app renders English in every language. This guards the renderer against it.
const renderer = fileURLToPath(new URL('..', import.meta.url))
const languages = fileURLToPath(new URL('../../../../ios/Kit/Sources/CodyncKit/Resources/Languages', import.meta.url))

const phrases = new Set<string>()
for (const name of readdirSync(languages)) {
  if (!name.endsWith('.json')) continue
  for (const key of Object.keys(JSON.parse(readFileSync(join(languages, name), 'utf8')) as Record<string, string>)) phrases.add(key)
}

const JSX_TEXT = />([^<>{}\n]{2,60})</g

function sources(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) found.push(...sources(path))
    else if (name.endsWith('.tsx') && !name.includes('.test.')) found.push(path)
  }
  return found
}

test('no JSX text is left untranslated when a catalog has the phrase', () => {
  const untranslated: string[] = []
  const files = sources(renderer)
  for (const path of files) {
    const lines = readFileSync(path, 'utf8').split('\n')
    for (const [index, line] of lines.entries()) {
      if (line.includes('tr(') || line.includes('trNow(') || line.includes('translate(')) continue
      for (const match of line.matchAll(new RegExp(JSX_TEXT))) {
        const text = match[1].trim()
        if (phrases.has(text)) untranslated.push(`${path.slice(renderer.length)}:${index + 1} ${JSON.stringify(text)}`)
      }
    }
  }
  assert.ok(files.length > 100, `expected to scan the renderer, scanned ${files.length} files`)
  assert.deepEqual(untranslated, [], 'wrap these in tr() or add a catalog entry')
})
