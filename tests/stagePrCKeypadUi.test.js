import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildStagePrCKeypadModel,
  loadStagePrCSmuflPresentation,
  resolveSmuflGlyphPresentation,
  smuflCodepointToCharacter,
} from '../src/stagePrCKeypadUi.js'

const source = readFileSync(new URL('../src/stagePrCKeypadUi.js', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/stagePrCKeypad.css', import.meta.url), 'utf8')

const groups = [
  ['duration', 'duration', [
    ['duration.whole', 'noteWhole'], ['duration.half', 'noteHalfUp'], ['duration.quarter', 'noteQuarterUp'],
    ['duration.eighth', 'note8thUp'], ['duration.16th', 'note16thUp'], ['duration.32nd', 'note32ndUp'],
  ]],
  ['rests', 'rests', [
    ['rest.whole', 'restWhole'], ['rest.half', 'restHalf'], ['rest.quarter', 'restQuarter'],
    ['rest.eighth', 'rest8th'], ['rest.16th', 'rest16th'], ['rest.32nd', 'rest32nd'],
  ]],
  ['accidentals', 'accidentals', [
    ['accidental.flat', 'accidentalFlat'], ['accidental.natural', 'accidentalNatural'], ['accidental.sharp', 'accidentalSharp'],
  ]],
  ['dots', 'dots', [
    ['dot.set.0', null], ['dot.set.1', 'augmentationDot'], ['dot.set.2', 'augmentationDot'], ['dot.set.3', 'augmentationDot'],
  ]],
  ['tuplets', 'tuplets', [['tuplet.triplet', 'tuplet3']]],
  ['connections', 'connections', [['tie.edit', null], ['slur.edit', null]]],
]

function manifest() {
  return Object.freeze({
    version: '1.0.0',
    mode: 'EXISTING_SCORE_CORRECTION',
    semanticAuthority: 'ACTION_ID_ONLY',
    glyphMetadataAuthority: false,
    rawGlyphCodepointsIncluded: false,
    fontAssetsIncluded: false,
    groups: Object.freeze(groups.map(([id, label, actions]) => Object.freeze({
      id,
      accessibleLabelKey: `keypad.group.${label}`,
      actions: Object.freeze(actions.map(([actionId, glyphName]) => Object.freeze({
        actionId,
        accessibleLabelKey: `keypad.${actionId}`,
        glyph: glyphName ? Object.freeze({ smuflGlyphName: glyphName, repeat: actionId === 'dot.set.2' ? 2 : actionId === 'dot.set.3' ? 3 : 1 }) : null,
        hostPrimitiveHint: actionId === 'tie.edit' ? 'tie' : actionId === 'slur.edit' ? 'slur' : null,
      }))),
    }))),
  })
}

function glyphNames() {
  const names = new Set(groups.flatMap(([, , actions]) => actions.map(([, glyph]) => glyph).filter(Boolean)))
  let code = 0xe100
  return Object.fromEntries([...names].map((name) => [name, { codepoint: `U+${(code++).toString(16).toUpperCase()}`, description: name }]))
}

test('STI-08 resolves official SMuFL codepoint metadata only after Editor manifest supplies a glyph name', () => {
  assert.equal(smuflCodepointToCharacter('U+E1D5'), String.fromCodePoint(0xe1d5))
  const descriptor = manifest().groups[0].actions.find((item) => item.actionId === 'duration.quarter')
  const presentation = resolveSmuflGlyphPresentation(descriptor, { noteQuarterUp: { codepoint: 'U+E1D5' } })
  assert.equal(presentation.glyphName, 'noteQuarterUp')
  assert.equal(presentation.character, String.fromCodePoint(0xe1d5))
  assert.throws(() => resolveSmuflGlyphPresentation(descriptor, {}), /noteQuarterUp/)
})

test('STI-08 keypad model pages real duration/rest/accidental/dot/tuplet glyphs and leaves advanced edits disabled for STI-10', () => {
  const model = buildStagePrCKeypadModel(manifest(), glyphNames(), { exactSelectionReady: true })
  assert.equal(model.actions.length, 22)
  const quarter = model.actions.find((item) => item.actionId === 'duration.quarter')
  const rest = model.actions.find((item) => item.actionId === 'rest.eighth')
  const sharp = model.actions.find((item) => item.actionId === 'accidental.sharp')
  const dot2 = model.actions.find((item) => item.actionId === 'dot.set.2')
  const triplet = model.actions.find((item) => item.actionId === 'tuplet.triplet')
  assert.equal(quarter.page, 1)
  assert.equal(rest.page, 1)
  assert.equal(sharp.page, 2)
  assert.equal(dot2.glyph.repeat, 2)
  assert.equal(triplet.page, 3)
  assert.equal(triplet.enabled, false)
  assert.match(triplet.disabledReason, /STI-10/)
  assert.equal(quarter.enabled, true)
})

test('STI-08/09 basic actions remain disabled without exact selection and during pending product synchronization', () => {
  const noSelection = buildStagePrCKeypadModel(manifest(), glyphNames(), { exactSelectionReady: false })
  assert.equal(noSelection.actions.filter((item) => !item.advanced).every((item) => !item.enabled), true)
  assert.equal(noSelection.actions.find((item) => item.actionId === 'duration.quarter').disabledReason, 'Exact nota seçimi gerekiyor.')

  const pending = buildStagePrCKeypadModel(manifest(), glyphNames(), { exactSelectionReady: true, productSyncPending: true })
  assert.equal(pending.actions.filter((item) => !item.advanced).every((item) => !item.enabled), true)
  assert.match(pending.actions.find((item) => item.actionId === 'accidental.flat').disabledReason, /senkronizasyon/)
})

test('STI-08 verifies same-origin glyph metadata and Bravura FontFaceSet readiness before mounting presentation', async () => {
  const expected = glyphNames()
  let requested = null
  const result = await loadStagePrCSmuflPresentation({
    fetchImpl: async (url) => {
      requested = url
      return { ok: true, status: 200, json: async () => expected }
    },
    fontSet: {
      async load(value) { assert.match(value, /Bravura/) },
      check(value) { assert.match(value, /Bravura/); return true },
    },
  })
  assert.equal(requested, '/smufl-keypad/glyphnames.json')
  assert.equal(result.glyphNames, expected)
})

test('STI-08 keypad source does not import or execute legacy Stage E/S07 field mutation', () => {
  assert.doesNotMatch(source, /STAGE_E_EDIT_FIELD/)
  assert.doesNotMatch(source, /stageEVisualNoteEdit/)
  assert.doesNotMatch(source, /stage-s07-pitch|stage-s07-accidental|stage-s07-octave|stage-s07-duration/)
  assert.match(source, /data\.editorActionId|dataset\.editorActionId/)
  assert.match(source, /aria-label/)
})

test('STI-08 mobile CSS enforces 44px controls, Bravura font, safe areas, and retires the legacy palette only under the new path', () => {
  assert.match(css, /@font-face/)
  assert.match(css, /Bravura\.woff2/)
  assert.match(css, /min-width:\s*44px/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /safe-area-inset-bottom/)
  assert.match(css, /data-sti-prc-keypad-active='true'.*\.stage-s12-note-tools/s)
  assert.doesNotMatch(css, /^\.stage-s12-note-tools\s*\{\s*display:\s*none/m)
})
