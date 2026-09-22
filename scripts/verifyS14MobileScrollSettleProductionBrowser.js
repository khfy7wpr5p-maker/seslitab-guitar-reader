import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  createS14CdpProofSession,
  musicXmlUploadExpression,
} from './s14CdpProofHarness.js'

const repoRoot = resolve('.')
const distRoot = resolve(repoRoot, 'dist')
const artifactDir = resolve(repoRoot, 'artifacts')
const artifactPath = resolve(artifactDir, 'smoosic-mobile-scroll-settle-production.json')
const builtViewportPath = resolve(distRoot, 'smoosic-editor', 'viewport-fit.js')

for (const required of [
  resolve(distRoot, 'index.html'),
  resolve(distRoot, 'smoosic-editor', 'index.html'),
  builtViewportPath,
]) {
  if (!existsSync(required)) {
    console.error(`S14 production scroll-settle browser acceptance failed closed: missing ${required}`)
    process.exit(1)
  }
}

const builtViewportSource = readFileSync(builtViewportPath, 'utf8')
if (
  !builtViewportSource.includes('SCROLL_SETTLE_MS = 140')
  || !builtViewportSource.includes('scheduleViewportMotionFit')
) {
  console.error(
    'S14 production scroll-settle browser acceptance failed closed: production bundle does not contain the hardened viewport script.',
  )
  process.exit(1)
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>S14 Production Scroll Settle</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`

let session = null
try {
  session = await createS14CdpProofSession()
  const { chrome, evaluate, waitFor } = session

  await waitFor(
    `document.readyState === 'complete' && !!document.getElementById('musicxml-tab-btn')`,
    'host app init',
  )
  await evaluate(`document.getElementById('musicxml-tab-btn').click(); true`)
  if (!await evaluate(musicXmlUploadExpression(xml, 's14-production-scroll-settle.musicxml'))) {
    throw new Error('MusicXML input missing')
  }
  await waitFor(
    `document.getElementById('musicxml-open-btn')?.disabled === false`,
    'MusicXML selection',
  )
  await evaluate(`document.getElementById('musicxml-open-btn').click(); true`)
  await waitFor(
    `String(document.getElementById('xml-output')?.textContent || '').includes('<step>F</step>')`,
    'MusicXML parse',
  )
  await evaluate(`document.getElementById('smoosic-tab-btn').click(); true`)

  await waitFor(`!!document.getElementById('smoosic-editor-frame')`, 'Smoosic iframe')
  await waitFor(
    `!!document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')`,
    'editor document',
  )
  const editorStatus = await waitFor(
    `(() => {
      const text = String(document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')?.textContent || '');
      if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) return 'ERROR:' + text;
      if (text.startsWith('Yüklendi:') && text.includes('s14-production-scroll-settle.musicxml')) return text;
      return '';
    })()`,
    'fully loaded editor MusicXML',
  )
  if (String(editorStatus).startsWith('ERROR:')) {
    throw new Error(String(editorStatus).slice('ERROR:'.length))
  }
  await waitFor(
    `(() => {
      const host = document.getElementById('smoosic-editor-host-status');
      return !!host && host.hidden === true && String(host.textContent || '').trim() === '' && host.dataset.kind === 'ready';
    })()`,
    'editor host sync settled',
  )

  const metrics = await evaluate(`(async () => {
    const frame = document.getElementById('smoosic-editor-frame');
    const editorDoc = frame?.contentDocument;
    if (!frame || !editorDoc) throw new Error('editor frame unavailable');

    const win = window;
    const scroller = document.scrollingElement || document.documentElement;
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.scrollBehavior = 'auto';
    scroller.scrollTop = 0;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));

    function snapshot() {
      const rect = frame.getBoundingClientRect();
      const vv = win.visualViewport;
      const viewportTop = Number(vv?.offsetTop || 0);
      const viewportHeight = Number(vv?.height || win.innerHeight || 0);
      return {
        frameTop: Number(rect.top.toFixed(3)),
        frameHeight: Number(rect.height.toFixed(3)),
        frameStyleHeight: frame.style.height || '',
        datasetHeight: frame.dataset.seslitabViewportHeight || '',
        menuTop: frame.dataset.seslitabMenuTop || '',
        expectedHeight: Math.floor(viewportTop + viewportHeight - rect.top - 4),
      };
    }

    const metrics = {
      viewport: {
        width: win.innerWidth,
        height: win.innerHeight,
        visualHeight: win.visualViewport?.height || null,
      },
      scroll: {
        maxBefore: 0,
        maxAfter: 0,
        samples: [],
        dispatchedSignals: 0,
        observedEvents: 0,
      },
      initial: snapshot(),
      editorStatus: String(editorDoc.getElementById('poc-status')?.textContent || ''),
      events: {
        iframeLoad: 0,
        editorInputChange: 0,
        frameHiddenMutation: 0,
      },
      phase: {
        burst: { frameStyleMutation: 0 },
        settle: { frameStyleMutation: 0 },
        idle: { frameStyleMutation: 0 },
      },
    };

    let phase = 'burst';
    frame.addEventListener('load', () => { metrics.events.iframeLoad += 1; });
    editorDoc.getElementById('mobile-xml-input')?.addEventListener('change', () => {
      metrics.events.editorInputChange += 1;
    });
    win.addEventListener('scroll', () => { metrics.scroll.observedEvents += 1; }, { passive: true });

    const frameObserver = new win.MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName === 'style') metrics.phase[phase].frameStyleMutation += 1;
        if (record.attributeName === 'hidden') metrics.events.frameHiddenMutation += 1;
      }
    });
    frameObserver.observe(frame, { attributes: true, attributeFilter: ['style', 'hidden'] });

    metrics.scroll.maxBefore = Math.max(0, scroller.scrollHeight - win.innerHeight);
    const spacer = document.createElement('div');
    spacer.style.height = '2600px';
    spacer.style.width = '1px';
    spacer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(spacer);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
    metrics.scroll.maxAfter = Math.max(0, scroller.scrollHeight - win.innerHeight);
    if (metrics.scroll.maxAfter < 280) {
      frameObserver.disconnect();
      spacer.remove();
      throw new Error('host app did not become scrollable');
    }

    for (const requested of [40, 80, 120, 160, 200, 240]) {
      const target = Math.min(requested, metrics.scroll.maxAfter);
      scroller.scrollTop = target;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
      const actual = Number(win.scrollY || scroller.scrollTop || 0);
      if (Math.abs(actual - target) > 2) {
        frameObserver.disconnect();
        spacer.remove();
        throw new Error('host scroll position did not apply: requested=' + target + ' actual=' + actual);
      }
      metrics.scroll.samples.push({ requested: target, actual });
      win.dispatchEvent(new win.Event('scroll'));
      metrics.scroll.dispatchedSignals += 1;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
    }

    metrics.afterBurst = snapshot();
    phase = 'settle';
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    metrics.afterSettle = snapshot();
    phase = 'idle';
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    metrics.afterIdle = snapshot();
    frameObserver.disconnect();
    spacer.remove();

    metrics.analysis = {
      iframeReloadObserved: metrics.events.iframeLoad > 0,
      sourceReimportObserved: metrics.events.editorInputChange > 0,
      frameHiddenChanged: metrics.events.frameHiddenMutation > 0,
      burstFrameHeightDelta: Number((metrics.afterBurst.frameHeight - metrics.initial.frameHeight).toFixed(3)),
      settledFrameHeightDelta: Number((metrics.afterSettle.frameHeight - metrics.initial.frameHeight).toFixed(3)),
      burstFrameWrites: metrics.phase.burst.frameStyleMutation,
      settleFrameWrites: metrics.phase.settle.frameStyleMutation,
      idleFrameWrites: metrics.phase.idle.frameStyleMutation,
      settledGeometryError: Number((metrics.afterSettle.frameHeight - metrics.afterSettle.expectedHeight).toFixed(3)),
      idleGeometryDrift: Number((metrics.afterIdle.frameHeight - metrics.afterSettle.frameHeight).toFixed(3)),
    };
    return metrics;
  })()`)

  const checks = {
    scrollEstablished:
      metrics.scroll.samples.length === 6
      && metrics.scroll.samples.at(-1).actual >= 200,
    lifecycleSafetyPreserved:
      !metrics.analysis.iframeReloadObserved
      && !metrics.analysis.sourceReimportObserved
      && !metrics.analysis.frameHiddenChanged,
    meaningfulGeometryChange:
      Math.abs(metrics.afterBurst.expectedHeight - metrics.initial.frameHeight) >= 1,
    heightStableDuringBurst:
      Math.abs(metrics.analysis.burstFrameHeightDelta) < 0.5,
    zeroFrameWritesDuringBurst:
      metrics.analysis.burstFrameWrites === 0,
    exactSettledGeometry:
      Math.abs(metrics.analysis.settledGeometryError) < 0.5,
    datasetMatchesSettledGeometry:
      Number(metrics.afterSettle.datasetHeight) === metrics.afterSettle.expectedHeight,
    boundedWritesAfterSettle:
      metrics.analysis.settleFrameWrites >= 1
      && metrics.analysis.settleFrameWrites <= 2,
    zeroWritesWhenIdle:
      metrics.analysis.idleFrameWrites === 0,
    zeroGeometryDriftWhenIdle:
      Math.abs(metrics.analysis.idleGeometryDrift) < 0.5,
  }
  const failedChecks = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)

  const evidence = {
    documentType: 'SmoosicMobileScrollSettleProductionEvidence',
    evidenceClass: 'CHROMIUM_REAL_BROWSER_PRODUCTION_BUNDLE',
    productionBehaviorChanged: true,
    deterministicActualScrollVerified: true,
    physicalIphoneSafariVerified: false,
    browserDriver: 'CDP_REAL_TIME',
    metrics,
    comparison: { checks, failedChecks },
  }

  mkdirSync(artifactDir, { recursive: true })
  writeFileSync(artifactPath, JSON.stringify(evidence, null, 2) + '\n')

  if (failedChecks.length) {
    console.error(
      `S14 production scroll-settle browser acceptance failed checks: ${failedChecks.join(', ')}`,
    )
    console.error(JSON.stringify(evidence, null, 2))
    process.exitCode = 1
  } else {
    console.log(
      `S14 production scroll-settle browser acceptance PASS using ${chrome} through real-time CDP.`,
    )
    console.log(JSON.stringify(evidence, null, 2))
  }
} catch (error) {
  console.error(
    `S14 production scroll-settle browser acceptance failed closed: ${error?.message ?? error}`,
  )
  process.exitCode = 1
} finally {
  try {
    await session?.close()
  } catch (error) {
    console.error(
      `S14 production scroll-settle cleanup failed: ${error?.message ?? error}`,
    )
    process.exitCode = 1
  }
}
