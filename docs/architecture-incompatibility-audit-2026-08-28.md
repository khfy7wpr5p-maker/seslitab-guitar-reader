# SesliTab — Architecture / Documentation Incompatibility Audit

Date: 2026-08-28  
Fresh baseline: `c096f0daa43eb20c79fea46d1d76211b8fcb49dc`  
Protected branch: `main`  
Required check: `test-and-build`

## Scope

Read-only incompatibility inspection followed by documentation-only reconciliation.

Explicitly excluded from modification:

- Audiveris provider/runtime/preflight
- OMR worker/provider selection
- Cloud OMR Gateway
- production MusicXML OMR path
- Dockerfile
- render.yaml
- current Render service/deployment connection
- application source behavior
- test expectations
- dependencies

## Fresh repository evidence

Before this documentation branch was created:

- Package 7 closure evidence-recording PR #84 was exact-head green, mergeable, 0 commits behind main and had no unresolved review threads.
- PR #84 merged to protected main as `c096f0daa43eb20c79fea46d1d76211b8fcb49dc`.
- Exact-main CI #214 / workflow `33155750235` completed successfully.
- Required job `test-and-build` completed successfully, including dependency installation, tests and production build.
- Repository status documents identify Package 8 as the next strict roadmap package.

## Incompatibilities found

### 1. README status drift

The README still described MIDI export and violin support as planned even though repository closure evidence records:

- Package 3 — playback / measure interaction / deterministic MIDI — Completed.
- Package 5 — Basic Violin — Completed.

Impact: new development could incorrectly treat proven modules as missing and duplicate or replace working architecture.

Resolution: README now distinguishes verified current outputs from later roadmap areas.

### 2. `music-engine-architecture.md` represented an obsolete pre-implementation design

The document still stated or implied:

- status was a draft and code had not been changed;
- MIDI Generator did not exist;
- Chord Analyzer did not exist;
- Rhythm Analyzer did not exist;
- Teacher Correction Engine should sit inline and mutate/produce corrected `NoteObject[]` before downstream outputs;
- confidence/error tolerance could allow the pipeline to continue after module failure.

These statements conflict with current verified architecture:

- deterministic SMF0 MIDI exists;
- structural/rhythmic validator exists;
- quality/error report and fail-closed quality gate exist;
- Basic Guitar TAB exists;
- Basic Violin exists;
- source-only MusicXML harmony parsing/presentation/TTS exists;
- Package 8 teacher correction/approval is not implemented and must preserve automatic/corrected/approved revisions separately.

Impact: the old architecture could encourage unsafe in-place correction, bypass of quality policy, duplicate implementation of completed modules, or loss of revision provenance.

Resolution: `docs/music-engine-architecture.md` was replaced with a current architecture map aligned with completed Package 0–7 evidence and a revision-based Package 8 boundary.

### 3. Teacher approval boundary was underspecified in AI orientation

`docs/AI_CONTEXT.md` stated the general safety rule but did not explicitly pin the next package to a revision-domain boundary or preserve the current Audiveris/Render integrations during Package 8 work.

Impact: an autonomous implementation could broaden scope into OMR/backend/deployment infrastructure unnecessarily.

Resolution: AI context now records the next strict package, the immutable revision principle and protected integration boundaries.

## Current safe architecture conclusion

No source-code incompatibility requiring immediate production change was established by this audit. The concrete incompatibilities found were documentation/architecture drift.

The next safe implementation target is not an OMR or Render change. It is Package 8 teacher revision/approval, beginning with a small dependency-free domain contract that:

1. keeps the automatic source immutable;
2. creates teacher corrections as new revisions;
3. binds approval to one exact revision;
4. does not treat quality-gate ACCEPT as teacher approval;
5. prevents later edits from inheriting an old approval;
6. does not touch Audiveris or Render.

## No-touch verification for this branch

Expected changed files are documentation only:

- `README.md`
- `docs/AI_CONTEXT.md`
- `docs/music-engine-architecture.md`
- `docs/architecture-incompatibility-audit-2026-08-28.md`

If any backend, provider, workflow, deployment, Render, Docker, OMR, source implementation or dependency file appears in the diff, this branch must fail scope review and must not merge.
