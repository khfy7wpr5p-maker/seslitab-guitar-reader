# SES-249 explicit part instrument assignment

## Approved design

Goal: teachers can assign supported sounds to existing MusicXML parts without altering musical events or the existing delivery package schema. Original uploads remain immutable; preview, explicit apply and undo are mandatory. Existing single-instrument assignments, SCORE/TAB, CHORD_BOARD, recipient isolation, idempotency and retries retain their behavior.

Representation: the derived MusicXML carries conventional score-instrument/MIDI declarations plus a single identification/miscellaneous field `seslitab-part-instruments-version=1`. This explicit opt-in prevents changing legacy playback semantics. No new PracticePackage fields, API endpoints, dependencies or infrastructure. The consumer validates all declared part IDs and instrument references. Supported sounds are GRAND_PIANO (GM program 1), CLASSICAL_GUITAR (25), VIOLIN (41). The violin follow target remains the existing explicit content.violin descriptor; polyphonic target events retain V1 abstention.

## Tasks and interfaces

1. Implement tested Teacher `preparePartInstrumentAssignment({musicXml, assignments})` and `confirmPartInstrumentAssignment({musicXml, preview, confirmed})`. Assignments are complete arrays of `{partId, instrumentId}`. Preview binds source and derived SHA-256, assignments and exact derived XML. Musical part bodies must remain unchanged. Cover real Vals, alternate IDs/order, namespace/doctype, absent declarations, instrument references, stale/tampered preview, invalid mappings and unsupported changes.
2. Add opt-in Student interpretation to playbackPartRouting; preserve the existing unmarked path byte-for-byte in behavior. Test all supported combinations, strict declaration/target consistency and legacy fallback through real transport/adapter tests. Refresh PWA cache.
3. Add bounded accessible Teacher preview/apply/undo controls. Share pending/busy/reset ownership with the existing split and send flows. Already multipart uploads show assignment controls, not the inapplicable staff split. Cover file replacement, cancellation, destruction, ordinary and request-conversion send, preparation failure, recipient isolation and consecutive sends.
4. Verify actual Teacher upload/package/isolated delivery → pinned Student plan/routing/audio. Keep the 108-measure Vals and 24-measure pilot as distinct fixtures. Compare all pitches/onsets/durations, retained 28 polyphonic Vals target measures, one clock, pause/restart/repeat/tempo and offline regressions. Run complete suites/builds and Chromium/WebKit when available; report environment limitations precisely.

## Review focus

- Legacy packages never activate routing just because their MIDI declarations differ.
- No stale preview or pending asynchronous result can replace a newer upload or be delivered.
- Multiple violin parts require an explicit target; piano chords never drive the board.
- MIDI channel/bank changes and undeclared instrument references never silently select the wrong sound.
- Partial delivery failures cannot reuse changed bytes under an already prepared assignment identity.

Deployment order after separate approval: Student consumer first, Teacher producer second. No main merge, production data writes or deployment in this implementation task.
