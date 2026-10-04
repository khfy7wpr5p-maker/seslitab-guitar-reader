import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, webkit } from "playwright";
import {
  startRepositoryStaticServer,
} from "./support/static-server.mjs";
import {
  TD_PROD_10_FIXTURE,
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
  "SES-122 teacher-delivered SCORE + CHORD_BOARD survives real Student App online/offline journey",
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
        .getByRole("heading", {
          name: "Çalışmalar",
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
      const tabTexts = (
        await page
          .locator(
            "#st-score-root svg text",
          )
          .allTextContents()
      )
        .map((value) => value.trim())
        .filter(Boolean);
      assert.ok(tabTexts.includes("7"));
      assert.ok(tabTexts.includes("12"));

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
