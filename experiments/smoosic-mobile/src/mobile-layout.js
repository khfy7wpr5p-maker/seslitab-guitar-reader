document.addEventListener('click', (event) => {
  if (window.innerWidth > 820) return;
  const target = event.target;
  if (!(target instanceof Element)) return;

  if (target.closest('#mobile-menu-toggle')) {
    const resetMenuScroll = () => {
      if (!document.body.classList.contains('mobile-menu-open')) return;
      const menu = document.getElementById('controls-left');
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
