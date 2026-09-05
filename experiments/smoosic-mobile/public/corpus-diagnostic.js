(() => {
  let lastResults = null;

  function formatResult(result) {
    const stats = result && result.stats ? result.stats : {};
    const mark = result && result.ok ? '✓' : '✗';
    const base = `${mark} ${result.label || result.name || 'score'} · ${stats.staves || 0} staff · ${stats.voices || 0} voice · ${stats.measures || 0} ölçü · ${stats.notes || 0} nota · ${stats.ties || 0} tie · ${stats.slurs || 0} slur · ${stats.tuplets || 0} tuplet · ${stats.grace || 0} grace · ${Math.round(Number(result.renderMs || 0))} ms`;
    if (result && !result.ok) {
      return `${base}\n  Hata: ${String(result.status || 'Bilinmeyen corpus render hatası')}`;
    }
    return base;
  }

  function refresh() {
    const results = window.__smoosicCorpusStressResults;
    if (!Array.isArray(results) || results === lastResults) return;
    lastResults = results;
    const output = document.getElementById('corpus-results');
    if (output) output.textContent = results.map(formatResult).join('\n');
  }

  window.setInterval(refresh, 200);
})();
