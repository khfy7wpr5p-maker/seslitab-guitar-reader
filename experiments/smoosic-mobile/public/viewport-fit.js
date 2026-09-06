(() => {
  const MOBILE_MAX_WIDTH = 820;
  const BOTTOM_GAP_PX = 4;
  const MENU_GAP_PX = 4;
  let scheduledFrame = 0;

  function parentWindow() {
    try {
      if (window.parent && window.parent !== window) return window.parent;
    } catch {}
    return null;
  }

  function hostHeaderBottom(parent, viewportTop) {
    try {
      const header = parent.document?.querySelector?.('.app-header');
      if (!header) return viewportTop;
      return Math.max(viewportTop, Number(header.getBoundingClientRect().bottom || viewportTop));
    } catch {
      return viewportTop;
    }
  }

  function fitMenuToVisibleHostViewport(parent, frame, viewportTop) {
    const menu = document.getElementById('controls-left');
    if (!menu) return;

    const frameTop = Number(frame.getBoundingClientRect().top || 0);
    const visibleHostTop = hostHeaderBottom(parent, viewportTop);
    const occludedTop = Math.max(0, Math.ceil(visibleHostTop - frameTop));
    const topBar = document.querySelector("[id$='-top-bar']");
    const topBarHeight = Math.max(0, Math.ceil(Number(topBar?.getBoundingClientRect?.().height || 46)));
    const menuTop = Math.max(topBarHeight, occludedTop + MENU_GAP_PX);

    document.documentElement.style.setProperty('--seslitab-mobile-menu-top', `${menuTop}px`);
    frame.dataset.seslitabMenuTop = String(menuTop);
    frame.dataset.seslitabHostOccludedTop = String(occludedTop);
  }

  function fitEditorFrame() {
    scheduledFrame = 0;
    const parent = parentWindow();
    const frame = window.frameElement;
    if (!parent || !frame) return;

    if (parent.innerWidth > MOBILE_MAX_WIDTH) {
      frame.style.removeProperty('height');
      frame.style.removeProperty('min-height');
      document.documentElement.style.removeProperty('--seslitab-mobile-menu-top');
      delete frame.dataset.seslitabViewportFit;
      delete frame.dataset.seslitabViewportHeight;
      delete frame.dataset.seslitabMenuTop;
      delete frame.dataset.seslitabHostOccludedTop;
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
    fitMenuToVisibleHostViewport(parent, frame, viewportTop);
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
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('#mobile-menu-toggle')) scheduleFit();
    }, { passive: true });
    window.addEventListener('load', scheduleFit, { once: true });

    const observer = new MutationObserver(() => {
      if (!document.getElementById('controls-left')) return;
      observer.disconnect();
      scheduleFit();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    scheduleFit();
    setTimeout(scheduleFit, 0);
  }

  bindViewport();
})();
