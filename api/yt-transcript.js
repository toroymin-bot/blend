// [2026-04-18] Vercel serverless function — YouTube transcript extractor
// Works for videos with manually-uploaded CC captions (InnerTube Android client)
// ASR (auto-generated) captions are blocked by YouTube from datacenter IPs
// [2026-04-18] Audio fallback: @distube/ytdl-core extracts audio stream URL → client transcribes via Whisper

// ── Rate Limiter (in-memory sliding window) ───────────────────────────────
// Limits: 10 req/min per IP (transcription is heavy — prevents abuse)
// Note: In-memory; resets per cold start. Sufficient for basic DDoS/abuse protection.
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10;              // max requests per window per IP
const _rl = new Map(); // Map<ip, number[]> — sliding window timestamps

function getRateLimitedIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const hits = (_rl.get(ip) || []).filter(t => t > windowStart);
  hits.push(now);
  _rl.set(ip, hits);
  // Prune old IPs every ~500 entries to prevent memory leak
  if (_rl.size > 500) {
    for (const [k, v] of _rl) {
      if (v.every(t => t <= windowStart)) _rl.delete(k);
    }
  }
  return hits.length > RATE_LIMIT_MAX;
}
// ─────────────────────────────────────────────────────────────────────────

const ANDROID_UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function parseXml(xml) {
  const results = [];
  // srv3 format: <p t="ms" d="ms"><s>text</s></p>
  const pRe = /<p\s+t="\d+"\s+d="\d+"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = pRe.exec(xml)) !== null) {
    const raw = m[1];
    let text = '';
    const sRe = /<s[^>]*>([^<]*)<\/s>/g;
    let s;
    while ((s = sRe.exec(raw)) !== null) text += s[1];
    if (!text) text = raw.replace(/<[^>]+>/g, '');
    text = decodeEntities(text).trim();
    if (text) results.push(text);
  }
  // Classic format: <text start="s" dur="s">text</text>
  if (results.length === 0) {
    const tRe = /<text[^>]*>([^<]+)<\/text>/g;
    while ((m = tRe.exec(xml)) !== null) {
      const text = decodeEntities(m[1]).trim();
      if (text) results.push(text);
    }
  }
  return results;
}

// [2026-04-18] Audio fallback — get lowest-bitrate audio-only stream URL via @distube/ytdl-core
// Audio streams are served by YouTube CDN and are NOT blocked from server IPs (unlike caption API)
// Returns { url, mimeType, bitrate } or null if unavailable
async function getYouTubeAudioUrl(videoId) {
  const ytdl = require('@distube/ytdl-core');
  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, {
    requestOptions: {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    },
  });

  // Filter to audio-only formats, sort ascending by bitrate (smallest file for Whisper)
  const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
  if (!audioFormats.length) return null;
  audioFormats.sort((a, b) => (a.audioBitrate || 999) - (b.audioBitrate || 999));

  // Prefer m4a/mp4a (best Whisper compatibility), fallback to any audio format
  const format = audioFormats.find(
    (f) => f.container === 'm4a' || (f.mimeType && f.mimeType.startsWith('audio/mp4'))
  ) || audioFormats[0];

  if (!format?.url) return null;
  return {
    url: format.url,
    mimeType: format.mimeType || 'audio/mp4',
    bitrate: format.audioBitrate || null,
    contentLength: format.contentLength || null,
  };
}

async function getTracksViaInnerTube(videoId) {
  const clients = [
    // Android client — most reliable for CC captions from server IPs
    {
      name: 'ANDROID',
      nameId: '3',
      ctx: { clientName: 'ANDROID', clientVersion: '20.10.38' },
      ua: ANDROID_UA,
      extra: { racyCheckOk: true, contentCheckOk: true },
    },
    // IOS fallback
    {
      name: 'IOS',
      nameId: '5',
      ctx: { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2' },
      ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)',
      extra: { racyCheckOk: true, contentCheckOk: true },
    },
    // Web embedded (used by embeds, often has fewer restrictions)
    {
      name: 'WEB_EMBEDDED',
      nameId: '56',
      ctx: { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '2.20240726.00.00', hl: 'en', gl: 'US', embedUrl: 'https://www.youtube.com' },
      ua: BROWSER_UA,
      extra: { racyCheckOk: true, contentCheckOk: true },
    },
  ];

  const errors = [];
  for (const client of clients) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': client.ua,
          'X-YouTube-Client-Name': client.nameId,
          'X-YouTube-Client-Version': client.ctx.clientVersion,
        },
        body: JSON.stringify({ context: { client: client.ctx }, videoId, ...client.extra }),
      });
      if (!res.ok) { errors.push(`${client.name}:http_${res.status}`); continue; }
      const data = await res.json();
      const ps = data?.playabilityStatus?.status;
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) return { tracks, clientName: client.name };
      errors.push(`${client.name}:ps=${ps}`);
    } catch (e) { errors.push(`${client.name}:${e.message?.slice(0, 40)}`); }
  }
  return { tracks: null, errors };
}

