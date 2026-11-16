import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { announcements, phrases } from './whats-new.ts'

const directory = new URL('../../../../ios/Kit/Sources/CodyncKit/Resources/Languages/', import.meta.url)
const read = (language: string): Record<string, string> => JSON.parse(readFileSync(new URL(`${language}.json`, directory), 'utf8'))

/** Every key the file spells out, in order, including a repeat a parser would drop. */
const spelledKeys = (text: string): string[] => {
  const keys: string[] = []
  let at = text.indexOf('{') + 1
  while (at > 0 && at < text.length) {
    while (at < text.length && /[\s,]/.test(text[at])) at++
    if (text[at] !== '"') return keys
    const starts = at
    at++
    while (at < text.length && text[at] !== '"') at += text[at] === '\\' ? 2 : 1
    keys.push(JSON.parse(text.slice(starts, at + 1)) as string)
    at = text.indexOf(':', at) + 1
    while (at < text.length && /\s/.test(text[at])) at++
    if (text[at] !== '"') throw new Error('a catalog value is not a string')
    at++
    while (at < text.length && text[at] !== '"') at += text[at] === '\\' ? 2 : 1
    at++
  }
  return keys
}

test('no catalog spells a key twice, so a translation is never dropped', () => {
  for (const locale of ['zh-Hans', 'zh-Hant', 'ja', 'ko', 'fr', 'de', 'es', 'pt-BR', 'ru', 'it']) {
    const keys = spelledKeys(readFileSync(new URL(`${locale}.json`, directory), 'utf8'))
    const repeated = keys.filter((key, index) => keys.indexOf(key) !== index)
    assert.deepEqual(repeated, [], `${locale}: the last one wins, so "${repeated.at(-1) ?? ''}" loses its other translation`)
  }
})

test('all shipped catalogs have the same keys and preserve interpolation tokens', () => {
  const source = read('zh-Hans')
  for (const locale of ['zh-Hant', 'ja', 'ko', 'fr', 'de', 'es', 'pt-BR', 'ru', 'it']) {
    const catalog = read(locale)
    assert.equal(catalog.English, "English", `${locale}: English keeps its native name in language menus`)
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(source).sort(), locale)
    for (const [key, value] of Object.entries(catalog)) {
      assert.ok(value.trim(), `${locale}: ${key}`)
      assert.deepEqual((value.match(/\{[A-Za-z0-9]+\}/g) ?? []).sort(), (key.match(/\{[A-Za-z0-9]+\}/g) ?? []).sort(), `${locale}: ${key}`)
      assert.equal((value.match(/%d/g) ?? []).length, (key.match(/%d/g) ?? []).length, `${locale}: ${key} (%d)`)
      assert.doesNotMatch(value, /ZXQ\d|QXZ/, `${locale}: ${key}`)
    }
  }
})

test("every What's new phrase is translated in every catalog, and the clips beside the file are the ones it names, each under 300 KB", () => {
  const folder = new URL('../../../CodyncUI/Resources/Announcements/', directory)
  const clips = readdirSync(folder).filter((name) => name.endsWith('.mp4'))
  // Every app ships the whole folder: a clip no feature names is dead weight in all of them.
  assert.deepEqual(clips.sort(), announcements.flatMap((a) => a.features ?? []).flatMap((f) => (f.media ? `${f.media}.mp4` : [])).sort())
  for (const clip of clips) assert.ok(statSync(new URL(clip, folder)).size < 300_000, clip)
  for (const locale of ['zh-Hans', 'zh-Hant', 'ja', 'ko', 'fr', 'de', 'es', 'pt-BR', 'ru', 'it']) {
    const catalog = read(locale)
    for (const note of phrases(announcements)) assert.ok(Object.hasOwn(catalog, note), `${locale}: ${note}`)
  }
})
