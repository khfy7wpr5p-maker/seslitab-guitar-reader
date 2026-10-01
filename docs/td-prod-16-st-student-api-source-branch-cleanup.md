# TD-PROD-16 — Canonical st-student-api Source Branch Cleanup

## Purpose

Make the repository source authority for the existing `st-student-api` service explicit without changing any live Render, Firebase, OMR, deployment, environment, or teacher-write state.

This package is **source/docs/ops only**.

Machine-readable contract:

- `ops/st-student-api-source-branch.v1.json`

## Fresh qualified baseline — 2026-10-01

Protected SesliTab `main`:

- `a10cf3e609de5a566294eea58640cf3fd5097716`

Exact-main qualification for the same SHA:

- CI #1458: **SUCCESS**, attempt 1
- Regression Quality #795: **SUCCESS**, attempt 1
- Dependency Security run 14: **SUCCESS**, attempt 1
- Production Gate #2: **SUCCESS**, attempt 1

Production Gate PASS is a technical prerequisite only. It does not authorize a Render branch switch, deploy, environment mutation, Firebase production write, teacher-write activation, or OMR operation.

## Read-only Git reality

Legacy Render-tracked branch:

- `ses8-pilot-authorization-hardening`
- branch head: `515189192b139a0924e2adca41bdc47a7cacdc26`

Compared with qualified `main@a10cf3e609de5a566294eea58640cf3fd5097716`:

- main ahead: **21 commits**
- main behind: **0 commits**
- legacy branch is a strict ancestor of main
- a future branch transition is fast-forward-compatible at the Git-history level

This does not itself authorize that live transition.

## Read-only Render reality

Existing service:

- service ID: `srv-darsntfavr4c7381t9f0`
- permanent URL: `https://st-student-api.onrender.com`
- tracked branch: `ses8-pilot-authorization-hardening`
- current LIVE deploy: `dep-daulsgvf3r2c73fv8on0`
- live commit: `515189192b139a0924e2adca41bdc47a7cacdc26`
- start command: `node backend/delivery/pilot/server.js`
- auto-deploy: enabled

No Render mutation was performed while collecting this evidence.

## Source-authority decision

For future `st-student-api` development and production-source qualification:

- protected `main` is the **canonical Git source authority**;
- `ses8-pilot-authorization-hardening` is retained as **LIVE_TRACKED_HISTORICAL** evidence until a separately approved Render branch transition occurs;
- the legacy branch is not a second development authority;
- do not force-update, delete, rewrite, or silently advance the legacy branch in TD-PROD-16;
- do not rewrite TD-PROD-11/12 historical evidence to pretend the live service already tracks `main`.

## Historical evidence preserved

The following remain historical records and are intentionally not repurposed:

- `docs/render-production-alignment-dry-run.md`
- `ops/render-production-alignment.v1.json`

They describe the TD-PROD-11/12 preparation and alignment history. TD-PROD-16 adds a new current source-authority contract instead of destroying that evidence.

## Explicitly forbidden in TD-PROD-16

- changing the Render tracked branch;
- triggering or forcing a deploy;
- changing Render environment variables;
- creating a new Render service or domain;
- enabling teacher writes;
- provisioning or writing Firebase production state;
- resuming or deploying `seslitab-omr`;
- force-pushing or rewriting branch history;
- unrelated runtime or product refactoring.

## Next independent production gate

The next production action, if separately approved, is:

`switch the existing st-student-api tracked Render branch to main`

That later gate must fresh-read:

1. current protected `main` and exact-main CI / Regression Quality / Dependency Security / Production Gate evidence;
2. existing Render service ID, URL, start command, tracked branch, current deploy and rollback point;
3. safe write/activation/provisioning flags without exposing secrets;
4. current Firebase identity/grant prerequisites;
5. confirm auto-deploy is disabled before changing the tracked branch, so the branch switch cannot silently trigger deployment.

The branch switch, deployment, teacher-write activation, production assignment smoke, Firebase provisioning/grants, and OMR live E2E remain distinct approvals.

## Rollback / preservation rule

TD-PROD-16 itself changes no live service, so it has no infrastructure rollback action. Repository rollback is simply reverting the bounded SES-128 docs/ops/test commit(s).

The existing production service, URL, branch, deploy, environment and OMR state remain untouched.
