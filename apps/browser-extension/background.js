const NATIVE_HOST = 'dev.codync.browser'
const EXTENSION_ID = 'dgejialhpalhoigbkmgeabgpphlipiek'
const PROTOCOL = 1
const SESSION_KEY = 'codyncBrowserSession'
const MAX_TEXT = 16 * 1024
const MAX_URL = 8 * 1024
const attachTimeout = 10_000
const navigateTimeout = 20_000
const settleTimeout = 200

let port = null
let hostId = null
let reconnect = null
const attachedTabs = new Set()
const sessions = new Map()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function describeError(error) {
  return String(chrome.runtime.lastError?.message ?? error?.message ?? error ?? 'Unknown Chrome error')
}

function isMissingTabError(error) {
  return /No tab with id|Invalid tab ID|Tab not found/i.test(describeError(error))
}

async function removeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId)
  } catch (error) {
    if (!isMissingTabError(error)) throw new Error(`Could not close the dedicated browser tab: ${describeError(error)}`)
  }
}

function checkedUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL) {
    throw new Error(`URL must be 1-${MAX_URL} bytes`)
  }
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https pages can be opened')
  if (url.username || url.password) throw new Error('URLs with credentials are not allowed')
  return url.toString()
}

function targetFrom(params, requireTab = true) {
  const target = params?.target
  if (!target || typeof target !== 'object') throw new Error('Missing browser target')
  const required = ['hostId', 'botId', 'messageId', 'operationId', 'browserId', 'generation']
  if (requireTab) required.push('tabId')
  for (const key of required) {
    if (typeof target[key] !== 'string' || target[key].length === 0) throw new Error(`Missing browser target ${key}`)
  }
  if (hostId && target.hostId !== hostId) throw new Error('Browser target belongs to another Codync host')
  return target
}

function sessionFor(target) {
  const session = sessions.get(target.browserId)
  if (!session) throw new Error('Browser operation is no longer running in Codync Browser')
  for (const key of ['hostId', 'botId', 'messageId', 'operationId']) {
    if (session[key] !== target[key]) throw new Error('Browser target changed')
  }
  if (session.tabId !== String(target.tabId)) throw new Error('Browser tab changed')
  if (session.generation !== target.generation) throw new Error('Browser target changed')
  return session
}

async function persistSessions() {
  await chrome.storage.session.set({ [SESSION_KEY]: [...sessions.values()] })
}

async function restoreSessions() {
  const stored = await chrome.storage.session.get(SESSION_KEY)
  for (const session of stored[SESSION_KEY] ?? []) sessions.set(session.browserId, session)
}

async function setBridgeStatus(status, detail = '') {
  await chrome.storage.local.set({
    bridgeStatus: { status, detail, hostId, at: Date.now() }
  })
}

function connectNative() {
  if (port) return
  void setBridgeStatus('connecting')
  try {
    port = chrome.runtime.connectNative(NATIVE_HOST)
  } catch (error) {
    void setBridgeStatus('disconnected', String(error?.message ?? error))
    scheduleReconnect()
    return
  }
  port.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') return
    if (message.type === 'ready') {
      hostId = message.hostId
      void setBridgeStatus('connected')
      return
    }
    if (message.type === 'bridgeError') {
      void setBridgeStatus('error', String(message.error ?? 'Browser bridge error'))
      return
    }
    if (message.type === 'queued') {
      void setBridgeStatus('waiting', String(message.detail ?? 'Another browser window is connected'))
      return
    }
    if (typeof message.id !== 'string' || typeof message.method !== 'string') return
    void runRequest(message)
  })
  port.onDisconnect.addListener(() => {
    const detail = chrome.runtime.lastError?.message ?? 'Codync Browser bridge disconnected'
    port = null
    hostId = null
    void setBridgeStatus('disconnected', detail)
    scheduleReconnect()
  })
  port.postMessage({
    type: 'hello',
    protocol: PROTOCOL,
    extensionId: EXTENSION_ID,
    version: chrome.runtime.getManifest().version,
    browserVersion: navigator.userAgent
  })
}

function scheduleReconnect() {
  if (reconnect) return
  reconnect = setTimeout(() => {
    reconnect = null
    connectNative()
  }, 2000)
}

function reply(message, result) {
  if (!port) return
  port.postMessage({ id: message.id, ok: true, result })
}

function fail(message, error) {
  if (!port) return
  port.postMessage({
    id: message.id,
    ok: false,
    error: String(error?.message ?? error ?? 'Codync Browser request failed')
  })
}

