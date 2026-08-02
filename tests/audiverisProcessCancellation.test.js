import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { runAudiveris } from '../backend/providers/AudiverisProvider.js'

function alive(pid) { try { process.kill(pid, 0); return true } catch (e) { return e.code !== 'ESRCH' } }
async function ready(child) { child.stdout.setEncoding('utf8'); while (true) { const [chunk] = await once(child.stdout, 'data'); if (chunk.includes('READY')) return } }

async function cancelScript(script) {
  const controller = new AbortController()
  let child
  const promise = runAudiveris(process.execPath, ['-e', script], 5000, controller.signal, { gracefulKillDelayMs: 40, forceKillWaitMs: 1000, onSpawn: (c) => { child = c } })
  await ready(child)
  const pid = child.pid
  controller.abort()
  await assert.rejects(promise, (e) => e.code === 'CANCELED')
  assert.equal(alive(pid), false)
  return { child, pid }
}

test('SIGTERM-responsive controlled child closes before cancellation settles', async () => {
  const { child } = await cancelScript("console.log('READY'); setInterval(()=>{},1000)")
  assert.notEqual(child.signalCode, null)
})

test('SIGTERM-resistant controlled child receives SIGKILL and closes', { skip: process.platform === 'win32' }, async () => {
  const { child } = await cancelScript("process.on('SIGTERM',()=>{}); console.log('READY'); setInterval(()=>{},1000)")
  assert.equal(child.signalCode, 'SIGKILL')
})

test('already-aborted signal never starts a child', async () => {
  const controller = new AbortController(); controller.abort()
  let spawned = false
  await assert.rejects(runAudiveris(process.execPath, ['-e', ''], 1000, controller.signal, { onSpawn: () => { spawned = true } }), (e) => e.code === 'CANCELED')
  assert.equal(spawned, false)
})

test('spawn failure is reported truthfully', async () => {
  await assert.rejects(runAudiveris('/definitely/missing/seslitab', [], 1000), (e) => e.code === 'EXECUTABLE_NOT_FOUND')
})
