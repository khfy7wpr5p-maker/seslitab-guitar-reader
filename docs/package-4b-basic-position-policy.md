# Package 4B — Deterministic Basic Guitar Position Policy

## Scope

Package 4B defines the first explicit generated-basic fingering policy over Package 4A physical guitar-position candidates.

It does **not** claim source MusicXML technical fingering, teacher approval, pedagogical optimality, or advanced/polyphonic fingering. It does not render TAB and it does not activate the production `GUITAR_TAB` canonical consumer boundary.

## Policy

Policy identifier: `lowest-fret-v1`

Generated provenance: `generated-basic`

For one canonical pitched NoteObject:

1. enumerate Package 4A standard-tuning / 24-fret physical candidates;
2. choose the candidate with the lowest fret;
3. if two candidates have the same fret, choose the lower string number;
4. expose the result as generated-basic, never source truth.

The tie-break is deterministic and exists only to make the basic product behavior reproducible. It is not a claim of pedagogical superiority.

## Provenance boundary

Existing canonical notes can contain `stringLetter`, `stringNumber`, or `fret` fields, but the current canonical bridge does not yet provide a robust machine-readable contract proving whether those values came from explicit MusicXML `<technical>` fingering or from the parser's legacy calculated fallback.

Therefore Package 4B deliberately does **not** promote those fields to `source technical fingering`. A future slice may preserve source technical fingering only after explicit provenance is represented and tested.

## Fail-closed behavior

- rests stay rests and receive no position;
- unsupported/out-of-range pitch remains `unplayable`;
- malformed/non-canonical input remains `invalid`;
- no e0 fallback is invented;
- input NoteObject is never mutated;
- output is immutable and deterministic;
- no production OMR/provider/gateway imports;
- no Package 2D gate or consumer-binding changes;
- no parser changes;
- no dependency changes;
- no deployment.

## Examples

Written E4 under the existing SesliTab octave-transposing guitar mapping:

- physical candidates: D2, A7, low-E12
- `lowest-fret-v1`: D2
- provenance: `generated-basic`

Written E5:

- candidates include high-e open plus higher-fret alternatives
- `lowest-fret-v1`: high-e open
- provenance: `generated-basic`

## Next safe slice

After Package 4B passes exact-head and exact-main CI, the next safe step is to define a canonical NoteObject[] → basic Guitar TAB projection/render contract while keeping Package 2D quality-gate enforcement fail-closed until the consumer integration itself is explicitly verified.
