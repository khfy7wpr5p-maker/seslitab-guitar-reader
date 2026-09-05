import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../experiments/smoosic-mobile/public/mobile.css', import.meta.url), 'utf8')
const visibility = readFileSync(new URL('../experiments/smoosic-mobile/public/status-visibility.js', import.meta.url), 'utf8')
const prepare = readFileSync(new URL('../scripts/prepareSmoosicEditor.js', import.meta.url), 'utf8')

test('S14 routine Smoosic status text stays available to automation but is hidden from the UI', () => {
  assert.match(css, /#poc-status \{[\s\S]*?display: none;/)
  assert.match(css, /#poc-status\.is-visible \{[\s\S]*?display: block;/)
  assert.match(visibility, /new MutationObserver\(refreshVisibility\)/)
  assert.match(visibility, /actionablePattern = \/\(hata\|başarısız\|bulunamadı\|oluşmadı\|reddedildi\)\/i/)
  assert.match(visibility, /busyPattern = \/\(yükleniyor\|hazırlanıyor\|başlatılıyor\|aktarılıyor\)\/i/)
  assert.match(visibility, /status\.classList\.toggle\('is-visible', isError \|\| isBusy\)/)
})

test('S14 generated editor ships the status visibility helper without changing status text semantics', () => {
  assert.match(prepare, /'status-visibility\.js'/)
  assert.match(prepare, /<script defer src="\/smoosic-editor\/status-visibility\.js"><\/script>/)
  assert.match(prepare, /<div id="poc-status">Yükleniyor…<\/div>/)
})
