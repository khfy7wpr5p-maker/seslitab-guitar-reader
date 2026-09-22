# TD-03 — Teacher Pool Publishing

## Boundary

TD-03 implements provider-neutral teacher Pool publication production. It does not select a production persistence/auth provider and does not modify Student App.

## Publication model

TD-01 `PoolItem` remains immutable. TD-03 wraps it in `PoolPublicationRecord` with an orthogonal `revokedAt` tombstone.

A publication is active while `revokedAt === null`. Revocation creates a new immutable lifecycle record that preserves the original Pool item. TD-03 exposes no hard delete, restore or unrevoke operation.

## Audience

- `ALL` keeps `recipientStudentIds` empty and does not expand into a roster snapshot.
- `SELECTED` uses TD-02 active-student stable-ID preflight.
- duplicate selected IDs are normalized by the TD-02 preflight in first-selection order.
- display names/nicknames are presentation-only; targeting uses `studentId`.

## Repository truth

Publish and revoke are successful only after a valid exact repository acknowledgement.

The TD-03 reference repository is deterministic and in-memory. It is a contract/test adapter, not production persistence.

Repository invariants:

- unique `poolItemId`;
- immutable publication records;
- deterministic list order;
- exact-ID lookup;
- duplicate publish fails closed;
- unknown/already-revoked revoke fails closed;
- no delete or restore surface.

## Teacher service

`createTeacherPoolPublishingService(...)` exposes:

- `publishPoolItem(input)`;
- `listPoolPublications()`;
- `revokePoolPublication(poolItemId)`.

For `SELECTED`, publication happens only after TD-02 `preflightActiveStudentIds` succeeds. Unknown or inactive students prevent repository publication.

Producer-owned Pool IDs and timestamps are dependency-injected and validated through existing TD-01 normalization.

## Teacher controller and UI boundary

TD-03 supplies:

- a teacher-safe controller that converts domain failures into bounded user-facing messages;
- an explicitly mounted `Havuza Gönder` UI module;
- ALL / SELECTED audience controls;
- active-student selection using stable IDs;
- teacher publication history;
- `Geri Çek` for active publications only.

The UI reports success only after the controller/service receives a valid repository acknowledgement.

The UI is intentionally not auto-mounted from `main.js` or `appShell`. Current production entry-point behavior remains unchanged until an authenticated/provider composition is selected.

## Security and scope

TD-03 contains no:

- Firebase/Admin implementation;
- Firebase Authentication user listing;
- Firestore/database provider;
- localStorage/IndexedDB persistence;
- network delivery endpoint;
- production authentication policy;
- Student App write;
- Stage L / Package 12 SCORE dependency;
- MusicXML/notation/playback/Practice Package payload in Pool;
- cross-repository write.

Pool remains text/detail publication metadata only.

## Verification

TD-03 has focused tests for:

- lifecycle immutability and revoke tombstones;
- repository uniqueness/history/revoke;
- ALL vs SELECTED audience behavior;
- TD-02 active roster preflight;
- acknowledgement substitution/malformed adapter failures;
- bounded controller messages;
- explicit-mount UI behavior;
- stable-ID student selection;
- no success refresh on failed publish/revoke;
- security/provider/autowiring boundaries.

Final merge readiness is determined only by the exact implementation PR head after the full repository suite, production build and protected quality/browser workflows succeed.

## Deferred

- SCORE private assignments: TD-04;
- persisted teacher assignment lifecycle: TD-05;
- authenticated production persistence/delivery and teacher UI composition: TD-06;
- Chord Board delivery: TD-07.
