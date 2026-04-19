'use client';

import { useState, useEffect } from 'react';

const CACHE_KEY = 'blend:country';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function useCountry(): { country: string; loading: boolean } {
  const [country, setCountry] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { value, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          setCountry(value);
          setLoading(false);
          return;
        }
      }
    } catch {}

    fetch('https://ipapi.co/country/')
      .then((r) => r.text())
      .then((code) => {
        const c = code.trim().toUpperCase();
        setCountry(c);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ value: c, ts: Date.now() }));
        } catch {}
      })
      .catch(() => setCountry(''))
      .finally(() => setLoading(false));
  }, []);

  return { country, loading };
}
