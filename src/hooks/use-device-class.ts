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
  // [2026-05-03 BUG-011] SSR HTML과 client 첫 렌더가 항상 같은 'desktop'을 반환 →
  //   React #418 hydration mismatch 차단. 이전 v3.2 lazy init은 client에서 실제 폭을
  //   바로 반환해 SSR ('desktop')과 어긋났음. 다운스트림 race는 각 consumer가
  //   useEffect에서 deviceClass 변화를 다시 받아 보정하도록 처리.
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
