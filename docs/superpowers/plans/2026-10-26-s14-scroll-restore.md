# S14 delayed scroll restoration

Approved scope: correct delayed browser anchoring after an iframe height write without undoing newer user input. Preserve the 140 ms settle delay, editor menus, source lifecycle and all musical behavior. Fresh isolated clone on main a6beb475080863872c896ebf9b2c3caa072ee01d; no AGENTS.md found.

1. Extend the existing VM harness with delayed anchoring and prove the current implementation misses the next-frame shift.
2. Add one bounded deferred recheck. Invalidate pending restoration on fresh user input in the parent or editor and on superseding geometry/lifecycle changes. Do not prevent default input or disable root anchoring globally.
3. Verify delayed restoration, newer wheel/touch/keyboard/pointer input, hidden frame and desktop transitions. Run focused suites, full repository tests, production build and existing mobile browser checks when available.
4. Review the final diff and prepare a draft PR. Do not merge or deploy. Physical iPhone Safari remains a separate unverified acceptance check.

The old PR's root-CSS assertion has no matching implementation and does not establish a requirement to alter global CSS. Reuse its behavioral reproduction, not that assertion or old branch contents wholesale.

## Validation

- RED: historical delayed-anchor reproduction fails on main (327 instead of 240).
- Unsafe old PR diagnostic overwrites newer wheel scroll from 300 to 240; revised implementation preserves 300.
- Focused four-file suite: 33 pass, zero fail.
- Final full `CHROME_BIN=/tmp/s14-chrome-wrapper npm test`: 3137 total, 3106 pass, zero fail, 31 skipped. An earlier environment-only missing-Chromium failure was resolved by supplying a temporary test browser; a handler-name source assertion was replaced by behavioral coverage in the production VM harness.
- `npm run build`: successful. Existing bundle-size warning retained.
- Real Chromium 153: production scroll-settle, mobile menu host-occlusion and Smoosic production/source-refresh scripts successful. Browser used this environment's proxy and test-only certificate allowance to load existing remote assets. Repository dependencies and production browser security were unchanged.
- Independent review: visualViewport cancellation finding resolved; no remaining material findings. Physical iPhone Safari and remote CI/Sonar remain unverified by these local checks.

## Follow-up after CI failure (supersedes deferred replay design above)

CI's menu proof timed out before host occlusion. A read-only browser trace showed it starts scrolling while the editor still says 'Editör başlatılıyor…'. The old deferred replay also overwrites a newer programmatic scroll (300 -> 240), even before its scroll event is delivered. Cancelling on input or delivered scroll alone is insufficient.

Final design removes asynchronous scrollTo completely. Before an iframe height write, a bounded lease temporarily applies overflow-anchor:none!important to the parent scrolling element. It lasts across one full rendering frame, then restores the previous inline value/priority. Existing synchronous restoration remains as a fallback; no permanent CSS or input interception is added. Native support on physical iPhone Safari remains unverified.

The menu proof now waits for renderer readiness, enabled controls and actual geometry stability over the existing 140 ms settle window. No timeout extension or bypass. Tests cover scroll without an input event, scroll before event delivery, anchoring prevention, original style/priority restoration and preservation of a newer external style value.

Fresh verification: 39 focused tests pass; full suite 3143 total / 3112 pass / 0 fail / 31 skipped. Production package refreshed with prepareSmoosicEditor + vite build + composition manifest. Real Chromium menu occlusion, production scroll-settle and Smoosic production/source refresh proofs pass. Independent review found no material blockers; optional priority-only ownership edge remains a low-risk observation.

Sonar's earlier 0% new-code coverage was caused by anonymous VM script attribution. The VM now names the real production source file. Pinned c8@12.0.0 reports 90.7% line coverage for viewport-fit.js; every changed executable line is covered. This is local LCOV evidence, not a remote Sonar PASS claim.

## Approved CI browser startup repair

Current head 2c96b38 has green test-and-build but Sonar coverage exits before scanner execution: the existing CE fixture cannot obtain a page via /json/list within its startup deadline. Repair only test infrastructure: replace TCP/HTTP/WebSocket discovery with Chrome's supported remote-debugging-pipe transport, create/attach a fresh target through CDP, keep the 20s overall deadline/22s process watchdog, retain exact fixture assertions and c8 coverage. Add failure-path framing, deadline, early-exit and malformed-transport tests plus a real Chrome regression with HTTP discovery unavailable. No application code, dependencies, scanner exclusions or quality thresholds change. Context7 was attempted but quota-blocked; official Puppeteer LaunchOptions and PipeTransport source confirm the pipe transport.

Resumed verification: Chromium 143 real-iframe and pipe failure suites: 14/14 pass. The previous helper fails when DevTools HTTP discovery is unavailable; the new helper completes the exact PASS proof. Full serialized c8@12.0.0 suite is running. One unrelated queue-safety failure was reproduced as an existing empty sentinel directory in the restored workspace; the unchanged suite passes 21/21 with a fresh isolated SESLITAB_MUSICXML_DIR. No storage data or production code was changed. Full Firebase-emulator coverage and the Sonar scanner must be verified on the final remote head; local Java is 17 rather than CI's required 21. Independent review of the transport found no material blockers.
