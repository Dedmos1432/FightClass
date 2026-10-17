const svg = (body: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${body}</svg>`;

export const icons = {
  arrow: svg('<path d="M4 12h15m-6-6 6 6-6 6"/>'),
  play: svg('<path d="m8 5 11 7-11 7z"/>'),
  continue: svg('<path d="M5 4v16m5-14 10 6-10 6z"/>'),
  settings: svg('<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>'),
  sound: svg('<path d="m11 5-5 4H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'),
  muted: svg('<path d="m11 5-5 4H3v6h3l5 4zM16 9l6 6m0-6-6 6"/>'),
  fullscreen: svg('<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>'),
  close: svg('<path d="m6 6 12 12M18 6 6 18"/>'),
  back: svg('<path d="M20 12H5m6-6-6 6 6 6"/>'),
  check: svg('<path d="m5 12 4 4L19 6"/>'),
};
