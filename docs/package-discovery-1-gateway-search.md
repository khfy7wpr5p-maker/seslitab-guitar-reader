# Discovery Package 1 — Gateway Search Integration

## Purpose

This package connects SesliTab to the separate `st-score-discovery-gateway` without moving provider-specific catalog code into SesliTab and without bypassing the existing PDF/MusicXML intake and quality gates.

## User surface

A fourth accessible input tab, **Nota Ara**, is added next to the existing PDF, MusicXML and TAB input modes.

The search surface supports:

- artist/work query;
- contemporary / classical / traditional repertoire filtering;
- Turkish / international catalog scope;
- PDF / MusicXML filtering;
- guitar, piano, violin, viola, cello and voice instrumentation filters;
- explicit source-content filters for notation, chords, lyrics and tablature.

Akor, lyrics and TAB are displayed only when the discovery source explicitly reports those content features. This package does not derive chords from notation.

## Architecture

```text
SesliTab browser
  -> POST /api/v1/discovery/search
  -> SesliTab backend fixed discovery client
  -> configured ST Score Discovery Gateway root
  -> POST /v1/search
  -> approved provider adapters
```

The browser never chooses a discovery origin or provider URL.

## Handoff boundary

This package intentionally does not implement remote score download or automatic direct import.

- `external-open`: a sanitized HTTPS source page may be opened in a new tab;
- `direct-import`: metadata may be displayed, but the remote `assetUrl` is removed before the result crosses the SesliTab backend/browser boundary;
- `blocked`: no source/import action is offered;
- PDF/MusicXML result cards can move keyboard focus back to SesliTab's existing local PDF or MusicXML upload tab.

A future dedicated handoff package must own authenticated/opaque remote file acquisition, file-size/type/magic validation, provenance and the existing SesliTab intake gate. No discovery result is treated as trusted musical content.

## Configuration

Backend environment variable:

- `SESLITAB_DISCOVERY_GATEWAY_URL`

Production requires a credential-free HTTPS root URL. Development additionally permits loopback HTTP for local testing. Query strings, fragments, embedded credentials and non-root base paths are rejected.

Discovery configuration is evaluated lazily per search request, so a disabled or invalid discovery URL does not prevent the core OMR backend from starting.

## Safety limits

- browser requests are same-origin only;
- backend result limit is bounded to 100 and defaults lower;
- upstream response bytes are bounded;
- upstream redirect following is disabled;
- request timeout is bounded;
- unknown/malformed upstream results are dropped;
- remote asset URLs never cross the consumer boundary in this package;
- no provider implementation is added to SesliTab;
- no dependency is added;
- existing PDF upload, OMR, MusicXML parser, Package 2D quality gate, Guitar TAB and violin packages are not modified.

## Acceptance gate

This package is complete only after:

1. focused discovery integration/security tests pass;
2. the full SesliTab test suite passes;
3. production Vite build passes;
4. PR exact-head required `test-and-build` passes;
5. the package reaches protected `main` through PR;
6. exact post-merge `main` CI passes.
