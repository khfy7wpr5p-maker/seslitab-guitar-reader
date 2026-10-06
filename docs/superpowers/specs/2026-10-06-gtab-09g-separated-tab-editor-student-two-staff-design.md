# GTAB-09G — Separate Teacher TAB Editor + Student Two-Staff Render

Date: 2026-10-06
Status: Design approved in conversation; written spec awaiting review
Related: GTAB-09, GTAB-09C, GTAB-09D, SES-196

## Problem

The current SesliTab Guitar TAB teacher workspace successfully loads MusicXML and exposes the underlying six-string assignment engine, but its authoring surface is not a practical tablature editor. The teacher sees a normal notation renderer plus text-like six-string rows rather than a clear, dedicated TAB editing surface.

Trying to align a custom live TAB overlay pixel-for-pixel beneath the read-only notation renderer would add a new layout-synchronization problem and duplicate responsibilities already solved by MusicXML and the score renderer.

The teacher has explicitly approved a simpler workflow: TAB authoring may happen in a separate editor surface. The student-facing result must still be one combined score containing standard notation above six-line tablature.

## Decision

Use a **separate teacher TAB authoring surface** in SesliTab, then export one canonical two-staff MusicXML and let ST Student render that combined file.

Canonical flow:

```text
Supported source MusicXML
  -> SesliTab Guitar TAB teacher workspace
  -> dedicated six-string TAB authoring surface
  -> teacher assigns exact string/fret per pitched source event
  -> st-guitar-tab-editor validates the complete assignment document
  -> serializeGuitarTabMusicXml(...)
  -> one new combined MusicXML
       staff 1 = standard notation / G clef
       staff 2 = TAB clef / six lines / tuning / exact string+fret
  -> existing SesliTab validation + delivery package
  -> ST Student TAB view
  -> renderer draws standard notation + TAB together from the same MusicXML
```

ST Student does **not** merge two files at runtime. The merge is already encoded structurally in the exported MusicXML.

## Authority model

- Source MusicXML remains authority for pitch, onset, duration, measure, voice and source-event identity.
- Teacher owns only exact guitar string/fret placement.
- `st-guitar-tab-editor` owns assignment history, six-string validation, duplicate-string rejection and export eligibility.
- `serializeGuitarTabMusicXml()` remains the single combined-MusicXML writer.
- ST Score Rendering Layer remains presentation-only.
- ST Student renders the delivered combined file but does not rewrite or infer string/fret.
- Original source MusicXML is never overwritten.

## MusicXML output contract

The combined export is one Guitar part with two staves.

Required first-measure structure:

```xml
<staves>2</staves>
<clef number="1"><sign>G</sign><line>2</line></clef>
<clef number="2"><sign>TAB</sign><line>5</line></clef>
<staff-details number="2" show-frets="numbers">
  <staff-type>alternate</staff-type>
  <staff-lines>6</staff-lines>
  <!-- six standard-tuning staff-tuning entries -->
</staff-details>
```

For pitched notes:

- standard notation copy is written to `<staff>1</staff>`;
- tablature copy is written to `<staff>2</staff>`;
- TAB copy contains `<notations><technical><string>…</string><fret>…</fret></technical></notations>`;
- measure timing is shared by both staves through the same source event timing and explicit backup/forward structure.

This follows current W3C MusicXML 4.0 tablature guidance and the existing `st-guitar-tab-editor` writer contract.

## Teacher UI

The existing SesliTab **Gitar TAB** result tab remains the entry point.

The teacher authoring experience is intentionally separate from final two-staff presentation:

1. Load supported MusicXML.
2. Create one immutable Editor source session.
3. Show the current source event / chord group context.
4. Show a dedicated six-string TAB surface with six real horizontal lines.
5. Allow keyboard-first string/fret assignment using the existing Editor controller.
6. Preserve undo/redo and deterministic invalid-position errors.
7. Keep export disabled until `tabDocument.canExport()` is true.
8. Export a new `*-guitar-tab.musicxml` file.

The authoring surface does not need to visually align each custom TAB line with the read-only score renderer. Final staff alignment is delegated to the combined MusicXML renderer.

## Six-string authoring presentation

Each editor row must contain:

- string identity,
- a real horizontal TAB line,
- active-string state,
- assigned fret rendered on the line when present,
- source-event linkage only through deterministic Editor state.

The UI may show note/chord/measure context, but visible text, SVG proximity or pitch-nearness must never become assignment authority.

## Polyphony and chords

Existing Editor semantics remain binding:

- every pitched source event receives its own `{ string, fret }` assignment;
- simultaneous notes are grouped through the existing source session;
- two simultaneous notes may not use the same physical string;
- Voice 1–4 input remains supported where already supported by the Editor;
- 1–6 simultaneous pitched notes remain supported subject to six-string physical constraints;
- unsupported overlapping/timing structures continue to fail closed rather than being guessed.

## Export behavior

