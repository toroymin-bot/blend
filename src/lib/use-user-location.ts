'use client';

// [2026-05-05 PM-39 Roy] 사용자 위치 자동 감지 — IP geo (city/country/timezone 포함).
// 채팅 시스템 프롬프트에 주입해 AI가 "오늘 날씨는?" 같은 위치 의존 질문에 정확 답변.
// 이전: useCountry()는 country code만 → 날씨/시간/번역 시 도시 모름.
//
// 정책:
// - ipapi.co/json/ — IP 기반 city level. 무료. CORS 허용.
// - localStorage 24h 캐시 (요청 minimize, IP 잘 안 바뀜).
// - VPN / 셀룰러로 부정확할 수 있어 "추정 위치"로 표시. 사용자 명시 위치 우선.
// - 권한 요구 X (geolocation API보다 가벼움).

import { useState, useEffect } from 'react';

const CACHE_KEY = 'blend:user-location';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface UserLocation {
  city: string;
  region: string;
  country: string;       // full name e.g. "South Korea"
  countryCode: string;   // ISO e.g. "KR"
  timezone: string;      // e.g. "Asia/Seoul"
}

export function useUserLocation(): { location: UserLocation | null; loading: boolean } {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { value, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL && value?.city) {
          setLocation(value);
          setLoading(false);
          return;
        }
      }
    } catch {}

    fetch('https://ipapi.co/json/')
      .then((r) => r.json())
      .then((data) => {
        const loc: UserLocation = {
          city:        String(data?.city ?? ''),
          region:      String(data?.region ?? ''),
          country:     String(data?.country_name ?? ''),
          countryCode: String(data?.country_code ?? '').toUpperCase(),
          timezone:    String(data?.timezone ?? ''),
        };
        if (loc.city) {
          setLocation(loc);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ value: loc, ts: Date.now() }));
          } catch {}
        }
      })
      .catch(() => {
        // 네트워크 실패 시 silent — 시스템 프롬프트에 위치 정보 미주입.
      })
      .finally(() => setLoading(false));
  }, []);

  return { location, loading };
}

/**
 * 시스템 프롬프트에 추가할 사용자 위치 prefix.
 * AI가 "오늘 날씨", "지금 시간", "환율" 같은 질문 받을 때 활용.
 *
 * 예 (ko): "[사용자 추정 위치 — Seoul, South Korea (Asia/Seoul, IP 기반 추정).
 *   사용자가 다른 도시 명시하면 그쪽 우선.]"
 */
export function buildLocationPrompt(loc: UserLocation | null, lang: 'ko' | 'en' | 'ph'): string {
  if (!loc || !loc.city) return '';
  const cityCountry = loc.country ? `${loc.city}, ${loc.country}` : loc.city;
  const tz = loc.timezone ? ` (${loc.timezone})` : '';
  if (lang === 'ko') {
    return `\n\n[사용자 추정 위치 — ${cityCountry}${tz}, IP 기반 추정. 사용자가 다른 도시 명시하면 그쪽 우선. "오늘 날씨/지금 시간/내 위치" 같은 질문에 이 위치 활용.]`;
  }
  if (lang === 'ph') {
    return `\n\n[Tinatayang lokasyon ng user — ${cityCountry}${tz}, base sa IP. Kung magsabi ng ibang siyudad, sundan iyon. Gamitin ito sa "weather/oras/lokasyon" tanong.]`;
  }
  return `\n\n[User approximate location — ${cityCountry}${tz}, IP-inferred. If user mentions a different city, prefer that. Use for "weather / current time / where am I" questions.]`;
}