async function getTracksViaWebPage(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    const html = await res.text();
    const varName = 'ytInitialPlayerResponse';
    const start = html.indexOf(`var ${varName} = `);
    if (start !== -1) {
      let depth = 0;
      const jsonStart = start + `var ${varName} = `.length;
      for (let i = jsonStart; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}' && --depth === 0) {
          try {
            const data = JSON.parse(html.slice(jsonStart, i + 1));
            const ps = data?.playabilityStatus?.status;
            const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (Array.isArray(tracks) && tracks.length > 0) return { tracks, ps };
            return { tracks: null, ps };
          } catch { break; }
        }
      }
    }
    // Regex fallback for captionTracks
    const ctMatch = html.match(/"captionTracks":(\[.*?\])/s);
    if (ctMatch) {
      try {
        const tracks = JSON.parse(ctMatch[1]);
        if (Array.isArray(tracks) && tracks.length > 0) return { tracks };
      } catch { /* */ }
    }
    return { tracks: null };
  } catch (e) {
    return { tracks: null, error: e.message };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limiting
  const ip = getRateLimitedIp(req);
  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요. (Rate limit: 10 req/min)' });
  }

  const videoId = Array.isArray(req.query?.videoId) ? req.query.videoId[0] : req.query?.videoId;
  if (!videoId) return res.status(400).json({ error: 'videoId required' });

  const debug = req.query?.debug === '1';
  const debugLog = [];

  try {
    // Try InnerTube first
    const { tracks: itTracks, clientName, errors: itErrors } = await getTracksViaInnerTube(videoId);
    debugLog.push({ method: 'innertube', client: clientName ?? 'none', count: itTracks?.length ?? 0, errors: itErrors });

    // Fall back to web page scraping
    const { tracks: wpTracks, ps: wpPs } = await getTracksViaWebPage(videoId);
    debugLog.push({ method: 'webpage', count: wpTracks?.length ?? 0, ps: wpPs });

    const tracks = itTracks ?? wpTracks;
    if (!tracks) {
      // Distinguish: LOGIN_REQUIRED (ASR restriction) vs genuine no captions
      const allErrors = (itErrors ?? []).join(' ');
      const isAsrRestricted = allErrors.includes('LOGIN_REQUIRED') || wpPs === 'LOGIN_REQUIRED';

      // [2026-04-18] Audio fallback: when captions are unavailable, return audio stream URL
      // Client will fetch the audio and transcribe via Whisper (uses user's own OpenAI key)
      try {
        const audioInfo = await getYouTubeAudioUrl(videoId);
        if (audioInfo?.url) {
          debugLog.push({ method: 'audio_fallback', bitrate: audioInfo.bitrate, hasUrl: true });
          return res.status(200).json({
            source: 'audio',
            audioUrl: audioInfo.url,
            audioMimeType: audioInfo.mimeType,
            contentLength: audioInfo.contentLength,
            ...(debug ? { debug: debugLog } : {}),
          });
        }
      } catch (audioErr) {
        debugLog.push({ method: 'audio_fallback', error: String(audioErr?.message || audioErr).slice(0, 100) });
      }

      const errMsg = isAsrRestricted
        ? 'Auto-generated captions are not accessible from server IPs. Please paste the transcript manually.'
        : 'No subtitles found for this video.';
      return res.status(404).json({ error: errMsg, asrRestricted: isAsrRestricted, ...(debug ? { debug: debugLog } : {}) });
    }

    const lang = Array.isArray(req.query?.lang) ? req.query.lang[0] : req.query?.lang;
    const track = (lang ? tracks.find(t => t.languageCode === lang) : null) ?? tracks[0];

    const xmlRes = await fetch(track.baseUrl, { headers: { 'User-Agent': BROWSER_UA } });
    const xml = await xmlRes.text();
    debugLog.push({ method: 'xml', status: xmlRes.status, len: xml.length, lang: track.languageCode });

    const segments = parseXml(xml);
    if (!segments.length) {
      return res.status(404).json({ error: 'Captions found but empty.', ...(debug ? { debug: debugLog } : {}) });
    }

    const rawText = segments.join(' ').replace(/\s+/g, ' ').trim();
    return res.status(200).json({ rawText, segmentCount: segments.length, ...(debug ? { debug: debugLog } : {}) });

  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e), ...(debug ? { debug: debugLog } : {}) });
  }
};
