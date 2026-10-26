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
