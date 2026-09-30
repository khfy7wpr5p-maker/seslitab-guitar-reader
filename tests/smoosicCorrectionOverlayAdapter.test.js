import { existsSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  createSmoosicCorrectionOverlayManager,
} = require('../experiments/smoosic-mobile/src/seslitab-correction-overlay.js')

function fakeScore() {
  return {
    staves: [
      {
        partInfo: {
          stavesBefore: 0,
          stavesAfter: 0,
        },
        measures: [
          {
            svg: {
              logicalBox: {
                x: 10,
                y: 20,
                width: 100,
                height: 60,
              },
            },
          },
          {
            svg: {
              logicalBox: {
                x: 120,
                y: 20,
                width: 110,
                height: 60,
              },
            },
          },
        ],
      },
    ],
  }
}

function harness() {
  const outlined = []
  const erased = []
  const context = {
    pageNumber: 1,
    box: {
      x: 0,
      y: 0,
      width: 800,
      height: 1000,
    },
  }
  let rendererUpdates = 0
  const view = {
    score: fakeScore(),
    tracker: {
      selections: [
        {
          selector: {
            staff: 0,
            measure: 0,
            voice: 0,
            tick: 0,
          },
        },
      ],
    },
    renderer: {
      pageMap: {
        getRenderer() {
          return context
        },
      },
      async updatePromise() { rendererUpdates += 1 },
    },
  }
  const SvgHelpers = {
    outlineRect(info) {
      info.element = {
        isConnected: true,
        remove() {
          this.isConnected = false
        },
      }
      outlined.push(info)
    },
    eraseOutline(info) {
      erased.push(info)
      info.element?.remove?.()
      info.element = undefined
    },
  }
  const manager =
    createSmoosicCorrectionOverlayManager({
      SvgHelpers,
      getView: () => view,
      hashText: async () =>
        'a'.repeat(64),
      reviewedSmoosicVersion: '1.0.44',
    })
  return {
    manager,
    view,
    outlined,
    erased,
    get rendererUpdates() { return rendererUpdates },
  }
}

test('SES-120 maps exact single-part MusicXML identity to Smoosic model geometry without changing teacher selection', async () => {
  const {
    manager,
    view,
    outlined,
    rendererUpdates,
  } = harness()
  const selectionBefore =
    structuredClone(
      view.tracker.selections,
    )

  await manager.bindImportedSource({
    musicXml:
      '<score-partwise version="4.0.3"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"/><measure number="2"/></part></score-partwise>',
    partIds: ['P1'],
    score: view.score,
    sourceRevision: 7,
  })

  const result = await manager.replace({
    sourceRevision: 7,
    sourceHash: 'a'.repeat(64),
    targets: [
      {
        partId: 'P1',
        measureIndex: 1,
      },
    ],
  })

  assert.deepEqual(result, {
    ok: true,
    appliedCount: 1,
    sourceHash: 'a'.repeat(64),
  })
  assert.equal(outlined.length, 1)
  assert.equal(
    outlined[0].stroke.stroke,
    '#dc2626',
  )
  assert.equal(
    outlined[0].stroke.strokeName,
    'seslitab-correction-measure',
  )
  assert.deepEqual(
    outlined[0].box,
    {
      x: 120,
      y: 20,
      width: 110,
      height: 60,
    },
  )
  assert.deepEqual(
    view.tracker.selections,
    selectionBefore,
  )
  assert.equal(rendererUpdates, 0)
})

