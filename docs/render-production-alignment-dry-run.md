# TD-PROD-11 — Render Production Alignment Dry-Run

## Purpose

Prepare the existing Render estate for the completed SesliTab Task 1–10 code without performing a live Render mutation.

This document is a **dry-run only** handoff. It does not authorize branch changes, environment changes, deploys, Firebase writes, OMR resume, new Render services, or new Render domains.

Machine-readable source of truth:

- `ops/render-production-alignment.v1.json`

Repository source revision used for this preparation:

- `48bfa4443356632cd1401efd246f0c590701f8d7`

## Fresh Render reality — 2026-09-30

### seslitab-app

- Existing service ID: `srv-da9gqapf2nfc73fh6o1g`
- Permanent URL: `https://seslitab-app.onrender.com`
- Branch: `main`
- Live deploy commit: `48bfa4443356632cd1401efd246f0c590701f8d7`
- Status: **already aligned**

No action is required in TD-PROD-11.

### st-student-app

- Existing service ID: `srv-darsnufpn0mc73dt17og`
- Permanent URL: `https://st-student-app.onrender.com`
- Branch: `main`
- Live deploy commit: `b59bcb6dc5525f035515ab358734ebbe5a277fbb`
- Status: **aligned to the exact Student App revision qualified by Task 10**

No action is required in TD-PROD-11.

### st-student-api

- Existing service ID: `srv-darsntfavr4c7381t9f0`
- Permanent URL: `https://st-student-api.onrender.com`
- Current branch: `ses8-pilot-authorization-hardening`
- Current live commit: `33825c8332ab0f6b65a7206fc34c3ab3dd4f4185`
- Current rollback deploy: `dep-das3a6chaf8s73f1irr0`
- Current start command: `node backend/delivery/pilot/server.js`
- Auto-deploy: enabled
- Current log evidence: `[Secure Delivery] production server listening`

The last line is important. The repository's runtime selector enters the production server only when `SECURE_DELIVERY_PRODUCTION_ACTIVATION=true`. Therefore the production master selector is already active on the current service. This observation does **not** prove teacher writes are enabled; Render MCP does not expose the current environment values for read-only inspection.

### seslitab-omr

- Existing service ID: `srv-d9jmd26gekts7381pk1g`
- Permanent URL: `https://seslitab-omr.onrender.com`
- Branch: `main`
- Auto-deploy: disabled
- Service state: **suspended**
- Last live commit: `5d1242572f5fed906158882cb1dd0139889d5b51`

OMR remains a separate human gate and is not part of the Student Secure Delivery alignment.

## Safe target state

The alignment target uses the **same Render services and the same permanent URLs**.

For `st-student-api`:

- keep service ID `srv-darsntfavr4c7381t9f0`;
- keep URL `https://st-student-api.onrender.com`;
- keep start command `node backend/delivery/pilot/server.js`;
- move source branch to `main` only after a separate execution approval;
- deploy reviewed main revision only after explicit deploy approval;
- keep teacher writes disabled during source alignment;
- keep provisioning bootstrap disabled;
- keep acceptance bootstrap disabled unless separately approved;
- do not create a replacement API service.

The existing pilot entrypoint is intentionally retained because on `main` it selects the production server only through the existing master gate. Replacing the start command is unnecessary for source alignment.

## Mandatory preflight before any future live alignment

Do not change the branch until all items below are manually verified in the existing `st-student-api` service.

1. Record the current deploy ID and commit:
   - deploy `dep-das3a6chaf8s73f1irr0`
   - commit `33825c8332ab0f6b65a7206fc34c3ab3dd4f4185`
2. Confirm environment key names and safe values without copying secrets into GitHub, Linear, Notion, or chat.
3. Required source-alignment profile:
   - `SECURE_DELIVERY_PRODUCTION_ACTIVATION=true`
   - `SECURE_DELIVERY_WRITES_ENABLED=false`
   - `SECURE_DELIVERY_TEACHER_WRITES_ACTIVATION=false`
   - production provisioning bootstrap disabled
   - production acceptance bootstrap disabled unless explicitly authorized
4. Confirm the Firebase project ID is the approved non-emulator project.
5. Confirm Firebase Admin ADC is available to the service without exporting credential material.
6. Disable automatic deploy before changing the tracked branch, so changing the branch cannot silently promote unreviewed code.
7. Only then may the existing service branch be changed to `main` under a separate explicit approval.
8. Manually deploy the exact approved `main` revision under a separate deploy approval.
9. Verify `/health` reports a healthy production service with Student reads available and teacher writes disabled.
10. Stop. Teacher-write activation is a later independent gate.

## Rollback

If the future alignment deployment is unhealthy:

1. Do not enable teacher writes.
2. Restore the existing `st-student-api` service to the recorded deploy:
   - `dep-das3a6chaf8s73f1irr0`
   - commit `33825c8332ab0f6b65a7206fc34c3ab3dd4f4185`
3. Preserve the same service ID and URL.
4. Keep `seslitab-omr` suspended.
5. Investigate before another alignment attempt.

## Explicitly forbidden in TD-PROD-11 preparation

- creating a new Render service;
- creating a new Render domain;
- triggering a Render deploy;
- changing Render environment variables;
- changing the tracked Render branch;
- enabling teacher writes;
- provisioning/writing Firebase production state;
- resuming or deploying `seslitab-omr`.

## Stop condition

TD-PROD-11 preparation is complete when:

- the observed Render service/deploy reality is recorded;
- the existing-service-only target is machine-readable;
- rollback is recorded;
- activation/write/provisioning gates are explicit;
- CI verifies the dry-run manifest;
- no live infrastructure mutation has occurred.
