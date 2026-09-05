const { SuiApplication, SuiSampleMedia, SmoScore } = require('smoosic');

function sendKey(key, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: Boolean(options.ctrlKey),
    altKey: Boolean(options.altKey),
    shiftKey: Boolean(options.shiftKey)
  });
  document.body.dispatchEvent(event);
}

function wireMobileControls() {
  document.querySelectorAll('[data-key]').forEach((button) => {
    button.addEventListener('click', () => {
      sendKey(button.dataset.key, {
        ctrlKey: button.dataset.ctrl === 'true',
        altKey: button.dataset.alt === 'true',
        shiftKey: button.dataset.shift === 'true'
      });
      button.blur();
    });
  });

  const menuButton = document.getElementById('mobile-menu-toggle');
  if (menuButton) {
    menuButton.addEventListener('click', () => {
      document.body.classList.toggle('mobile-menu-open');
    });
  }

  document.addEventListener('click', (event) => {
    if (window.innerWidth > 820) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.controls-left button')) {
      document.body.classList.remove('mobile-menu-open');
    }
  });
}

function setStatus(text) {
  const status = document.getElementById('poc-status');
  if (status) status.textContent = text;
}

async function boot() {
  const domContainer = document.getElementById('smoo');
  wireMobileControls();

  window.addEventListener('error', (event) => {
    setStatus(`Hata: ${event.message || 'bilinmeyen hata'}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    setStatus(`Hata: ${String(event.reason || 'başlatma reddedildi')}`);
  });

  try {
    setStatus('Editör başlatılıyor…');

    // Smoosic application mode eagerly downloads every soundfont before it creates
    // the editable score UI. That startup path is too heavy for iPhone Safari and
    // can leave the page looking blank. Editing does not require those samples, so
    // the mobile POC skips eager audio loading. Playback can be added lazily later.
    SuiSampleMedia.samplePromise = async (_audio, setProgress) => {
      if (typeof setProgress === 'function') setProgress(100);
    };

    // Supplying an explicit initial score also avoids the first-time help modal.
    const initialScore = SmoScore.getDefaultScore(SmoScore.defaults, null);
    const application = await SuiApplication.configure({
      mode: 'application',
      domContainer,
      initialScore
    });

    const rendered = Boolean(application && application.view && application.view.renderer);
    setStatus(rendered ? 'Editör hazır' : 'Renderer oluşmadı');
  } catch (error) {
    console.error(error);
    setStatus(`Başlatma hatası: ${String(error)}`);
  }
}

document.addEventListener('DOMContentLoaded', boot);
