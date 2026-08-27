# Package 5D — Violin canonical consumer and quality-gate boundary

## Scope

Package 5D introduces the canonical consumer identity required for Basic Violin and connects that identity to the existing Package 2D fail-closed quality-gate contract.

This package does **not** activate Basic Violin production output. The production violin consumer is intentionally deferred to Package 5E.

## Canonical consumer vocabulary

`CANONICAL_CONSUMER_TYPE.VIOLIN` is registered as:

- consumer type: `violin`
- input: exact canonical `NoteObject[]`
- boundary state during Package 5D: `pending`
- enforcement ready: `false`

The shared canonical verification policy is unchanged. Violin receives the same canonical VERIFIED / PARTIAL / INVALID / legacy interpretation used by the existing consumers.

## Fail-closed boundary

Package 5D adds `resolveViolinQualityGate(notes, options)`.

Because the production violin consumer does not exist yet, the violin boundary remains `pending`. Therefore even otherwise verified notes and a source-verified Package 2C report must return:

- decision: `BLOCK`
- reason: `consumer-boundary-pending`
- allowed: `false`
- definitive: `false`
- automaticAllowed: `false`

This prevents Package 5A–5C test-only/basic projection logic from being silently treated as a production consumer.

## Safety invariants

- No Package 5A–5C generated fingering is promoted to teacher truth.
- No violin output may bypass Package 2D.
- Exact `NoteObject[]` identity remains the report-registration boundary.
- Existing TTS, playback, Guitar TAB, rhythmic text and rhythmic HTML policies are unchanged.
- No MusicXML parser change.
- No Audiveris/provider/runtime/preflight/worker/gateway/E2E change.
- No dependency addition.
- No deployment.

## Next package

Package 5E may create the quality-gated Basic Violin production consumer. Only that package may change the violin boundary from `pending` to `mapped` / `enforcementReady=true`, and only after focused tests and full regression evidence pass.