test('SES-120 fails closed and clears for wrong source hash, wrong part or out-of-range measure', async () => {
  const {
    manager,
    outlined,
    erased,
  } = harness()

  await manager.bindImportedSource({
    musicXml:
      '<score-partwise version="4.0.3"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"/><measure number="2"/></part></score-partwise>',
    partIds: ['P1'],
    score: fakeScore(),
    sourceRevision: 1,
  })

  assert.equal(
    (
      await manager.replace({
        sourceRevision: 1,
        sourceHash: 'a'.repeat(64),
        targets: [
          {
            partId: 'P1',
            measureIndex: 0,
          },
        ],
      })
    ).ok,
    true,
  )
  assert.equal(outlined.length, 1)

  for (const payload of [
    {
      sourceRevision: 1,
      sourceHash: 'b'.repeat(64),
      targets: [
        {
          partId: 'P1',
          measureIndex: 0,
        },
      ],
    },
    {
      sourceRevision: 1,
      sourceHash: 'a'.repeat(64),
      targets: [
        {
          partId: 'OTHER',
          measureIndex: 0,
        },
      ],
    },
    {
      sourceRevision: 1,
      sourceHash: 'a'.repeat(64),
      targets: [
        {
          partId: 'P1',
          measureIndex: 9,
        },
      ],
    },
  ]) {
    const result =
      await manager.replace(payload)
    assert.equal(result.ok, false)
    assert.equal(result.appliedCount, 0)
  }

  assert.equal(erased.length >= 1, true)
})

test('SES-120 refuses multipart/ambiguous import mapping before any overlay authority exists', async () => {
  const { manager } = harness()

  await assert.rejects(
    () =>
      manager.bindImportedSource({
        musicXml:
          '<score-partwise version="4.0.3"><part-list><score-part id="P1"/><score-part id="P2"/></part-list><part id="P1"><measure number="1"/></part><part id="P2"><measure number="1"/></part></score-partwise>',
        partIds: ['P1', 'P2'],
        score: {
          staves: [
            {
              partInfo: {
                stavesBefore: 0,
                stavesAfter: 0,
              },
              measures: [
                {
                  svg: {
                    logicalBox: {
                      x: 0,
                      y: 0,
                      width: 50,
                      height: 50,
                    },
                  },
                },
              ],
            },
            {
              partInfo: {
                stavesBefore: 0,
                stavesAfter: 0,
              },
              measures: [
                {
                  svg: {
                    logicalBox: {
                      x: 0,
                      y: 60,
                      width: 50,
                      height: 50,
                    },
                  },
                },
              ],
            },
          ],
        },
      }),
    /single-part|ambiguous/i,
  )
})

test('SES-120 admits only the reviewed Smoosic version surface', () => {
  assert.throws(
    () =>
      createSmoosicCorrectionOverlayManager({
        SvgHelpers: {
          outlineRect() {},
          eraseOutline() {},
        },
        getView: () => null,
        hashText: async () =>
          'a'.repeat(64),
        reviewedSmoosicVersion:
          '1.0.45',
      }),
    /1\.0\.44|reviewed/i,
  )
})


test('SES-120 protected CI requires the real bundled Smoosic overlay browser proof', () => {
  const scriptUrl = new URL('../scripts/verifySmoosicCorrectionOverlayBrowser.js', import.meta.url)
  assert.equal(existsSync(scriptUrl), true)

  const script = readFileSync(scriptUrl, 'utf8')
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

  assert.match(script, /createS14CdpProofSession/)
  assert.match(script, /seslitab-correction-overlay/)
  assert.match(script, /vf-seslitab-correction-overlay/)
  assert.match(script, /#dc2626/)
  assert.match(script, /exactMeasureIndex:\s*1/)
  assert.match(script, /overlayCount:\s*0/)
  assert.match(ci, /Verify SES-120 Smoosic correction overlay in real browser/)
  assert.match(ci, /node scripts\/verifySmoosicCorrectionOverlayBrowser\.js/)
})


test('SES-120 overlay does not hook generic teacher click or keyup events', () => {
  const editorSource = readFileSync(
    new URL('../experiments/smoosic-mobile/src/index.js', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(
    editorSource,
    /addEventListener\(['"]click['"],\s*scheduleCorrectionOverlayRefresh/,
  )
  assert.doesNotMatch(
    editorSource,
    /addEventListener\(['"]keyup['"],\s*scheduleCorrectionOverlayRefresh/,
  )
  assert.doesNotMatch(
    editorSource,
    /function\s+scheduleCorrectionOverlayRefresh/,
  )
})


test('SES-120 overlay adapter is renderer-passive and never calls updatePromise', () => {
  const source = readFileSync(
    new URL('../experiments/smoosic-mobile/src/seslitab-correction-overlay.js', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(source, /\.updatePromise\s*\(/)
})
