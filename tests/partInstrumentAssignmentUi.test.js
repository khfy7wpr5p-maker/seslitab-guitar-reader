import test from 'node:test'
import assert from 'node:assert/strict'
import { createFakeDocument } from './support/fakeTeacherPoolDom.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'
import { mountTeacherAssignmentComposerUi } from '../src/teacherAssignmentComposerUi.js'
import { prepareTeacherAssignmentScoreUpload } from '../src/services/teacherAssignmentComposerScoreUpload.js'
import { readMusicXmlPartInstrumentMap } from '../src/services/musicXmlPartInstrumentAssignment.js'
import { score } from './support/staffSplitFixture.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer
const source = '<score-partwise><part-list><score-part id="lead"><part-name>Voice</part-name></score-part><score-part id="bass"><part-name>Voice</part-name></score-part></part-list><part id="lead"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration></note></measure></part><part id="bass"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration></note></measure></part></score-partwise>'
const button = (h, label) => h.host.querySelectorAll('button').find(b => b.textContent === label)
async function harness({ gate, conversion = false, conversionFailure = false } = {}) {
  const root = createFakeDocument(), host = root.createElement('div'), sent = []
  let draft = 0
  const handle = mountTeacherAssignmentComposerUi({ root, host, createDraftId: () => 'assignment-' + ++draft,
    service: { loadRoster: async () => [{ studentId: 'student-a', displayNameOrNickname: 'Ada' }],
      async prepareScoreUpload(input) {
        if (input.musicXml.includes('seslitab-part-instruments-version') && gate) await gate
        return prepareTeacherAssignmentScoreUpload({ ...input, teacherId: 'teacher', now: () => '2026-10-24T00:00:00Z' })
      },
      send: async input => { sent.push(input);return { ok: false, recipients: [] } },
    } })
  await new Promise(r => setImmediate(r))
  if (conversion) handle.startRequestConversion({ title: 'Vals', displayNameOrNickname: 'Ada', targetState: 'ACTIVE', onSubmit: async input => { sent.push(input);if (conversionFailure) throw new Error('conversion-response-lost') } })
  const choose = async (musicXml = source) => {
    const input = host.querySelector('input[name="scoreMusicXml"]')
    input.files = [{ name: 'piece.musicxml', size: musicXml.length, text: async () => musicXml }]
    await input.dispatchEventAsync({ type: 'change' })
  }
  await choose()
  host.querySelector('input[name="assignmentTitle"]').value = 'Vals'
  host.querySelector('input[name="studentId"]').checked = true
  const h = { root, host, handle, choose, sent, submit: () => host.querySelector('form').dispatchEventAsync({ type: 'submit', preventDefault() {} }) }
  h.preview = async () => {
    assert.ok(button(h, 'Partilere enstrüman ata'), 'existing multipart scores must offer explicit assignment')
    await button(h, 'Partilere enstrüman ata').dispatchEventAsync({ type: 'click' })
    host.querySelector('select[name="partInstrument:lead"]').value = 'VIOLIN'
    host.querySelector('select[name="partInstrument:bass"]').value = 'GRAND_PIANO'
    await button(h, 'Enstrüman atamasını önizle').dispatchEventAsync({ type: 'click' })
  }
  return h
}

test('already separate parts expose assignment choices and send the confirmed XML with the exact violin target', async () => {
  const h = await harness()
  assert.equal(button(h, 'Keman ve piyano partilerini ayır').disabled, true)
  assert.ok(button(h, 'Partilere enstrüman ata'))
  await h.preview()
  assert.equal(h.host.querySelector('select[name="partInstrument:lead"]').getAttribute('aria-label'), 'Voice (lead)')
  assert.equal(h.host.querySelector('select[name="partInstrument:bass"]').getAttribute('aria-label'), 'Voice (bass)')
  await button(h, 'Enstrüman atamasını uygula').dispatchEventAsync({ type: 'click' })
  await h.submit()
  assert.equal(h.sent.length, 1)
  assert.deepEqual(readMusicXmlPartInstrumentMap(h.sent[0].scoreUpload.musicXml), { lead: 'VIOLIN', bass: 'GRAND_PIANO' })
  assert.equal(h.sent[0].playbackInstrument, 'VIOLIN')
  assert.deepEqual(h.sent[0].scoreUpload.violinParts, [{ partId: 'lead', name: 'Voice' }])
  assert.equal(h.sent[0].scoreUpload.musicXml.includes('<duration>1</duration>'), true)
  h.handle.destroy()
})

test('editing without applying blocks send until the teacher cancels the assignment', async () => {
  const h = await harness()
  await button(h, 'Partilere enstrüman ata').dispatchEventAsync({ type: 'click' })
  await h.submit();assert.equal(h.sent.length, 0)
  await button(h, 'Enstrüman atamasını iptal et').dispatchEventAsync({ type: 'click' })
  await h.submit();assert.equal(h.sent[0].scoreUpload.musicXml, source)
  h.handle.destroy()
})

test('destroying an in-flight apply prevents detached composer delivery', async () => {
  let release;const gate = new Promise(r => { release = r })
  const h = await harness({ gate });await h.preview()
  const applying = button(h, 'Enstrüman atamasını uygula').dispatchEventAsync({ type: 'click' })
  await new Promise(r => setImmediate(r));h.handle.destroy();release();await applying
  assert.equal(h.sent.length, 0)
})

