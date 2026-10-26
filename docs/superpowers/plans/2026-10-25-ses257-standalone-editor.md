# SES-257 standalone editor implementation plan

Goal: Nota Düzenle opens without a parent PDF/XML source, retains native XML Open/Save and isolates independent files from canonical SesliTab revisions.

Spec: user-approved six-section plan in this conversation; Notion https://app.notion.com/p/4042be2e5664811ab1c0fca1d72ee55e and Linear SES-257.

Baseline main: 806c9ad4a8d298ff9a3e3d2785bd836e5c037eab (tree equals local 92fe5ff). Dedicated scratch branch codex/smoosic-standalone-safe-session. Preserve prior untracked build assets and lockfiles; never publish them.

1. Isolate native editor imports from canonical source; reject cross-source apply.
2. Keep the editor visible without source; existing pinned Smoosic default measure contains rests. Disable canonical Apply until a completed current-source import exists.
3. Preserve native XML Open/Save and cancellation. Observe native selection at document capture, before production MusicXML compatibility interception.
4. Preserve independent work across parent source/reset. Explicit confirmed load-current replaces it. Invalidate pending apply and check revision after asynchronous structural runtime preparation. Guard compatibility normalization and serialize score changes so older imports cannot finish over newer ones.
5. RED/GREEN behavioral regressions, full Node suite, production build, Chromium/WebKit E2E. Physical iPhone Safari remains manual acceptance.
6. Independent review, exact-head CI/Sonar, release validation. A draft PR does not authorize merge/deploy or establish native acceptance.

Global constraints: no new services/dependencies, engine version/pin changes, OMR/Audiveris pipeline, Firebase/auth, Secure Delivery, musical engine or Student package changes. XML canonical state and authenticated homework sending retain existing owners.

Review focus: real capture/redispatch ordering; delayed XML reads and renderer changes; pending structural apply; restoring canonical source while import waits; reset must not retain an old canonical score.

Ruling: this already isolated scratch clone uses a fresh feature branch rather than another worktree; preserve its existing generated assets. No reinstall is needed.
Ruling: native invalid-file selection conservatively detaches before parsing, preserving the previous editor content but requiring explicit canonical restore; cost is one extra confirmation after invalid selection, rather than wrong-source publication.
Ruling: independent imports require document capture plus bounded generation guards in existing mobile host/compatibility wrappers. Smoosic package internals and versions remain unchanged.
