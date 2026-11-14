import assert from 'node:assert/strict'
import test from 'node:test'
import { updaterFixture as fixture } from './test-support/updater.ts'
import { officialUpdates } from '../main/update-policy.ts'

const updaterFixture = (options: Parameters<typeof fixture>[0] = {}) => fixture({ ...options, officialUpdates })

test('the production build policy disables official updates', () => {
  assert.equal(officialUpdates, false)
})

test('a previous foreground request is consumed once only in packaged main', () => {
  for (const platform of ['darwin', 'win32', 'linux'] as const) {
    const first = updaterFixture({ platform, prefs: { updateRelaunchInFront: true, updateInstalling: 'keep', hostRestart: 'keep' } })
    assert.equal(first.preferences.get('updateRelaunchInFront'), false)
    assert.equal(first.preferences.get('updateInstalling'), 'keep')
    assert.equal(first.preferences.get('hostRestart'), 'keep')
    assert.equal(first.opened.length, platform === 'darwin' ? 1 : 0)
    const next = updaterFixture({ platform, prefs: Object.fromEntries(first.preferences) })
    assert.equal(next.opened.length, 0)
    assert.deepEqual(first.calls, { check: 0, download: 0, install: 0, prepare: 0, resume: 0, quit: 0 })
    assert.deepEqual(next.calls, first.calls)
  }
  for (const options of [{ packaged: false }, { main: false }]) {
    const f = updaterFixture({ ...options, prefs: { updateRelaunchInFront: true } })
    assert.equal(f.preferences.get('updateRelaunchInFront'), true)
    assert.deepEqual(f.opened, [])
  }
  for (const marker of [false, undefined]) {
    assert.deepEqual(updaterFixture({ prefs: { updateRelaunchInFront: marker } }).opened, [])
  }
})

test('deferred cleanup rechecks the request and job and does not overlap', async () => {
  for (const changed of ['request', 'job'] as const) {
    const f = updaterFixture({ deferList: true, shipIt: { request: false, job: 'idle' } })
    await f.tick(3_600_000)
    assert.equal(f.pendingLists.length, 1)
    if (changed === 'request') f.shipIt.request = true
    else f.shipIt.job = 'running'
    f.pendingLists.shift()?.()
    assert.equal(f.shipIt.removed, 0, changed)
    f.shipIt.request = false
    f.shipIt.job = 'idle'
    await f.tick(3_600_000)
    f.pendingLists.shift()?.()
    assert.equal(f.shipIt.removed, 1, changed)
  }
})

test('our disabled updater ignores checks, downloads and install requests', async () => {
  const f = updaterFixture()
  assert.equal(f.handlers.get('updates:state')?.(), f.updates.state)
  assert.equal(f.updates.state.supported, false)
  f.updates.check()
  f.ipc.emit('updates:check')
  f.ipc.emit('updates:install')
  f.host.emit('updateRequested')
  await f.emit('update-available', { version: '2.11.3' })
  await f.emit('update-downloaded', { version: '2.11.3' })
  await f.tick(30_000)
  await f.tick(3_600_000)

  assert.equal(f.updates.state.checking, false)
  assert.equal(f.updates.state.availableVersion, null)
  assert.equal(f.updates.state.staged, false)
  assert.deepEqual(f.calls, { check: 0, download: 0, install: 0, prepare: 0, resume: 0, quit: 0 })
})

test('an injected staged state does not enable update actions or intercept quit', async () => {
  const f = updaterFixture()
  f.updates.state.availableVersion = '2.11.3'
  f.updates.state.staged = true
  let prevented = false

  f.updates.check()
  f.ipc.emit('updates:install')
  f.host.emit('updateRequested')
  f.app.emit('before-quit', { preventDefault: () => { prevented = true } })
  await f.tick(30_000)

  assert.equal(prevented, false)
  assert.deepEqual(f.calls, { check: 0, download: 0, install: 0, prepare: 0, resume: 0, quit: 0 })
})

test('automatic update preferences cannot schedule checks in our build', async () => {
  const f = updaterFixture()
  f.updates.setAutoCheck(false)
  f.updates.setAutoDownload(false)
  f.updates.setAutoCheck(true)
  f.updates.setAutoDownload(true)
  f.advance(24 * 3_600_000)
  await f.tick(30_000)
  await f.tick(3_600_000)

  assert.equal(f.preferences.get('updatesAutoCheck'), true)
  assert.equal(f.preferences.get('updatesAutoDownload'), true)
  assert.equal(f.calls.check + f.calls.download + f.calls.prepare + f.calls.install, 0)
})

test('unsolicited update events do not activate our disabled updater', async () => {
  const f = updaterFixture()
  // The real updater has its own error logger; this fixture uses a plain EventEmitter.
  f.updater.on('error', () => {})
  await f.emit('checking-for-update')
  await f.emit('update-not-available')
  await f.emit('update-available', { version: '2.11.3' })
  await f.emit('download-progress', { percent: 50 })
  await f.emit('update-downloaded', { version: '2.11.3' })
  await f.emit('error', new Error('fixture error'))

  assert.equal(f.updates.state.checking, false)
  assert.equal(f.updates.state.availableVersion, null)
  assert.equal(f.updates.state.downloadPercent, null)
  assert.equal(f.updates.state.staged, false)
  assert.equal(f.updates.state.error, null)
  assert.equal(f.calls.check + f.calls.download + f.calls.prepare + f.calls.install, 0)
})

test('our disabled updater removes only an orphaned ShipIt job on registration', () => {
  const f = updaterFixture({ shipIt: { request: false, job: 'idle' } })
  assert.equal(f.shipIt.removed, 1)
  for (const shipIt of [{ request: true, job: 'idle' }, { request: false, job: 'running' }, { request: false, job: 'none' }] as const) {
    assert.equal(updaterFixture({ shipIt }).shipIt.removed, 0, JSON.stringify(shipIt))
  }
})

test('our disabled updater continues orphan cleanup hourly without checking for updates', async () => {
  const f = updaterFixture({ shipIt: { request: true, job: 'running' } })
  assert.equal([...f.timers.values()].filter(({ kind, ms }) => kind === 'interval' && ms === 3_600_000).length, 1)
  f.shipIt.request = false
  await f.tick(3_600_000)
  assert.equal(f.shipIt.removed, 0, 'a running installer is not removed')
  f.shipIt.job = 'idle'
  await f.tick(3_600_000)
  assert.equal(f.shipIt.removed, 1, 'the orphan is removed once idle')
  assert.deepEqual(f.launchctlCalls, [
    { bin: '/bin/launchctl', args: ['list', 'com.pokai.Codync.ShipIt'] },
    { bin: '/bin/launchctl', args: ['list', 'com.pokai.Codync.ShipIt'] },
    { bin: '/bin/launchctl', args: ['remove', 'com.pokai.Codync.ShipIt'] },
  ])
  assert.deepEqual(f.calls, { check: 0, download: 0, install: 0, prepare: 0, resume: 0, quit: 0 })
})

test('the disabled updater does not schedule macOS cleanup on other platforms', async () => {
  for (const platform of ['win32', 'linux'] as const) {
    const f = updaterFixture({ platform, shipIt: { request: false, job: 'idle' } })
    assert.equal(f.timers.size, 0, platform)
    await f.tick(3_600_000)
    assert.equal(f.shipIt.removed, 0, platform)
    assert.deepEqual(f.launchctlCalls, [], platform)
    assert.equal(f.calls.check + f.calls.download + f.calls.prepare + f.calls.install, 0, platform)
  }
})
