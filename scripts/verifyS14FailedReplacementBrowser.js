import {
  createS14CdpProofSession,
  musicXmlUploadExpression,
} from './s14CdpProofHarness.js'

const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`

const invalidReplacementXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Empty</part-name></score-part></part-list>
  <part id="P1"><measure number="1"></measure></part>
</score-partwise>`

let session = null
try {
  session = await createS14CdpProofSession()
  const { chrome, evaluate, waitFor } = session

  await waitFor(
    `document.readyState === 'complete' && !!document.getElementById('smoosic-tab-btn')`,
    'app init',
  )

  await evaluate(`document.getElementById('musicxml-tab-btn').click(); true`)
  if (!await evaluate(musicXmlUploadExpression(validXml, 'accepted-source.musicxml'))) {
    throw new Error('accepted source input missing')
  }
  await waitFor(
    `document.getElementById('musicxml-open-btn')?.disabled === false`,
    'accepted source selection',
  )
  await evaluate(`document.getElementById('musicxml-open-btn').click(); true`)
  await waitFor(
    `String(document.getElementById('xml-output')?.textContent || '').includes('<step>C</step>')`,
    'accepted source parse',
  )

  await evaluate(`document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(`!!document.getElementById('smoosic-editor-frame')`, 'editor iframe')
  await waitFor(
    `!!document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')`,
    'editor document',
  )
  await waitFor(
    `(() => {
      const text = String(document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')?.textContent || '');
      if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) return 'ERROR:' + text;
      return text.startsWith('Yüklendi:') && text.includes('accepted-source.musicxml');
    })()`,
    'accepted source handoff',
  )
  await waitFor(
    `(() => {
      const host = document.getElementById('smoosic-editor-host-status');
      return !!host && host.hidden === true && String(host.textContent || '').trim() === '' && host.dataset.kind === 'ready';
    })()`,
    'accepted source host sync settled',
  )

  await evaluate(`document.getElementById('musicxml-tab-btn').click(); true`)
  if (!await evaluate(musicXmlUploadExpression(invalidReplacementXml, 'failed-replacement.musicxml'))) {
    throw new Error('failed replacement input missing')
  }
  await waitFor(
    `document.getElementById('musicxml-open-btn')?.disabled === false`,
    'failed replacement selection',
  )
  await evaluate(`document.getElementById('musicxml-open-btn').click(); true`)
  await waitFor(
    `(() => {
      const error = document.getElementById('musicxml-error');
      return !!error && error.hidden === false && String(error.textContent || '').trim().length > 0;
    })()`,
    'failed replacement error',
  )
  await waitFor(
    `document.getElementById('musicxml-progress')?.hidden === true`,
    'failed replacement completion',
  )

  const retainedHost = await evaluate(`({
    xml: String(document.getElementById('xml-output')?.textContent || ''),
    selectedName: String(document.getElementById('musicxml-file-name')?.textContent || ''),
  })`)
  if (!retainedHost?.xml.includes('<step>C</step>')) {
    throw new Error('failed replacement destroyed the last accepted MusicXML')
  }
  if (!retainedHost?.selectedName.includes('failed-replacement.musicxml')) {
    throw new Error('fixture did not exercise stale XML + new filename condition')
  }

  await evaluate(`document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(
    `document.getElementById('smoosic-editor-frame')?.hidden === false`,
    'accepted editor restored after failure',
  )
  const editorStatus = await waitFor(
    `(() => {
      const text = String(document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')?.textContent || '');
      if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) return 'ERROR:' + text;
      if (text.startsWith('Yüklendi:') && text.includes('accepted-source.musicxml')) return text;
      return '';
    })()`,
    'accepted source terminal load after failed replacement',
  )
  if (String(editorStatus).startsWith('ERROR:')) {
    throw new Error(String(editorStatus).slice('ERROR:'.length))
  }
  if (!String(editorStatus).includes('accepted-source.musicxml')) {
    throw new Error(`Smoosic did not retain the last accepted source after replacement failure: ${editorStatus}`)
  }
  if (String(editorStatus).includes('failed-replacement.musicxml')) {
    throw new Error('failed replacement was incorrectly promoted into Smoosic')
  }

  console.log(
    `S14 failed-replacement browser proof PASS using ${chrome}: failed source was not promoted over the last accepted score.`,
  )
} catch (error) {
  console.error(`S14 failed-replacement browser proof failed closed: ${error?.message ?? error}`)
  process.exitCode = 1
} finally {
  try {
    await session?.close()
  } catch (error) {
    console.error(`S14 failed-replacement cleanup failed: ${error?.message ?? error}`)
    process.exitCode = 1
  }
}
