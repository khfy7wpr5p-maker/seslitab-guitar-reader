import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import {
  startRepositoryStaticServer,
} from "./support/static-server.mjs";
import {
  TD_PROD_10_FIXTURE,
  SES248_FIXTURE,
  SES248_EXPECTED_EVENTS,
  SES249_FIXTURE,
} from "./support/td-prod-10-generated-fixture.mjs";

const E2E_PATH = "/__td-prod-10__/";
const E2E_DOCUMENT = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <base href="/">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>TD-PROD-10 Teacher → Student E2E</title>
    <script type="importmap">
    {
      "imports": {
        "@st/score-renderer-contracts": "/vendor/st-score-runtime/modules/contracts.js",
        "@st/score-renderer-core": "/vendor/st-score-runtime/modules/renderer-core.js",
        "@st/score-renderer-osmd": "/vendor/st-score-runtime/modules/adapter-osmd.js",
        "@st/score-renderer-browser-host": "/vendor/st-score-runtime/modules/browser-host.js",
        "opensheetmusicdisplay": "/vendor/st-score-runtime/modules/osmd-module-shim.mjs"
      }
    }
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script src="/vendor/st-score-audio/st-score-audio-engine.js"></script>
    <script type="module" src="/browser-tests/support/td-prod-10-e2e-bootstrap.mjs"></script>
  </body>
