// Blend - WebDAV Proxy API Route
// Proxies PROPFIND and GET requests to a WebDAV server server-side,
// bypassing browser CORS restrictions.
// All auth credentials are passed per-request from the client (BYOK model).

import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_METHODS = new Set(['PROPFIND', 'GET']);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, serverUrl, path, username, password, depth } = body as {
      method: string;
      serverUrl: string;
      path: string;
      username: string;
      password: string;
      depth?: string;
    };

    if (!ALLOWED_METHODS.has(method)) {
      return NextResponse.json({ error: `Method ${method} not allowed` }, { status: 400 });
    }
    if (!serverUrl || !path) {
      return NextResponse.json({ error: 'serverUrl and path are required' }, { status: 400 });
    }

    // Validate URL scheme — only http/https allowed
    const targetUrl = new URL(path.startsWith('http') ? path : `${serverUrl.replace(/\/$/, '')}${path}`);
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      return NextResponse.json({ error: 'Invalid URL scheme' }, { status: 400 });
    }

    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    };
    if (method === 'PROPFIND') {
      headers['Depth'] = depth ?? '1';
      headers['Content-Type'] = 'application/xml';
    }

    const upstream = await fetch(targetUrl.toString(), {
      method,
      headers,
      body: method === 'PROPFIND'
        ? '<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>'
        : undefined,
    });

    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    const data = await upstream.arrayBuffer();

    return new NextResponse(data, {
      status: upstream.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
