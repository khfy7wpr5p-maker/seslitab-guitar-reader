# Secure Delivery Production Provisioning Runbook

## Scope

This document describes the SES-14 identity and teacher↔student grant provisioning subsystem.

SES-14 does **not** activate production Firebase or Secure Delivery. The production adapter remains intentionally unavailable. The executable runner can validate a manifest locally and can use the existing Firebase emulator. Real production identities, credentials, Auth providers, rules/index deployment, hosting configuration and production deployment remain outside this package.

## Safety invariants

- Provisioning is dry-run by default.
- Apply requires both the CLI `--apply` flag and `SECURE_DELIVERY_PROVISIONING_APPLY=true`.
- In SES-14, apply is emulator-only; `--apply` without `--emulator` is rejected.
- Provider UID → stable SesliTab identity and stable SesliTab identity → provider UID are both unique.
- A disabled identity is not deleted and its reverse binding is retained.
- Grants are revoked, not deleted.
- Re-authorization after revoke uses explicit `REGRANT`; there is no generic undo.
- Every applied operation creates one append-only audit record.
- Replaying the same `operationId` with the same normalized payload is idempotent.
- Reusing an `operationId` with a different payload is a hard conflict.
- One conflict aborts the whole batch.
- Raw ID tokens, passwords, private keys, service-account JSON and secret material must never appear in a manifest or audit record.

## Manifest format

The manifest is a strict JSON object with one field:

```json
{
  "commands": [
    {
      "operationId": "example-operation-001",
      "action": "CREATE_IDENTITY",
      "operatorId": "operator-example",
      "reason": "Example only",
      "timestamp": "2026-09-25T10:00:00Z",
      "providerSubject": "example-provider-uid",
      "role": "STUDENT",
      "teacherId": null,
      "studentId": "example-student-id"
    }
  ]
}
```

Supported actions:

- `CREATE_IDENTITY`
- `DISABLE_IDENTITY`
- `CREATE_GRANT`
- `REVOKE_GRANT`
- `REGRANT`

Unknown fields are rejected.

## Dry-run

Manifest-only validation and conflict analysis within the manifest:

```bash
node scripts/secureDeliveryProvisioning.mjs --manifest ./provisioning.json
```

The result is machine-readable JSON and the target is reported as `MANIFEST_ONLY_DRY_RUN`. This mode does not claim to have inspected production Firebase state.

Firebase emulator dry-run:

```bash
node scripts/secureDeliveryProvisioning.mjs --manifest ./provisioning.json --emulator
```

No write occurs without `--apply`.

## Emulator apply

Only after reviewing the dry-run result:

```bash
SECURE_DELIVERY_PROVISIONING_APPLY=true \
node scripts/secureDeliveryProvisioning.mjs \
  --manifest ./provisioning.json \
  --emulator \
  --apply
```

SES-14 intentionally rejects a non-emulator apply.

## New teacher provisioning

1. Prepare one `CREATE_IDENTITY` command with role `TEACHER`.
2. Set `teacherId` and set `studentId` to `null`.
3. Use a unique `operationId`.
4. Run dry-run.
5. Resolve every conflict before any apply.
6. Apply only in the approved target environment.
7. Verify the identity mapping and its audit event.
8. Verify that the reverse binding points to the same provider UID.

## New student provisioning

1. Prepare one `CREATE_IDENTITY` command with role `STUDENT`.
2. Set `studentId` and set `teacherId` to `null`.
3. Use a unique `operationId`.
4. Run dry-run.
5. Resolve every conflict before any apply.
6. Apply only in the approved target environment.
7. Verify the identity mapping, reverse binding and audit event.

## Grant creation

A grant requires active teacher and student identities with valid reverse bindings.

Prepare `CREATE_GRANT` with:

- `teacherId`
- `studentId`
- unique `operationId`
- operator, reason and timestamp

After apply, existing `requireTeacherStudent(teacherId, studentId)` authorization must pass.

If an earlier grant is revoked, `CREATE_GRANT` does not reactivate it. Use explicit `REGRANT`.

## Grant revoke

Use `REVOKE_GRANT`.

The grant document remains present with `active=false` and `revokedAt` set. Existing teacher→student authorization must fail after revoke.

## Regrant

Use `REGRANT` only for a previously revoked grant. It creates a new active grant state and a new audit event. The prior revoke remains represented in the append-only audit history.

## Wrong identity mapping recovery

Do not delete the mapping.

1. Stop any dependent grant or delivery work.
2. Apply `DISABLE_IDENTITY` to the incorrect provider subject.
3. Verify principal resolution fails.
4. Preserve the reverse domain binding and audit evidence.
5. **Stop before rebinding the same stable SesliTab identity to another provider UID.**

SES-14 deliberately has no generic rebind/migration operation. Rebinding a stable identity requires a separately designed and approved migration protocol.

## Disabled identity handling

A disabled identity:

- remains stored,
- retains its original `createdAt`,
- receives `disabledAt`,
- cannot resolve to an active principal,
- does not free its stable domain identity for a different provider UID.

## Audit inspection

Applied operations are stored in:

- `secureDeliveryProvisioningAudit`

Reverse identity bindings are stored in:

- `identityDomainBindings`

Audit records include operation ID, action, target, operator, reason, timestamp, command fingerprint, before/after fingerprints and result. Secret material is forbidden.

The audit collection is append-only by operation ID. Exact replay does not create a second audit record.

## Transaction failure behavior

Firestore apply runs in one transaction for the submitted batch.

If any command conflicts:

- no identity mapping is partially created,
- no reverse binding is partially created,
- no grant is partially changed,
- no audit row from that batch is committed.

Retry only after understanding and resolving the conflict.

## Production preflight checklist

Production activation is **not** part of SES-14. Before a later production package may enable it, verify all of the following under separate human approval:

- exact current `main` SHA and exact-head CI are green;
- focused provisioning tests are green;
- Firebase emulator acceptance is green;
- full `npm test` is green;
- production build is green;
- browser regression suite is green;
- Sonar/Regression Quality gate is green;
- `git diff --check` is clean;
- no public provisioning HTTP route exists;
- direct Firestore browser/client access remains deny-all;
- production Firebase project selection is explicitly approved;
- Auth provider enablement is explicitly approved;
- credential/service-account handling is explicitly approved;
- Firestore rules/index deployment is explicitly approved;
- hosting/Render environment changes are explicitly approved;
- production Secure Delivery activation is explicitly approved;
- real teacher/student provisioning is explicitly approved;
- rollback/disable and grant revoke procedures are understood;
- audit inspection is available;
- no SES-15 work is mixed into the SES-14 PR.

## Rollback model

Provisioning rollback is compensating, not destructive:

- wrong/unsafe identity → `DISABLE_IDENTITY`
- unwanted grant → `REVOKE_GRANT`
- later approved re-authorization → explicit `REGRANT`

Do not delete identity, grant or audit evidence as a rollback mechanism.
