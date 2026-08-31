# Stage H — Review Playback

## Purpose

Stage H adds an explicitly non-definitive playback preview for a bounded subset of existing Package 2D `REVIEW` results.

It does not create a new quality engine and does not change Package 2D decisions. `REVIEW` remains `REVIEW`; Stage H only decides whether the existing playback consumer can be offered as a review aid.

## Product copy

When review preview is available:

- action: **`İnceleme İçin Dinle`**
- visible status: **`Doğrulanmamış önizleme`**

This wording must not be replaced by PASS/approval language.

## Routes

### DEFINITIVE

Existing playback gate decision is `ACCEPT` and the exact gate explicitly reports:

- `allowed === true`
- `definitive === true`
- `automaticAllowed === true`

Normal playback remains available.

### REVIEW_PREVIEW

Existing playback gate decision remains `REVIEW`.

Preview is available only when the existing gate already provides all required bounded evidence:

- review reason is one of the existing `SOURCE_NOT_VERIFIED`, `REVIEW_REQUIRED`, or `CANONICAL_REVIEW` reasons;
- the playback consumer boundary is already mapped;
- `allowed`, `definitive`, and `automaticAllowed` are all `false`;
- a registered quality report exists;
- `structurallyValid === true`;
- `reliable === true`;
- quality state is not `unreliable`;
- the existing canonical playback classification has no blocked notes.

The route explicitly reports:

- `definitivePlaybackAllowed: false`
- `reviewPreviewAllowed: true`
- `automaticAllowed: false`
- `teacherReviewRequired: true`

### REVIEW_WITHHELD

If Package 2D says `REVIEW` but the bounded preview evidence above is missing or unsafe, the product remains in REVIEW. Stage H does **not** relabel it as product BLOCK.

The review-preview action is disabled and the UI states:

**`İnceleme için dinleme kullanılamıyor`**

Examples include missing quality reports, structural evidence that is not explicitly valid/reliable, a pending playback boundary, canonical blocked notes, or malformed REVIEW permission flags.

### BLOCKED

Package 2D `BLOCK`, malformed `ACCEPT`, invalid canonical input, missing gate decisions, or gate-resolution failure remain fail-closed.

Visible status:

**`Kullanım engellendi`**

No preview or definitive playback is authorized.

## UI wiring

`src/app.js` keeps the exact parsed canonical `NoteObject[]` as the playback input.

For MusicXML/OMR results it:

1. prepares the existing Package 2C/2D quality evidence;
2. resolves the Stage H route over that exact note-array identity;
3. exposes normal playback for `DEFINITIVE`;
4. exposes `İnceleme İçin Dinle` plus `Doğrulanmamış önizleme` for `REVIEW_PREVIEW`;
5. disables playback for `REVIEW_WITHHELD` and `BLOCKED`;
6. keeps TAB-mode legacy playback behavior outside this MusicXML quality-gated Stage H route.

Stage H does not duplicate MusicXML parsing, note identity, or Web Audio playback logic.

## Preserved boundaries

Stage H does not:

- upgrade `REVIEW` to `ACCEPT` or PASS;
- change Package 2C/2D quality evidence or policy;
- change TTS gating;
- create teacher approval;
- create or alter Package 12 share authorization/eligibility;
- authorize student delivery;
- change Guitar TAB or violin consumer gates;
- change renderer semantics;
- mutate canonical notes or MusicXML;
- add dependencies;
- change OMR/provider/backend/database/auth/deployment behavior.

`Doğrulanmamış önizleme` is a review aid only, never musical truth or approval evidence.

## Completion gate

Stage H is complete only after:

1. focused Stage H regressions pass;
2. full repository tests pass;
3. production build passes;
4. real-browser runtime proof passes;
5. PR review/required checks are clear;
6. merge to protected main is explicitly authorized;
7. exact-main CI succeeds after merge.
