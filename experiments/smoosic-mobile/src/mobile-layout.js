const MOBILE_MAX_WIDTH = 820;
let menuHome = null;
let menuNextSibling = null;

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

function restoreMobileMenu() {
  if (window.innerWidth <= MOBILE_MAX_WIDTH || !menuHome) return;
  const menu = document.getElementById('controls-left');
  if (!menu || menu.parentElement !== document.body) return;

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
    const resetMenuScroll = () => {
      if (!document.body.classList.contains('mobile-menu-open')) return;
      if (!menu) return;
      menu.scrollTop = 0;
      menu.scrollLeft = 0;
    };
    resetMenuScroll();
    window.requestAnimationFrame(resetMenuScroll);
    return;
  }

  if (target.closest('#controls-left button')) {
    document.body.classList.remove('mobile-menu-open');
  }
});

window.addEventListener('resize', restoreMobileMenu, { passive: true });
window.addEventListener('orientationchange', restoreMobileMenu, { passive: true });