test('undo restores the exact original upload and permits ordinary unchanged delivery', async () => {
  const h = await harness();await h.preview()
  await button(h, 'Enstrüman atamasını uygula').dispatchEventAsync({ type: 'click' })
  await button(h, 'Enstrüman atamasını geri al').dispatchEventAsync({ type: 'click' })
  await h.submit()
  assert.equal(h.sent[0].scoreUpload.musicXml, source)
  assert.equal(h.sent[0].playbackInstrument, 'GRAND_PIANO')
  h.handle.destroy()
})

for (const conversion of [false, true]) test(`pending assignment cannot leak the original through ${conversion ? 'request conversion' : 'ordinary send'}`, async () => {
  let release;const gate = new Promise(r => { release = r })
  const h = await harness({ gate, conversion });await h.preview()
  const applying = button(h, 'Enstrüman atamasını uygula').dispatchEventAsync({ type: 'click' })
  await new Promise(r => setImmediate(r));await h.submit()
  assert.equal(h.sent.length, 0)
  release();await applying;await h.submit()
  assert.equal(h.sent.length, 1)
  assert.deepEqual(readMusicXmlPartInstrumentMap(h.sent[0].scoreUpload.musicXml), { lead: 'VIOLIN', bass: 'GRAND_PIANO' })
  h.handle.destroy()
})

test('file replacement invalidates an in-flight apply without changing the new upload', async () => {
  let release;const gate = new Promise(r => { release = r })
  const h = await harness({ gate });await h.preview()
  const applying = button(h, 'Enstrüman atamasını uygula').dispatchEventAsync({ type: 'click' })
  await new Promise(r => setImmediate(r))
  const newer = source.replace('<step>D</step>', '<step>E</step>')
  await h.choose(newer);release();await applying;await h.submit()
  assert.equal(h.sent[0].scoreUpload.musicXml, newer)
  h.handle.destroy()
})

test('changing instruments after a failed send creates a new draft while exact retries keep their identity', async () => {
  const h = await harness();await h.submit()
  const originalDraft = h.sent[0].draftId
  await h.preview();await button(h, 'Enstrüman atamasını uygula').dispatchEventAsync({ type: 'click' })
  await h.submit();await h.submit()
  assert.notEqual(h.sent[1].draftId, originalDraft, 'changed bytes must never overwrite an already prepared assignment')
  assert.equal(h.sent[2].draftId, h.sent[1].draftId, 'exact retry retains idempotency identity')
  assert.equal(h.sent[1].scoreUpload.draftId, h.sent[1].draftId)
  assert.equal(h.sent[0].scoreUpload.musicXml, source)
  await button(h, 'Enstrüman atamasını geri al').dispatchEventAsync({ type: 'click' });await h.submit()
  assert.notEqual(h.sent[3].draftId, h.sent[1].draftId)
  assert.equal(h.sent[3].scoreUpload.musicXml, source)
  h.handle.destroy()
})

test('failed delivery followed by assignment undo and split undo restores original bytes with a fresh retry identity', async () => {
  const h = await harness(), original = score()
  await h.choose(original)
  await button(h, 'Keman ve piyano partilerini ayır').dispatchEventAsync({ type: 'click' })
  await button(h, 'Ayırmayı uygula').dispatchEventAsync({ type: 'click' })
  await button(h, 'Partilere enstrüman ata').dispatchEventAsync({ type: 'click' })
  h.host.querySelector('select[name="partInstrument:P1"]').value = 'VIOLIN'
  h.host.querySelector('select[name="partInstrument:P2"]').value = 'GRAND_PIANO'
  await button(h, 'Enstrüman atamasını önizle').dispatchEventAsync({ type: 'click' })
  await button(h, 'Enstrüman atamasını uygula').dispatchEventAsync({ type: 'click' })
  await h.submit()
  await button(h, 'Enstrüman atamasını geri al').dispatchEventAsync({ type: 'click' })
  await button(h, 'Ayırmayı geri al').dispatchEventAsync({ type: 'click' })
  await h.submit();await h.submit()
  assert.equal(h.sent[1].scoreUpload.musicXml, original)
  assert.notEqual(h.sent[1].draftId, h.sent[0].draftId)
  assert.equal(h.sent[1].draftId, h.sent[1].scoreUpload.draftId)
  assert.equal(h.sent[2].draftId, h.sent[1].draftId)
  h.handle.destroy()
})

test('request conversion failed attempt keeps the exact attempted content locked for retry', async () => {
  const h = await harness({ conversion: true, conversionFailure: true })
  await h.preview();await button(h, 'Enstrüman atamasını uygula').dispatchEventAsync({ type: 'click' })
  await h.submit()
  assert.equal(h.host.querySelector('input[name="scoreMusicXml"]').disabled, true)
  await button(h, 'Enstrüman atamasını geri al').dispatchEventAsync({ type: 'click' })
  await h.choose(source.replace('<step>D</step>', '<step>E</step>'))
  h.host.querySelector('select[name="playbackInstrument"]').value = 'CLASSICAL_GUITAR'
  await h.submit()
  assert.deepEqual(h.sent[1], h.sent[0], 'a possibly completed conversion only retries its exact attempted payload')
  h.handle.destroy()
})
