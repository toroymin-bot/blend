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
  // [2026-04-30 v3.2 fix] lazy initializer — 클라이언트 첫 렌더부터 정확한 deviceClass 반환.
  //   이전엔 SSR 안전을 위해 'desktop' 박아두고 useEffect로 갱신했는데, 그 사이 1 tick에
  //   downstream useEffect들이 'desktop' 가정으로 잘못된 셋을 해버리는 race가 발생함.
  //   useState lazy init은 첫 렌더만 실행되므로 SSR(`window === undefined`)엔 'desktop'을,
  //   client hydration 직후엔 실제 폭을 반환. SSR HTML과 첫 client 렌더 결과가 다를 수 있지만
  //   화면에 보이는 값은 client 렌더 결과 → hydration mismatch 경고 가능성. 그러나 이 컴포넌트는
  //   client-only 분기 (반응형 레이아웃)라 시각 왜곡보단 race 차단이 더 중요.
  const [deviceClass, setDeviceClass] = useState<DeviceClass>(() => {
    if (typeof window === 'undefined') return 'desktop';
    return getDeviceClass(window.innerWidth);
  });

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
