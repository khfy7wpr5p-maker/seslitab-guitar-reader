import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('.')
const source = resolve(root, 'experiments/smoosic-mobile/public')
const buildSource = resolve(source, 'build')
const target = resolve(root, 'public/smoosic-editor')
const buildTarget = resolve(target, 'build')

if (!existsSync(resolve(buildSource, 'mobile.js'))) {
  throw new Error('Smoosic mobile bundle was not produced.')
}

rmSync(target, { recursive: true, force: true })
mkdirSync(buildTarget, { recursive: true })

for (const file of ['mobile.css', 'musicxml-compat.js', 'status-visibility.js']) {
  const from = resolve(source, file)
  if (!existsSync(from)) throw new Error(`Missing Smoosic asset: ${file}`)
  cpSync(from, resolve(target, file))
}

for (const file of readdirSync(buildSource)) {
  if (!file.endsWith('.js')) continue
  cpSync(resolve(buildSource, file), resolve(buildTarget, file))
}

const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>SesliTab Nota Düzenle</title>
  <link rel="stylesheet" href="https://smoosic.github.io/Smoosic/src/styles/fonts.css">
  <link rel="stylesheet" href="https://smoosic.github.io/Smoosic/src/styles/media.css">
  <link rel="stylesheet" href="https://smoosic.github.io/Smoosic/src/styles/ribbon.css">
  <link rel="stylesheet" href="https://smoosic.github.io/Smoosic/src/styles/dialogs.css">
  <link rel="stylesheet" href="https://smoosic.github.io/Smoosic/src/styles/menus.css">
  <link rel="stylesheet" href="https://smoosic.github.io/Smoosic/src/styles/piano.css">
  <link rel="stylesheet" href="https://smoosic.github.io/Smoosic/src/styles/tree.css">
  <link rel="stylesheet" href="https://smoosic.github.io/Smoosic/src/styles/bravura-font-codes.css">
  <link rel="stylesheet" href="https://smoosic.github.io/Smoosic/src/styles/bootstrap.min.css">
  <link rel="stylesheet" href="/smoosic-editor/mobile.css">
  <script src="https://code.jquery.com/jquery-3.6.0.slim.min.js"></script>
  <script defer src="/smoosic-editor/musicxml-compat.js"></script>
  <script defer src="/smoosic-editor/build/mobile.js"></script>
  <script defer src="/smoosic-editor/status-visibility.js"></script>
</head>
<body>
  <div id="poc-status">Yükleniyor…</div>

  <audio preload="none" crossorigin="anonymous" id="samplecn4" data-pitch="c/4" data-patch="piano" src="https://smoosic.github.io/SmoSounds/piano/piano-c4-iowa.mp3"></audio>
  <audio preload="none" crossorigin="anonymous" id="samplebb4" data-pitch="bb/4" data-patch="piano" src="https://smoosic.github.io/SmoSounds/piano/piano-bb4-iowa.mp3"></audio>
  <audio preload="none" crossorigin="anonymous" id="sample-piano-a2" data-pitch="a/2" data-patch="piano" src="https://smoosic.github.io/SmoSounds/piano/piano-a2.mp3"></audio>

  <input id="mobile-xml-input" type="file" accept=".xml,.mxml,.musicxml,application/xml,text/xml" hidden>
  <div id="smoo"></div>

  <nav id="mobile-toolbar" aria-label="Nota düzenleme araçları">
    <button id="mobile-menu-toggle" type="button">Menü</button>
    <button data-key="ArrowLeft" type="button">←</button>
    <button data-key="ArrowRight" type="button">→</button>
    <button data-key="," type="button">½ süre</button>
    <button data-key="." type="button">2× süre</button>
    <button data-key="z" data-ctrl="true" type="button">Geri al</button>
    <button data-key="c" type="button">Do</button>
    <button data-key="d" type="button">Re</button>
    <button data-key="e" type="button">Mi</button>
    <button data-key="f" type="button">Fa</button>
    <button data-key="g" type="button">Sol</button>
    <button data-key="a" type="button">La</button>
    <button data-key="b" type="button">Si</button>
    <button data-key="=" type="button">+½ ses</button>
    <button data-key="-" type="button">−½ ses</button>
    <button data-key="l" data-alt="true" type="button">Grace seç</button>
    <button data-key="G" data-shift="true" type="button">Grace +</button>
    <button id="mobile-xml-open" type="button">XML Aç</button>
    <button data-instrument="piano" type="button">Piyano</button>
    <button data-instrument="eGuitar" type="button">Gitar</button>
    <button id="mobile-metronome" type="button" aria-pressed="false">Metronom</button>
    <button id="mobile-xml-export" type="button">XML Kaydet</button>
  </nav>
</body>
</html>`

writeFileSync(resolve(target, 'index.html'), html, 'utf8')

const copiedBundles = readdirSync(buildTarget).filter((name) => name.endsWith('.js'))
if (!copiedBundles.includes('mobile.js')) throw new Error('Embedded Smoosic mobile.js is missing after copy.')
console.log(`Prepared same-origin Smoosic editor with ${copiedBundles.length} JS bundle(s).`)
