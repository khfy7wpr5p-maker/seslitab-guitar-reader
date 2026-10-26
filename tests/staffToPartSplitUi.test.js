import assert from 'node:assert/strict'
import test from 'node:test'
import { createFakeDocument } from './support/fakeTeacherPoolDom.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'
import { score } from './support/staffSplitFixture.js'
import { prepareTeacherAssignmentScoreUpload } from '../src/services/teacherAssignmentComposerScoreUpload.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer
async function api() {
  try { return await import('../src/staffToPartSplitUi.js') }
  catch { assert.fail('SES-248 reversible split UI must exist') }
}
const button = (host, label) => host.querySelectorAll('button').find(b => b.textContent === label)
async function harness({ prepare } = {}) {
  const { mountStaffToPartSplitUi } = await api()
  const root = createFakeDocument(), host = root.createElement('div')
  const source = await prepareTeacherAssignmentScoreUpload({ musicXml: score(), teacherId: 'teacher', draftId: 'draft', now: () => '2026-10-23T00:00:00Z' })
  let current = source, busy = false
  const handle = mountStaffToPartSplitUi({ root, host, getUpload: () => current, isBusy: () => busy,
    prepareUpload: prepare ?? (musicXml => prepareTeacherAssignmentScoreUpload({ musicXml, teacherId: 'teacher', draftId: 'draft', now: () => '2026-10-23T00:00:00Z' })),
    onApply: upload => { current = upload }, onRestore: upload => { current = upload } })
  handle.setUpload(source)
  return { host, handle, source, current: () => current, set: upload => { current = upload }, busy: value => { busy = value } }
}

test('preview does not mutate selected upload; explicit apply creates fresh upload and undo restores source', async () => {
  const h = await harness()
  await button(h.host, 'Keman ve piyano partilerini ayır').dispatchEventAsync({ type: 'click' })
  assert.equal(h.current(), h.source)
  assert.match(h.host.querySelector('[role="status"]').textContent, /Önizleme.*Keman.*P1.*Piyano.*P2/)
  assert.equal(button(h.host, 'Ayırmayı uygula').hidden, false)
  await button(h.host, 'Ayırmayı uygula').dispatchEventAsync({ type: 'click' })
  assert.notEqual(h.current(), h.source)
  assert.equal(h.source.musicXml, score())
  assert.equal(h.current().violinParts.length, 2)
  assert.notEqual(h.current().musicXmlFingerprint, h.source.musicXmlFingerprint)
  await button(h.host, 'Ayırmayı geri al').dispatchEventAsync({ type: 'click' })
  assert.equal(h.current(), h.source)
})

test('cancel leaves original upload unchanged', async () => {
  const h = await harness()
  await button(h.host, 'Keman ve piyano partilerini ayır').dispatchEventAsync({ type: 'click' })
  await button(h.host, 'Önizlemeyi kapat').dispatchEventAsync({ type: 'click' })
  assert.equal(h.current(), h.source)
  assert.equal(button(h.host, 'Ayırmayı uygula').hidden, true)
})

test('replaced upload and reset invalidate an apply that is still preparing', async () => {
  let resolve, entered
  const started = new Promise(r => { entered = r })
  const h = await harness({ prepare: () => new Promise(r => { resolve = r;entered() }) })
  await button(h.host, 'Keman ve piyano partilerini ayır').dispatchEventAsync({ type: 'click' })
  const applying = button(h.host, 'Ayırmayı uygula').dispatchEventAsync({ type: 'click' })
  await started
  const newer = Object.freeze({ ...h.source, musicXml: score().replace('<step>E</step>', '<step>A</step>') })
  h.set(newer);h.handle.setUpload(newer)
  resolve({ musicXml: '<score-partwise/>' });await applying
  assert.equal(h.current(), newer)
})

test('sending or destroying prevents pending split from replacing the assignment', async () => {
  for (const mode of ['send', 'destroy']) {
    let resolve, entered
    const started = new Promise(r => { entered = r })
    const h = await harness({ prepare: () => new Promise(r => { resolve = r;entered() }) })
    await button(h.host, 'Keman ve piyano partilerini ayır').dispatchEventAsync({ type: 'click' })
    const applying = button(h.host, 'Ayırmayı uygula').dispatchEventAsync({ type: 'click' })
    await started
    if (mode === 'send') h.busy(true)
    else h.handle.destroy()
    resolve({ musicXml: '<score-partwise/>' });await applying
    assert.equal(h.current(), h.source)
  }
})

test('invalid rhythm is explained without enabling apply', async () => {
  const h = await harness()
  const invalid = { ...h.source, musicXml: score().replace('<backup><duration>4</duration>', '<backup><duration>8</duration>') }
  h.set(invalid);h.handle.setUpload(invalid)
  await button(h.host, 'Keman ve piyano partilerini ayır').dispatchEventAsync({ type: 'click' })
  assert.match(h.host.querySelector('[role="status"]').textContent, /1.*ölçü.*zamanlama/)
  assert.equal(button(h.host, 'Ayırmayı uygula').hidden, true)
  assert.equal(h.current(), invalid)
})
