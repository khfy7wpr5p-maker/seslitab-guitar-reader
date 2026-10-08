Title: fix: preserve selected source key context in TAB MusicXML exports
Repository: khfy7wpr5p-maker/st-guitar-tab-editor
Head: fix/gtab10c-preserve-selected-key-context
SHA: e1fe771f4a1637c46dedf15a881f2bfcf260e9ae
Base: feature/gtab-10b-target-source-session (34851f3f1ec00d3804144f414090bcfab8314808; open PR #4 dependency)

GTAB-10C's pinned MuseScore-like comparison detects that TAB export drops an explicit source C-major key context. Preserve selected-part/staff key nodes and subsequent measure context changes, normalize staff identity to notation staff 1, and reject ambiguous or unsupported mid-measure key changes rather than losing them. Source bytes remain immutable; note/TAB/meter/measure output stays byte-identical apart from added key elements.

Validation: writer regression RED on the baseline, full Node tests 50/50 GREEN with the fix. Selected-staff and selected-part context tests prevent unrelated keys leaking into export. Actual SesliTab/Partitura pinned requalification is 3/3 PASS with reversible oracle identity projection.

This is a narrow follow-up on the reviewed PR #4 head, not a merged-main claim. Do not merge/deploy as part of this task.
