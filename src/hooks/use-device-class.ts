/**
 * useDeviceClass — Tori 18841602 §4.1.
 *
 * window.innerWidth 기반 deviceClass 추적. SSR 안전 (default = 'desktop' — 서버 마크업 깨짐 방지).
 * 클라이언트 마운트 즉시 정확한 값으로 갱신, 이후 resize 추적.
 */

'use client';

import { useEffect, useState } from 'react';
import { getDeviceClass, type DeviceClass } from '@/lib/responsive/breakpoints';

export function useDeviceClass(): DeviceClass {
  const [deviceClass, setDeviceClass] = useState<DeviceClass>('desktop');

  useEffect(() => {
    function update() {
      if (typeof window === 'undefined') return;
      setDeviceClass(getDeviceClass(window.innerWidth));
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return deviceClass;
}
