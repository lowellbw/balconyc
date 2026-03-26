// Vercel Serverless Function — NYC Geoclient API Proxy
// Proxies requests to api.nyc.gov/geoclient because it blocks CORS
// and requires a subscription key that should not be exposed client-side.
//
// Set NYC_GEOCLIENT_KEY in Vercel Environment Variables.
// Usage: GET /api/geoclient?houseNumber=350&street=west+42+street&borough=manhattan

export default async function handler(req, res) {
  // CORS headers for client-side access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.NYC_GEOCLIENT_KEY;
  if (!key) {
    return res.status(500).json({ error: 'NYC Geoclient API key not configured' });
  }

  const { houseNumber, street, borough } = req.query;

  if (!houseNumber || !street || !borough) {
    return res.status(400).json({
      error: 'Missing required parameters: houseNumber, street, borough',
    });
  }

  try {
    const params = new URLSearchParams({
      houseNumber,
      street,
      borough,
    });

    const url = `https://api.nyc.gov/geoclient/v2/address.json?${params}`;

    const response = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': key,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Geoclient API error: ${response.status} ${text}`);
      return res.status(response.status).json({
        error: `Geoclient API returned ${response.status}`,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Geoclient proxy error:', err);
    return res.status(500).json({ error: 'Failed to reach NYC Geoclient API' });
  }
}
