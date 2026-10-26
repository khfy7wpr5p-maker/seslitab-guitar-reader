import test from 'node:test'
import assert from 'node:assert/strict'
import { createFakeDocument } from './support/fakeTeacherPoolDom.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'
import { mountTeacherAssignmentComposerUi } from '../src/teacherAssignmentComposerUi.js'
import { prepareTeacherAssignmentScoreUpload } from '../src/services/teacherAssignmentComposerScoreUpload.js'
import { activateTeacherTool } from '../src/teacherToolsNavigation.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer
const xml = '<score-partwise><part-list><score-part id="lead"><part-name>Voice</part-name></score-part><score-part id="bass"><part-name>Piano</part-name></score-part></part-list><part id="lead"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration></note></measure></part><part id="bass"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration></note></measure></part></score-partwise>'
const turn = () => new Promise(r => setImmediate(r))
const deferred = () => { let release; const promise = new Promise(r => { release = r }); return { promise, release } }

async function harness({ prepareGate, sendGate } = {}) {
  const doc = createFakeDocument(), nodes = new Map()
  for (const id of ['teacher-tools-navigation', 'results-section', 'tab-xml', 'tab-assignment', 'tab-guitar-tab', 'tab-violin']) nodes.set(id, doc.createElement('div'))
  const root = { ...doc, getElementById: id => nodes.get(id) ?? null }
  const host = nodes.get('tab-assignment'), attempts = []
  let draft = 0
  const handle = mountTeacherAssignmentComposerUi({ root, host, createDraftId: () => `draft-${++draft}`,
    service: {
      loadRoster: async () => [{ studentId: 'student-a', displayNameOrNickname: 'Ada' }],
      async prepareScoreUpload(input) {
        if (prepareGate && input.musicXml.includes('seslitab-part-instruments-version')) await prepareGate.promise
        return prepareTeacherAssignmentScoreUpload({ ...input, teacherId: 'teacher', now: () => '2026-10-25T00:00:00Z' })
      },
      async send(input) { attempts.push(input); if (sendGate) await sendGate.promise; return { ok: false, recipients: [] } },
    },
  })
  await turn()
  const file = host.querySelector('input[name="scoreMusicXml"]')
  file.files = [{ name: 'duet.musicxml', size: xml.length, text: async () => xml }]
  await file.dispatchEventAsync({ type: 'change' })
  const title = host.querySelector('input[name="assignmentTitle"]')
  const recipient = host.querySelector('input[name="studentId"]')
  title.value = 'Duet'; recipient.checked = true
  const cycle = () => { for (const n of ['guitar-tab', 'violin', 'assignment']) assert.equal(activateTeacherTool(root, n), true) }
  const click = label => host.querySelectorAll('button').find(b => b.textContent === label).dispatchEventAsync({ type: 'click' })
  const submit = () => host.querySelector('form').dispatchEventAsync({ type: 'submit', preventDefault() {} })
  return { host, handle, attempts, title, recipient, file, cycle, click, submit }
}

test('navigation preserves live draft controls and exact retry identity after a failed send', async () => {
  const h = await harness()
  try {
    h.cycle(); await h.submit(); h.cycle(); await h.submit()
    assert.equal(h.host.querySelector('input[name="assignmentTitle"]'), h.title)
    assert.equal(h.host.querySelector('input[name="studentId"]'), h.recipient)
    assert.equal(h.title.value, 'Duet'); assert.equal(h.recipient.checked, true)
    assert.equal(h.attempts.length, 2)
    assert.equal(h.attempts[0].scoreUpload.musicXml, xml)
    assert.deepEqual(h.attempts[1], h.attempts[0])
  } finally { h.handle.destroy() }
})

test('navigation during pending send cannot duplicate the request or reset its draft', async () => {
  const gate = deferred(), h = await harness({ sendGate: gate })
  try {
    const pending = h.submit(); await turn(); h.cycle(); await h.submit()
    assert.equal(h.attempts.length, 1)
    assert.equal(h.title.value, 'Duet')
    assert.equal(h.recipient.checked, true)
    gate.release(); await pending
    h.cycle(); await h.submit()
    assert.equal(h.attempts.length, 2)
    assert.deepEqual(h.attempts[1], h.attempts[0])
  } finally { gate.release(); h.handle.destroy() }
})

test('navigation during instrument apply keeps send blocked and preserves undo source', async () => {
  const gate = deferred(), h = await harness({ prepareGate: gate })
  try {
    await h.click('Partilere enstrüman ata')
    h.host.querySelector('select[name="partInstrument:lead"]').value = 'VIOLIN'
    h.host.querySelector('select[name="partInstrument:bass"]').value = 'GRAND_PIANO'
    await h.click('Enstrüman atamasını önizle')
    const applying = h.click('Enstrüman atamasını uygula')
    await turn(); h.cycle(); await h.submit()
    assert.equal(h.attempts.length, 0)
    gate.release(); await applying
    h.cycle(); await h.submit()
    assert.equal(h.attempts.length, 1)
    assert.match(h.attempts[0].scoreUpload.musicXml, /seslitab-part-instruments-version/)
    await h.click('Enstrüman atamasını geri al'); h.cycle(); await h.submit()
    assert.equal(h.attempts[1].scoreUpload.musicXml, xml)
    assert.notEqual(h.attempts[1].draftId, h.attempts[0].draftId)
  } finally { gate.release(); h.handle.destroy() }
})