</html>`;

let server;
let baseUrl;

before(async () => {
  server =
    await startRepositoryStaticServer({
      htmlRoutes: Object.freeze({
        [E2E_PATH]: E2E_DOCUMENT,
      }),
    });
  baseUrl = server.baseUrl;
});

after(async () => {
  if (server) {
    await server.close();
  }
});

async function eventually(
  predicate,
  {
    timeoutMs = 10_000,
    intervalMs = 50,
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, intervalMs),
    );
  }
  return false;
}

async function visibleScoreSvg(page) {
  const svg =
    page.locator("#st-score-root svg").first();
  return (
    (await svg.count()) === 1 &&
    (await svg.evaluate(
      (element) =>
        element.getBoundingClientRect()
          .height > 0,
    ))
  );
}

async function assertNoAuthorityLeakage(page) {
  const html =
    await page.locator("#app").innerHTML();
  assert.equal(
    html.includes(
      TD_PROD_10_FIXTURE.score
        .package.packageId,
    ),
    false,
    "internal package identity must not leak to the student DOM",
  );
  assert.equal(
    html.includes("<score-partwise"),
    false,
    "raw MusicXML must not leak to the student DOM",
  );
  assert.equal(
    /firebase|bearer|secure_delivery|debug/iu
      .test(html),
    false,
    "provider/token/debug internals must not leak to the student DOM",
  );
}

await test(
  "SES-224 qualifies Smoosic SCORE + TAB in the real Student App without production changes",
  { timeout: 120_000 },
  async () => {
    const browserName =
      process.env.ST_BROWSER ?? "chromium";
    const browserType = {
      chromium,
      webkit,
    }[browserName];
    assert.ok(
      browserType,
      `Unsupported ST_BROWSER: ${browserName}`,
    );

    const browser =
      await browserType.launch({
        headless: true,
      });
    const context =
      await browser.newContext({
        viewport: {
          width: 390,
          height: 844,
        },
        deviceScaleFactor: 3,
      });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const telemetry = { starts: [], analysers: [] };
      globalThis.__SES248_AUDIO__ = telemetry;
      // Observe real native sample scheduling and the real output signal.
      // The analyser is inserted in series; no plan, sample or audio node is mocked.
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function(destination, ...args) {
        if (destination === this.context.destination) {
          const analyser = this.context.createAnalyser();
          connect.call(this, analyser);
          connect.call(analyser, destination);
          telemetry.analysers.push(analyser);
          return destination;
        }
        return connect.call(this, destination, ...args);
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function(...args) {
        const result = start.apply(this, args);
        telemetry.starts.push({ when: args[0], frames: this.buffer?.length ?? 0, rate: this.playbackRate.value });
        return result;
      };
    });
    const pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    try {
      const response =
        await page.goto(
          `${baseUrl}${E2E_PATH}`,
        );
      assert.equal(response?.status(), 200);
      assert.equal(await page.evaluate(() => globalThis.STScoreAudioEngine?.version), "0.2.0",
        "the qualification page must load the same real instrument runtime as current Student");

      await page
        .locator("[data-sign-in-email]")
        .fill(
          TD_PROD_10_FIXTURE.student
            .email,
        );
      await page
        .locator("[data-sign-in-password]")
        .fill(
          TD_PROD_10_FIXTURE.student
            .password,
        );
      await page
        .getByRole("button", {
          name: "Giriş Yap",
          exact: true,
        })
        .click();

      await page
        .getByRole("button", {
          name: "Benim Çalışmalarım",
          exact: true,
        })
        .waitFor();
      await page
        .getByRole("button", {
          name: "Benim Çalışmalarım",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name:
            TD_PROD_10_FIXTURE.piece
              .title,
          exact: true,
        })
        .click();

      assert.equal(
        await eventually(
          () => visibleScoreSvg(page),
        ),
        true,
        "teacher-delivered SCORE must render",
      );
      await page
        .locator(
          '#st-score-root[role="region"][aria-label="Nota"]',
        )
        .waitFor();
      assert.equal(
        await page
          .getByRole("tab", {
            name: "Nota",
            exact: true,
          })
          .getAttribute("aria-selected"),
        "true",
      );
      await page
        .getByRole("button", {
          name: "Dinle",
          exact: true,
        })
        .waitFor();

      const playbackEvidence =
        await page.evaluate(
          () =>
            globalThis
              .__SES_224_QUALIFICATION__
              ?.playback ?? null,
        );
      assert.deepEqual(
        playbackEvidence,
        {
          firstMidi: 61,
          sourceExact: true,
          scoreOnlyFirstMidi: 61,
          scoreOnlyHasTab: false,
        },
        "C-sharp must resolve as written C-sharp 4 / MIDI 61, never C-sharp 3 or C-sharp 5",
      );

      await page
        .getByRole("tab", {
          name: "TAB",
          exact: true,
        })
        .click();
      assert.equal(
        await eventually(
          () => visibleScoreSvg(page),
        ),
        true,
        "teacher-delivered TAB must render",
      );
      const tabRegionLabel =
        await page
          .locator("#st-score-root")
          .getAttribute("aria-label");
      const tabTexts = (
        await page
          .locator(
            "#st-score-root svg text",
          )
          .allTextContents()
      )
        .map((value) => value.trim())
        .filter(Boolean);
      assert.ok(tabTexts.includes("2"));
      assert.ok(tabTexts.includes("3"));
      assert.ok(tabTexts.includes("0"));
      assert.ok(tabTexts.includes("1"));

      await page
        .getByRole("tab", {
          name: "Akorlar",
          exact: true,
        })
        .click();
      await page
        .locator("#chord-board-title")
        .waitFor();
      assert.equal(
        (
          await page
            .locator(
              "#chord-board-title",
            )
            .textContent()
        )?.trim(),
        "C",
      );

      await assertNoAuthorityLeakage(page);
      await page.getByRole("button", { name: "← Geri", exact: true }).click();
      await page.getByRole("button", { name: SES248_FIXTURE.package.title, exact: true }).click();
      assert.equal(await eventually(() => visibleScoreSvg(page)), true, "24-measure SES-248 pilot must render in Student App");
      const pilotEvidence = await page.evaluate(() => {
        const proof = globalThis.__SES248_QUALIFICATION__;
        return { notes: proof.plan?.notes, measures: proof.plan?.measures.length, sourceExact: proof.sourceExact,
          partInstruments: proof.partInstruments };
      });
      assert.equal(pilotEvidence.sourceExact, true);
      assert.equal(pilotEvidence.measures, 24);
      assert.deepEqual(pilotEvidence.partInstruments, { P1: 'VIOLIN', P2: 'GRAND_PIANO' });
      assert.deepEqual(pilotEvidence.notes, SES248_EXPECTED_EVENTS, "all 189 Student playback pitches, onsets and durations must match the independently calculated source");
      await page.getByRole("button", { name: "Dinle", exact: true }).click();
      assert.equal(await eventually(() => page.evaluate(() => {
        const audio = globalThis.__SES248_AUDIO__;
        const positions = globalThis.__SES248_QUALIFICATION__.positions;
        const nonzeroSignal = audio.analysers.some(analyser => {
          const values = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(values);
          return values.some(value => Math.abs(value) > 0.00001);
        });
        return nonzeroSignal && audio.starts.length >= 2 &&
          audio.starts.every(source => source.frames > 0 && source.rate > 0) &&
          positions.some(position => position.playing && position.beat > 0);
      }), { timeoutMs: 15_000 }), true, "Dinle must schedule native sample buffers, advance musical position and produce a nonzero Web Audio signal");
      // A standalone SCORE uses the persistent Student navigation, not the
      // Piece Workspace's back control.
      await page.getByRole("button", { name: "Benim Çalışmalarım", exact: true }).click();
      await page.getByRole('button', { name: SES249_FIXTURE.package.title, exact: true }).click();
      assert.equal(await eventually(() => visibleScoreSvg(page)), true, '108-measure Vals renders after actual Teacher instrument assignment and delivery');
      const valsEvidence = await page.evaluate(() => {
        const proof = globalThis.__SES249_QUALIFICATION__;
        return { sourceExact: proof.sourceExact, measures: proof.plan?.measures.length,
          total: proof.plan?.notes.length, violin: proof.plan?.notes.filter(n => n.partId === 'P1').length,
          piano: proof.plan?.notes.filter(n => n.partId === 'P2').length, mapping: proof.partInstruments };
      });
      assert.deepEqual(valsEvidence, { sourceExact: true, measures: 108, total: 783, violin: 259, piano: 524, mapping: { P1: 'VIOLIN', P2: 'GRAND_PIANO' } });
      const beforeVals = await page.evaluate(() => globalThis.__SES248_AUDIO__.starts.length);
      await page.getByRole('button', { name: 'Dinle', exact: true }).click();
      assert.equal(await eventually(() => page.evaluate(before => globalThis.__SES248_AUDIO__.starts.length >= before + 2 &&
        globalThis.__SES249_QUALIFICATION__.positions.some(p => p.playing && p.beat > 0), beforeVals), { timeoutMs: 45000 }), true);
      await page.getByRole('button', { name: 'Benim Çalışmalarım', exact: true }).click();
      // Return to the original piece for its existing offline/reconnect checks.
      await page.getByRole("button", { name: TD_PROD_10_FIXTURE.piece.title, exact: true }).click();

      await page
        .getByRole("button", {
          name: "← Geri",
          exact: true,
        })
        .click();
      await context.setOffline(true);

      await page
        .getByText("Çevrimdışı", {
          exact: false,
        })
        .first()
        .waitFor();
      await page
        .getByRole("button", {
          name:
            TD_PROD_10_FIXTURE.piece
              .title,
          exact: true,
        })
        .click();
      assert.equal(
        await eventually(
          () => visibleScoreSvg(page),
        ),
        true,
        "teacher-delivered Piece must reopen offline",
      );

      await context.setOffline(false);
      await page
        .getByText("Çevrimiçi", {
          exact: false,
        })
        .first()
        .waitFor();

      await page
        .getByRole("tab", {
          name: "TAB",
          exact: true,
        })
        .click();
      assert.equal(
        await eventually(
          () => visibleScoreSvg(page),
        ),
        true,
        "TAB must remain usable after reconnect",
      );
      await assertNoAuthorityLeakage(page);

      await page
        .getByRole("button", {
          name: "← Geri",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name:
            TD_PROD_10_FIXTURE
              .scoreOnly.package.title,
          exact: true,
        })
        .click();
      assert.equal(
        await eventually(
          () => visibleScoreSvg(page),
        ),
        true,
        "score-only assignment must still render notation",
      );
      await page
        .locator(
          '#st-score-root[role="region"][aria-label="Nota"]',
        )
        .waitFor();
      assert.equal(
        await page
          .getByRole("tab", {
            name: "TAB",
            exact: true,
          })
          .count(),
        0,
        "score-only assignment must not gain a TAB view",
      );
      await page
        .getByRole("button", {
          name: "Dinle",
          exact: true,
        })
        .waitFor();
      await assertNoAuthorityLeakage(page);
      assert.equal(
        tabRegionLabel,
        "TAB",
        "selected TAB content must be announced as TAB, not notation",
      );
      assert.deepEqual(pageErrors, []);
    } finally {
      await context
        .setOffline(false)
        .catch(() => {});
      await context.close();
      await browser.close();
    }
  },
);
