# SES-140 revoke and malformed final XML qualification

This extends the current TD-PROD-10 fixture; it preserves its SCORE-only,
exact SCORE/TAB and multipart examples and existing Student revision pin.
It exercises actual package, orchestrator, authorization and delivery
services against an isolated in-memory repository, without live accounts.

- Revoke: read the delivered SCORE, apply teacher REVOKE, verify the durable
  revoked record, require the specific revoked-not-found error on the same
  Student read, and verify the assignment disappears from that Student list.
- Malformed XML: pass damaged XML alongside previously parsed notes through
  the actual final-intake/package/delivery sequence. Require intake rejection,
  zero prepare/deliver calls and no records for that attempted assignment.
  Then successfully deliver valid XML through the same sequence and store,
  proving the call counters and backend path can actually be reached.

2026-10-26 local evidence: six focused tests pass; the complete Teacher
suite passes 3084 tests with 31 skips and zero failures, using Chromium
headless shell 141.0.7390.37 for the existing browser-backed checks.
No production runtime, authorization policy, deployment or account changed.
