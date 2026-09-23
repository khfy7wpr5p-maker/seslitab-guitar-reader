# TD-06 Secure Delivery — Firebase pilot architecture

## Status

TD-06 implements the private SCORE delivery path through a provider-neutral HTTP boundary and a Firebase-backed server adapter. The implementation is prepared for local emulator verification only. Production Firebase provisioning and activation remain behind Human Gate B.

## Semantic ladder

The authority states remain distinct:

```text
READY_EXACT_REVISION
→ local PrivateAssignment
→ DURABLY_PREPARED
→ DELIVERED_TO_STUDENT
```

`DURABLY_PREPARED` does not mean delivered. Delivery authority is created only by an exact `DeliveryRecord`.

## Runtime boundary

The existing OMR gateway exposes the isolated path:

```text
/api/secure-delivery/v1
```

Current production server wiring remains fail-closed with `createUnavailableSecureDeliveryRouter`. It does not initialize Firebase Admin or Firestore.

The provider-neutral composition entry point is:

```text
createSecureDeliveryComposition({
  env,
  firebaseFactories,
  now,
  createHistoryEventId
})
```

Firebase factories are invoked only when `SECURE_DELIVERY_ENABLED=true`. The production server does not yet call this composition.

## Feature flags

- `SECURE_DELIVERY_ENABLED`: enables the isolated Secure Delivery composition.
- `SECURE_DELIVERY_WRITES_ENABLED`: independently enables teacher preparation/delivery/lifecycle writes.
- `STUDENT_DELIVERY_READS_ENABLED`: independently enables Student read endpoints.

All flags are closed when absent or not exactly `true`.

## HTTP contract

Teacher endpoints:

- `POST /teacher/prepared-assignments`
- `POST /teacher/deliveries`
- `GET /teacher/deliveries`
- `POST /teacher/assignments/:assignmentId/actions`

Student endpoints:

- `GET /student/assignments`
- `GET /student/assignments/:deliveryId`

The browser-side `secureDeliveryApiClient` receives a `getIdToken` function by injection. It asks for a fresh token per request, places it only in the Authorization header, and never imports Firebase or persists the token.

## Firestore collections

Server-private collections used by the TD-06 adapter:

- `identityMappings`
- `teacherStudentGrants`
- `privateAssignments`
- `practicePackages`
- `assignmentLifecycle`
- `assignmentLifecycle/{assignmentId}/history`
- `deliveries`
- `studentRoster`
- `poolPublications`
- `poolPublications/{poolItemId}/recipients`

Document IDs are deterministic encoded forms of stable domain IDs. Provider subjects remain at the authentication boundary; domain records use stable teacher/student IDs.

## Transaction rules

Prepared batches are transactional: all conflicting assignment/package documents are read before any write. A single conflict rejects the entire batch.

Delivery batches are transactional and bounded to 40 assignments. Prepared authority, student/teacher/package identity, lifecycle revoke state, and existing delivery conflicts are validated before writes. No silent partial delivery is allowed.

Lifecycle mutation persists the current lifecycle, append-only history, and a delivery revoke in the same Firestore transaction. Repeated revoke is idempotent and does not append another history event or move the original revoke timestamp.

## Direct Firestore access policy

The first-pilot architecture routes private access only through the trusted Express/Admin SDK boundary. Firestore client rules therefore deny all direct reads and writes:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

This is deliberately stricter than a client-side RLS design.

## Local emulator

Only the demo project ID is used in local tests:

```text
demo-seslitab-td06
```

Run:

```bash
npm run test:td06:emulator
```

The command starts Auth and Firestore emulators, loads `firestore.rules` and `firestore.indexes.json`, then runs direct-client denial and Firebase transactional adapter tests.

CI uses Node 24 and Java 21 and runs the emulator suite before the normal repository suite.

## Firestore indexes

Descriptors are committed but not deployed:

- `deliveries(studentId ASC, revokedAt ASC)`
- `deliveries(teacherId ASC, deliveredAt DESC)`

## Firebase dependency versions

Reviewed exact versions:

- `firebase-admin@14.4.0`
- `firebase@12.19.0`
- `@firebase/rules-unit-testing@5.0.2`
- `firebase-tools@15.30.2`

## Human Gate B — still closed

The following are not authorized by code completion:

- selecting or creating a real Firebase cloud project;
- enabling Firebase Authentication providers;
- creating or modifying the production Firestore database;
- deploying Firestore Rules or indexes;
- adding Firebase Admin credentials or service-account material;
- adding Render/hosting production environment variables;
- adding billing/payment details;
- provisioning real teacher/student identity mappings or grants;
- enabling Secure Delivery flags in production;
- deploying the backend;
- writing to `khfy7wpr5p-maker/st-student-app`;
- merging PR #247.

No production project identifier, credential, service account, or token is committed.


## Task 11 final review evidence

Final review was performed against product-code head:

`fd8e108ebea37a65fedc7855aa60b1b3d589d50a`

This review used a separate manual/self-review pass because no independent subagent dispatcher is available in the current execution environment.

### Requirements coverage

- All 31 focused TD-01 through TD-06 test files named by the implementation plan exist on the reviewed head.
- The repository `npm test` command is `node --test tests/*.test.js`, so those focused files are included in the full Node test run.
- Firebase emulator coverage remains separate through `npm run test:td06:emulator`.
- Secure Delivery production flags remain closed unless their environment variables equal `true`.
- The production server remains fail-closed and does not initialize Firebase composition.

### Final security checklist

The exact TD-06 product diff was reviewed for:

- committed Firebase/service-account credentials;
- raw token logging or browser token persistence;
- Firebase provider UID leaking into domain principals/student read models;
- direct client Firestore authority;
- Firebase/Admin imports in browser code;
- OMR job/storage imports inside `backend/delivery/**`;
- client-supplied teacherId/studentId authority;
- silent partial prepared/delivery batches;
- missing exact acknowledgement rereads;
- revoke/read visibility races;
- default-open feature flags;
- cross-repository Student App writes.

No blocking finding remained in this review.

The only Firebase project identifier in executable provider setup is the local emulator demo ID `demo-seslitab-td06`. Firestore client rules remain deny-all for the first pilot. Real Firebase project provisioning, credentials, production rule/index deployment, billing, production flags, deployment, Student App writes and merge remain behind Human Gate B / later explicit approvals.

This documentation-only review commit must itself pass the exact-head CI, emulator, protected browser, Playwright and Sonar checks before TD-06 can be called merge-ready.
