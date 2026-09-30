# TD-PROD-15 Dependency Security Qualification

## Scope

TD-PROD-15 qualifies the dependency graph used by SesliTab before any teacher-write or Firebase production activation. It does not activate, deploy, provision, or mutate Render or Firebase.

Baseline source revision:

`main@77eb2ef31e2153607f1705c1f8f998fce9db9f32`

The fresh RED audit on PR #300 reported:

- production graph: 5 moderate, 1 high, 0 critical;
- full graph: 10 moderate, 6 high, 0 critical.

The ordinary main installation summary therefore contained **10 moderate, 6 high** vulnerabilities.

## High-severity root causes

The production high-severity finding was the direct `multer@2.2.0` dependency. The npm audit evidence identified multiple denial-of-service advisories and supplied `multer@2.4.0` as a non-major fix.

The additional full-graph high findings were in the Firebase emulator/test/tooling chain, including `@grpc/grpc-js <1.13.6` through the Firebase JavaScript SDK / Firestore tooling path.

## Qualified candidate

The bounded candidate applies:

- `multer@2.4.0`;
- `firebase-tools@15.32.0`;
- npm override range `@grpc/grpc-js@^1.13.6`, with the refreshed lockfile resolving `1.14.5`;
- compatible lockfile refreshes produced without `npm audit fix --force`.

The compatible lockfile refresh also moves affected transitive packages such as Express/body-parser/qs and Firebase CLI utilities to patched versions allowed by their declared dependency ranges. The gRPC range keeps the audited `1.13.6` security floor while allowing newer compatible `1.x` releases instead of pinning the minimum fixed version.

Fresh candidate audit evidence reports:

- **production graph: 2 moderate, 0 high, 0 critical**;
- **full graph: 5 moderate, 0 high, 0 critical**.

No high or critical vulnerability remains in either graph.

## Residual production moderates

The remaining production moderate findings are `gaxios` and `uuid`.

They are installed through the Firebase Admin optional Storage chain:

`firebase-admin → optional @google-cloud/storage@8.2.0 → gaxios@6.7.1 → uuid@9.0.1`

SesliTab has **no Storage API usage**: repository qualification found no `getStorage`, `firebase-admin/storage`, `@google-cloud/storage`, storage bucket configuration, or bucket call. The production Firebase adapter uses Auth and Firestore.

Registry qualification also showed that the current later `firebase-admin@14.5.0` still declares `@google-cloud/storage@^8.1.0`, while current `@google-cloud/storage@8.2.0` still declares `gaxios@^6.0.2`. A patch/minor Firebase Admin update therefore does not remove this chain.

Removing these two findings would require an out-of-range major transitive override rather than a compatible package fix. TD-PROD-15 deliberately makes **no semver-major transitive override** for this unused optional path.

## Residual development/tooling moderates

The full graph additionally retains classified moderate findings in:

- `firebase-tools`;
- `@google-cloud/pubsub`;
- `@opentelemetry/core`.

The qualified `firebase-tools@15.32.0` still declares `@google-cloud/pubsub@^5.2.0`. Registry qualification showed that `@google-cloud/pubsub@6.1.0` uses the fixed `@opentelemetry/core@^2.8.0`, but version 6 is outside the Firebase CLI declared major range. Forcing that transitive major would widen compatibility risk in emulator/test tooling.

The full graph also contains the same classified `gaxios` / `uuid` pair.

## CI policy

`.github/workflows/dependency-security.yml` is read-only and:

1. installs the committed lockfile with lifecycle scripts disabled;
2. creates separate production-only and full-graph `npm audit --json` reports;
3. fails on any high or critical vulnerability;
4. fails if a new moderate package appears outside the reviewed TD-PROD-15 allowlist;
5. uploads both JSON reports as retained CI evidence.

The moderate allowlist is an upper bound, not a requirement that findings remain. A future dependency release may remove a classified finding without failing the gate.

Any new high/critical finding or previously unclassified moderate finding blocks qualification until it is investigated.

## Safety decision

No `npm audit fix --force` was used for the committed candidate. No dependency was intentionally downgraded. No application feature, authorization boundary, Firebase production project, Render setting, teacher-write flag, deployment state, or OMR service state is changed by TD-PROD-15.
