# Regression-safe quality baseline

This layer is intentionally observational. It must not replace or weaken the
existing Node tests, browser-proof scripts, OMR boundaries, deployment
configuration, renderer contracts, teacher revision authority or playback
policy.

## Playwright

The repository keeps its existing dependency lock unchanged. Playwright is
installed only inside the dedicated GitHub Actions job so that the first
baseline cannot change production dependency resolution.

Current protected flows:

1. SesliTab shell loads without a page-level JavaScript exception.
2. PDF, MusicXML and TAB input tabs remain reachable and switch correctly.
3. The built-in TAB sample can be loaded.
4. The TAB sample can still be converted to a visible rhythmic result.
5. The TAB input can still be cleared.

Local run:

```bash
npm ci
npm install --no-save --package-lock=false @playwright/test@1.63.0
npx playwright install chromium
npx playwright test --project=chromium
```

The baseline should grow only after a behavior is known to be working and worth
protecting. Do not encode unfinished behavior as a mandatory regression gate.

## SonarQube

`sonar-project.properties` defines a read-only analysis scope and excludes
generated/runtime artifacts. The initial baseline does not wait on the
SonarQube quality gate, so pre-existing technical debt cannot suddenly block
unrelated work.

For SonarQube Server, configure repository secrets:

- `SONAR_TOKEN`
- `SONAR_HOST_URL`

For SonarQube Cloud, configure:

- repository secret: `SONAR_TOKEN`
- repository variable: `SONAR_ORGANIZATION`

The Sonar project must already exist and use the project key:

`khfy7wpr5p-maker_seslitab-guitar-reader`

After the first analysis is reviewed, quality-gate blocking can be enabled in a
separate, explicitly reviewed change.
