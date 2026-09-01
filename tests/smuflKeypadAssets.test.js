import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BRAVURA_OFL_GIT_BLOB,
  BRAVURA_REVISION,
  BRAVURA_VERSION,
  BRAVURA_WOFF2_GIT_BLOB,
  REQUIRED_EDITOR_KEYPAD_GLYPHS,
  SMUFL_GLYPHNAMES_GIT_BLOB,
  SMUFL_REVISION,
  verifyBravuraLicense,
  verifySmuflGlyphNames,
} from '../scripts/prepareSmuflKeypadAssets.js'

const validLicense = `Copyright © Steinberg\nwith Reserved Font Name "Bravura".\nSIL OPEN FONT LICENSE Version 1.1\nfonts can be bundled, embedded, redistributed.`

test('STI-08 pins exact Bravura 1.482 and matching SMuFL build sources', () => {
  assert.equal(BRAVURA_VERSION, '1.482')
  assert.match(BRAVURA_REVISION, /^[0-9a-f]{40}$/)
  assert.match(SMUFL_REVISION, /^[0-9a-f]{40}$/)
  assert.match(BRAVURA_WOFF2_GIT_BLOB, /^[0-9a-f]{40}$/)
  assert.match(BRAVURA_OFL_GIT_BLOB, /^[0-9a-f]{40}$/)
  assert.match(SMUFL_GLYPHNAMES_GIT_BLOB, /^[0-9a-f]{40}$/)
  assert.equal(REQUIRED_EDITOR_KEYPAD_GLYPHS.includes('noteQuarterUp'), true)
  assert.equal(REQUIRED_EDITOR_KEYPAD_GLYPHS.includes('tuplet3'), true)
})

test('STI-08 rejects Bravura admission if Reserved Font Name or OFL evidence is absent', () => {
  assert.equal(verifyBravuraLicense(validLicense), true)
  assert.throws(() => verifyBravuraLicense(validLicense.replace('Reserved Font Name "Bravura"', '')), /Reserved Font Name/)
  assert.throws(() => verifyBravuraLicense(validLicense.replace('SIL OPEN FONT LICENSE Version 1.1', '')), /Open Font License/)
})

test('STI-08 admits only official SMuFL name-to-codepoint metadata for every Editor glyph', () => {
  const metadata = Object.fromEntries(REQUIRED_EDITOR_KEYPAD_GLYPHS.map((glyphName, index) => [
    glyphName,
    { codepoint: `U+E${String(index).padStart(3, '0')}`, description: glyphName },
  ]))
  assert.equal(verifySmuflGlyphNames(metadata), true)
  delete metadata.noteQuarterUp
  assert.throws(() => verifySmuflGlyphNames(metadata), /noteQuarterUp/)
})

test('STI-08 rejects raw or malformed codepoint metadata instead of guessing glyph presentation', () => {
  const metadata = Object.fromEntries(REQUIRED_EDITOR_KEYPAD_GLYPHS.map((glyphName) => [
    glyphName,
    { codepoint: 'U+E000', description: glyphName },
  ]))
  metadata.accidentalSharp = { codepoint: '#', description: 'invalid' }
  assert.throws(() => verifySmuflGlyphNames(metadata), /accidentalSharp/)
})
