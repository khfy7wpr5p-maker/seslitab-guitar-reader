# Score View Browser Proof

This verification slice proves the pinned ST Score Rendering Layer runtime can produce real SVG notation inside a headless Chrome/Chromium browser after the normal SesliTab production build.

The proof remains presentation-only. It does not modify Audiveris, OMR provider selection, PDF upload/job lifecycle, Cloud OMR Gateway, Dockerfile, render.yaml, TTS, playback, quality gating, teacher revision/approval, or canonical musical authority.

Acceptance gate:

- production build prepares the pinned ST runtime;
- Chrome/Chromium loads the generated runtime modules;
- the ST-owned `__ST_SCORE_RENDER_HOST__` accepts bounded in-memory MusicXML with contract `0.2.0`;
- the runtime exports at least one SVG page;
- a real `<svg>` exists in the browser DOM;
- missing browser/runtime/SVG evidence fails closed.

Cursor/highlight synchronization remains a later slice.
