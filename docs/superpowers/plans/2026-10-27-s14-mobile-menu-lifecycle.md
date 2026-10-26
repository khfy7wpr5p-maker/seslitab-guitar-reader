# S14 Mobile Menu Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this approved plan in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the native desktop sidebar out of the mobile score on first load and make closed overlays reject pointer/keyboard focus.

**Architecture:** Target the actual outer `#controls-left` while it is a direct `.media` child; retain the existing body portal on Menu activation. Let the nested group inherit visibility and pointer-events from its outer shell. Extend the existing built-application browser qualification rather than adding a production subsystem.

**Tech Stack:** Existing CSS, Node tests and Chrome CDP proof; no new dependencies.

**Spec:** https://app.notion.com/p/4052be2e566481d19d06d44a42229da1?pvs=204 (user-approved three-step scope, 2026-10-27).

## Global Constraints

- Base `main@728c43269bb4b142722a6a327b6344a79db4ebb6`; no AGENTS.md found.
- Production surface: `experiments/smoosic-mobile/public/mobile.css` only.
- Preserve musical/XML/audio/assignment/OMR authority, viewport timing and dependency/quality settings.
- No merge/deploy in this implementation phase. Physical iPhone Safari remains a human acceptance check.
- Existing logo 404 is outside this change.

## Review Focus

- First boot before any Menu click: native sidebar must not occupy score width.
- Large parent scroll / iframe growth: hidden menu remains absent and open touch targets stay bounded.
- Closed descendants: no invisible hit target or keyboard focus, including retained focus.
- Repeated open/close and reopen: real menu starts at top and first item remains visible below the host header.
- Desktop and return to mobile: menu returns to its original parent and mobile hiding resumes.

## Task 1: CSS repair with behavioral regression proof

**Files:** modify `experiments/smoosic-mobile/public/mobile.css`, `scripts/verifyS14MobileMenuHostOcclusionBrowser.js`, `tests/stageS14SmoosicMobileLayout.test.js`.

**Interfaces:** consumes the pinned Smoosic DOM, existing Menu portal and CDP helper; produces the same browser proof command with stricter lifecycle assertions.

- [x] Add first-load and pre-click scrolled assertions to the browser proof; require the actual shell to exist rather than treating a failed selector as width zero. Add closed hit/focus and desktop round-trip checks.
- [x] Run `CHROME_BIN=/tmp/seslitab-menu-verification/chrome-wrapper node scripts/verifyS14MobileMenuHostOcclusionBrowser.js`. Expected RED: initial sidebar occupies about 148px.
- [x] Replace the obsolete shell selector with mobile `.media > #controls-left { display: none !important; }`; change inner-group visibility/pointer-events to inherit. Update the obsolete source contract.
- [x] Refresh the build and run the same browser proof. Expected GREEN: first-load score width equals iframe width, open buttons >=44 and <=64px, closed pointer/focus rejected, desktop restoration and return pass.
- [x] Run focused S14 suites, full npm test and production build; inspect diff and obtain independent review. Commit the bounded change.

## Verification ledger

- Baseline: `CHROME_BIN=/tmp/seslitab-menu-verification/chrome-wrapper npm test` -> 3149 total / 3118 pass / 0 fail / 31 skipped.
- Pre-flight: no shared interfaces (one bounded task).
- RED 1: first-load proof rejects actual native menuWidth 147.97 / scoreWidth 232.03 / viewportWidth 380 before any click.
- RED 2 after the initial-shell repair only: closed menu still reports pointerTarget=true and focusAccepted=true.
- Test actionability diagnostic: the first raw touch was at parent y=67.72 while the sticky header ended at 151.55; the helper now waits for actual parent/iframe hit tests using the unchanged deadline.
- GREEN: full `npm run build` exit 0; existing bundle-size warning remains. Source and shipped CSS are identical.
- GREEN: built-app menu proof passes first boot, pre-click host scrolling, real touch opening, two close/reopen cycles with no hidden hit/focus, desktop restoration and mobile return/reopen.
- GREEN: focused S14 suites 42/42; final full npm test 3149 total / 3118 pass / 0 fail / 31 skipped.
- Native execution on the existing dedicated clone and a new branch preserves all existing untracked generated files; none are staged.
- Independent whole-branch review: no production CSS defects; two Important qualification gaps identified (retained focus and reopening from nonzero scroll).
- Final: fixed retained-focus/scrolled-reopen qualification — new setup assertion first RED with focused=false/scrollTop=0; then real descendant focus plus scrollTop=179 is verified before closure. One programmatic close preserves descendant focus until the real close handler, and one close uses real touch. Every reopen asserts scrollTop=0, visible/hittable first item and bounded button heights. Browser proof GREEN; post-review whole suite 3149 total / 3118 pass / 0 fail / 31 skipped.
- Final: Ruling: physical iPhone Safari remains human acceptance, as approved — automated Chrome cannot certify that device; cost if wrong is a remaining device-specific behavior discovered during acceptance.
- Final: Ruling: musical/XML/audio/assignment/OMR manual end-to-end acceptance remains outside this CSS-only change — their production source is unchanged and the existing full suite passes; cost if wrong is an indirect UI interaction requiring its own acceptance check.
- No deferred minor findings. Local task complete; draft PR/remote CI and physical acceptance are distinct states. Merge/deploy: not performed.
