# GTAB-10C investigation (in progress)

Baseline SesliTab PR #335: a7dbb784cd3e9e3c7de2ac3a8738e9a9f4d8c7cb.
Editor baseline: 34851f3f1ec00d3804144f414090bcfab8314808.
Semantic Engine: ef305f45ff90d940ac6c51a0c46c4fac006d7c5c; Partitura 1.9.0.

Confirmed failures and repairs:
- Smoosic-like MIDI 55 position string 3/fret 5 is MIDI 60, rejected by the actual Editor guitar model. Correct string 3/fret 0 preserves pitch 55.
- Unexpected exported staff accessed an uninitialized context list. Controlled non-PASS now replaces the TDZ exception.
- Matching tie-presence booleans previously permitted dangling endpoints. Reciprocal, adjacent, same-part/staff/voice/pitch structural graph validation rejects invalid endpoints, while renamed IDs preserve topology.
- Missing key/clef arrays are incomplete oracle coverage, distinct from valid empty key arrays.
- UTF-16 DTD/entity input bypassed the old ASCII byte test. defusedxml rejects declarations regardless of encoding. Fractional/nonfinite alterations no longer round to an integer MIDI pitch.
- Target part ordinal/count and oracle original-byte hashes are bound; the runner checks actual checkout HEAD, including CI merge SHA.

Local verification at this stage: comparator 21/21; Python 8/8 including actual pinned oracle invocation. Real pinned Editor → SesliTab handoff → Python oracle passes Audiveris-like and Smoosic-like fixtures. MuseScore-like remains non-PASS: original explicit key context is dropped by the pinned Editor, and Partitura links only one staff's ties when both staffs share voice/pitch. No context removal, tie manufacture, unsupported-diagnostic whitelist, or threshold change was used.

Read views add deterministic note IDs only at this stage. Existing IDs/tie markers are preserved; duplicates/collisions rejected. Snapshots are produced from these read views, not claimed as direct original-byte snapshots. Artifact records normalization policy, original/read-view SHA256 and note mapping; original files are re-read before output. A separately authorized narrow upstream Editor key-context repair and reversible oracle staff/voice disambiguation remain in progress.

PR Sonar baseline failed coverage 64.9, Security C, Reliability D (root-reported). Actual current issue locations unavailable through this workspace: public Sonar proxy CONNECT 403 and gh API Forbidden. No claim of finding disappearance or final gate acceptance. Coverage import, full tests/build/audit and exact-head CI remain pending. No merge/deploy.
