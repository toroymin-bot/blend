// Blend D1 Animation tokens

export const D1_EASING = {
  smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
  apple:  'cubic-bezier(0.32, 0.72, 0, 1)',
  fast:   'cubic-bezier(0.4, 0, 0.6, 1)',
} as const;

export const D1_DURATION = {
  fast:   '160ms',
  base:   '200ms',
  slow:   '280ms',
  slower: '500ms',
  glow:   '800ms',
} as const;

export const D1_RADIUS = {
  sm:   '8px',
  md:   '10px',
  lg:   '12px',
  xl:   '16px',
  pill: '9999px',
} as const;
