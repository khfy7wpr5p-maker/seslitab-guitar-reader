# SES-172 post-merge diagnostics

Base main: `58e92c0b119073ae1e3761ed14b429388f5e2653`.

CI 37157317703 passed Node tests and build, then timed out waiting for the malformed-provenance status in CE-BRIDGE. Production Gate 37157493145 correctly rejected this unsuccessful CI run. That gate is unchanged.

The baseline CE-BRIDGE proof passed locally once plus three repeats using an npm-sourced local jQuery asset because the CDN is blocked in this environment. Its reported CI timeout has **not** been reproduced, including a delayed import-poll experiment. No timeout was increased and no assertion was skipped.

Direct execution of the baseline delivery function preserved the XML payload; nested escaping was not proven defective. A small helper makes serialization explicit. The fixture now confirms the actual postMessage source/origin and exact payload, waits for the parent's completed handoff, and verifies accepted XML and source revision remain unchanged after rejection. Failed runs remove any prior success artifact. These changes improve the proof; they do not establish the original CI timeout's cause.

Regression Quality push 37157317692 succeeded as a scanner workflow, while diagnostics 37157602002 rejected CE task `AaED0q95Ay3xakmEYgvY`. Scanner upload success is not server processing success or quality acceptance. The scan intentionally does not wait for the quality gate; diagnostics retain the exact task/analysis binding. A scanner warning mentioning `IllegalStateException` is not evidence of the CE root cause.

CE failures now distinguish upstream FAILED/CANCELED, invalid task schema/status, task/project/branch mismatch, HTTP/API errors, and exhausted polling budget. A separate `sonarqube-ce-failure/status.json` contains only validated task/project identifiers and bounded status/reason/category fields. Raw server messages, stack traces and private source data are omitted. Failed CE tasks remain failures, with no issue/gate export.

External evidence remains unavailable: local public Sonar GET was blocked by proxy HTTP 403; root's unauthenticated task and gate queries returned HTTP 404. No Sonar token is configured here. The supplied analysis ID `404755df-b090-4acf-9ebe-21b7081a5212` has not been linked to this task or merge SHA. Authenticated Background Tasks evidence is required to determine the actual server error; no host/privacy/missing-task cause is inferred from 404.
