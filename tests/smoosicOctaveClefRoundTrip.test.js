import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  SmoosicTestDOMParser,
  SmoosicTestXMLSerializer,
} from './support/smoosicXmlDom.js'
import {
  createSmoosicRoundTripWorkingCopy,
  restoreSmoosicRoundTripCandidate,
} from '../src/services/smoosicOctaveClefRoundTrip.js'

const SOURCE = readFileSync(
  new URL('./fixtures/ses-221/audiveris-octave-clef.musicxml', import.meta.url),
  'utf8',
)
const SMOOSIC_4096 = readFileSync(
  new URL('./fixtures/ses-221/smoosic-4096-octave-clef.musicxml', import.meta.url),
  'utf8',
)

const options = {
  sourceRevision: 7,
  DOMParserCtor: SmoosicTestDOMParser,
  XMLSerializerCtor: SmoosicTestXMLSerializer,
  cryptoScope: globalThis.crypto,
}

test('SES-221 creates an exact-lineage working copy for Smoosic clef display loss', async () => {
  const before = SOURCE
  const result = await createSmoosicRoundTripWorkingCopy({
    musicXml: SOURCE,
    ...options,
  })

  assert.equal(result.kind, 'DERIVED')
  assert.match(result.musicXml, /<step>C<\/step><alter>1<\/alter><octave>5<\/octave>/)
  assert.doesNotMatch(result.musicXml, /<clef-octave-change>/)
  assert.equal(result.provenance.sourceRevision, 7)
  assert.match(result.provenance.sourceSha256, /^[0-9a-f]{64}$/)
  assert.match(result.provenance.workingSha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(result.provenance.compensations, [{
    partId: 'P1', partIndex: 0, measureIndex: 0, noteIndex: 0,
    staff: 1, voice: 1, semitones: 12,
  }, {
    partId: 'P1', partIndex: 0, measureIndex: 0, noteIndex: 1,
    staff: 1, voice: 1, semitones: 12,
  }])
  assert.equal(SOURCE, before)
})

test('SES-221 removes only system display compensation and restores canonical clef context', async () => {
  const working = await createSmoosicRoundTripWorkingCopy({ musicXml: SOURCE, ...options })

  const result = await restoreSmoosicRoundTripCandidate({
    sourceMusicXml: SOURCE,
    candidateMusicXml: SMOOSIC_4096,
    provenance: working.provenance,
    ...options,
  })

  assert.match(result.musicXml, /<step>D<\/step><alter>1<\/alter><octave>4<\/octave>/)
  assert.match(result.musicXml, /<clef-octave-change>-1<\/clef-octave-change>/)
  assert.match(result.musicXml, /<duration>8192<\/duration>/)
  assert.match(result.musicXml, /<tie type="start"\/>/)
  assert.equal(result.restoredCompensationCount, 2)
})

test('SES-221 preserves explicit source transpose context without changing written pitch', async () => {
  const source = SOURCE
    .replace('<clef-octave-change>-1</clef-octave-change>', '')
    .replace('</clef>', '</clef><transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>')
  const working = await createSmoosicRoundTripWorkingCopy({
    musicXml: source,
    ...options,
  })

  assert.equal(working.kind, 'DERIVED')
  assert.match(working.musicXml, /<octave>4<\/octave>/)
  const candidate = working.musicXml.replace(/<transpose>[\s\S]*?<\/transpose>/, '')
  const restored = await restoreSmoosicRoundTripCandidate({
    sourceMusicXml: source,
    candidateMusicXml: candidate,
    provenance: working.provenance,
    ...options,
  })

  assert.match(restored.musicXml, /<transpose><diatonic>0<\/diatonic><chromatic>0<\/chromatic><octave-change>-1<\/octave-change><\/transpose>/)
  assert.match(restored.musicXml, /<octave>4<\/octave>/)
})

test('SES-221 fails closed for stale or unproven compensation lineage', async () => {
  const working = await createSmoosicRoundTripWorkingCopy({ musicXml: SOURCE, ...options })
  await assert.rejects(
    restoreSmoosicRoundTripCandidate({
      sourceMusicXml: SOURCE,
      candidateMusicXml: working.musicXml,
      provenance: working.provenance,
      ...options,
      sourceRevision: 8,
    }),
    /source revision/i,
  )
  await assert.rejects(
    restoreSmoosicRoundTripCandidate({
      sourceMusicXml: SOURCE.replace('<part-name>Audiveris</part-name>', '<part-name>Changed</part-name>'),
      candidateMusicXml: working.musicXml,
      provenance: working.provenance,
      ...options,
    }),
    /source hash/i,
  )
  await assert.rejects(
    restoreSmoosicRoundTripCandidate({
      sourceMusicXml: SOURCE,
      candidateMusicXml: working.musicXml,
      provenance: null,
      ...options,
    }),
    /provenance/i,
  )
})

test('SES-221 rejects staff identity drift before removing compensation', async () => {
  const working = await createSmoosicRoundTripWorkingCopy({ musicXml: SOURCE, ...options })
  await assert.rejects(
    restoreSmoosicRoundTripCandidate({
      sourceMusicXml: SOURCE,
      candidateMusicXml: working.musicXml.replace('<staff>1</staff>', '<staff>2</staff>'),
      provenance: working.provenance,
      ...options,
    }),
    /staff identity/i,
  )
})

test('SES-221 rejects part or voice identity drift before removing compensation', async () => {
  const working = await createSmoosicRoundTripWorkingCopy({ musicXml: SOURCE, ...options })
  for (const [candidateMusicXml, expected] of [
    [working.musicXml.replace('<part id="P1">', '<part id="P2">'), /part identity/i],
    [working.musicXml.replace('<voice>1</voice>', '<voice>2</voice>'), /voice identity/i],
  ]) {
    await assert.rejects(
      restoreSmoosicRoundTripCandidate({
        sourceMusicXml: SOURCE,
        candidateMusicXml,
        provenance: working.provenance,
        ...options,
      }),
      expected,
    )
  }
})
