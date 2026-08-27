# Package 2E-D — Isolated Comparative Runner

Status: **Under verification**

Package 2E-D adds the experimental orchestration boundary required to compare all eight approved Package 2E input/preprocessing variants without changing the production OMR path.

## Runner contract

A complete experiment requires exactly one instance of each approved variant kind. Each variant:

1. receives its own temporary workspace,
2. receives a copied local source file rather than the original source path,
3. runs through caller-supplied experimental preprocessing and OMR adapters,
4. validates that the prepared artifact remains inside the dedicated workspace,
5. verifies the original source SHA-256/byte length before and after adapter execution,
6. sends generated MusicXML into the Package 2E-C evidence adapter,
7. removes all temporary experiment files in `finally`.

The returned result contains stable source metadata and measured/unmeasured variant evidence. It does not contain raw MusicXML, absolute temporary paths, timestamps, or merged output notes.

## Fail-closed behavior

- unsupported, duplicate, or incomplete variant sets are rejected before adapters run,
- an artifact escaping its variant workspace is rejected,
- original source mutation aborts the experiment,
- adapter exceptions abort the complete experiment after cleanup rather than returning a partial comparable result,
- an explicitly unavailable experimental capability is represented as `NOT_MEASURED`,
- absence of golden MusicXML keeps recognition-comparison metrics `NOT_MEASURED`.

## Production boundary

Package 2E-D imports no production Audiveris provider, OMR worker/provider/gateway, `omrService`, or E2E implementation. Experimental adapters are dependency-injected at the benchmark boundary.

The runner does not provide or claim empirical Audiveris recognition accuracy by itself. Real preprocessing/OMR adapters may be connected later for controlled benchmark runs, but any unavailable or unexecuted capability remains unmeasured.

No deployment is included.

## Next safe slice

After exact PR-head and post-merge `main` CI verify 2E-D, Package 2E-E should add deterministic evidence-based recommendation/reporting. It must select a best complete measured variant only when the defined metrics support an unambiguous choice; ties, trade-offs, incomplete measurements, or review-required evidence must not produce a winner.
