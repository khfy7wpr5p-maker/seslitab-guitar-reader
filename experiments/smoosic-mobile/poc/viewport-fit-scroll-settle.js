(() => {
  const MOBILE_MAX_WIDTH = 820;
  const BOTTOM_GAP_PX = 4;
  const MENU_GAP_PX = 4;
  const SCROLL_SETTLE_MS = 140;
  let scheduledFrame = 0;
  let scheduledMenuFrame = 0;
  let scrollSettleTimer = 0;

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

  function clearMobileFrameState(parent, frame) {
    if (scrollSettleTimer) {
      parent.clearTimeout(scrollSettleTimer);
      scrollSettleTimer = 0;
    }
    frame.style.removeProperty('height');
    frame.style.removeProperty('min-height');
    document.documentElement.style.removeProperty('--seslitab-mobile-menu-top');
    delete frame.dataset.seslitabViewportFit;
    delete frame.dataset.seslitabViewportHeight;
    delete frame.dataset.seslitabMenuTop;
    delete frame.dataset.seslitabHostOccludedTop;
    delete frame.dataset.seslitabPocMode;
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

    if (frame.dataset.seslitabMenuTop !== String(menuTop)) {
      document.documentElement.style.setProperty('--seslitab-mobile-menu-top', `${menuTop}px`);
      frame.dataset.seslitabMenuTop = String(menuTop);
    }
    if (frame.dataset.seslitabHostOccludedTop !== String(occludedTop)) {
      frame.dataset.seslitabHostOccludedTop = String(occludedTop);
    }
  }

  function fitEditorFrame() {
    scheduledFrame = 0;
    const parent = parentWindow();
    const frame = window.frameElement;
    if (!parent || !frame) return;

    if (parent.innerWidth > MOBILE_MAX_WIDTH) {
      clearMobileFrameState(parent, frame);
      return;
    }

    const viewport = parent.visualViewport;
    const viewportTop = Number(viewport?.offsetTop || 0);
    const viewportHeight = Number(viewport?.height || parent.innerHeight || 0);
    const viewportBottom = viewportTop + viewportHeight;
    const frameTop = frame.getBoundingClientRect().top;
    const availableHeight = Math.floor(viewportBottom - frameTop - BOTTOM_GAP_PX);
    if (availableHeight <= 0) return;

    const heightText = `${availableHeight}px`;
    if (frame.dataset.seslitabViewportHeight !== String(availableHeight) || frame.style.height !== heightText) {
      frame.style.height = heightText;
      frame.dataset.seslitabViewportHeight = String(availableHeight);
    }
    if (frame.style.minHeight !== '0px') frame.style.minHeight = '0px';
    frame.dataset.seslitabViewportFit = 'mobile';
    frame.dataset.seslitabPocMode = 'scroll-settle-v1';
    fitMenuToVisibleHostViewport(parent, frame, viewportTop);
  }

  function fitMenuOnly() {
    scheduledMenuFrame = 0;
    const parent = parentWindow();
    const frame = window.frameElement;
    if (!parent || !frame) return;
    if (parent.innerWidth > MOBILE_MAX_WIDTH) {
      document.documentElement.style.removeProperty('--seslitab-mobile-menu-top');
      delete frame.dataset.seslitabMenuTop;
      delete frame.dataset.seslitabHostOccludedTop;
      return;
    }
    fitMenuToVisibleHostViewport(parent, frame, Number(parent.visualViewport?.offsetTop || 0));
  }

  function scheduleFit() {
    if (scheduledFrame) return;
    const parent = parentWindow();
    if (!parent) return;
    scheduledFrame = parent.requestAnimationFrame(fitEditorFrame);
  }

  function scheduleMenuFit() {
    if (scheduledMenuFrame) return;
    const parent = parentWindow();
    if (!parent) return;
    scheduledMenuFrame = parent.requestAnimationFrame(fitMenuOnly);
  }

  function scheduleSettledFrameFit() {
    const parent = parentWindow();
    if (!parent) return;
    if (scrollSettleTimer) parent.clearTimeout(scrollSettleTimer);
    scrollSettleTimer = parent.setTimeout(() => {
      scrollSettleTimer = 0;
      scheduleFit();
    }, SCROLL_SETTLE_MS);
  }

  function scheduleViewportMotionFit() {
    scheduleMenuFit();
    scheduleSettledFrameFit();
  }

  function scheduleParentResizeFit() {
    if (scrollSettleTimer) {
      scheduleViewportMotionFit();
      return;
    }
    scheduleFit();
    scheduleMenuFit();
  }

  function scheduleOrientationFit() {
    const parent = parentWindow();
    if (parent && scrollSettleTimer) {
      parent.clearTimeout(scrollSettleTimer);
      scrollSettleTimer = 0;
    }
    scheduleFit();
    scheduleMenuFit();
  }

  function bindViewport() {
    const parent = parentWindow();
    if (!parent) return;

    parent.addEventListener('resize', scheduleParentResizeFit, { passive: true });
    parent.addEventListener('orientationchange', scheduleOrientationFit, { passive: true });
    parent.addEventListener('scroll', scheduleViewportMotionFit, { passive: true });
    parent.visualViewport?.addEventListener('resize', scheduleViewportMotionFit, { passive: true });
    parent.visualViewport?.addEventListener('scroll', scheduleViewportMotionFit, { passive: true });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('#mobile-menu-toggle')) return;
      scheduleMenuFit();
      if (!scrollSettleTimer) scheduleFit();
    }, { passive: true });

    window.addEventListener('load', () => {
      scheduleFit();
      scheduleMenuFit();
    }, { once: true });

    const observer = new MutationObserver(() => {
      if (!document.getElementById('controls-left')) return;
      observer.disconnect();
      scheduleFit();
      scheduleMenuFit();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    scheduleFit();
    scheduleMenuFit();
    setTimeout(scheduleFit, 0);
  }

  bindViewport();
})();
