import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createS14CdpProofSession,
  musicXmlUploadExpression,
} from './s14CdpProofHarness.js'

const SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>CE Bridge</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    <forward><duration>1</duration></forward>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff><type>half</type></note>
  </measure></part>
</score-partwise>`

const EXPECTED_FAILURES = Object.freeze({
  runtime: 'CE_RUNTIME_UNAVAILABLE',
  conformance: 'CONFORMANCE_FAILED',
})

const evidence = {
  contract: 'CE-BRIDGE structural browser proof',
  explicitAction: '2× süre',
  success: null,
  undo: null,
  malformed: null,
  stale: null,
  runtimeUnavailable: null,
  conformance: null,
}

async function openSource(session, fileName) {
  const { evaluate, waitFor } = session
  await evaluate(`document.getElementById('musicxml-tab-btn').click(); true`)
  if (!await evaluate(musicXmlUploadExpression(SOURCE_XML, fileName))) {
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
      return xml.includes('<step>C</step>') && name.includes(${JSON.stringify(fileName)});
    })()`,
    `${fileName} accepted parse`,
  )

  await evaluate(`document.getElementById('smoosic-tab-btn').click(); true`)
  await waitFor(`!!document.getElementById('smoosic-editor-frame')`, 'Smoosic iframe')
  await waitFor(
    `!!document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')`,
    'Smoosic document',
  )
  const status = await waitFor(
    `(() => {
      const text = String(document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')?.textContent || '');
      if (text.startsWith('Başlatma hatası:') || text.startsWith('Hata:') || text.startsWith('XML hatası:')) return 'ERROR:' + text;
      return text.startsWith('Yüklendi:') && text.includes(${JSON.stringify(fileName)}) ? text : '';
    })()`,
    `${fileName} Smoosic handoff`,
  )
  if (String(status).startsWith('ERROR:')) throw new Error(String(status).slice(6))
  await waitFor(
    `!!document.getElementById('smoosic-editor-frame')?.contentDocument?.querySelector('button[data-key="."]')`,
    '2× süre control',
  )
}

async function clickEditorKey(session, key, { ctrl = false } = {}) {
  const selector = ctrl
    ? `button[data-key="${key}"][data-ctrl="true"]`
    : `button[data-key="${key}"]:not([data-ctrl="true"])`
  const clicked = await session.evaluate(`(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const button = frame?.contentDocument?.querySelector(${JSON.stringify(selector)});
    if (!button) return false;
    button.click();
    return true;
  })()`)
  if (!clicked) throw new Error(`Smoosic key not available: ${key}`)
}

async function probeEditorExport(session, sourceRevision = 0) {
  const requestId = await session.evaluate(`(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    if (!frame?.contentWindow) return '';
    const requestId = 'ce-bridge-probe-' + crypto.randomUUID();
    window.__CE_BRIDGE_PROBE__ = null;
    const handler = (event) => {
      if (
        event.source === frame.contentWindow
        && event.origin === location.origin
        && event.data?.type === 'seslitab:smoosic-export-result'
        && event.data.requestId === requestId
      ) {
        window.__CE_BRIDGE_PROBE__ = event.data;
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);
    frame.contentWindow.postMessage({
      type: 'seslitab:smoosic-export-request',
      version: 1,
      requestId,
      sourceRevision: ${Number(sourceRevision)},
    }, location.origin);
    return requestId;
  })()`)
  if (!requestId) throw new Error('Could not issue structural export probe.')
  return session.waitFor(
    `window.__CE_BRIDGE_PROBE__ || null`,
    'structuralActionManifest export probe',
  )
}

async function visibleFirstNote(session) {
  return session.evaluate(`(() => {
    const xml = String(document.getElementById('xml-output')?.textContent || '');
    const parsed = new DOMParser().parseFromString(xml, 'text/xml');
    const note = parsed.querySelector('part > measure > note');
    return {
      step: String(note?.querySelector('pitch > step')?.textContent || ''),
      duration: Number(note?.querySelector('duration')?.textContent || 0),
      xml,
    };
  })()`)
}

async function clickApply(session) {
  const ok = await session.evaluate(`(() => {
    const button = document.getElementById('smoosic-apply-btn');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`)
  if (!ok) throw new Error('SesliTab structural Apply control was unavailable.')
}

