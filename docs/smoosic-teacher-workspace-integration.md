# Smoosic Teacher Workspace Integration

Status: EXPERIMENT / NOT PRODUCTION
Branch: `experiment/smoosic-teacher-workspace-integration`

## Goal

Use the verified Smoosic mobile editor as an advanced visual notation surface inside the existing SesliTab teacher workflow without changing SesliTab's revision, provenance, quality, approval, or correction authority.

## Non-negotiable boundaries

1. The imported/automatic MusicXML revision remains immutable.
2. Smoosic is an editor/presentation surface, not semantic source of truth.
3. Smoosic must never overwrite the current teacher revision in place.
4. The existing Stage E bounded editor remains available as fallback until the Smoosic integration passes device and round-trip gates.
5. Returning MusicXML must be compared semantically, not by line/text diff.
6. A Smoosic save creates a candidate correction result only. It is not teacher approval, quality PASS, share authorization, or student delivery.
7. The existing revision lifecycle and revalidation pipeline remains authoritative.
8. Unsupported, ambiguous, stale, or structurally invalid returns fail closed.

## Isolation architecture

The Smoosic editor is hosted as a same-origin isolated teacher editor surface (iframe/route) and is loaded only when the teacher explicitly opens the advanced editor.

Reasons:
- keep the large Smoosic runtime out of the normal SesliTab startup path;
- isolate Smoosic CSS/UI from SesliTab production UI;
- preserve current renderer and teacher selection authorities;
- allow the editor runtime to be replaced or rolled back without changing canonical note/revision logic.

## Data flow

```text
SesliTab current exact teacher revision
        |
        | exact revisionId + source lineage + MusicXML
        v
same-origin Smoosic teacher editor
        |
        | teacher edits
        v
edited MusicXML candidate
        |
        v
semantic MusicXML diff
        |
        +--> supported bounded changes -> candidate teacher correction events
        |
        +--> unsupported/ambiguous changes -> REVIEW / blocked
        v
existing immutable revision creation
        v
existing materialization + structural/semantic revalidation
        v
rerender
        v
teacher explicitly approves exact resulting revision
```

## Parent -> editor message contract

`SESLITAB_EDITOR_OPEN`

Required:
- `protocolVersion`
- `sessionId`
- `revisionId`
- `sourceRevisionId`
- `musicXml`

Optional:
- selected canonical note reference
- display title
- teacher actor audit label

The editor must reject messages from an unexpected origin, stale `sessionId`, missing exact revision identity, or malformed MusicXML.

## Editor -> parent message contract

`SESLITAB_EDITOR_READY`
- protocolVersion
- sessionId

`SESLITAB_EDITOR_CANDIDATE`
- protocolVersion
- sessionId
- sourceRevisionId
- editedMusicXml
- editorMetadata

`SESLITAB_EDITOR_CANCEL`
- protocolVersion
- sessionId

The editor must not emit `approved`, `qualityPass`, `shareAuthorized`, or `studentDelivered` states.

## Semantic diff boundary

Initial production candidate scope must map only to changes already supported by SesliTab's bounded correction/revalidation contracts.

The semantic comparison layer should classify at least:
- pitch: step / alter / octave
- duration
- onset
- voice
- staff
- tie
- slur
- tuplet
- grace
- articulation / ornament
- measure / meter / tempo structural changes

Phase 1 may accept only existing bounded fields and report all other differences as REVIEW rather than silently dropping them.

Raw XML line diff is prohibited because notation editors may normalize MusicXML without changing musical meaning.

## Rollout phases

### Phase 1 — Read-only integration proof
- Add `Gelişmiş Editör` entry in the existing teacher workspace.
- Open the exact current revision in the isolated Smoosic surface.
- Verify revision/session identity.
- No write-back yet.

### Phase 2 — Candidate return
- Return edited MusicXML to parent.
- Run structural parse + semantic diff.
- Display change summary.
- No automatic revision creation for unsupported classes.

### Phase 3 — Bounded revision creation
- Map supported semantic changes to existing teacher correction/revision APIs.
- Create a new immutable revision.
- Revalidate and rerender.
- Preserve old Stage E editor as fallback.

### Phase 4 — Extended correction taxonomy
- Connect supported voice/staff/tie/slur/tuplet/grace classes only after explicit correction-engine contracts exist.
- Feed verified teacher decisions to ST-OMR Correction Engine teacher-gold events.

### Phase 5 — Device/production gate
- iPhone Safari regression
- long/polyphonic corpus 5/5
- import/edit/export semantic round-trip
- playback + note preview + metronome regression
- stale session/revision rejection
- malformed/unsupported MusicXML rejection
- accessibility and narrow viewport check

## Current decision

Do not merge the Smoosic POC branch into `main` wholesale. Selectively integrate the verified editor behavior behind this isolated contract. Existing SesliTab teacher workspace remains the authority and fallback until all gates pass.
