/**
 * HR Hub — Cloudflare Worker Proxy
 * Fetches Baseball Savant and FanGraphs data server-side,
 * returns it with CORS headers so the mobile app can read it.
 *
 * Deploy: wrangler deploy  OR  paste into workers.cloudflare.com dashboard
 * Usage:  https://your-worker.workers.dev/?url=https://baseballsavant.mlb.com/...
 */

const ALLOWED_ORIGINS = [
  'https://jimtufexis-max.github.io',
  'https://homerunhub.app',
  'http://localhost',
  'null', // local file:// development
];

const ALLOWED_HOSTS = [
  'baseballsavant.mlb.com',
  'fangraphs.com',
  'statsapi.mlb.com',
  'api.open-meteo.com',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', ts: Date.now() }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Get target URL from query param
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Validate target host
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const allowed = ALLOWED_HOSTS.some(h => targetUrl.hostname.endsWith(h));
    if (!allowed) {
      return new Response(JSON.stringify({ error: `Host not allowed: ${targetUrl.hostname}` }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Cache key — use full target URL
    const cacheKey = new Request(target, { method: 'GET' });
    const cache = caches.default;

    // Check cache first
    const cached = await cache.match(cacheKey);
    if (cached) {
      const resp = new Response(cached.body, cached);
      resp.headers.set('X-Cache', 'HIT');
      resp.headers.set('Access-Control-Allow-Origin', '*');
      return resp;
    }

    // Fetch from origin
    try {
      const originResp = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/json,text/csv,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://baseballsavant.mlb.com/',
        },
        cf: {
          // Cloudflare-specific: cache for 30 min at the edge
          cacheTtl: 1800,
          cacheEverything: true,
        },
      });

      if (!originResp.ok) {
        return new Response(
          JSON.stringify({ error: `Origin returned ${originResp.status}`, url: target }),
          {
            status: originResp.status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      }

      const body = await originResp.arrayBuffer();
      const contentType = originResp.headers.get('Content-Type') || 'text/plain';

      const response = new Response(body, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': contentType,
          'X-Cache': 'MISS',
          // Cache for 30 min — Savant data doesn't change mid-game
          'Cache-Control': 'public, max-age=1800',
        },
      });

      // Store in cache (don't await — fire and forget)
      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      return response;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Fetch failed', message: err.message, url: target }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