async function runRuntimeUnavailableProof() {
  let session = null
  try {
    session = await createS14CdpProofSession()
    const { chrome, evaluate, waitFor } = session
    await waitFor(
      `document.readyState === 'complete' && !!document.getElementById('smoosic-tab-btn')`,
      'runtime-unavailable app init',
    )
    await openSource(session, 'ce-runtime-unavailable.musicxml')
    await evaluate(`(() => {
      delete window.STOmrCorrectionCeStructRuntime;
      const original = Node.prototype.appendChild;
      window.__CE_BRIDGE_APPEND_CHILD__ = original;
      Node.prototype.appendChild = function(node) {
        if (
          this === document.head
          && node?.tagName === 'SCRIPT'
          && String(node.src || '').includes('/st-omr-correction-engine-runtime/ce-struct-browser-runtime.js')
        ) {
          queueMicrotask(() => node.dispatchEvent(new Event('error')));
          return node;
        }
        return original.call(this, node);
      };
      return true;
    })()`)

    await clickEditorKey(session, '.')
    const probe = await probeEditorExport(session)
    if (!probe?.structuralActionManifest) {
      const editorStatus = await evaluate(`String(document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')?.textContent || '')`)
      throw new Error(`Runtime-unavailable fixture did not create explicit structuralActionManifest. editorStatus=${editorStatus} probeError=${String(probe?.error || '')}`)
    }
    await clickApply(session)
    const status = await waitFor(
      `(() => {
        const text = String(document.getElementById('smoosic-editor-host-status')?.textContent || '');
        return text.includes('doğrulama motoru yüklenemedi') ? text : '';
      })()`,
      EXPECTED_FAILURES.runtime,
    )
    const visible = await visibleFirstNote(session)
    if (visible.duration !== 1 || visible.step !== 'C') {
      throw new Error('CE runtime failure changed the accepted revision.')
    }
    evidence.runtimeUnavailable = { status, failure: EXPECTED_FAILURES.runtime, chrome }
  } finally {
    try {
      await session?.evaluate(`(() => {
        if (window.__CE_BRIDGE_APPEND_CHILD__) {
          Node.prototype.appendChild = window.__CE_BRIDGE_APPEND_CHILD__;
          delete window.__CE_BRIDGE_APPEND_CHILD__;
        }
        return true;
      })()`)
    } catch {}
    await session?.close()
  }
}

async function armForgedManifest(session, mode) {
  return session.evaluate(`(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const frameWindow = frame?.contentWindow;
    const frameDocument = frame?.contentDocument;
    if (!frameWindow || !frameDocument?.body) return false;

    if (!window.__CE_BRIDGE_DELIVER_FORGED__) {
      window.__CE_BRIDGE_DELIVER_FORGED__ = (payload) => {
        const activeFrame = document.getElementById('smoosic-editor-frame');
        if (!activeFrame?.contentWindow) return false;
        window.dispatchEvent(new MessageEvent('message', {
          data: payload,
          origin: location.origin,
          source: activeFrame.contentWindow,
        }));
        return true;
      };
    }

    if (!frameWindow.__CE_BRIDGE_FORGE_HANDLER__) {
      const sourceXml = ${JSON.stringify(SOURCE_XML)};
      const installer = frameDocument.createElement('script');
      installer.textContent = '(' + function installForgedReplyListener(sourceXml) {
        const handler = (event) => {
          const message = event.data;
          const mode = window.__CE_BRIDGE_FORGE_MODE__;
          if (!mode || message?.type !== 'seslitab:smoosic-export-request') return;

          const malformed = { malformed: true };
          const stale = {
            version: 1,
            sourceRevision: Number(message.sourceRevision) + 1,
            editorSessionId: 'forged-session',
            actionId: 'forged-apply',
            operations: [{
              order: 0,
              operation: 'CHANGE_EVENT_DURATION',
              rawNoteOrdinal: 0,
              staffIndex: 0,
              measureIndex: 0,
              voiceIndex: 0,
              noteIndex: 0,
              noteIdentity: 'forged-note',
              before: 1,
              after: 2,
            }],
            baseMappingFingerprint: '0000000000000000',
            createdFromExplicitTeacherApply: true,
          };
          const payload = {
            type: 'seslitab:smoosic-export-result',
            version: 2,
            requestId: message.requestId,
            sourceRevision: message.sourceRevision,
            fileName: 'forged-structural.musicxml',
            musicXml: sourceXml,
            paddingRestProvenance: {
              version: 1,
              sourceRevision: message.sourceRevision,
              rawNoteCount: 2,
              entries: [],
            },
            structuralActionManifest: mode === 'stale' ? stale : malformed,
            roundTripOk: true,
            shapeOk: true,
            semanticOk: true,
          };

          const delivered = parent.__CE_BRIDGE_DELIVER_FORGED__?.(payload) === true;
          parent.__CE_BRIDGE_FORGE_DEBUG__ = {
            mode,
            requestId: message.requestId,
            sourceRevision: message.sourceRevision,
            delivered,
          };
        };

        window.__CE_BRIDGE_FORGE_HANDLER__ = handler;
        window.addEventListener('message', handler, true);
      }.toString() + ')(' + JSON.stringify(sourceXml) + ');';
      frameDocument.body.appendChild(installer);
      installer.remove();

      if (typeof frameWindow.__CE_BRIDGE_FORGE_HANDLER__ !== 'function') return false;
    }

    frameWindow.__CE_BRIDGE_FORGE_MODE__ = ${JSON.stringify(mode)};
    return true;
  })()`)
}

