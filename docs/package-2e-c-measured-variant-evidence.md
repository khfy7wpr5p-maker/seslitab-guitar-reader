# Package 2E-C — Measured Variant Evidence

Status: **Under verification**

Package 2E-C connects one isolated benchmark variant's generated MusicXML to the Package 2B/2C quality evidence and Package 2E-B teacher-verified golden comparator without changing production OMR behavior.

## Contract

A measured record stores:

- immutable variant identity and variant kind
- input metadata
- preprocessing settings
- Audiveris settings
- generated MusicXML artifact SHA-256, byte length, and format
- Package 2C validator findings and quality state
- golden comparison evidence when a repository teacher-verified reference is supplied
- explicit `NOT_MEASURED`, `REVIEW_REQUIRED`, or `UNKNOWN` states when evidence is incomplete

Raw generated MusicXML is not retained in the returned evidence record.

Measured event equality does not become a claim of complete musical correctness. `sourceVerification` remains review-required/non-definitive unless an independent verification workflow supplies that evidence.

## Safety boundary

2E-C does not:

- invoke Audiveris
- preprocess files or images
- import the production OMR provider/worker/gateway
- change the production MusicXML parser
- rewrite or repair MusicXML
- merge notes across OMR outputs
- write benchmark artifacts to disk
- select a best variant
- deploy anything

## Next safe slice

After exact-head and exact post-merge CI verify 2E-C, Package 2E-D may introduce the isolated experimental runner. That runner must use dedicated temporary workspaces, preserve original bytes, validate variant-path containment, clean temporary files in `finally`, remain outside the production OMR path, and expose unavailable experimental capabilities as unmeasured rather than inventing results.
