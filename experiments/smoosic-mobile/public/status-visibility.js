(() => {
  const status = document.getElementById('poc-status');
  if (!status) return;

  let hideTimer = null;
  const actionablePattern = /(hata|başarısız|bulunamadı|oluşmadı|reddedildi)/i;
  const busyPattern = /(yükleniyor|hazırlanıyor|başlatılıyor|aktarılıyor)/i;

  const refreshVisibility = () => {
    const text = String(status.textContent || '').trim();
    const isError = actionablePattern.test(text);
    const isBusy = busyPattern.test(text);

    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    status.classList.toggle('is-visible', isError || isBusy);

    if (isError) {
      hideTimer = setTimeout(() => {
        status.classList.remove('is-visible');
        hideTimer = null;
      }, 5000);
    }
  };

  new MutationObserver(refreshVisibility).observe(status, {
    childList: true,
    characterData: true,
    subtree: true
  });

  refreshVisibility();
})();
