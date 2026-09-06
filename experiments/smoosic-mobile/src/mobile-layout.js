const MOBILE_MAX_WIDTH = 820;
let menuHome = null;
let menuNextSibling = null;
let menuResetGeneration = 0;

function portalMobileMenu() {
  const menu = document.getElementById('controls-left');
  if (!menu) return null;
  if (window.innerWidth > MOBILE_MAX_WIDTH) return menu;
  if (menu.parentElement === document.body) return menu;

  menuHome = menu.parentElement;
  menuNextSibling = menu.nextSibling;
  document.body.appendChild(menu);
  return menu;
}

function resetMenuPosition(menu) {
  if (!menu) return;
  menu.scrollTop = 0;
  menu.scrollLeft = 0;
}

function blurRetainedMenuFocus(menu, preferredTarget = null) {
  if (!menu || typeof menu.contains !== 'function') return;
  const active = preferredTarget && menu.contains(preferredTarget)
    ? preferredTarget
    : document.activeElement;
  if (!active || !menu.contains(active) || typeof active.blur !== 'function') return;
  active.blur();
}

function dismissOpenSmoosicOverlay() {
  const overlay = document.querySelector('.modal.show, .menuContainer .menuElement.show');
  if (!overlay) return false;

  const cancel = typeof overlay.querySelector === 'function'
    ? overlay.querySelector('[data-value="cancel"], .cancel-button, [data-bs-dismiss="modal"], .btn-close')
    : null;
  if (cancel && typeof cancel.click === 'function') {
    cancel.click();
    return true;
  }

  if (typeof KeyboardEvent === 'function' && document.body && typeof document.body.dispatchEvent === 'function') {
    document.body.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    }));
    return true;
  }
  return false;
}

function stabilizeOpenMenuAtTop(menu) {
  if (!menu) return;
  const generation = ++menuResetGeneration;
  blurRetainedMenuFocus(menu);

  const resetIfCurrent = () => {
    if (generation !== menuResetGeneration) return;
    if (!document.body.classList.contains('mobile-menu-open')) return;
    resetMenuPosition(menu);
  };

  resetIfCurrent();
  window.requestAnimationFrame(() => {
    resetIfCurrent();
    window.requestAnimationFrame(resetIfCurrent);
  });
  window.setTimeout(resetIfCurrent, 80);
  window.setTimeout(resetIfCurrent, 180);
}

function settleClosedMenu(menu, preferredTarget = null) {
  menuResetGeneration += 1;
  blurRetainedMenuFocus(menu, preferredTarget);
  resetMenuPosition(menu);
}

function restoreMobileMenu() {
  if (window.innerWidth <= MOBILE_MAX_WIDTH || !menuHome) return;
  const menu = document.getElementById('controls-left');
  if (!menu || menu.parentElement !== document.body) return;

  settleClosedMenu(menu);
  if (menuNextSibling && menuNextSibling.parentElement === menuHome && typeof menuHome.insertBefore === 'function') {
    menuHome.insertBefore(menu, menuNextSibling);
  } else if (typeof menuHome.appendChild === 'function') {
    menuHome.appendChild(menu);
  }
  menuHome = null;
  menuNextSibling = null;
  document.body.classList.remove('mobile-menu-open');
}

document.addEventListener('click', (event) => {
  if (window.innerWidth > MOBILE_MAX_WIDTH) return;
  const target = event.target;
  if (!(target instanceof Element)) return;

  if (target.closest('#mobile-menu-toggle')) {
    const menu = portalMobileMenu();
    if (document.body.classList.contains('mobile-menu-open')) {
      dismissOpenSmoosicOverlay();
      stabilizeOpenMenuAtTop(menu);
    } else {
      settleClosedMenu(menu);
    }
    return;
  }

  if (target.closest('#controls-left button')) {
    const menu = document.getElementById('controls-left');
    document.body.classList.remove('mobile-menu-open');
    settleClosedMenu(menu, target);
  }
});

window.addEventListener('resize', restoreMobileMenu, { passive: true });
window.addEventListener('orientationchange', restoreMobileMenu, { passive: true });
