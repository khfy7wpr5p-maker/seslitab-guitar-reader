# Discovery Package 1 — Gateway Search Integration

## Purpose

This package connects SesliTab to the separate `st-score-discovery-gateway` without moving provider-specific catalog code into SesliTab and without bypassing the existing PDF/MusicXML intake and quality gates.

The consumer now also understands the Gateway SD-3J contemporary-source contract: work-specific `web` results and separate fixed-host `sourceLocators` for additional notation/chord/TAB/listening searches.

## User surface

A fourth accessible input tab, **Nota Ara**, is added next to the existing PDF, MusicXML and TAB input modes.

The search surface supports:

- artist/work query;
- contemporary / classical / traditional repertoire filtering;
- Turkish / international catalog scope;
- PDF / MusicXML / web filtering;
- guitar, piano, violin, viola, cello and voice instrumentation filters;
- optional source-content filters for notation, chords, lyrics and tablature.

For contemporary search the content checkboxes are optional by default. This is important because a valid TAB/chord-only web result must not disappear merely because `notation` was silently required.

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

## Contemporary result types

### Work-specific web results

A Gateway `format: web` result is treated as an external resource such as a Songsterr TAB/chord page.

- it can display provider-reported content badges such as `TAB` or `Akor`;
- it may offer **Kaynağı Aç** only when the handoff is `external-open` and the source URL is safe HTTPS;
- it never receives a PDF/MusicXML intake button;
- it never becomes a local score file merely because the source page is public.

### Source locators

`sourceLocators` are rendered in a separate **Kaynaklarda ara** section.

They may point to fixed searches/entry pages for notation, chord/TAB, listening or metadata sources. SesliTab labels them as source searches and explicitly does not present them as a claim that a work-specific file has been found.

The backend:

- accepts at most 10 locator objects;
- keeps only HTTPS credential-free source URLs;
- allowlists locator capability vocabulary;
- discards malformed locator records;
- never accepts an asset/download URL from a locator.

The UI exposes locators as normal keyboard-focusable links with source/capability labels so screen-reader users can understand what each destination offers before activating it.

## Handoff boundary

This package intentionally does not implement remote score download or automatic direct import.

- `external-open`: a sanitized HTTPS source page may be opened in a new tab;
- `direct-import`: metadata may be displayed, but the remote `assetUrl` is removed before the result crosses the SesliTab backend/browser boundary;
- `blocked`: no source/import action is offered;
- PDF/MusicXML result cards can move keyboard focus back to SesliTab's existing local PDF or MusicXML upload tab;
- web result cards never enter PDF/MusicXML intake.

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
- source locators are independently bounded to 10;
- remote asset URLs never cross the consumer boundary in this package;
- no provider implementation is added to SesliTab;
- no dependency is added;
- existing PDF upload, OMR, MusicXML parser, Package 2D quality gate, Guitar TAB and violin packages are not modified.

## Acceptance gate

This package extension is complete only after:

1. focused contemporary discovery/web/locator tests pass;
2. the full SesliTab test suite passes;
3. production Vite build passes;
4. PR exact-head required `test-and-build` passes;
5. the package reaches protected `main` through PR;
6. exact post-merge `main` CI passes;
7. the Render service is redeployed from the merged exact main because its current auto-deploy setting is disabled.
