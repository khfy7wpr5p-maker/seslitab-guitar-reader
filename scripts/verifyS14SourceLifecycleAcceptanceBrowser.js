import {
  createS14CdpProofSession,
  musicXmlUploadExpression,
  pdfUploadExpression,
} from './s14CdpProofHarness.js'

function scoreXml(step, title) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`
}

const musicXmlA = scoreXml('C', 'MusicXML A')
const musicXmlC = scoreXml('E', 'MusicXML C')
const pdfXmlA = scoreXml('F', 'PDF A')
const pdfXmlB = scoreXml('G', 'PDF B')
const pdfXmlD = scoreXml('B', 'PDF D')
const invalidMusicXmlB = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Empty</part-name></score-part></part-list>
  <part id="P1"><measure number="1"></measure></part>
</score-partwise>`

let session = null
try {
  session = await createS14CdpProofSession()
  const { chrome, evaluate, waitFor } = session

  const waitHostReady = (label) => waitFor(
    `(() => {
      const host = document.getElementById('smoosic-editor-host-status');
      return !!host && host.hidden === true && String(host.textContent || '').trim() === '' && host.dataset.kind === 'ready';
    })()`,
    label,
  )

  const waitEditorLoaded = async (fileName, label) => {
    const status = await waitFor(
      `(() => {
        const text = String(document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')?.textContent || '');
        if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) return 'ERROR:' + text;
        if (text.startsWith('Yüklendi:') && text.includes(${JSON.stringify(fileName)})) return text;
        return '';
      })()`,
      label,
    )
    if (String(status).startsWith('ERROR:')) {
      throw new Error(String(status).slice('ERROR:'.length))
    }
    return String(status)
  }

  const openMusicXml = async (xml, fileName, expectedStep) => {
    await evaluate(`document.getElementById('musicxml-tab-btn').click(); true`)
    if (!await evaluate(musicXmlUploadExpression(xml, fileName))) {
      throw new Error(`${fileName} input missing`)
    }
    await waitFor(
      `document.getElementById('musicxml-open-btn')?.disabled === false`,
      `${fileName} selection`,
    )
    await evaluate(`document.getElementById('musicxml-open-btn').click(); true`)
    await waitFor(
      `(() => {
        const output = String(document.getElementById('xml-output')?.textContent || '');
        const name = String(document.getElementById('musicxml-file-name')?.textContent || '');
        return output.includes('<step>${expectedStep}</step>') && name.includes(${JSON.stringify(fileName)});
      })()`,
      `${fileName} parse`,
    )
  }

  const beginPdfTransition = async (pdfName) => {
    await evaluate(`document.getElementById('pdf-tab-btn').click(); true`)
    if (!await evaluate(pdfUploadExpression(pdfName))) {
      throw new Error(`${pdfName} input missing`)
    }
    await waitFor(
      `String(document.getElementById('file-name')?.textContent || '') === ${JSON.stringify(pdfName)}`,
      `${pdfName} real selection`,
    )
    await evaluate(`document.getElementById('progress-container').hidden = false; true`)
    await waitFor(
      `document.getElementById('smoosic-editor-frame')?.hidden === true`,
      `${pdfName} pending hides stale editor`,
    )
  }

  const completePdfSuccess = async (xml) => {
    await evaluate(`(() => {
      document.getElementById('results-section').hidden = false;
      document.getElementById('xml-output').textContent = ${JSON.stringify(xml)};
      document.getElementById('progress-container').hidden = true;
      return true;
    })()`)
  }

  await waitFor(
    `document.readyState === 'complete' && !!document.getElementById('smoosic-tab-btn')`,
    'app init',
  )

  await openMusicXml(musicXmlA, 'source-a.musicxml', 'C')
  await evaluate(`document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(`!!document.getElementById('smoosic-editor-frame')`, 'editor iframe')
  await waitFor(
    `!!document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')`,
    'editor document',
  )
  await waitEditorLoaded('source-a.musicxml', 'MusicXML A handoff')
  await waitHostReady('MusicXML A host sync settled')

  await evaluate(`document.getElementById('musicxml-tab-btn').click(); true`)
  if (!await evaluate(musicXmlUploadExpression(invalidMusicXmlB, 'source-b-invalid.musicxml'))) {
    throw new Error('MusicXML B input missing')
  }
  await waitFor(
    `document.getElementById('musicxml-open-btn')?.disabled === false`,
    'MusicXML B selection',
  )
  await evaluate(`document.getElementById('musicxml-open-btn').click(); true`)
  await waitFor(
    `(() => {
      const error = document.getElementById('musicxml-error');
      return !!error && error.hidden === false && String(error.textContent || '').trim().length > 0;
    })()`,
    'MusicXML B parse failure',
  )
  await waitFor(
    `document.getElementById('musicxml-progress')?.hidden === true`,
    'MusicXML B failure completion',
  )

  await evaluate(`document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(
    `document.getElementById('smoosic-editor-frame')?.hidden === false`,
    'A restored after B failure',
  )
  const afterFailure = await waitEditorLoaded(
    'source-a.musicxml',
    'MusicXML A restored after B failure',
  )
  if (afterFailure.includes('source-b-invalid.musicxml')) {
    throw new Error('MusicXML B failure was promoted as a successful source')
  }

  await openMusicXml(musicXmlC, 'source-c.musicxml', 'E')
  await waitEditorLoaded('source-c.musicxml', 'MusicXML C automatic refresh')
  await waitHostReady('MusicXML C host sync settled')

  await beginPdfTransition('pdf-a.pdf')
  await completePdfSuccess(pdfXmlA)
  await waitEditorLoaded('pdf-a.pdf.musicxml', 'PDF A success refresh')
  await waitHostReady('PDF A host sync settled')

  await beginPdfTransition('pdf-b.pdf')
  await completePdfSuccess(pdfXmlB)
  await waitEditorLoaded('pdf-b.pdf.musicxml', 'PDF B success refresh')
  await waitHostReady('PDF B host sync settled')

  await beginPdfTransition('pdf-c-failed.pdf')
  await evaluate(`document.getElementById('progress-container').hidden = true; true`)
  await waitFor(
    `document.getElementById('smoosic-editor-frame')?.hidden === false`,
    'PDF C failure restores last accepted editor',
  )
  const afterPdfFailure = await waitEditorLoaded(
    'pdf-b.pdf.musicxml',
    'PDF B retained after PDF C failure',
  )
  if (afterPdfFailure.includes('pdf-c-failed.pdf')) {
    throw new Error('Failed PDF was promoted as a successful source')
  }

  await beginPdfTransition('pdf-d.pdf')
  await completePdfSuccess(pdfXmlD)
  const finalStatus = await waitEditorLoaded(
    'pdf-d.pdf.musicxml',
    'PDF D recovery refresh',
  )

  console.log(
    `S14 source lifecycle browser proof PASS using ${chrome}: MusicXML A->B failure->C and PDF success/failure/recovery invariants hold. Final: ${finalStatus}`,
  )
} catch (error) {
  console.error(`S14 source lifecycle browser proof failed closed: ${error?.message ?? error}`)
  process.exitCode = 1
} finally {
  try {
    await session?.close()
  } catch (error) {
    console.error(`S14 source lifecycle cleanup failed: ${error?.message ?? error}`)
    process.exitCode = 1
  }
}
