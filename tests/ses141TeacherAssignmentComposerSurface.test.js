import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('SES-141 places Ödev Gönder immediately before MusicXML and provides an Assignment Composer host', () => {
  const assignmentButton = html.indexOf('id="result-assignment-btn"')
  const xmlButton = html.indexOf('id="result-xml-btn"')
  assert.ok(assignmentButton >= 0)
  assert.ok(xmlButton > assignmentButton)

  const between = html.slice(assignmentButton, xmlButton)
  assert.match(between, /Ödev Gönder/)
  assert.ok(html.includes('id="tab-assignment"'))
  assert.ok(html.includes('id="teacher-assignment-composer-host"'))
  assert.ok(html.includes('https://khfy7wpr5p-maker.github.io/st-guitar-chord-board/'))
})
