# Flat Embed Teacher Correction Prototype

Status: EXPERIMENTAL / NON-AUTHORITATIVE

## Goal

Prove exactly three integration capabilities without replacing or weakening the existing SesliTab Teacher Editor:

1. Flat Embed can open inside the SesliTab score workspace.
2. The current in-session MusicXML can be loaded into Flat in edit mode.
3. The edited MusicXML can be exported back into SesliTab memory.

## Boundary

This prototype is intentionally not a canonical write path.

It does not:

- overwrite imported/OMR MusicXML;
- create or mutate Package 8 immutable revisions;
- change Editor Core single-write authority;
- change OMR evidence or error classification;
- grant teacher approval;
- bypass quality/revalidation gates;
- deliver content to students.

The export is retained only as prototype memory and emitted through the `seslitab:flat-musicxml-exported` browser event for a later, explicitly reviewed integration stage.

## Runtime configuration

Set the public Flat Embed application identifier in the frontend environment:

```text
VITE_FLAT_EMBED_APP_ID=<flat-app-id>
```

When it is missing, the UI remains inert and reports that the appId is required. The existing SesliTab Teacher Editor remains unchanged.

The prototype loads Flat's official browser Embed SDK from:

```text
https://prod.flat-cdn.com/embed-js/v2.12.1/embed.min.js
```

No Flat editor source code is copied into this repository.

## User flow

```text
PDF / MusicXML
  -> existing SesliTab MusicXML
  -> Flat’te aç
  -> Flat Embed editor (mode=edit)
  -> teacher edits notation
  -> Düzeltilmiş XML’i al
  -> exported MusicXML held in prototype memory
```

## Exit criteria

The prototype may advance only after a real Flat appId is configured and a browser proof demonstrates:

- iframe/editor readiness inside SesliTab;
- successful `loadMusicXML()` with a real SesliTab MusicXML document;
- successful `getMusicXML({ compressed: false })` after a visible teacher edit;
- exported MusicXML remains isolated from canonical revision state.

Only after those pass should a separate design decide how Flat output becomes a new immutable teacher revision and enters normal SesliTab revalidation.
