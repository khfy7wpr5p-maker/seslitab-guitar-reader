(() => {
  const MOBILE_MAX_WIDTH = 820;
  const BOTTOM_GAP_PX = 4;
  let scheduledFrame = 0;

  function parentWindow() {
    try {
      if (window.parent && window.parent !== window) return window.parent;
    } catch {}
    return null;
  }

  function fitEditorFrame() {
    scheduledFrame = 0;
    const parent = parentWindow();
    const frame = window.frameElement;
    if (!parent || !frame) return;

    if (parent.innerWidth > MOBILE_MAX_WIDTH) {
      frame.style.removeProperty('height');
      frame.style.removeProperty('min-height');
      delete frame.dataset.seslitabViewportFit;
      delete frame.dataset.seslitabViewportHeight;
      return;
    }

    const viewport = parent.visualViewport;
    const viewportTop = Number(viewport?.offsetTop || 0);
    const viewportHeight = Number(viewport?.height || parent.innerHeight || 0);
    const viewportBottom = viewportTop + viewportHeight;
    const frameTop = frame.getBoundingClientRect().top;
    const availableHeight = Math.floor(viewportBottom - frameTop - BOTTOM_GAP_PX);
    if (availableHeight <= 0) return;

    frame.style.height = `${availableHeight}px`;
    frame.style.minHeight = '0px';
    frame.dataset.seslitabViewportFit = 'mobile';
    frame.dataset.seslitabViewportHeight = String(availableHeight);
  }

  function scheduleFit() {
    if (scheduledFrame) return;
    const parent = parentWindow();
    if (!parent) return;
    scheduledFrame = parent.requestAnimationFrame(fitEditorFrame);
  }

  function bindViewport() {
    const parent = parentWindow();
    if (!parent) return;

    parent.addEventListener('resize', scheduleFit, { passive: true });
    parent.addEventListener('orientationchange', scheduleFit, { passive: true });
    parent.addEventListener('scroll', scheduleFit, { passive: true });
    parent.visualViewport?.addEventListener('resize', scheduleFit, { passive: true });
    parent.visualViewport?.addEventListener('scroll', scheduleFit, { passive: true });
    window.addEventListener('load', scheduleFit, { once: true });

    scheduleFit();
    setTimeout(scheduleFit, 0);
  }

  bindViewport();
})();
