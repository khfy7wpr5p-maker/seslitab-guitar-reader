# Execution ledger — plan: docs/superpowers/plans/2026-10-25-ses226-teacher-navigation.md

- Authorized: implement approved six steps; PR for review; no merge/deploy.
- Dedicated clean clone and feature branch; no user-owned checkout changed. Native skill helper scripts have no executable local path; ledger and tests recorded directly here.
- Pre-flight: shell -> panel navigation -> app reset share visibility, not domain state; existing composer and musical engines retain ownership. Legacy embedded hosts retain old result-tab behavior; production uses the new tablist.
- Baseline npm ci completed with unchanged package/lockfile. Full npm test running before production edits.
- Task 1: baseline 3092 total: 3055 pass / 36 skip / 1 missing-Chromium failure. New navigation module test RED (missing module), then GREEN; legacy embedded-host suites preserved.
- Tasks 2–4: persistent tablist above input; existing panels remain mounted; app reset no longer hides teacher access. XML always remains available in the new production composition. Dynamic button binding is idempotent; arrows/Home/End use native focus.
- Task 5: real composer navigation during pending apply, pending send, failed-send exact retry and undo PASS. Focused auth/workspace/TAB/violin/composer tests 51/51 before final review fixes.
- Final independent review: two Important defects, no Critical findings. Reset retained stale XML authority; reachable score-view could hide XML and leave teacher selection inconsistent.
- Final fixed reset: clear source in presentation reset, preserving composer/panel identity. reset helper regression RED missing export -> GREEN. Existing Smoosic observer remains the authority invalidation owner; its code is unchanged. Real MusicXML/editor/reset browser test added for native CI.
- Final fixed score-view: regression through actual activateScoreView RED (XML hidden) -> GREEN. Score view clears teacher selection without hiding XML; teacher selection hides the score panel. Renderer/music code unchanged.
- Final Ruling: preserve production-reachable score-view rather than retire it — it is loaded transitively by package3Ui; only its presentation selection is reconciled. Cost: existing score-view remains an additional UI surface.
- Final Ruling: prepare existing production runtime assets in Regression Quality before native tests — the new real editor/download test needs built Smoosic assets, absent in clean dev checkout. Cost: longer browser job; no runtime pins, engines or deployment settings change.
- Full production npm run build PASS; final Vite rebuild after review fixes PASS. Local browser downloads (Chromium, shell and WebKit batch) return truncated ZIPs; native execution blocked. APT browser installation was also unavailable in this container. No local native-browser PASS claimed.
- Installing no-save Playwright in the app node_modules disturbed transitive packages and exposed two dependency test failures; restored exact npm ci and moved Playwright to isolated /tmp prefix. No package/lockfile changes included. Full restored suite pending.
- Deferred minors: none.
- Final restored npm test: 3100 total, 3063 pass / 36 skip / 1 pre-existing missing-Chromium environment failure. The two transitive dependency failures disappeared after exact install restoration. Final affected suites: 53/53 PASS. git diff --check PASS. Native CI remains required; draft PR only, no release-readiness claim.
