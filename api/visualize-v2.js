// Vercel Serverless Function — AI Solar Visualization v2
// Uses Street View as reference but generates a clean, head-on
// architectural rendering of the building with solar panels.
//
// Env vars: GEMINI_API_KEY, GOOGLE_API_KEY (or GOOGLE_SV_KEY)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

  const googleKey = process.env.GOOGLE_SV_KEY || process.env.GOOGLE_API_KEY;
  if (!googleKey) return res.status(500).json({ error: 'Google API key not configured' });

  const { lat, lon, floor, totalFloors, address } = req.body || {};
  if (!lat || !lon) return res.status(400).json({ error: 'Missing lat/lon' });

  try {
    // 1. Check Street View availability
    const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lon}&key=${googleKey}`;
    const metaRes = await fetch(metaUrl);
    const meta = await metaRes.json();

    if (meta.status !== 'OK') {
      return res.status(404).json({ error: 'No Street View imagery available for this location' });
    }

    // 2. Calculate heading and pitch
    const camLat = meta.location.lat;
    const camLng = meta.location.lng;
    const heading = calculateBearing(camLat, camLng, lat, lon);
    const pitch = calculatePitch(floor || 3, totalFloors || 6);

    // 3. Fetch Street View image as reference
    const svUrl = `https://maps.googleapis.com/maps/api/streetview?size=1024x1024&location=${lat},${lon}&heading=${heading}&pitch=${pitch}&fov=85&key=${googleKey}`;
    const svRes = await fetch(svUrl);

    if (!svRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch Street View image' });
    }

    const svBuffer = await svRes.arrayBuffer();
    const svBase64 = Buffer.from(svBuffer).toString('base64');

    // 4. Generate clean architectural rendering with Gemini
    const floorCount = totalFloors || 6;
    const userFloor = floor || 3;

    const prompt = `Look at this Street View photo of a real building. Using it as reference for the building's architecture, style, materials, and colors, generate a new image that shows:

A clean, straight-on, head-on architectural photograph of this same building's facade, as if taken by a professional architectural photographer standing directly in front of it. The perspective should be perfectly frontal — no angle, no distortion, centered on the building.

This building has ${floorCount} floors. The user lives on floor ${userFloor}. Show modern solar panels prominently mounted on the balcony railing at floor ${userFloor} — this is the main focus of the image. The panels on floor ${userFloor} should be clearly visible and well-lit. If the building has balconies on other floors too, you may add panels to those as well, but floor ${userFloor} should be the hero.

The solar panels should have sleek black aluminum frames with tempered glass fronts showing a subtle blue-purple photovoltaic tint. They should look naturally integrated into the building's design.

Style: Clean architectural photography, sharp focus, natural daylight, no lens distortion, professional real estate quality. Show ONLY this building, tightly cropped. No street, no cars, no sidewalk — just the building facade filling the frame.

IMPORTANT: Keep the building's real architectural character, materials, colors, and style. Do NOT add balconies that don't exist — only add solar panels to balconies that are already part of the building. Do NOT invent or fabricate new architectural features.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${geminiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: svBase64,
              },
            },
          ],
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      return res.status(200).json({
        originalImage: `data:image/jpeg;base64,${svBase64}`,
        heroImage: null,
        error: 'AI visualization generation failed',
      });
    }

    const geminiData = await geminiRes.json();

    // Extract the generated image
    let heroImageData = null;
    if (geminiData.candidates && geminiData.candidates[0]) {
      const parts = geminiData.candidates[0].content.parts;
      for (const part of parts) {
        if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
          heroImageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    return res.status(200).json({
      originalImage: `data:image/jpeg;base64,${svBase64}`,
      heroImage: heroImageData,
      error: heroImageData ? null : 'No image generated by AI',
    });

  } catch (err) {
    console.error('Visualize v2 error:', err);
    return res.status(500).json({ error: 'Visualization pipeline failed' });
  }
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function calculatePitch(floor, totalFloors) {
  const floorHeight = (floor - 1) * 3 + 1.5;
  const cameraHeight = 2.5;
  const heightDiff = floorHeight - cameraHeight;
  const distance = 18;
  const pitchRad = Math.atan2(heightDiff, distance);
  const pitch = pitchRad * 180 / Math.PI;
  return Math.max(-10, Math.min(50, Math.round(pitch)));
}
