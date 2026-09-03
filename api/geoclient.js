// Vercel Serverless Function — NYC Geoclient API Proxy
// Proxies requests to api.nyc.gov/geoclient because it blocks CORS
// and requires a subscription key that should not be exposed client-side.
//
// Set NYC_GEOCLIENT_KEY in Vercel Environment Variables.
// Usage: GET /api/geoclient?houseNumber=350&street=west+42+street&borough=manhattan
//
// The upstream key has a quota, so requests must come from our own pages and
// each client IP gets a modest hourly allowance (mirrors api/visualize-v3.js).

const ALLOWED_ORIGINS = [
  'https://balco.nyc',
  'https://www.balco.nyc',
  'http://localhost:3000',
];
const RATE_LIMIT_MAX = 60;                    // requests per IP
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;  // per hour

// Best-effort in-memory limiter: serverless instances are recycled, so this
// blunts casual abuse rather than guaranteeing a hard ceiling.
const requestLog = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const hits = (requestLog.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) return true;
  hits.push(now);
  requestLog.set(ip, hits);
  if (requestLog.size > 5000) requestLog.clear();
  return false;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const allowed = origin && ALLOWED_ORIGINS.includes(origin);
  if (allowed) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Same-origin GETs may carry no Origin header; accept a matching Referer.
  const referer = req.headers.referer || '';
  const fromOurSite = allowed || ALLOWED_ORIGINS.some(o => referer.startsWith(o));
  if (!fromOurSite) return res.status(403).json({ error: 'Forbidden' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    res.setHeader('Retry-After', '3600');
    return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
  }

  const key = process.env.NYC_GEOCLIENT_KEY;
  if (!key) return res.status(500).json({ error: 'NYC Geoclient API key not configured' });

  const { houseNumber, street, borough } = req.query;
  if (!houseNumber || !street || !borough) {
    return res.status(400).json({ error: 'Missing required parameters: houseNumber, street, borough' });
  }

  try {
    const params = new URLSearchParams({ houseNumber, street, borough });
    const url = `https://api.nyc.gov/geoclient/v2/address.json?${params}`;
    const response = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Geoclient API error: ${response.status} ${text}`);
      return res.status(response.status).json({ error: `Geoclient API returned ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Geoclient proxy error:', err);
    return res.status(500).json({ error: 'Failed to reach NYC Geoclient API' });
  }
}
