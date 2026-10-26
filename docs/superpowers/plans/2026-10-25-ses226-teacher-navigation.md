# SES-226 Teacher navigation implementation plan

Goal: persistent Ödev Gönder / Gitar TAB / Keman navigation above Dosya Aç, preserving existing panels, MusicXML, downloads, authenticated delivery and musical authority.

Spec: approved SES-226 Notion handoff https://app.notion.com/p/3f62be2e566481048e2bfff6290861ba and the six-step plan approved in this conversation. Execute inline with superpowers:executing-plans.

Baseline: 8a51ebc9449da2feeb581d820addd808003a84d2. No engine, auth, delivery service, package, dependency/lockfile, deployment or infrastructure changes. Preserve original IDs and ARIA relationships; no composer remount on navigation. Keep compatibility for embedded hosts without the new navigation.

1. Characterize current behavior: existing teacher workspace, mount/security, TAB/violin and composer tests; full baseline suite. Add failing behavioral navigation tests before production edits.
2. Persistent shell: index.html and src/style.css put the teacher tablist above input. Keep actual panels in place. Make default assignment access and reset independent from score-result visibility. Test initial and post-reset access in the real page.
3. Panel seam: src/teacherToolsNavigation.js owns only selection/visibility and keyboard navigation; bind existing package4Ui/package5Ui entry points. Tests assert same panel/control identity, missing-target abstention, idempotent binding and arrows/Home/End.
4. MusicXML: retain xml-output and download source state. New teacher navigation never hides XML; preserve legacy embedded host behavior. Test XML contents, download visibility and selection after every navigation.
5. State/recovery: exercise actual composer with navigation during pending instrument apply, pending send, errors and exact retries. Assert original upload/draft/recipient and one send survive; no side effects from selection. Retain existing file replacement/destruction/undo tests.
6. Qualification: focused Node suites, full npm test, production build, Chromium/WebKit protected baseline including navigation tests, scope review. Record unavailable environments without a PASS. Fresh whole-branch reviewer before draft PR; no merge or production deployment.

Review focus: reset versus authentication visibility; dynamic button binding order; active-panel focus; in-flight apply/send and idempotency; immutable source/download identity. Each is covered in navigation or composer integration/browser tests.
