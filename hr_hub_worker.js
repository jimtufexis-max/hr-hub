// HR Hub Proxy Worker v3 — with Odds API support and edge caching

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' }
      });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', worker: 'hr-hub-proxy', v: 3, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const target = url.searchParams.get('url');
    if (!target) {
      return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }), {
        status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let targetUrl;
    try { targetUrl = new URL(decodeURIComponent(target)); }
    catch { try { targetUrl = new URL(target); } catch(e) {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }}

    const allowed = [
      'baseballsavant.mlb.com',
      'fangraphs.com',
      'statsapi.mlb.com',
      'api.open-meteo.com',
      'api.the-odds-api.com',   // NEW — Odds API
    ];
    if (!allowed.some(h => targetUrl.hostname.endsWith(h))) {
      return new Response(JSON.stringify({ error: 'Host not allowed: ' + targetUrl.hostname }), {
        status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Cache key — strip apiKey from cache key for Odds API so all users share cache
    let cacheKeyUrl = targetUrl.toString();
    const isOddsApi = targetUrl.hostname === 'api.the-odds-api.com';
    if (isOddsApi) {
      // Remove apiKey from cache key (but keep it for the actual request)
      const cacheUrl = new URL(targetUrl.toString());
      cacheUrl.searchParams.delete('apiKey');
      cacheKeyUrl = cacheUrl.toString();
    }
    const cacheKey = new Request(cacheKeyUrl, { method: 'GET' });
    const cache = caches.default;

    // Check cache
    const cached = await cache.match(cacheKey);
    if (cached) {
      const resp = new Response(cached.body, cached);
      resp.headers.set('X-Cache', 'HIT');
      resp.headers.set('Access-Control-Allow-Origin', '*');
      return resp;
    }

    // For Savant statcast_search — get session cookie first
    const isSavantSearch = targetUrl.hostname === 'baseballsavant.mlb.com' &&
                           targetUrl.pathname.includes('statcast_search');
    let cookie = '';
    if (isSavantSearch) {
      try {
        const homeResp = await fetch('https://baseballsavant.mlb.com/', {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
          redirect: 'follow',
        });
        const setCookie = homeResp.headers.get('set-cookie') || '';
        cookie = setCookie.split(',').map(c => c.split(';')[0].trim()).filter(c => c.includes('=')).join('; ');
      } catch(e) {}
    }

    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/json,text/csv,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://baseballsavant.mlb.com/',
      };
      if (cookie) headers['Cookie'] = cookie;

      const resp = await fetch(targetUrl.toString(), { headers });
      const body = await resp.arrayBuffer();
      const contentType = resp.headers.get('Content-Type') || 'text/plain';

      // Cache duration: Odds API = 30 min, Savant leaderboards = 30 min, weather = 30 min
      const cacheTTL = isOddsApi ? 1800 : 1800;

      const response = new Response(body, {
        status: resp.status,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': `public, max-age=${cacheTTL}`,
          'X-Cache': 'MISS',
          'X-Proxied-From': targetUrl.hostname,
        },
      });

      // Only cache successful responses
      if (resp.status === 200) {
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }

      return response;
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, target: targetUrl.hostname }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
