// Vercel Serverless Function — Premium AI Solar Visualization v3
// Multi-angle Street View capture + two-phase Gemini (analysis → generation)
//
// Env vars: GEMINI_API_KEY, GOOGLE_API_KEY (or GOOGLE_SV_KEY)
// Usage: POST /api/visualize-v3 { lat, lon, floor, totalFloors, address }

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

  const { lat, lon, floor, totalFloors, address, styleImage } = req.body || {};
  if (!lat || !lon) return res.status(400).json({ error: 'Missing lat/lon' });

  try {
    // ── 1. Street View metadata (free call) ──
    const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lon}&source=outdoor&key=${googleKey}`;
    const metaRes = await fetch(metaUrl);
    const meta = await metaRes.json();

    if (meta.status !== 'OK') {
      return res.status(404).json({ error: 'No Street View imagery available for this location' });
    }

    const camLat = meta.location.lat;
    const camLng = meta.location.lng;
    const primaryHeading = calculateBearing(camLat, camLng, lat, lon);
    const pitch = calculatePitch(floor || 3, totalFloors || 6);

    // ── 2. Fetch 3 angles in parallel ──
    const headings = [
      primaryHeading,
      (primaryHeading + 40) % 360,
      (primaryHeading - 40 + 360) % 360,
    ];

    const svPromises = headings.map((heading) => {
      const url = `https://maps.googleapis.com/maps/api/streetview?size=1024x1024&location=${lat},${lon}&heading=${heading}&pitch=${pitch}&fov=80&source=outdoor&key=${googleKey}`;
      return fetch(url).then(async (r) => {
        if (!r.ok) throw new Error(`SV fetch failed: ${r.status}`);
        const buf = await r.arrayBuffer();
        return Buffer.from(buf).toString('base64');
      });
    });

    const svResults = await Promise.allSettled(svPromises);
    const validImages = svResults
      .map((r, i) => (r.status === 'fulfilled' ? { base64: r.value, heading: headings[i] } : null))
      .filter(Boolean);

    if (validImages.length === 0) {
      return res.status(502).json({ error: 'Failed to fetch any Street View images' });
    }

    // Use primary heading image as default; if we have multiple, pick the best via quick scoring
    let selectedImage = validImages[0];
    let selectedIndex = 0;

    if (validImages.length > 1) {
      try {
        const scored = await scoreImages(validImages, geminiKey);
        if (scored !== null) {
          selectedIndex = scored;
          selectedImage = validImages[scored];
        }
      } catch (e) {
        console.warn('Image scoring failed, using primary heading:', e.message);
      }
    }

    const originalBase64 = selectedImage.base64;

    // ── 3. Phase 1: Analyze the building ──
    let buildingAnalysis = '';
    try {
      buildingAnalysis = await analyzeBuilding(originalBase64, geminiKey, floor, totalFloors);
    } catch (e) {
      console.warn('Building analysis failed, proceeding without:', e.message);
      buildingAnalysis = `A ${totalFloors || 'multi'}-story building in NYC.`;
    }

    // ── 4. Phase 2: Generate premium visualization ──
    const userFloor = floor || 3;
    const floorCount = totalFloors || 6;

    const styleNote = styleImage
      ? `\n\nSTYLE REFERENCE:
I've also attached a second image — this is a STYLE REFERENCE showing the visual treatment and composition we want. Match its photographic style, color grading, warmth, mood, and overall aesthetic. The output should feel like it belongs in the same series as this reference image. Use the same kind of framing, color palette, and atmospheric quality — but show the ACTUAL building from the Street View photo, not the building in the style reference.`
      : '';

    const generationPrompt = `You are a world-class architectural visualization artist. I'm attaching a Street View photograph of a real building. Generate a stunning new photorealistic image of THIS building.

BUILDING ANALYSIS (from expert assessment):
${buildingAnalysis}

YOUR TASK:
Create a beautiful image of this exact building with solar panels installed on the balconies. The output should look like a hero image for a premium website — cinematic, aspirational, magazine-quality.${styleNote}

COMPOSITION:
- Show the building facade prominently, well-framed
- The building should be the clear subject filling most of the frame
- Include some environmental context (sky, neighboring buildings faintly) for realism
- Professional architectural photography composition

SOLAR PANELS:
- The user lives on floor ${userFloor} of ${floorCount}. Their balcony should have the most prominent, well-lit solar panels
- Panels: sleek black aluminum frames with tempered glass, subtle blue-purple photovoltaic tint
- Mount panels on existing balcony railings only — do NOT add balconies that don't exist
- If other floors have balconies, add panels there too, but floor ${userFloor} is the hero
- Panels should look naturally integrated — matching the building's lighting, shadows, and materials

LIGHTING & STYLE:
- Warm, natural daylight — golden hour quality
- Rich colors, high dynamic range, cinematic feel
- Professional real estate / architectural photography quality
- The image should make someone want to live here and go solar

CRITICAL: Preserve the building's real architectural character, materials, colors, and style. This must look like a real photograph of a real building, not a rendering or CGI.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${geminiKey}`;

    // Build parts array — Street View image + optional style reference
    const imageParts = [
      { text: generationPrompt },
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: originalBase64,
        },
      },
    ];

    if (styleImage) {
      // Strip data URL prefix if present
      const styleData = styleImage.replace(/^data:image\/[^;]+;base64,/, '');
      imageParts.push({ text: 'Style reference image (match this visual treatment):' });
      imageParts.push({
        inlineData: {
          mimeType: 'image/png',
          data: styleData,
        },
      });
    }

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: imageParts,
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini generation error:', geminiRes.status, errText);
      return res.status(200).json({
        originalImage: `data:image/jpeg;base64,${originalBase64}`,
        heroImage: null,
        buildingAnalysis,
        anglesEvaluated: validImages.length,
        selectedAngle: selectedIndex,
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
      originalImage: `data:image/jpeg;base64,${originalBase64}`,
      heroImage: heroImageData,
      buildingAnalysis,
      anglesEvaluated: validImages.length,
      selectedAngle: selectedIndex,
      error: heroImageData ? null : 'No image generated by AI',
    });

  } catch (err) {
    console.error('Visualize v3 error:', err);
    return res.status(500).json({ error: 'Visualization pipeline failed' });
  }
}