async function runRequest(message) {
  try {
    reply(message, await handle(message.method, message.params ?? {}))
  } catch (error) {
    fail(message, error)
  }
}

async function waitForTab(tabId, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let tab
    try {
      tab = await chrome.tabs.get(tabId)
    } catch (error) {
      throw new Error(`The browser tab closed while loading: ${describeError(error)}`)
    }
    if (predicate(tab)) return tab
    await sleep(100)
  }
  throw new Error('The tab did not finish loading in time')
}

async function attach(tabId) {
  if (attachedTabs.has(tabId)) return
  await withTimeout(
    chrome.debugger.attach({ tabId }, '1.3'),
    attachTimeout,
    'Could not attach to the browser tab'
  )
  attachedTabs.add(tabId)
  await chrome.debugger.sendCommand({ tabId }, 'Page.enable')
  await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable')
}

async function detach(tabId) {
  if (!attachedTabs.delete(tabId)) return
  try {
    await chrome.debugger.detach({ tabId })
  } catch (error) {
    if (!isMissingTabError(error)) {
      await setBridgeStatus('error', `Could not release the browser tab: ${describeError(error)}`)
    }
  }
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    sleep(timeoutMs).then(() => {
      throw new Error(`${message} in ${Math.round(timeoutMs / 1000)} seconds`)
    })
  ])
}

async function evaluate(tabId, expression) {
  const answer = await chrome.debugger.sendCommand(
    { tabId },
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true }
  )
  if (answer.exceptionDetails) {
    throw new Error(answer.exceptionDetails.exception?.description ?? 'The page script failed')
  }
  return answer.result?.value
}

async function pageState(tabId) {
  const tab = await chrome.tabs.get(tabId)
  const value = await evaluate(tabId, `(() => ({
    url: location.href,
    title: document.title,
    text: (document.body?.innerText ?? '').slice(0, 12000)
  }))()`)
  return {
    url: String(value?.url || tab.url || ''),
    title: String(value?.title || tab.title || ''),
    text: String(value?.text || '')
  }
}

async function start(params) {
  const target = targetFrom(params, false)
  const url = checkedUrl(params.url)
  let tabId = null
  try {
    const tab = await chrome.tabs.create({ url, active: false })
    if (!Number.isInteger(tab.id)) throw new Error('Chrome did not return a tab id')
    tabId = tab.id
    await waitForTab(tabId, (current) => current.status === 'complete', navigateTimeout)
    await attach(tabId)
    const session = {
      hostId: target.hostId,
      botId: target.botId,
      messageId: target.messageId,
      operationId: target.operationId,
      browserId: target.browserId,
      tabId: String(tabId),
      generation: target.generation,
      initialUrl: url,
      currentUrl: url
    }
    sessions.set(target.browserId, session)
    await persistSessions()
    return {
      tabId: String(tabId),
      browserVersion: navigator.userAgent,
      browserExecutable: 'unknown',
      extensionId: EXTENSION_ID,
      extensionVersion: chrome.runtime.getManifest().version,
      state: await pageState(tabId)
    }
  } catch (error) {
    if (tabId != null) {
      try {
        await detach(tabId)
        await removeTab(tabId)
      } catch (cleanupError) {
        await setBridgeStatus('error', `Could not clean up a failed browser start: ${describeError(cleanupError)}`)
      }
    }
    throw error
  }
}

async function navigate(params) {
  const target = targetFrom(params)
  const session = sessionFor(target)
  const url = checkedUrl(params.url)
  const tabId = Number(session.tabId)
  const previousUrl = session.currentUrl
  const updated = await chrome.tabs.update(tabId, { url })
  if (updated.status !== 'loading' && updated.url === previousUrl) {
    await waitForTab(
      tabId,
      (current) => current.status === 'loading' || current.url !== previousUrl,
      navigateTimeout
    )
  }
  const tab = await waitForTab(
    tabId,
    (current) => current.status === 'complete' && /^https?:/i.test(current.url ?? ''),
    navigateTimeout
  )
  session.currentUrl = tab.url ?? url
  await persistSessions()
  return pageState(tabId)
}

