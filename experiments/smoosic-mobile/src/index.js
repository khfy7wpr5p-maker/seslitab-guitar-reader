const { SuiApplication } = require('smoosic');

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

function boot() {
  const domContainer = document.getElementById('smoo');
  const status = document.getElementById('poc-status');
  try {
    SuiApplication.configure({ mode: 'application', domContainer });
    if (status) status.textContent = 'Editör hazır';
  } catch (error) {
    console.error(error);
    if (status) status.textContent = `Başlatma hatası: ${String(error)}`;
  }
  wireMobileControls();
}

document.addEventListener('DOMContentLoaded', boot);