// ── Score multiple Street View images to pick the best one ──
async function scoreImages(images, geminiKey) {
  const parts = [
    {
      text: `I have ${images.length} Street View photographs of the same building from different angles. Score each image from 1-10 based on: (1) how clearly the building facade is visible, (2) whether balconies are visible, (3) overall image quality and framing. Return ONLY a JSON object like {"scores": [7, 9, 5]} with no other text.`,
    },
  ];

  for (let i = 0; i < images.length; i++) {
    parts.push({
      text: `Image ${i + 1}:`,
    });
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: images[i].base64,
      },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) throw new Error(`Scoring failed: ${res.status}`);

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.scores) && parsed.scores.length === images.length) {
      let maxIdx = 0;
      for (let i = 1; i < parsed.scores.length; i++) {
        if (parsed.scores[i] > parsed.scores[maxIdx]) maxIdx = i;
      }
      return maxIdx;
    }
  } catch (e) {
    // Try to extract scores from text
  }

  return null;
}

// ── Analyze building from Street View image ──
async function analyzeBuilding(imageBase64, geminiKey, floor, totalFloors) {
  const prompt = `Analyze this photograph of a building. Provide a concise but detailed description covering:
1. Architectural style (e.g., brownstone, prewar, modern glass, brick walkup)
2. Building materials and colors (brick color, trim, window frames)
3. Number of visible floors
4. Balcony locations and styles (iron railings, concrete, juliet balconies, etc.)
5. Notable features (fire escapes, awnings, cornices, signage)
6. Lighting direction and quality in the photo
7. Camera angle relative to the building

Be specific and factual. This description will be used to generate a photorealistic visualization.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64,
            },
          },
        ],
      }],
    }),
  });

  if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── Helpers ──
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
