document.addEventListener('click', (event) => {
  if (window.innerWidth > 820) return;
  const target = event.target;
  if (target instanceof Element && target.closest('#controls-left button')) {
    document.body.classList.remove('mobile-menu-open');
  }
});
