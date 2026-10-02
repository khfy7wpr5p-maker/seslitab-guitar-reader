import { spawn, spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function findSes153Chrome() {
  for (const candidate of [process.env.CHROME_BIN, 'google-chrome',
    'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)) {
    if (spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 5000 }).status === 0) return candidate
  }
  throw new Error('SES-153 browser proof failed closed: Chrome/Chromium not found.')
}

// Node 24 CDP over a pipe needs no debug port or extra dependency.
// The deadline belongs to the host clock, not Chromium's virtual clock.
export async function runSes153BrowserProof({ url, chrome = findSes153Chrome(), timeoutMs = 15000 }) {
  const started = performance.now()
  const report = { chrome, url, events: [], snapshot: null, outcome: 'FAIL' }
  const userDataDir = mkdtempSync(join(tmpdir(), 'ses153-proof-'))
  const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu',
    '--disable-dev-shm-usage', '--allow-file-access-from-files',
    '--remote-debugging-pipe', `--user-data-dir=${userDataDir}`, '--no-first-run', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
  const pending = new Map()
  let nextId = 1
  let buffered = ''
  let sessionId
  let failed = false
  let closing = false
  let terminalResolve
  const terminal = new Promise(resolve => { terminalResolve = resolve })
  const record = (kind, detail) => {
    if (report.events.length < 1000) report.events.push({ wallMs: performance.now() - started, kind, detail })
  }
  const fatal = error => {
    if (closing) return
    failed = true
    record('fatal', String(error?.stack || error))
    terminalResolve('FAIL')
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }
  const send = (method, params = {}, targetSession = sessionId) => new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`CDP command timed out: ${method}`))
    }, Math.min(timeoutMs, 10000))
    pending.set(id, { resolve, reject, timer })
    child.stdio[3].write(JSON.stringify({ id, method, params,
      ...(targetSession ? { sessionId: targetSession } : {}) }) + '\0', error => {
      if (error) fatal(error)
    })
  })
  child.on('error', fatal)
  child.on('exit', (code, signal) => fatal(new Error(`Chrome exited: code=${code}, signal=${signal}`)))
  child.stderr.on('data', chunk => record('stderr', String(chunk)))
  child.stdio[3].on('error', fatal)
  child.stdio[4].on('error', fatal)
  child.stdio[4].setEncoding('utf8')
  child.stdio[4].on('data', chunk => {
    buffered += chunk
    let end
    while ((end = buffered.indexOf('\0')) !== -1) {
      const raw = buffered.slice(0, end)
      buffered = buffered.slice(end + 1)
      if (!raw) continue
      let message
      try { message = JSON.parse(raw) } catch (error) { fatal(error); continue }
      const entry = pending.get(message.id)
      if (entry) {
        pending.delete(message.id)
        clearTimeout(entry.timer)
        if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
        else entry.resolve(message.result)
      } else if (message.sessionId === sessionId) {
        const { method, params } = message
        if (method === 'Runtime.bindingCalled' && params.name === 'ses153ProofEvent') {
          let snapshot
          try { snapshot = JSON.parse(params.payload) } catch (error) { fatal(error); continue }
          report.snapshot = snapshot
          record('fixture', snapshot)
          if (snapshot.kind === 'error' || snapshot.kind === 'unhandledrejection') terminalResolve('FAIL')
          if (snapshot.kind === 'error' || snapshot.kind === 'unhandledrejection') failed = true
          if (snapshot.dataset?.proofStatus === 'done') terminalResolve('DONE')
        } else if (method === 'Runtime.exceptionThrown') {
          record(method, params)
          failed = true
          terminalResolve('FAIL')
        } else if (method === 'Runtime.consoleAPICalled' || method === 'Log.entryAdded'
          || method === 'Network.loadingFailed') {
          record(method, params)
          if (params.type === 'error' || params.entry?.level === 'error' || method === 'Network.loadingFailed') {
            failed = true
            terminalResolve('FAIL')
          }
        }
      }
    }
  })
  let deadline
  try {
    report.browserVersion = await send('Browser.getVersion')
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const attached = await send('Target.attachToTarget', { targetId, flatten: true })
    sessionId = attached.sessionId
    for (const domain of ['Page', 'Runtime', 'Log', 'Network']) await send(`${domain}.enable`)
    await send('Runtime.addBinding', { name: 'ses153ProofEvent' })
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      (() => {
        const snapshot = (kind, detail) => ({ kind, detail, pageMs: performance.now(),
          timestamp: new Date().toISOString(), readyState: document.readyState,
          protocol: location.protocol, isSecureContext, cryptoSubtle: typeof crypto.subtle,
          dataset: { ...document.body?.dataset },
          statuses: Array.from(document.querySelectorAll('[class$="__score-status"], [class$="__status"]'), el => el.textContent) })
        window.__ses153Snapshot = snapshot
        const emit = (kind, detail) => ses153ProofEvent(JSON.stringify(snapshot(kind, detail)))
        window.addEventListener('error', e => emit('error', e.error?.stack || e.message || e.target?.src), true)
        window.addEventListener('unhandledrejection', e => emit('unhandledrejection', String(e.reason?.stack || e.reason)))
        new MutationObserver(() => emit('state')).observe(document, {
          subtree: true, childList: true, characterData: true, attributes: true })
        for (const [prototype, name, label] of [[Blob.prototype, 'text', 'file_text'], [SubtleCrypto.prototype, 'digest', 'hash']]) {
          const original = prototype[name]
          prototype[name] = function(...args) {
            emit(label + '_started')
            const promise = original.apply(this, args)
            promise.then(() => emit(label + '_resolved'), error => emit(label + '_rejected', String(error)))
            return promise
          }
        }
        emit('document_created')
      })()
    ` })
    const timeout = new Promise(resolve => {
      deadline = setTimeout(() => resolve('TIMEOUT'), timeoutMs)
    })
    const navigation = await send('Page.navigate', { url })
    if (navigation.errorText) throw new Error(navigation.errorText)
    const state = await Promise.race([terminal, timeout])
    const evaluated = await send('Runtime.evaluate', {
      expression: 'window.__ses153Snapshot?.("terminal")', returnByValue: true,
    })
    report.snapshot = evaluated.result?.value || report.snapshot
    const data = report.snapshot?.dataset
    if (!failed && state === 'DONE' && data?.scoreOnlyPass === 'true' && data?.combinedPass === 'true') report.outcome = 'PASS'
    else report.reason = `${state}: stage=${data?.stage || 'before fixture entry'}, scoreOnly=${data?.scoreOnlyPass} (${data?.scoreOnlyStage}), combined=${data?.combinedPass} (${data?.combinedStage})`
  } catch (error) {
    report.reason = String(error?.stack || error)
  } finally {
    closing = true
    clearTimeout(deadline)
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new Error('SES-153 CDP session closed'))
    }
    pending.clear()
    child.removeAllListeners('exit')
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const exit = new Promise(resolve => child.once('exit', resolve))
      let waitForExit = true
      if (process.platform === 'win32') child.kill('SIGKILL')
      else {
        try { process.kill(-child.pid, 'SIGKILL') }
        catch (error) {
          waitForExit = false
          if (error.code !== 'ESRCH') {
            report.outcome = 'FAIL'
            report.reason = `Chrome cleanup failed: ${String(error?.stack || error)}`
            record('cleanup_error', report.reason)
          }
        }
      }
      if (waitForExit) await exit
    }
    child.stdio[3].destroy()
    child.stdio[4].destroy()
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    report.wallMs = performance.now() - started
  }
  return report
}
