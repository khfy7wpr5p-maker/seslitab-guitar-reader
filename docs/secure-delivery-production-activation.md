# Secure Delivery Production Activation Runbook — SES-15

## Scope

This runbook defines the **prepared but inactive** SES-15 production path. Merging this code does not authorize or perform production Firebase provisioning, environment changes, deployment, or writes.

Permanent endpoints remain:

- Student App: `https://st-student-app.onrender.com`
- Secure Delivery API: `https://st-student-api.onrender.com/api/secure-delivery/v1`

No feature-, stage-, date- or acceptance-specific Render service/domain may be created.

## Default-closed activation boundary

Production Secure Delivery can initialize Firebase only when all of these conditions are true:

- `NODE_ENV=production`
- `SECURE_DELIVERY_PRODUCTION_ACTIVATION=true`
- `SECURE_DELIVERY_ENABLED=true`
- `STUDENT_DELIVERY_READS_ENABLED=true`
- `SECURE_DELIVERY_WRITES_ENABLED=false`
- `SECURE_DELIVERY_FIREBASE_PROJECT_ID=<explicit approved non-emulator project ID>`
- Firebase emulator host variables are absent

The master `SECURE_DELIVERY_PRODUCTION_ACTIVATION` flag is independent from the older feature flags. If it is absent or not exactly `true`, Firebase modules are not loaded and the existing unavailable/fail-closed router is served.

The first production activation profile is intentionally **read-only**. Teacher preparation/delivery/lifecycle writes stay disabled.

## Browser origin contract

Secure Delivery uses a route-specific exact-origin CORS policy. Its production defaults are:

- `https://st-student-app.onrender.com`
- `https://seslitab-guitar-tab-bg2n.bolt.host`

Only the Secure Delivery route adds `Authorization` to the permitted request headers. The general OMR Gateway CORS policy remains unchanged.

An optional explicit `SECURE_DELIVERY_ALLOWED_ORIGINS` value may replace these defaults, but it must contain exact origins only. Wildcards remain forbidden.

## Firebase Admin credential boundary

The production adapter uses Firebase Admin **Application Default Credentials**. No service-account JSON, private key, client email, ID token, password, or other secret material belongs in this repository.

Credential provisioning and runtime secret/file configuration are environment operations and remain behind the SES-15 human gate. A repository merge is not credential authorization.

## Production identity/grant provisioning

The provisioning CLI remains dry-run-first.

Manifest-only validation, with no Firebase access:

```bash
node scripts/secureDeliveryProvisioning.mjs --manifest ./provisioning.json
```

Production-state dry-run requires an explicitly approved production target:

```bash
SECURE_DELIVERY_PROVISIONING_PRODUCTION_AUTHORIZED=true \
SECURE_DELIVERY_FIREBASE_PROJECT_ID=<approved-project-id> \
node scripts/secureDeliveryProvisioning.mjs \
  --manifest ./provisioning.json \
  --production
```

A real production apply requires **all** of the following and separate human approval:

- `--production`
- `--apply`
- `SECURE_DELIVERY_PROVISIONING_PRODUCTION_AUTHORIZED=true`
- `SECURE_DELIVERY_PROVISIONING_APPLY=true`
- `SECURE_DELIVERY_PROVISIONING_PRODUCTION_APPLY=true`
- approved Application Default Credentials
- approved explicit production project ID

The three provisioning gates are deliberately separate so a dry-run authorization cannot silently become a write authorization.

## Activation sequence

Do not execute this sequence during Aşama 1. It is the Aşama 2 checklist after explicit user approval.

1. Record the exact pre-activation backend commit/deploy identifier and current environment **key names**. Do not copy secret values into evidence.
2. Confirm the approved existing Render service is `st-student-api.onrender.com`; do not create a new service.
3. Confirm the approved Firebase project, Authentication provider configuration, Firestore database, deny-all client rules, required indexes, and ADC runtime credential.
4. Run production provisioning dry-run and review every operation/conflict.
5. Under a separate provisioning-write approval, apply the minimum teacher/student identity mappings and grants needed for acceptance.
6. Deploy the already-reviewed backend code to the existing API service while keeping `SECURE_DELIVERY_PRODUCTION_ACTIVATION` closed until the deployment is healthy.
7. Confirm ordinary health remains green.
8. Enable the read-only activation profile; keep `SECURE_DELIVERY_WRITES_ENABLED=false`.
9. Run acceptance:
   - authenticated authorized Student read;
   - missing/invalid authentication fail-closed;
   - disabled/revoked identity or grant fail-closed;
   - Piece → SCORE/TAB;
   - offline reopen and reconnect;
   - structured `authorized`, `unauthorized`, and `revoked` request outcomes;
   - no raw UID, bearer token, secret, internal identity/resource ID, or provider diagnostic in logs;
   - physical iPhone/Safari acceptance.
10. Stop. Teacher production writes require a later separately reviewed/write-enabled profile; they are not part of the initial activation.

## Rollback

Rollback is fail-closed-first and uses the existing services.

1. Set `SECURE_DELIVERY_PRODUCTION_ACTIVATION=false` and restart/redeploy the existing API service.
2. Confirm `/api/secure-delivery/v1` returns the bounded unavailable response.
3. If an identity or grant caused the incident, use audited `DISABLE_IDENTITY` / `REVOKE_GRANT`; do not delete audit evidence.
4. If code rollback is required, restore the recorded pre-activation backend revision on the same API service.
5. Keep Student at `https://st-student-app.onrender.com`; do not create a fallback Render URL.
6. Investigate before reactivation. Do not bypass a failed gate with a temporary allowlist or alternate service.

## Aşama 1 stop condition

Aşama 1 is complete when the guarded code path, provisioning target, CORS contract, rollback plan, tests, build, browser checks, and quality gates are green.

Aşama 1 must stop before:

- production Firebase project/Auth/rules/index changes;
- runtime credential provisioning;
- production identity/grant writes;
- production environment flag changes;
- backend deployment;
- production write;
- live production acceptance.
