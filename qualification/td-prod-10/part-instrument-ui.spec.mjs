import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { startRepositoryStaticServer } from './support/static-server.mjs';

const DOCUMENT = `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body>
<div id="assignment"></div><button id="play" hidden>Atanan sesleri çal</button>
<script src="/vendor/st-score-audio/st-score-audio-engine.js"></script><script type="module">
import { mountPartInstrumentAssignmentUi } from '/browser-tests/support/ses249-teacher/src/partInstrumentAssignmentUi.js';
import { preparePartInstrumentAssignment } from '/browser-tests/support/ses249-teacher/src/services/musicXmlPartInstrumentAssignment.js';
import { SES249_SOURCE_XML, SES249_FIXTURE } from '/browser-tests/support/td-prod-10-generated-fixture.mjs';
import { createPlaybackPlanResolver } from '/src/playback/playbackPlanResolver.js';
import { createStudentPlaybackPort } from '/src/playback/studentPlaybackPort.js';
import { createWebAudioPianoEngine } from '/src/playback/webAudioPianoEngine.js';
import { createScoreAudioVoiceAdapter } from '/src/playback/scoreAudioVoiceAdapter.js';
let upload = Object.freeze({musicXml:SES249_SOURCE_XML}), pkg, context;
const factory = () => context ??= new AudioContext();
const engine = createWebAudioPianoEngine({audioContextFactory:factory,audioContextSupported:true,scoreAudioVoice:createScoreAudioVoiceAdapter({runtime:globalThis.STScoreAudioEngine,audioContextFactory:factory})});
const port = createStudentPlaybackPort({playbackPlanResolver:createPlaybackPlanResolver(),engine});
const handle = mountPartInstrumentAssignmentUi({root:document,host:document.querySelector('#assignment'),getUpload:()=>upload,
 prepareUpload:async musicXml=>Object.freeze({musicXml}),onApply(next){upload=next;pkg={...SES249_FIXTURE.package,content:{...SES249_FIXTURE.package.content,score:{format:'musicxml',data:upload.musicXml}}};document.querySelector('#play').hidden=false;},
 onRestore(original){port.disposePackage(pkg);upload=original;document.querySelector('#play').hidden=true;}});
document.querySelector('#play').onclick=()=>port.playPackage(pkg);
globalThis.__SES249_NATIVE__={port,engine,preparePartInstrumentAssignment,get source(){return SES249_SOURCE_XML},get upload(){return upload},get pkg(){return pkg}};
document.documentElement.dataset.ready='true';
</script></body></html>`;

