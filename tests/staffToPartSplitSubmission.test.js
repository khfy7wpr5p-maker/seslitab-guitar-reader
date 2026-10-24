import assert from 'node:assert/strict'
import test from 'node:test'
import { mountTeacherAssignmentComposerUi } from '../src/teacherAssignmentComposerUi.js'
import { prepareTeacherAssignmentScoreUpload } from '../src/services/teacherAssignmentComposerScoreUpload.js'
import { createFakeDocument } from './support/fakeTeacherPoolDom.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'
import { note, score } from './support/staffSplitFixture.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes;reject = no })
  return { promise, resolve, reject }
}
async function composer({ conversion = false } = {}) {
  const root = createFakeDocument(), host = root.createElement('div'), sent = [], gates = []
  const handle = mountTeacherAssignmentComposerUi({ root, host, createDraftId: () => 'pending-split', service: {
    loadRoster: async () => [{ studentId: 'student-a', displayNameOrNickname: 'Ada' }],
    async prepareScoreUpload(input) {
      if (input.musicXml.includes('<part id="P2">') && gates.length) {
        const gate = gates.shift()
        gate.started.resolve()
        await gate.done.promise
      }
      return prepareTeacherAssignmentScoreUpload({ ...input, teacherId: 'teacher-a', now: () => '2026-10-23T00:00:00Z' })
    },
    send: async input => { sent.push(input);return { ok: false, recipients: [] } },
  } })
  await new Promise(resolve => setImmediate(resolve))
  if (conversion) handle.startRequestConversion({ title: 'Etüt', displayNameOrNickname: 'Ada',
    targetState: 'ACTIVE', onSubmit: async input => { sent.push(input) } })
  const find = label => host.querySelectorAll('button').find(node => node.textContent === label)
  const submitButton = host.querySelectorAll('button').find(node => node.type === 'submit')
  const choose = async (musicXml = score()) => {
    const file = host.querySelector('input[name="scoreMusicXml"]')
    file.files = [{ name: 'piano.musicxml', size: musicXml.length, text: async () => musicXml }]
    await file.dispatchEventAsync({ type: 'change' })
  }
  await choose()
  host.querySelector('input[name="assignmentTitle"]').value = 'Etüt'
  host.querySelector('input[name="studentId"]').checked = true
  return { host, handle, sent, choose, submitButton,
    preview: () => find('Keman ve piyano partilerini ayır').dispatchEventAsync({ type: 'click' }),
    apply: () => find('Ayırmayı uygula').dispatchEventAsync({ type: 'click' }),
    submit: () => host.querySelector('form').dispatchEventAsync({ type: 'submit', preventDefault() {} }),
    queue() { const gate = { started: deferred(), done: deferred() };gates.push(gate);return gate },
  }
}

test('composer disables submission until the confirmed split upload is ready', async () => {
  const h = await composer(), gate = h.queue()
  await h.preview()
  const applying = h.apply()
  await gate.started.promise
  try { assert.equal(h.submitButton.disabled, true, 'send must wait for the requested split') }
  finally { gate.done.resolve();await applying;h.handle.destroy() }
})

for (const conversion of [false, true]) test('preview preparation blocks submission until hashing completes: ' + (conversion ? 'request conversion' : 'ordinary assignment'), async () => {
  const h = await composer({ conversion }), started = deferred(), gate = deferred()
  const subtle = globalThis.crypto.subtle, digest = subtle.digest
  subtle.digest = async function(...args) {
    started.resolve()
    await gate.promise
    return digest.apply(this, args)
  }
  const previewing = h.preview()
  await started.promise
  try {
    assert.equal(h.submitButton.disabled, true)
    await h.submit()
    assert.equal(h.sent.length, 0)
  } finally {
    gate.resolve();await previewing
    subtle.digest = digest
  }
  assert.equal(h.submitButton.disabled, false)
  h.handle.destroy()
})

for (const conversion of [false, true]) test('programmatic submit cannot deliver the original while split apply is pending: ' + (conversion ? 'request conversion' : 'ordinary assignment'), async () => {
  const h = await composer({ conversion }), gate = h.queue()
  await h.preview()
  const applying = h.apply()
  await gate.started.promise
  try {
    await h.submit()
    assert.equal(h.sent.length, 0, 'no delivery path may bypass pending split state')
  } finally { gate.done.resolve();await applying }
  assert.equal(h.submitButton.disabled, false)
  await h.submit()
  assert.equal(h.sent.length, 1)
  assert.match(h.sent[0].scoreUpload.musicXml, /<part id="P1">/)
  assert.match(h.sent[0].scoreUpload.musicXml, /<part id="P2">/)
  h.handle.destroy()
})

test('failed split preparation releases submission and permits a successful retry', async () => {
  const h = await composer(), gate = h.queue()
  await h.preview()
  const applying = h.apply()
  await gate.started.promise
  gate.done.reject(new Error('qualification prepare failure'))
  await applying
  assert.equal(h.submitButton.disabled, false)
  assert.equal(h.sent.length, 0)
  await h.apply()
  await h.submit()
  assert.equal(h.sent.length, 1)
  assert.match(h.sent[0].scoreUpload.musicXml, /<part id="P2">/)
  h.handle.destroy()
})

test('destroying a pending composer prevents its detached form from sending', async () => {
  const h = await composer(), gate = h.queue(), form = h.host.querySelector('form')
  await h.preview()
  const applying = h.apply()
  await gate.started.promise
  h.handle.destroy()
  try {
    await form.dispatchEventAsync({ type: 'submit', preventDefault() {} })
    assert.equal(h.sent.length, 0)
  } finally { gate.done.resolve();await applying }
})

test('an unsupported chord split keeps the original upload available for explicit ordinary submission', async () => {
  const h = await composer()
  const source = score(note('G', 1, 4) + '<backup><duration>4</duration></backup>' +
    note('C', 2) + '<forward><duration>2</duration></forward>' + note('E', 2, 2, '<chord/>'))
  await h.choose(source)
  await h.preview()
  assert.equal(h.host.querySelectorAll('button').find(node => node.textContent === 'Ayırmayı uygula').hidden, true)
  assert.equal(h.submitButton.disabled, false)
  assert.equal(h.sent.length, 0)
  await h.submit()
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].scoreUpload.musicXml, source)
  h.handle.destroy()
})

test('a stale apply cannot unlock submission during a replacement split', async () => {
  const h = await composer(), first = h.queue()
  await h.preview()
  const oldApply = h.apply()
  await first.started.promise
  await h.choose(score().replace('<step>E</step>', '<step>A</step>'))
  const second = h.queue()
  await h.preview()
  const newApply = h.apply()
  await second.started.promise
  first.done.resolve();await oldApply
  try {
    assert.equal(h.submitButton.disabled, true)
    await h.submit()
    assert.equal(h.sent.length, 0)
  } finally { second.done.resolve();await newApply }
  assert.equal(h.submitButton.disabled, false)
  await h.submit()
  assert.equal(h.sent.length, 1)
  assert.match(h.sent[0].scoreUpload.musicXml, /<step>A<\/step>/)
  assert.match(h.sent[0].scoreUpload.musicXml, /<part id="P2">/)
  h.handle.destroy()
})
