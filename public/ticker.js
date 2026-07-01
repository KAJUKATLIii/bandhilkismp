(function () {
  function setupTicker(track) {
    if (!track || track.dataset.tickerReady === 'true') return;

    const original = Array.from(track.children).map(node => node.cloneNode(true));
    if (!original.length) return;

    const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || '0') || 0;
    const originalWidth = track.scrollWidth + gap;
    const containerWidth = track.parentElement ? track.parentElement.clientWidth : window.innerWidth;

    while (track.scrollWidth < containerWidth + originalWidth) {
      original.forEach(node => track.appendChild(node.cloneNode(true)));
    }

    track.style.setProperty('--ticker-distance', `${originalWidth}px`);
    track.style.willChange = 'transform';
    track.style.animation = 'portalTickerScroll 26s linear infinite';
    track.dataset.tickerReady = 'true';
  }

  function setupAllTickers() {
    document.querySelectorAll('.portal-ticker-track').forEach(setupTicker);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAllTickers);
  } else {
    setupAllTickers();
  }

  window.addEventListener('resize', setupAllTickers);
})();
