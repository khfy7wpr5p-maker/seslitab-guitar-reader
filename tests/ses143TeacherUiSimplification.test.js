import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const indexHtml = readFileSync(resolve('index.html'), 'utf8')
const styleCss = readFileSync(resolve('src/style.css'), 'utf8')

function openingTagForId(id) {
  const pattern = new RegExp(`<[^>]+id=["']${id}["'][^>]*>`, 'i')
  const match = indexHtml.match(pattern)
  assert.ok(match, `missing #${id}`)
  return match[0]
}

function assertTeacherHidden(id) {
  const tag = openingTagForId(id)
  assert.match(tag, /class=["'][^"']*teacher-surface-hidden[^"']*["']/i, `#${id} must stay mounted but hidden from the normal teacher surface`)
}

test('SES-143 hides legacy teacher-only output surfaces without deleting their runtime nodes', () => {
  for (const id of [
    'result-rhythmic-btn',
    'result-html-btn',
    'result-notes-btn',
    'tab-rhythmic',
    'tab-html',
    'tab-notes',
    'copy-btn',
    'notes-summary',
    'voice-section',
  ]) {
    assertTeacherHidden(id)
  }

  for (const id of [
    'rhythmic-output',
    'rhythmic-html-output',
    'notes-output',
    'voice-btn',
    'voice-stop-btn',
    'speed-slider',
  ]) {
    assert.ok(indexHtml.includes(`id="${id}"`), `#${id} runtime node must not be deleted in SES-143`)
  }

  assert.match(styleCss, /\.teacher-surface-hidden\s*\{[^}]*display\s*:\s*none\s*!important\s*;?[^}]*\}/is)
})

test('SES-143 makes MusicXML the visible default output while preserving core teacher tools', () => {
  const xmlButton = openingTagForId('result-xml-btn')
  assert.match(xmlButton, /class=["'][^"']*active[^"']*["']/i)
  assert.match(xmlButton, /aria-selected=["']true["']/i)

  const xmlPanel = openingTagForId('tab-xml')
  assert.doesNotMatch(xmlPanel, /\shidden(?:\s|>|=)/i)
  assert.doesNotMatch(xmlPanel, /teacher-surface-hidden/i)

  for (const visibleText of ['PDF', 'MusicXML', 'TAB', 'Müziği Dinle']) {
    assert.ok(indexHtml.includes(visibleText), `expected teacher keep-list surface: ${visibleText}`)
  }

  assert.ok(indexHtml.includes('id="rhythm-section"'), 'playback surface must remain mounted')
  assert.ok(indexHtml.includes('id="musicxml-download-btn"'), 'MusicXML download must remain mounted')
  assert.ok(indexHtml.includes('id="omr-download-btn"'), 'OMR download must remain mounted')
})
