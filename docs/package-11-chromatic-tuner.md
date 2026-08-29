# Package 11 — Accessible Chromatic Tuner

Date: 2026-08-29

Status: **Completed.**

Verified implementation evidence:

- implementation PR **#125** merged to protected `main`;
- protected-main implementation SHA `160c3bcadfc634f7b1300627993e89ebda764576`;
- exact-head CI **#325 — SUCCESS**;
- exact-main CI **#326 / run `33258600115`, job `99116529789` — SUCCESS**;
- **1352 / 1352 tests PASS**, 232 suites, 0 failed/skipped/cancelled;
- **0 vulnerabilities**;
- production build **PASS**;
- real Chrome score render + cursor runtime proof **PASS**.

## Goal

Provide a modern, accessible, fully chromatic tuner that works independently of PDF/OMR processing.

Package 11 detects all 12 equal-tempered pitch classes, including enharmonic sharp/flat names, from live microphone audio in the browser.

## Detection design

The tuner uses the browser Web Audio API and a bounded YIN-style fundamental-frequency detector:

- microphone capture uses `getUserMedia` only after explicit user action;
- an `AnalyserNode` supplies floating-point time-domain samples;
- pitch analysis uses cumulative mean normalized difference plus parabolic lag interpolation;
- analysis is downsampled by averaging to reduce CPU cost while preserving the guitar/violin tuning range;
- RMS noise gating prevents silence from becoming an invented note;
- confidence gating rejects unstable pitch estimates;
- same-note exponential smoothing reduces display jitter without carrying stale state across note changes.

No remote audio analysis service or external tuner dependency is added.

## Chromatic contract

Supported chromatic classes:

`Do, Do♯/Re♭, Re, Re♯/Mi♭, Mi, Fa, Fa♯/Sol♭, Sol, Sol♯/La♭, La, La♯/Si♭, Si`

Default reference is A4 = 440 Hz. The teacher/user may calibrate A4 from 415.0 through 466.2 Hz in 0.1 Hz steps.

The live range is intentionally bounded to 40–2000 Hz for reliable real-time browser performance. This covers standard guitar and violin tuning/use ranges while remaining instrument-agnostic and chromatic.

## Tuning feedback

The display exposes:

- detected note and octave;
- measured frequency in Hz;
- signed cent deviation;
- a centered −50…+50 cent meter;
- explicit text states: very flat, flat, near flat, in tune, near sharp, sharp, very sharp.

Policy thresholds:

- ±2 cents: `Akortta`;
- ±5 cents: `Çok yakın`;
- larger deviation: explicit `Pes` or `Tiz` correction direction.

Color is never the only state signal.

## Accessibility

- native buttons and numeric calibration input;
- keyboard-visible focus;
- live polite screen-reader announcements throttled to avoid continuous speech flooding;
- note, octave, direction, frequency and cent values are available as text;
- the cent meter has an accessible value description;
- responsive layout for mobile/low-vision use;
- tuner can be used without loading a score.

## Privacy and safety

Microphone audio remains local to the browser. The tuner does not upload, persist, record or send microphone audio to the SesliTab backend.

Mic capture stops when the user presses Stop, the page is closed/left, or setup fails after microphone permission is granted.

Package 11 does not modify or depend on:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- backend production OMR path;
- Package 8B research/training/model path;
- `Dockerfile`;
- `render.yaml`;
- Render deployment/service wiring.