async function restoreForgedManifest(session) {
  await session.evaluate(`(() => {
    const frame = document.getElementById('smoosic-editor-frame');
    const frameWindow = frame?.contentWindow;
    if (frameWindow?.__CE_BRIDGE_FORGE_HANDLER__) {
      frameWindow.removeEventListener('message', frameWindow.__CE_BRIDGE_FORGE_HANDLER__, true);
      delete frameWindow.__CE_BRIDGE_FORGE_HANDLER__;
    }
    if (frameWindow) delete frameWindow.__CE_BRIDGE_FORGE_MODE__;
    delete window.__CE_BRIDGE_DELIVER_FORGED__;
    delete window.__CE_BRIDGE_FORGE_DEBUG__;
    return true;
  })()`)
}

async function runMainProof() {
  let session = null
  try {
    session = await createS14CdpProofSession()
    const { chrome, waitFor } = session
    await waitFor(
      `document.readyState === 'complete' && !!document.getElementById('smoosic-tab-btn')`,
      'Task 7 app init',
    )

    await openSource(session, 'ce-struct-success.musicxml')
    await clickEditorKey(session, '.')
    const successProbe = await probeEditorExport(session)
    const operation = successProbe?.structuralActionManifest?.operations?.[0]
    if (!operation || operation.operation !== 'CHANGE_EVENT_DURATION' || operation.before !== 1 || operation.after !== 2) {
      throw new Error(`Explicit 2× süre manifest unit mismatch: ${JSON.stringify(operation)}`)
    }
    await clickApply(session)
    const successStatus = await waitFor(
      `(() => {
        const text = String(document.getElementById('smoosic-editor-host-status')?.textContent || '');
        return text.includes('Yeni sürüm doğrulandı') ? text : '';
      })()`,
      'CE structural success',
    )
    const successVisible = await visibleFirstNote(session)
    if (successVisible.duration !== 2 || successVisible.step !== 'C') {
      throw new Error('Structural Apply did not publish the exact duration-only correction.')
    }
    evidence.success = {
      status: successStatus,
      structuralActionManifest: successProbe.structuralActionManifest,
      duration: successVisible.duration,
      chrome,
    }

    await openSource(session, 'ce-struct-undo.musicxml')
    await clickEditorKey(session, '.')
    await clickEditorKey(session, 'z', { ctrl: true })
    const undoProbe = await probeEditorExport(session)
    if (undoProbe?.error) {
      const editorStatus = await session.evaluate(`String(document.getElementById('smoosic-editor-frame')?.contentDocument?.getElementById('poc-status')?.textContent || '')`)
      throw new Error(`Undo export probe failed: ${String(undoProbe.error)}. editorStatus=${editorStatus}`)
    }
    if (typeof undoProbe?.musicXml !== 'string' || !undoProbe.musicXml.trim()) {
      throw new Error('Undo export probe returned no MusicXML.')
    }
    if (!undoProbe?.paddingRestProvenance) {
      throw new Error('Undo export probe returned no padding-rest provenance.')
    }
    if (undoProbe?.structuralActionManifest !== undefined) {
      throw new Error('Undo-before-Apply retained a structuralActionManifest.')
    }
    await clickApply(session)
    let undoStatus
    try {
      undoStatus = await waitFor(
        `(() => {
          const text = String(document.getElementById('smoosic-editor-host-status')?.textContent || '');
          return text.includes('yeni bir müzikal değişiklik yok') ? text : '';
        })()`,
        'undo no-change',
      )
    } catch (error) {
      const hostStatus = await session.evaluate(
        `String(document.getElementById('smoosic-editor-host-status')?.textContent || '')`,
      )
      const visible = await visibleFirstNote(session)
      throw new Error(
        `${error?.message ?? error}; hostStatus=${hostStatus}; undoProbe=${JSON.stringify(undoProbe)}; visible=${JSON.stringify({ step: visible.step, duration: visible.duration })}`,
      )
    }
    const undoVisible = await visibleFirstNote(session)
    if (undoVisible.duration !== 1 || undoVisible.step !== 'C') {
      throw new Error('Undo-before-Apply changed the accepted revision.')
    }
    evidence.undo = { status: undoStatus, structuralActionManifest: null }

    await openSource(session, 'ce-struct-conformance.musicxml')
    await clickEditorKey(session, '.')
    await clickEditorKey(session, 'e')
    const mixedProbe = await probeEditorExport(session)
    if (!mixedProbe?.structuralActionManifest) throw new Error('Mixed edit lost explicit structuralActionManifest.')
    await clickApply(session)
    const conformanceStatus = await waitFor(
      `(() => {
        const text = String(document.getElementById('smoosic-editor-host-status')?.textContent || '');
        return text.includes('doğrulanan yapısal değişiklikle eşleşmiyor') ? text : '';
      })()`,
      EXPECTED_FAILURES.conformance,
    )
    const conformanceVisible = await visibleFirstNote(session)
    if (conformanceVisible.duration !== 1 || conformanceVisible.step !== 'C') {
      throw new Error('CONFORMANCE_FAILED changed the accepted revision.')
    }
    evidence.conformance = { status: conformanceStatus, failure: EXPECTED_FAILURES.conformance }

    await openSource(session, 'ce-struct-provenance.musicxml')
    if (!await armForgedManifest(session, 'malformed')) throw new Error('Could not arm malformed manifest proof.')
    await clickApply(session)
    const malformedStatus = await waitFor(
      `(() => {
        const text = String(document.getElementById('smoosic-editor-host-status')?.textContent || '');
        return text.includes('Düzenleme kanıtı doğrulanamadı') ? text : '';
      })()`,
      'malformed action provenance',
    )
    evidence.malformed = { status: malformedStatus }

    await armForgedManifest(session, 'stale')
    await clickApply(session)
    const staleStatus = await waitFor(
      `(() => {
        const text = String(document.getElementById('smoosic-editor-host-status')?.textContent || '');
        return text.includes('Kaynak değişti') ? text : '';
      })()`,
      'stale action provenance',
    )
    const staleVisible = await visibleFirstNote(session)
    if (staleVisible.duration !== 1 || staleVisible.step !== 'C') {
      throw new Error('Malformed/stale manifest changed the accepted revision.')
    }
    evidence.stale = { status: staleStatus }
    await restoreForgedManifest(session)
  } finally {
    try { await restoreForgedManifest(session) } catch {}
    await session?.close()
  }
}

try {
  await runRuntimeUnavailableProof()
  await runMainProof()
  const artifacts = resolve('artifacts')
  mkdirSync(artifacts, { recursive: true })
  writeFileSync(
    resolve(artifacts, 'ce-bridge-structural-browser.json'),
    JSON.stringify({ ...evidence, generatedAt: new Date().toISOString() }, null, 2) + '\n',
  )
  console.log('Task 7 CE-BRIDGE structural browser proof PASS.')
} catch (error) {
  console.error(`Task 7 CE-BRIDGE structural browser proof failed closed: ${error?.message ?? error}`)
  process.exitCode = 1
}
