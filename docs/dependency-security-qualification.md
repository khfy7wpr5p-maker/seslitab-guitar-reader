# TD-PROD-15 Dependency Security Qualification

Current qualification: SES-172 now requires **full and production: 0 vulnerabilities**.
Earlier counts and decisions below are historical checkpoints, superseded by the
zero-finding qualification at the end of this document.

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
3. fails on any finding at any severity, including info and low;
4. fails on incomplete/error reports, nonzero audit command status, or a nonempty inventory;
5. uploads both JSON reports as retained CI evidence.

The former moderate allowlist was removed by the zero-finding SES-172 follow-up.
Any vulnerability blocks qualification; security rules and the Sonar gate are unchanged.

## Safety decision

No `npm audit fix --force` was used for the committed candidate. No dependency was intentionally downgraded. No application feature, authorization boundary, Firebase production project, Render setting, teacher-write flag, deployment state, or OMR service state is changed by TD-PROD-15.


## SES-172 follow-up (2026-10-03)

At PR #312 baseline `ae94b6965dae881a6ee370c026079e7fb5565151`, newly published
advisories changed the full graph to 7 high / 4 moderate (production: 0 high /
2 moderate). The seven high package records arose from two underlying paths:

- `firebase-tools → chokidar@3.6.0 → braces@3.0.3`:
  [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
  No patched braces release was available. A Firebase CLI-scoped override to
  `chokidar@4.0.3` removes the vulnerable brace parser entirely.
- `firebase-tools → proxy-agent → pac-proxy-agent → get-uri → basic-ftp@5.3.1`:
  [GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r).
  A Firebase CLI-scoped override selects patched `basic-ftp@6.2.1`.

These are deliberate, bounded major transitive overrides; they do not upgrade
Firebase CLI, the application Firebase SDK/Admin dependencies, or production
application behavior. The lockfile was generated with npm and reinstalled using
`npm ci --ignore-scripts`.

Compatibility checks exercise the literal-file rules watcher, its change event
and cleanup, plus the CommonJS FTP Client methods and real Unix listing parser
used by get-uri. The repository configures only Auth and Firestore emulators.
Chokidar 4 no longer expands glob inputs; Functions emulator glob/ignore semantics
are outside this qualification and must be separately checked before adding a
Functions emulator. Existing application assertions and security gates remain
unchanged.

The refreshed full audit has 0 high / 0 critical and five moderate package
records (`@opentelemetry/core`, `@google-cloud/pubsub`, `firebase-tools`, `gaxios`,
`uuid`). Production retains 0 high / 0 critical and the same two reviewed
moderate records (`gaxios`, `uuid`). Firebase CLI is now classified moderate
rather than high; the change from four to five moderate records is not an added
underlying advisory. All residual records remain within the existing CI allowlist.
The major OpenTelemetry/Storage dependency changes described above remain
unqualified and were not forced.

The managed environment returned proxy CONNECT 403 for the Firestore emulator
jar on `storage.googleapis.com`. The complete emulator suite therefore still
requires that specific saved network allowance to be applied. The local watcher
compatibility tests do not substitute for that blocked emulator suite.


## SES-172 zero-finding qualification (2026-10-03)

The previous `7b749137ef8264d43b9b1805ea7f4587e62063bd` checkpoint was verified
by GitHub CI 37153529719, Regression Quality 37153529704 and Dependency Security
37153529774. Its Sonar Quality Gate passed with 0 issues; its Firebase emulator
boundary passed 24/24. A managed-machine network denial is not a failure of that
CI qualification.

The five full / two production moderate records were propagated from two advisories:

- [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq):
  `gaxios@6.7.1 → uuid@9.0.1`. This includes Storage, Google Auth/gtoken and Firebase
  CLI consumers. The gaxios-scoped override selects `uuid@11.1.1`, the first fixed
  CommonJS-capable 11.x release, while retaining gaxios 6 and the existing Storage
  and authentication libraries. Gaxios uses only `uuid.v4()` to generate multipart
  boundaries. UUID 11 supplies separate CommonJS and ESM exports; both were tested.
- [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf):
  `firebase-tools → @google-cloud/pubsub@5.3.1 → @opentelemetry/core@1.30.1`.
  The Firebase/PubSub-scoped override selects patched Core `2.8.0`. PubSub consumes
  only `W3CTraceContextPropagator` from Core; this API is preserved. Core 2.8's
  OpenTelemetry API peer range `>=1.0.0 <1.10.0` admits the installed API 1.9.0.
  Node 24 satisfies its engine requirement. PubSub 5 and its Google Auth/gax
  dependency graph are unchanged; a wider PubSub 6 migration was unnecessary.

`tests/dependencySecurityCompatibility.test.js` exercises real installed consumers:
UUID rejects short v3/v5 buffers; CJS and ESM deterministic UUID output agrees;
gaxios sends UUID-delimited multipart content over local HTTP; Google Auth and
Storage send authenticated metadata requests with unchanged results; Firebase's
PubSub client constructs topics and the PubSub telemetry module round-trips W3C
trace identity. The patched baggage propagator rejects oversized inbound entries.
The UUID buffer and baggage checks failed before the override and pass after it.
All HTTP endpoints in these tests are localhost and use synthetic test authority;
no live Firebase/Storage resource or credential is involved.

Fresh full and production audits report **0 vulnerabilities at every severity**.
The npm-generated lockfile is validated by clean `npm ci --ignore-scripts`.
No direct dependencies, application features, Auth/Firestore/Storage behavior, tests, Sonar
rules or gates were removed or disabled. The earlier scoped Chokidar/FTP fixes
remain intact. The dependency-security workflow now rejects any nonzero finding,
including formerly reviewed moderate packages, and rejects malformed audit output.

## SES-245 tooling advisory refresh (2026-10-21)

At SES-243 PR #370 head `03858ec2ed7638b8018af3ad69906088ab9bfa10`,
the unchanged dependency graph failed Dependency Security run `39556558004`:
production had zero findings; the full graph had one moderate and one high
package record. A fresh local npm audit reproduced both records. These are
build/development-tool dependencies, not a failure in the new Student GET route.

The two paths were:

- Direct development dependency `vite@8.2.0` embeds the vulnerable editor-launch
  implementation. Advisories [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv),
  [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw), and
  [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm)
  include Windows command/argument handling issues. The same-line patched
  release `vite@8.2.4` replaces the direct exact pin. Its compatible PostCSS
  and Rolldown dependencies and native binding inventory were regenerated by npm.
- `firebase-tools@15.32.0 -> @modelcontextprotocol/sdk@1.32.1 -> hono@4.13.8`
  was affected by [GHSA-5r4p-p66f-jhc7](https://github.com/advisories/GHSA-5r4p-p66f-jhc7),
  a static-path double-decoding middleware bypass fixed in `4.13.11`.
  `npm update hono --package-lock-only --ignore-scripts` resolved `4.13.13`
  within the SDK's existing `^4.11.4` range and node-server's `^4` peer range.
  No new override or Firebase CLI upgrade was needed.

Validation on Node `24.19.0` / npm `11.9.0`:

- `npm ci --ignore-scripts --no-fund`: exit 0, clean installation from the
  regenerated lockfile (790 installed packages).
- `npm audit --json` and `npm audit --omit=dev --json`: both exit 0, empty
  vulnerability inventories and zero findings at every severity.
- Dependency security contract/consumer compatibility, development-tool
  compatibility, Student request HTTP/domain, teacher management,
  request-bound conversion and Secure Delivery HTTP suites: 73/73 passed.
- `vite build --outDir /tmp/ses245-vite-build`: exit 0; actual application
  entrypoint bundled successfully. This is the Vite bundle check, not a claim
  that the complete runtime-preparation/emulator/browser release pipeline ran.
- Firebase CLI version command: exit 0, `15.32.0`; `git diff --check`: exit 0.

The zero-finding audit gate, historical security overrides, runtime dependencies,
application features and production settings were preserved. No audit findings
were allowlisted, ignored or hidden. Complete release qualification remains in
GitHub CI; no production deployment or merge is part of this refresh.
