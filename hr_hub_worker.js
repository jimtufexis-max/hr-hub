// HR Hub Proxy Worker — with Savant session cookie support
// Paste into Cloudflare Workers dashboard → Save & Deploy

export default {
  async fetch(request) {

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        }
      });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', worker: 'hr-hub-proxy', v: 2, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const target = url.searchParams.get('url');
    if (!target) {
      return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let targetUrl;
    try { targetUrl = new URL(decodeURIComponent(target)); }
    catch { try { targetUrl = new URL(target); } catch(e) {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }}

    const allowed = ['baseballsavant.mlb.com','fangraphs.com','www.fangraphs.com','statsapi.mlb.com','api.open-meteo.com'];
    if (!allowed.some(h => targetUrl.hostname.endsWith(h))) {
      return new Response(JSON.stringify({ error: 'Host not allowed: ' + targetUrl.hostname }), {
        status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // For Savant statcast_search CSV — get session cookie first
    const isSavantSearch = targetUrl.hostname === 'baseballsavant.mlb.com' &&
                           targetUrl.pathname.includes('statcast_search');

    try {
      let cookie = '';

      if (isSavantSearch) {
        // Step 1: Hit Savant homepage to get session cookie
        const homeResp = await fetch('https://baseballsavant.mlb.com/', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          redirect: 'follow',
        });
        // Extract all cookies from Set-Cookie headers
        const setCookie = homeResp.headers.get('set-cookie') || '';
        // Parse cookie name=value pairs
        cookie = setCookie.split(',')
          .map(c => c.split(';')[0].trim())
          .filter(c => c.includes('='))
          .join('; ');
      }

      // Step 2: Make the actual request with cookie
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/json,text/csv,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://baseballsavant.mlb.com/statcast_search',
        'Origin': 'https://baseballsavant.mlb.com',
      };
      if (cookie) headers['Cookie'] = cookie;

      const resp = await fetch(targetUrl.toString(), { headers });
      const body = await resp.arrayBuffer();
      const contentType = resp.headers.get('Content-Type') || 'text/plain';

      // Log response size for debugging
      const size = body.byteLength;

      return new Response(body, {
        status: resp.status,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
          'X-Response-Size': String(size),
          'X-Had-Cookie': cookie ? 'yes' : 'no',
        },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, target: targetUrl.hostname }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