async function click(params) {
  const target = targetFrom(params)
  const session = sessionFor(target)
  if (typeof params.selector !== 'string' || params.selector.length === 0 || params.selector.length > 512) {
    throw new Error('Selector must be 1-512 bytes')
  }
  const tabId = Number(session.tabId)
  await attach(tabId)
  const selector = JSON.stringify(params.selector)
  const hit = await evaluate(tabId, `(() => {
    const matches = document.querySelectorAll(${selector});
    if (matches.length === 0) return { found: false, reason: 'selector did not match an element' };
    if (matches.length > 1) return { found: false, reason: 'selector matched more than one element' };
    const el = matches[0];
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { found: false, reason: 'element has a 0x0 hit box' };
    }
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === el || el.contains(hit))) {
      return { found: false, reason: 'element is covered or cannot receive the click' };
    }
    return {
      found: true,
      x,
      y
    };
  })()`)
  if (!hit?.found) throw new Error(hit?.reason ?? 'Element is not clickable')
  const point = { x: hit.x, y: hit.y }
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    ...point
  })
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...point,
    button: 'left',
    clickCount: 1
  })
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...point,
    button: 'left',
    clickCount: 1
  })
  await sleep(settleTimeout)
  return pageState(tabId)
}

async function type(params) {
  const target = targetFrom(params)
  const session = sessionFor(target)
  if (typeof params.selector !== 'string' || params.selector.length === 0 || params.selector.length > 512) {
    throw new Error('Selector must be 1-512 bytes')
  }
  if (typeof params.text !== 'string' || params.text.length > MAX_TEXT) {
    throw new Error(`Text must be at most ${MAX_TEXT} bytes`)
  }
  const tabId = Number(session.tabId)
  await attach(tabId)
  const selector = JSON.stringify(params.selector)
  const editable = await evaluate(tabId, `(() => {
    const matches = document.querySelectorAll(${selector});
    if (matches.length === 0) return { error: 'selector did not match an element' };
    if (matches.length > 1) return { error: 'selector matched more than one element' };
    const el = matches[0];
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable)) return false;
    el.focus();
    el.scrollIntoView({ block: 'center', inline: 'center' });
    return document.activeElement === el || el.contains(document.activeElement)
      ? true
      : { error: 'selector did not match a focusable editable element' };
  })()`)
  if (editable !== true) throw new Error(editable?.error ?? 'Selector did not match a focusable editable element')
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    modifiers: selectAllModifier(),
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    code: 'KeyA',
    key: 'a'
  })
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    modifiers: selectAllModifier(),
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    code: 'KeyA',
    key: 'a'
  })
  await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: params.text })
  await sleep(settleTimeout)
  return pageState(tabId)
}

function selectAllModifier() {
  return /Mac/i.test(navigator.platform) ? 4 : 2
}

async function screenshot(params) {
  const target = targetFrom(params)
  const session = sessionFor(target)
  const tabId = Number(session.tabId)
  await attach(tabId)
  const capture = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  })
  if (!capture?.data) throw new Error('Chrome returned no screenshot data')
  return { data: capture.data, state: await pageState(tabId) }
}

async function stop(params) {
  const target = targetFrom(params)
  const session = sessionFor(target)
  const tabId = Number(session.tabId)
  await detach(tabId)
  await removeTab(tabId)
  sessions.delete(target.browserId)
  await persistSessions()
  return { closed: true, tabId: session.tabId }
}

async function state(params) {
  const target = targetFrom(params)
  const session = sessionFor(target)
  return pageState(Number(session.tabId))
}

async function handle(method, params) {
  switch (method) {
    case 'start':
      return start(params)
    case 'navigate':
      return navigate(params)
    case 'click':
      return click(params)
    case 'type':
      return type(params)
    case 'screenshot':
      return screenshot(params)
    case 'stop':
      return stop(params)
    case 'state':
      return state(params)
    default:
      throw new Error(`Unknown Codync Browser method ${method}`)
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  let changed = false
  for (const [browserId, session] of sessions) {
    if (session.tabId !== String(tabId)) continue
    sessions.delete(browserId)
    attachedTabs.delete(tabId)
    changed = true
  }
  if (changed) void persistSessions()
})

chrome.debugger.onDetach.addListener((source) => {
  if (Number.isInteger(source.tabId)) attachedTabs.delete(source.tabId)
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'status') return false
  void chrome.storage.local.get(['bridgeStatus']).then(({ bridgeStatus }) => {
    sendResponse({
      bridgeStatus: bridgeStatus ?? { status: port ? 'connecting' : 'disconnected' },
      extensionVersion: chrome.runtime.getManifest().version,
      sessions: sessions.size
    })
  })
  return true
})

chrome.runtime.onStartup.addListener(connectNative)
chrome.runtime.onInstalled.addListener(connectNative)

void restoreSessions().finally(connectNative)
