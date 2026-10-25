# SDD ledger — plan: docs/superpowers/plans/2026-10-25-ses257-standalone-editor.md

User approved implementation and Notion/Linear recording. Created SES-257 and a private Notion draft with the six sections and research findings.

Initial RED evidence: no-source frame hidden; independent same-shape B publishes as A edit; new parent overwrites B. All three reproduced before source edits.

Initial focused GREEN: 49/49. Full initial suite: 3104 total, 3067 pass, 36 skip, 1 fail: ceBridgeFixtureSerialization real iframe requires missing Chromium (same documented baseline limitation). Initial production build passed before review fixes.

Independent reviewer ses257_review found four Important issues: native capture interception bypassed host bubble listener; Apply enabled before canonical restore completed; structural runtime await could publish stale authority; delayed import could overwrite newer native import. Added regression reproductions before corresponding fixes. Tests execute actual compatibility interceptor and actual mobile loader with browser/rendering seams simulated.

Native-browser acceptance, exact-head CI and Sonar are not yet claimed. No merge, deployment or production assignment writes.


## CI failure diagnosis and three authorized corrections

Candidate b00210c: S15 failed waiting for a second captured request after clicking a temporarily disabled Apply control. Protected browser baseline separately failed because Desktop Chrome targeted hidden mobile controls, and mobile WebKit buffer uploads emitted synthetic change events ignored by isTrusted-only detachment. Sonar passed; these were not a green release.

New RED regressions: disabled test buttons incorrectly dispatched clicks; synthetic B with leftover parent stamps remained canonical. Reproduced both before edits. Corrected the fixture to obey HTML disabled-click behavior, and detect parent events only during the active revision-stamped host import. Parent import replay is exercised through the actual host capture handler by the test fixture. S15 capture now waits/rechecks readiness atomically and records detailed timeout state. Mobile controls run in explicit mobile dimensions on both browser engines, with separate desktop workspace acceptance.

Initial follow-up focused tests: 56/56 pass. Full suite and exact-head CI pending for the follow-up SHA. No merge/deploy authorized by this correction.

Ruling: File event trust is not import provenance. Only an active, matching host transfer retains canonical binding; other selections detach even when automated. Cost if wrong: legitimate parent imports would be blocked, so the positive canonical flow remains in every affected host test.
Ruling: Mobile control tests explicitly emulate mobile dimensions; a separate desktop test preserves desktop layout coverage. The desktop application is not changed to expose a mobile-only toolbar.


Follow-up independent review found one Important active-transfer gap: a synthetic same-name B could reuse mutable parent stamps during import. Added a RED regression before fixing it. Parent transfers now carry an opaque CustomEvent detail object whose identity survives actual compatibility replay; active revision/stamp checks remain. A WeakSet recognizes genuine retired parent replay objects without granting them current authority. Added positive actual-compat replay and delayed replay regressions as well as the negative replacement case. This does not introduce a business/auth authority or change engine versions.

Final follow-up affected host/composer suites: 59/59 passed. The new S15 capture expression is executed against disabled/not-yet-imported/ready editor states in a VM test; disabled clicks do not arm a probe. Final full suite and prepared-assets/Vite build are being checked for the exact follow-up candidate. Desktop workspace plus mobile toolbar cases remain protected native CI acceptance, not locally claimed green.

Expanded affected host/composer/CE structural suite: 70/70 passed. Full-suite discovery exposed six CE fixture failures because its browser double omitted CustomEvent; added the standard CustomEvent detail behavior and disabled-click semantics to that fixture without weakening structural assertions. Final full suite rerun pending. No engine changes, no merge/deploy.

## Exact-head native follow-up (1f81627)

CI test-and-build, including the S15 real browser proof, passed. Protected baseline: 14 passed, 1 intentionally skipped desktop-only case on mobile, 1 failed. All mobile XML open/save and independent B/parent C cases passed on Chromium and WebKit. The sole failure is the added desktop assertion: `#smoo svg` first resolves to hidden `#piano-svg`, not the score. Pinned Smoosic svgPageMap.ts creates each real score SVG under `#smoosic-svg-div-N`; narrowed the assertion to page 0's direct SVG. CI failure is the RED reproduction; no production changes for this test-only correction. Sonar analysis job passed; latest revised head still requires fresh native evidence.

Local full suite before this selector-only correction: 3114 total, 3077 pass, 36 skipped, 1 environment failure (missing Chromium). Prepared editor assets and Vite production build passed. No merge/deploy.