`serializeGuitarTabMusicXml({ sourceSession, document })` remains the only export writer.

Export must fail closed when:

- the assignment document belongs to another source session;
- any required pitched event lacks a valid string/fret assignment;
- duplicate-string or invalid guitar-position validation failed;
- the existing SesliTab score/TAB handoff validation rejects the result.

Successful export creates a new file and leaves the original source bytes unchanged.

## ST Student contract

ST Student already distinguishes SCORE and TAB views. This design preserves that navigation model.

- SCORE view continues to render the normal score source.
- TAB view receives the combined Guitar TAB MusicXML as its MusicXML render source.
- Because that TAB source itself contains both staff 1 and staff 2, the renderer must show **standard notation above TAB together** in the TAB view.
- Student must not synthesize, merge, or infer the second staff.
- A normal score with no Guitar TAB capability must continue to open normally.

The existing Student browser pilot already proves that a two-staff MusicXML with G clef + six-line TAB and fret values can be rendered by the current ST score runtime. GTAB-09G must strengthen this from a standalone fixture into an exact Teacher-export -> Student-render qualification.

## Cross-repository boundary

### SesliTab production changes

Expected seams:

- `src/guitarTabTeacherWorkspaceUi.js`
- `src/style.css`
- focused teacher authoring tests
- cross-app qualification test(s)

The primary production change is the dedicated six-line authoring presentation and its interaction with the existing Editor state.

### st-guitar-tab-editor

No production change is expected initially.

Existing contracts to reuse:

- `createSourceSession`
- `createTabAssignmentDocument`
- `createKeyboardController`
- `createFixedSixStringRows`
- `serializeGuitarTabMusicXml`

A change in this repository requires separate evidence that the existing contract is insufficient; no speculative writer or model changes are allowed.

### ST Student

Prefer qualification-only changes first.

If the current TAB view already renders the combined exported file correctly, add/strengthen browser coverage without changing production code. Production changes are allowed only if the exact exported file demonstrates a real Student rendering defect.

## TDD acceptance matrix

1. Teacher Guitar TAB surface renders exactly six real horizontal lines.
2. Active string is visually distinguishable without changing assignment authority.
3. Assigning a valid fret shows that fret on the correct string line.
4. Changing selection does not lose existing assignments.
5. Undo/redo preserves the correct visual assignment state.
6. Simultaneous notes cannot reuse one physical string.
7. Export remains disabled until all required pitched events are assigned.
8. Exported XML contains `staves=2`, G clef on staff 1, TAB clef on staff 2, six staff lines and six tuning entries.
9. Every exported TAB pitched note contains exact technical string/fret and staff 2.
10. Standard notation events remain on staff 1 with original pitch/onset/duration/voice semantics preserved within the supported subset.
11. Original input MusicXML remains byte-identical after authoring/export.
12. Exact Teacher-exported MusicXML renders in ST Student TAB view with visible standard notation and visible fret numbers in Chromium.
13. The same exact cross-app render passes in WebKit.
14. Normal Student SCORE view remains unchanged.
15. Student content with no TAB capability still opens the normal score path.
16. Existing Assignment Composer / secure delivery / offline / playback boundaries remain green.
17. Full CI, regression, dependency security and Sonar gates pass before completion.

## Failure handling

- Editor runtime unavailable: show a bounded unavailable state; do not fake TAB output.
- Unsupported source MusicXML: fail closed while preserving the shell.
- Renderer unavailable during teacher authoring: TAB assignment may remain available because renderer presentation is not authority.
- Incomplete assignments: block export.
- Invalid generated MusicXML: block download/delivery.
- Student renderer cannot display the exact combined export: treat as a Student compatibility defect and stop before inventing a second runtime merge path.

## Non-goals

- live pixel-perfect custom TAB overlay beneath the teacher notation renderer;
- adding alphaTab;
- adding a second MusicXML serializer;
- changing source pitch/rhythm/voice/meter;
- automatic fingering inference;
- replacing ST Score Rendering Layer;
- changing Student Score/TAB navigation unless exact qualification proves it necessary;
- adding a new Render service/domain.

## Verification order

1. Focused RED test for real six-line authoring presentation.
2. Minimal SesliTab authoring UI change.
3. Existing keyboard/assignment/export tests.
4. Exact combined MusicXML contract tests.
5. Exact Teacher-export -> Student TAB render browser qualification on Chromium.
6. Repeat exact browser qualification on WebKit.
7. Normal Student score/no-TAB regression.
8. Full SesliTab CI and regression workflows.
9. Dependency security and exact-SHA qualification.
10. Sonar Quality Gate where provisioned.
11. Final integrated diff review.

## Human gates

- Architecture direction: **APPROVED**.
- This written spec: **AWAITING USER REVIEW**.
- Implementation plan: not yet written.
- Production code changes: not yet started.
- Merge: separate explicit user approval required.
- Production deploy: separate explicit user approval required.