test('SES-249 native Teacher assignment preserves Vals, produces real Student audio and supports namespaced XML', { timeout: 120000 }, async () => {
  const server = await startRepositoryStaticServer();let browser;
  try {
    browser = await ({ chromium, webkit }[process.env.ST_BROWSER ?? 'chromium']).launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const proof = { starts: [], analysers: [] };globalThis.__SES249_AUDIO__ = proof;
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function(destination, ...args) {
        if (destination === this.context.destination) {
          const analyser = this.context.createAnalyser();connect.call(this, analyser);connect.call(analyser, destination);proof.analysers.push(analyser);return destination;
        }
        return connect.call(this, destination, ...args);
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function(...args) { const result = start.apply(this, args);proof.starts.push(this.buffer?.length);return result; };
    });
    await page.route('**/ses249-native.html', route => route.fulfill({ contentType: 'text/html', body: DOCUMENT }));
    await page.goto(server.baseUrl + '/ses249-native.html');
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    await page.getByRole('button', { name: 'Partilere enstrüman ata', exact: true }).click();
    await page.getByLabel('Voice (P1)', { exact: true }).selectOption('VIOLIN');
    await page.getByLabel('Voice (P2)', { exact: true }).selectOption('GRAND_PIANO');
    await page.getByRole('button', { name: 'Enstrüman atamasını önizle', exact: true }).click();
    await page.getByRole('button', { name: 'Enstrüman atamasını uygula', exact: true }).click();
    await page.getByRole('button', { name: 'Atanan sesleri çal', exact: true }).waitFor({ state: 'visible' });
    const evidence = await page.evaluate(() => {
      const t = globalThis.__SES249_NATIVE__, p = t.port.getScoreFollowPlaybackContextForPackage(t.pkg);
      const bodies = xml => Array.from(new DOMParser().parseFromString(xml, 'application/xml').documentElement.children).filter(n => n.localName === 'part').map(n => new XMLSerializer().serializeToString(n));
      return { sameBodies: JSON.stringify(bodies(t.source)) === JSON.stringify(bodies(t.upload.musicXml)), measures: p.plan.measures.length, notes: p.plan.notes.length, mapping: p.partInstruments };
    });
    assert.deepEqual(evidence, { sameBodies: true, measures: 108, notes: 783, mapping: { P1: 'VIOLIN', P2: 'GRAND_PIANO' } });
    await page.getByRole('button', { name: 'Atanan sesleri çal', exact: true }).click();
    await page.waitForFunction(() => {
      const p = globalThis.__SES249_AUDIO__;
      return globalThis.__SES249_NATIVE__.engine.getCurrentBeat() > 0 && p.starts.length >= 2 && p.starts.every(n => n > 0) && p.analysers.filter(a => { const v = new Float32Array(a.fftSize);a.getFloatTimeDomainData(v);return v.some(n => Math.abs(n) > .00001); }).length >= 2;
    }, null, { timeout: 45000 });
    await page.evaluate(() => globalThis.__SES249_NATIVE__.engine.pause());
    const before = await page.evaluate(() => globalThis.__SES249_AUDIO__.starts.length);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Atanan sesleri çal', exact: true }).click();
    await page.waitForFunction(before => globalThis.__SES249_AUDIO__.starts.length > before, before);
    await context.setOffline(false);
    await page.evaluate(() => globalThis.__SES249_NATIVE__.engine.pause());
    const ns = await page.evaluate(async () => {
      const prefixed = '<mx:score-partwise xmlns:mx="urn:musicxml-test"><mx:part-list><mx:score-part id="lead"><mx:part-name>Voice</mx:part-name></mx:score-part><mx:score-part id="bass"><mx:part-name>Voice</mx:part-name></mx:score-part></mx:part-list><mx:part id="lead"><mx:measure number="1"><mx:note><mx:pitch><mx:step>D</mx:step><mx:octave>5</mx:octave></mx:pitch><mx:duration>1</mx:duration></mx:note></mx:measure></mx:part><mx:part id="bass"><mx:measure number="1"><mx:note><mx:pitch><mx:step>C</mx:step><mx:octave>3</mx:octave></mx:pitch><mx:duration>1</mx:duration></mx:note></mx:measure></mx:part></mx:score-partwise>';
      let prefixedRejected = false;
      try { await globalThis.__SES249_NATIVE__.preparePartInstrumentAssignment({ musicXml: prefixed, assignments: [] }); } catch (error) { prefixedRejected = error.message === 'part-instruments-invalid-xml'; }
      const xml = prefixed.replace(/(<\/?)mx:/g, '$1').replace('xmlns:mx=', 'xmlns=');
      const result = await globalThis.__SES249_NATIVE__.preparePartInstrumentAssignment({ musicXml: xml, assignments: [{ partId: 'lead', instrumentId: 'VIOLIN' }, { partId: 'bass', instrumentId: 'GRAND_PIANO' }] });
      const doc = new DOMParser().parseFromString(result.derivedMusicXml, 'application/xml');
      return { prefixedRejected, markerNamespace: doc.getElementsByTagNameNS('urn:musicxml-test', 'miscellaneous-field')[0]?.namespaceURI, notes: doc.getElementsByTagNameNS('urn:musicxml-test', 'note').length, errors: doc.getElementsByTagName('parsererror').length };
    });
    assert.deepEqual(ns, { prefixedRejected: true, markerNamespace: 'urn:musicxml-test', notes: 2, errors: 0 });
    await page.getByRole('button', { name: 'Enstrüman atamasını geri al', exact: true }).click();
    assert.equal(await page.evaluate(() => globalThis.__SES249_NATIVE__.upload.musicXml === globalThis.__SES249_NATIVE__.source), true);
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser?.close();await server.close(); }
});
