# SesliTab Proprietary Extension Boundary

Status: architectural and licensing boundary

This document defines what the public `seslitab-guitar-reader` repository does and does not promise to contain.

## Public repository role

The public repository may contain the interoperable application shell and generally reusable infrastructure needed for SesliTab, including:

- standards-based accessibility plumbing such as semantic HTML, ARIA, keyboard support and screen-reader compatibility;
- generic MusicXML parsing and canonical note/time contracts;
- OMR gateway/provider integration subject to third-party licenses;
- structural validation and quality-state transport;
- generic playback and browser TTS integration;
- public API/contract definitions required to connect optional extensions.

All SesliTab-owned material in this repository remains subject to the repository license. Third-party components retain their own licenses.

## Proprietary/private extension boundary

The public repository does not grant any expectation that the following product-specific capabilities will be developed or published here:

1. **Accessibility Education Core**
   - product-specific pedagogical logic for blind and low-vision learners;
   - adaptive non-visual learning flows beyond standards-based accessibility plumbing;
   - product-specific instructional sequencing and learner feedback policies.

2. **Music Education and Turkish Pedagogy Core**
   - proprietary pedagogical phrasing, sequencing and instructional decision rules;
   - learner-level adaptation and teacher-guided educational policies;
   - future intelligent tutoring or teacher-assistance logic.

3. **Guitar Pedagogy Extensions**
   - proprietary ranking or recommendation logic for pedagogical fingering, positions, exercises or student-level choices;
   - future teacher-reviewable learning-intelligence layers built above public musical data contracts.

4. **Commercial Product Logic**
   - pricing, entitlement, plan, licensing, institution/student commercial policy and other business-rule implementations;
   - commercial account and feature-gating logic not required for the public interoperability contract.

5. **Private Data and Evaluation Assets**
   - teacher-verified datasets;
   - learner data;
   - accessibility research data;
   - proprietary training/evaluation corpora and model assets;
   - private annotations, gold references and internal benchmarks unless explicitly released under a separate license.

These capabilities may be implemented in separate private repositories, private services, or separately licensed modules. Their absence from the public repository is intentional and is not an incomplete public API promise.

## Integration rule

Where a proprietary extension needs to interoperate with the public application, the preferred boundary is a narrow, versioned, testable contract. The public side should expose only the minimum data needed for interoperability and must not require disclosure of proprietary implementation details.

Public contracts must preserve the project's existing safety principles, including source-verification state, teacher approval boundaries, immutable source data and fail-closed behavior for unverified music.

## No silent transfer of rights

Publication of interface definitions, examples, compatibility shims or public application code does not grant rights to unpublished datasets, proprietary pedagogy, commercial services, trademarks, private repositories or separately licensed technology.

See also:

- `LICENSE`
- `COMMERCIAL-LICENSE.md`
- `TRADEMARKS.md`
- `THIRD_PARTY_NOTICES.md`
