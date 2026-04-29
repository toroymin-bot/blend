/**
 * Responsive Breakpoints — Tori 18841602 §3.1.
 *
 * - mobile  : 0 ~ 767       (drill-down 패턴)
 * - tablet  : 768 ~ 1023    (햄버거 + drawer)
 * - desktop : 1024+         (2-column)
 *
 * Tailwind 기본값과 일치 (`md` = 768, `lg` = 1024) — JS-side에서 동일한 분기점 사용.
 */

export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
} as const;

export type DeviceClass = 'mobile' | 'tablet' | 'desktop';

export function getDeviceClass(width: number): DeviceClass {
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet)  return 'tablet';
  return 'mobile';
}
