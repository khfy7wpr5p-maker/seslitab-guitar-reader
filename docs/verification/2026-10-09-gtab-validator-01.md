# GTAB-VALIDATOR-01 Verification Report — 2026-10-09

## Scope

GTAB-VALIDATOR-01 unifies Guitar TAB export validation across canonical Part / Staff / Voice identity, score inventory/editor preparation, teacher export readiness, final handoff, semantic parity, and physical string/fret validation.

Baseline authority: `main` at `35775290be2fd39c7694f8eec06bc090acb3d9c1`.

Final qualification authority is the exact PR head containing this report. The report intentionally does not hard-code transient GitHub Actions run IDs; completion requires every named exact-head gate below to be GREEN for that commit.

No merge or deploy is authorized by this report.

## Acceptance evidence

| Requirement | Evidence | Status contract |
| --- | --- | --- |
| Exact Part / Staff / Voice identity | `tests/guitarTabCanonicalIdentity.test.js`, `tests/gtabValidator01IdentityIntegration.test.js` | Confirm only when exact-head Node suite is GREEN. |
| Safe implicit Staff 1 / Voice 1 only | canonical identity + inventory integration tests; multi-staff/multi-voice omissions fail closed | Confirm only when exact-head Node suite is GREEN. |
| Immutable source MusicXML | inventory integration, validator regression, browser proof | Source bytes must remain unchanged. |
| One unified export validator | `src/services/guitarTabExportValidator.js`; handoff and teacher UI delegate to it | No duplicate export-validation authority may remain in handoff/UI. |
| Written semantic parity | validator semantic keys + existing GTAB-10C Semantic Parity / Partitura 1.9.0 oracle | GTAB-10C Semantic Parity workflow must be GREEN. |
| Physical string/fret vs sounding pitch | validator PHYSICAL category tests and browser proof | Wrong physical octave/position must fail closed. |
| Duplicate technical evidence | validator tests/regression | Duplicate `<technical>`, `<string>`, or `<fret>` must never pass by first-match selection. |
| Selected-target isolation | `tests/gtabValidator01Regression.test.js` and handoff regression | Unsupported events outside selected voice may not poison selected export; selecting the unsupported voice still fails closed. |
| Teacher export readiness | `tests/guitarTabTeacherAuthoring.test.js` | Complete assignments alone are insufficient; validator PASS is required. |
| Safe UI failure evidence | teacher workspace state exposes only bounded category/code and mapped Turkish status text | No raw source XML or stack trace may be surfaced. |
| Browser qualification | `npm run test:gtab10b-browser`, `npm run test:gtab-validator-browser` | Both real-browser gates must be GREEN. |
| Runtime provenance | existing GTAB-04 exact-SHA and build runtime verification | Pinned Guitar TAB Editor provenance must remain unchanged. |
| Dependency security | existing Dependency Security workflow | Must be GREEN. |
| Regression / Sonar | existing Regression Quality workflow, including Playwright and Sonar scan | Workflow must finish GREEN; a cancelled coverage/scan is not acceptance. |
| Full integration | existing CI workflow including Node suite, browser gates, production build, runtime/build composition checks, and Student App Chromium/WebKit E2E | Entire exact-head CI must be GREEN. |

## Focused verification commands

```text
node --test tests/guitarTabCanonicalIdentity.test.js
node --test tests/gtabValidator01IdentityIntegration.test.js
node --test tests/guitarTabExportValidator.test.js
node --test tests/editorGuitarTabHandoff.test.js tests/gtabOctaveHandoffValidation.test.js
node --test tests/guitarTabTeacherWorkspaceUi.test.js tests/guitarTabTeacherAuthoring.test.js
node --test tests/gtabValidator01Regression.test.js
npm test
npm run test:gtab10b-browser
npm run test:gtab-validator-browser
npm run build
```

Server-backed qualification is authoritative for GTAB-10C Semantic Parity, Dependency Security, Regression Quality/Sonar, exact-SHA qualification, and the complete CI matrix.

## Review constraints

- Source MusicXML is immutable authority; identity completion is derived editor input only.
- No auto-fingering was introduced.
- No new XML parser or heavy browser dependency was introduced.
- Ambiguous/stale identity remains fail-closed.
- Written pitch is not rewritten to satisfy a physical guitar position.
- Partitura remains a read-only semantic oracle; physical string/fret authority remains in the validator/editor contract.
- Existing public handoff error compatibility is preserved while machine `category` / `code` remain available.
- No merge/deploy action is part of GTAB-VALIDATOR-01 verification.

## Completion rule

GTAB-VALIDATOR-01 is ready for merge approval only when the exact PR head containing this report has all required GitHub checks completed successfully, including full CI and Regression Quality/Sonar. Any cancelled, skipped due to an upstream failure, or failing required gate blocks readiness.
