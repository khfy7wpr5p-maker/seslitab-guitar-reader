import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createS14CdpProofSession,
  musicXmlUploadExpression,
} from './s14CdpProofHarness.js'

const SUSPICIOUS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`

const CLEAN_XML = SUSPICIOUS_XML.replace(
  '<note><pitch><step>F</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice></note>',
  '<note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>',
)

const evidence = {
  contract: 'SES-120 Smoosic correction overlay browser proof',
  smoosicVersion: '1.0.44',
  suspicious: null,
  cleared: null,
  sourceImmutable: null,
}

async function openSource(session, xml, fileName) {
  const { evaluate, waitFor } = session
  await evaluate(`document.getElementById('musicxml-tab-btn').click(); true`)
  if (!await evaluate(musicXmlUploadExpression(xml, fileName))) {
    throw new Error(`MusicXML input missing for ${fileName}`)
  }
  await waitFor(
    `document.getElementById('musicxml-open-btn')?.disabled === false`,
    `${fileName} selection`,
  )
  await evaluate(`document.getElementById('musicxml-open-btn').click(); true`)
  await waitFor(
    `(() => {
      const xml = String(document.getElementById('xml-output')?.textContent || '');
      const name = String(document.getElementById('musicxml-file-name')?.textContent || '');
      return xml.includes('<score-partwise') && name.includes(${JSON.stringify(fileName)});
    })()`,
    `${fileName} accepted parse`,
  )
}

async function openSmoosic(session, fileName) {
  const { evaluate, waitFor } = session
  await evaluate(`document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(
    `!!document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')`,
    'Smoosic document',
  )
  const status = await waitFor(
    `(() => {
      const frame = document.getElementById('smoosic-editor-frame');
      const text = String(frame?.contentDocument?.getElementById('poc-status')?.textContent || '');
      if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) return 'ERROR:' + text;
      return text.startsWith('Yüklendi:') && text.includes(${JSON.stringify(fileName)}) ? text : '';
    })()`,
    `${fileName} Smoosic handoff`,
  )
  if (String(status).startsWith('ERROR:')) throw new Error(String(status).slice(6))
}

async function main() {
  let session = null
  try {
    session = await createS14CdpProofSession({ width: 1180, height: 900 })
    const { chrome, evaluate, waitFor } = session

    await waitFor(
      `document.readyState === 'complete' && !!document.getElementById('smoosic-tab-btn')`,
      'SesliTab init',
    )

    await evaluate(`(() => {
      window.__ses120OverlayResults = [];
      window.addEventListener('message', (event) => {
        const data = event?.data;
        if (data?.type === 'seslitab:smoosic-correction-overlay-result') {
          window.__ses120OverlayResults.push({
            origin: event.origin,
            version: data.version,
            requestId: data.requestId,
            sourceRevision: data.sourceRevision,
            ok: data.ok,
            appliedCount: data.appliedCount,
            sourceHash: data.sourceHash,
            error: data.error || null,
          });
        }
      });
      return true;
    })()`)

    await openSource(session, SUSPICIOUS_XML, 'ses-120-suspicious.musicxml')
    const sourceBefore = await evaluate(
      `String(document.getElementById('xml-output')?.textContent || '')`,
    )
    if (sourceBefore !== SUSPICIOUS_XML) {
      throw new Error('Host source changed before Smoosic overlay proof.')
    }

    await openSmoosic(session, 'ses-120-suspicious.musicxml')

    const acknowledgement = await waitFor(
      `(() => {
        const rows = window.__ses120OverlayResults || [];
        return rows.find((row) =>
          typeof row?.requestId === 'string'
          && !row.requestId.includes('-clear-')
        ) || null;
      })()`,
      'Smoosic correction overlay replace acknowledgement',
    )
    if (acknowledgement.ok !== true || acknowledgement.appliedCount < 1) {
      throw new Error(
        `Smoosic correction overlay rejected: ${JSON.stringify(acknowledgement)}`,
      )
    }

    const overlay = await waitFor(
      `(() => {
        const frame = document.getElementById('smoosic-editor-frame');
        const doc = frame?.contentDocument;
        const group = doc?.querySelector('g.vf-seslitab-correction-overlay.seslitab-correction-measure');
        const rect = group?.querySelector('rect');
        if (!group || !rect) return null;
        return {
          groups: doc.querySelectorAll('g.vf-seslitab-correction-overlay.seslitab-correction-measure').length,
          stroke: String(rect.getAttribute('stroke') || ''),
          strokeWidth: String(rect.getAttribute('stroke-width') || ''),
          fill: String(rect.getAttribute('fill') || ''),
          rect: {
            x: Number(rect.getAttribute('x')),
            y: Number(rect.getAttribute('y')),
            width: Number(rect.getAttribute('width')),
            height: Number(rect.getAttribute('height')),
          },
        };
      })()`,
      'red Smoosic suspicious-measure overlay',
    )

    if (
      overlay.groups !== 1
      || overlay.stroke.toLowerCase() !== '#dc2626'
      || Number(overlay.strokeWidth) !== 4
      || overlay.fill !== 'none'
      || !(overlay.rect.width > 0)
      || !(overlay.rect.height > 0)
    ) {
      throw new Error(`Unexpected Smoosic correction overlay: ${JSON.stringify(overlay)}`)
    }

    const sourceAfter = await evaluate(
      `String(document.getElementById('xml-output')?.textContent || '')`,
    )
    if (sourceAfter !== SUSPICIOUS_XML) {
      throw new Error('Correction overlay mutated host MusicXML.')
    }

    evidence.suspicious = {
      exactPartId: 'P1',
      exactMeasureIndex: 1,
      acknowledgements: await evaluate('window.__ses120OverlayResults'),
      acknowledgement,
      overlay,
      chrome,
    }
    evidence.sourceImmutable = true

    await openSource(session, CLEAN_XML, 'ses-120-clean.musicxml')
    await openSmoosic(session, 'ses-120-clean.musicxml')
    await waitFor(
      `(() => {
        const frame = document.getElementById('smoosic-editor-frame');
        return frame?.contentDocument?.querySelectorAll('g.vf-seslitab-correction-overlay.seslitab-correction-measure').length === 0;
      })()`,
      'stale Smoosic overlay clear',
    )

    const cleanSource = await evaluate(
      `String(document.getElementById('xml-output')?.textContent || '')`,
    )
    if (cleanSource !== CLEAN_XML) {
      throw new Error('Clean replacement source changed during overlay clear proof.')
    }

    evidence.cleared = {
      replacement: 'ses-120-clean.musicxml',
      overlayCount: 0,
    }

    mkdirSync(resolve('artifacts'), { recursive: true })
    writeFileSync(
      resolve('artifacts', 'ses-120-smoosic-correction-overlay-browser.json'),
      JSON.stringify(evidence, null, 2) + '\n',
      'utf8',
    )
    console.log(JSON.stringify(evidence, null, 2))
  } finally {
    await session?.close()
  }
}

main().catch((error) => {
  console.error('SES-120 Smoosic correction overlay browser proof failed:', error)
  process.exitCode = 1
})
