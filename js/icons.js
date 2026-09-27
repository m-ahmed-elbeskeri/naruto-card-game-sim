/* ============================================================
   ICONS — inline SVG icon set (stroke icons, currentColor)
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const P = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    fast: '<path d="M4 5l8 7-8 7zM12 5l8 7-8 7z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    check: '<path d="M5 12l5 5 9-11"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    sword: '<path d="M14.5 3H21v6.5L9 21.5 2.5 15z"/><path d="M5 13l6 6M3 21l3-3"/>',
    swords: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 6.5L14 2h3v3l-4.5 4.5M5 14l-2 2 5 5 2-2"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    arrow: '<path d="M4 12h14M13 6l6 6-6 6"/>',
    heart: '<path d="M12 20s-7-4.5-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.5-9 9-9 9z"/>',
  };
  NS.icon = (name, cls) => `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  // swap declarative <i data-icon="name"></i> placeholders in static HTML
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('[data-icon]').forEach(e => { e.outerHTML = NS.icon(e.dataset.icon); }));
})();
