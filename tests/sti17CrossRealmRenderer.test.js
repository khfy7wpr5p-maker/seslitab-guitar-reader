import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'

import { isRealmSafePlainObject } from '../src/services/realmSafePlainObject.js'
import {
  getCurrentScoreRenderEvidence,
  hitTestScoreNoteDetailed,
  renderScoreView,
} from '../src/services/scoreRendererConsumer.js'
import { validateRendererScoreNoteRef } from '../src/services/scoreNoteIdentity.js'

function inOtherRealm(source) {
  return vm.runInNewContext(source)
}

test('realm-safe plain object boundary accepts iframe-shaped Object values but rejects custom prototypes', () => {
  const crossRealm = inOtherRealm(`Object.freeze({ renderEpoch: 'render-1', sourceId: 'workstation:91' })`)
  assert.notEqual(Object.getPrototypeOf(crossRealm), Object.prototype)
  assert.equal(isRealmSafePlainObject(crossRealm), true)
  assert.equal(isRealmSafePlainObject(Object.create(null)), true)

  class Evidence {
    constructor() {
      this.renderEpoch = 'render-1'
      this.sourceId = 'workstation:91'
    }
  }
  assert.equal(isRealmSafePlainObject(new Evidence()), false)
  assert.equal(isRealmSafePlainObject([]), false)
})

test('renderScoreView accepts exact cross-realm renderEpoch/source evidence', async () => {
  const crossRealmEvidence = inOtherRealm(`Object.freeze({ renderEpoch: 'render-1', sourceId: 'workstation:91' })`)
  const host = {
    async renderMusicXml() {
      return crossRealmEvidence
    },
  }

  const result = await renderScoreView(host, '<score-partwise/>', { ticket: '91' })
  assert.equal(result, crossRealmEvidence)
  assert.deepEqual(getCurrentScoreRenderEvidence(host), {
    renderEpoch: 'render-1',
    sourceId: 'workstation:91',
  })
})

test('cross-realm detailed hit and nested ScoreNoteRef remain exact and fail closed', async () => {
  const crossRealmEvidence = inOtherRealm(`Object.freeze({ renderEpoch: 'render-1', sourceId: 'workstation:92' })`)
  const crossRealmHit = inOtherRealm(`Object.freeze({
    kind: 'HIT',
    renderEpoch: 'render-1',
    sourceId: 'workstation:92',
    target: Object.freeze({ partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 })
  })`)
  const host = {
    async renderMusicXml() { return crossRealmEvidence },
    hitTestNoteDetailed() { return crossRealmHit },
  }

  await renderScoreView(host, '<score-partwise/>', { ticket: '92' })
  assert.deepEqual(hitTestScoreNoteDetailed(host, { clientX: 10, clientY: 20 }), {
    kind: 'HIT',
    renderEpoch: 'render-1',
    sourceId: 'workstation:92',
    target: { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 },
  })
  assert.deepEqual(validateRendererScoreNoteRef(crossRealmHit.target), {
    partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1,
  })

  const crossRealmUnexpected = inOtherRealm(`Object.freeze({
    kind: 'HIT', renderEpoch: 'render-1', sourceId: 'workstation:92',
    target: Object.freeze({ partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 }),
    guessedPitch: 'C4'
  })`)
  host.hitTestNoteDetailed = () => crossRealmUnexpected
  assert.equal(hitTestScoreNoteDetailed(host, { clientX: 10, clientY: 20 }).kind, 'INVALID')
})

test('class-based cross-realm evidence is still rejected', async () => {
  const classEvidence = inOtherRealm(`new (class Evidence {
    constructor() {
      this.renderEpoch = 'render-1'
      this.sourceId = 'workstation:93'
    }
  })()`)
  const host = { async renderMusicXml() { return classEvidence } }
  await assert.rejects(
    () => renderScoreView(host, '<score-partwise/>', { ticket: '93' }),
    /renderEpoch\/source evidence/,
  )
})
