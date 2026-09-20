import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const editor = readFileSync(
  new URL('../experiments/smoosic-mobile/src/index.js', import.meta.url),
  'utf8',
)

test('S15 exposes a non-downloading MusicXML serializer for the host bridge', () => {
  assert.match(editor, /function serializeCurrentMusicXml\(\)/)
  assert.match(editor, /SmoToXml\.convert\(sourceScore\)/)
  assert.match(editor, /return \{[\s\S]*musicXml: xmlText,[\s\S]*fileName,[\s\S]*roundTripOk,[\s\S]*shapeOk,[\s\S]*semanticOk/)
})

test('S15 uses an exact same-origin versioned postMessage protocol', () => {
  assert.match(editor, /seslitab:smoosic-export-request/)
  assert.match(editor, /seslitab:smoosic-export-result/)
  assert.match(editor, /event\.source !== parent/)
  assert.match(editor, /event\.origin !== window\.location\.origin/)
  assert.match(editor, /version !== 1/)
  assert.match(editor, /requestId/)
  assert.match(editor, /sourceRevision/)
  assert.match(editor, /event\.source\.postMessage\([\s\S]*event\.origin/)
})

test('S15 keeps local XML Kaydet separate from host write-back', () => {
  assert.match(editor, /async function exportMusicXml\(\)/)
  assert.match(editor, /navigator\.share/)
  assert.match(editor, /URL\.createObjectURL/)
  assert.match(editor, /serializeCurrentMusicXml\(\)/)
})


const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')

test('S15 republishes a committed revision through the existing result path without changing the Package 2D handler signature', () => {
  assert.match(app, /export function applyRevalidatedMusicXmlRevision\(notes, musicXml\)/)
  assert.match(app, /function handleAnalysisResult\(notes, xmlString, hasRhythm\)/)
  assert.match(app, /let suppressResultScroll = false/)
  assert.match(app, /if \(!suppressResultScroll\) \{[\s\S]*scrollIntoView/)
  assert.match(
    app,
    /suppressResultScroll = true[\s\S]*handleAnalysisResult\(notes, musicXml, musicXmlHasRhythm\(notes\)\)[\s\S]*finally[\s\S]*suppressResultScroll = false/,
  )
})
