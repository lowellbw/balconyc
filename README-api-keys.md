# API Setup Guide — balco.nyc Solar Calculator

Complete guide to setting up every API the calculator uses. Most are free. Google is the only paid service.

---

## 1. NREL API Key (FREE)

Powers the core energy model (PVWatts V8). NREL became the National Laboratory of the Rockies in 2025; the API lives on `developer.nlr.gov` (the old nrel.gov host no longer resolves).

| | |
|---|---|
| **Signup** | https://developer.nlr.gov/signup/ |
| **Cost** | Free |
| **Rate limit** | 1,000 requests/hour per key |
| **What you get** | API key emailed instantly |
| **Client-safe?** | Yes — free key, rate-limited, no billing risk |

**Setup:**
1. Go to https://developer.nlr.gov/signup/
2. Fill in name, email, reason ("Solar energy modeling")
3. You'll receive your API key by email within minutes
4. Paste into `js/config.js`:
   ```js
   NREL_API_KEY: 'your_key_here',
   ```

**Used by:**
- `NREL PVWatts V8` — https://developer.nlr.gov/api/pvwatts/v8.json (energy production model)
- `scripts/build-pvwatts-table.mjs` and `scripts/build-irradiance-table.mjs` (regenerate the offline tables in `js/` after any PVWatts parameter change; 32 + 1 requests)
- `scripts/build-self-consumption-table.mjs` (regenerates `js/self-consumption-table.js` from the newest `docs/data/self-consumption-sim-*.csv`; no network)

**Docs:** https://developer.nlr.gov/docs/solar/pvwatts/v8/

---

## 2. Google Cloud — Maps JavaScript API + Places API (PAID)

Powers address autocomplete and geocoding.

| | |
|---|---|
| **Console** | https://console.cloud.google.com/ |
| **Cost** | Per-SKU pricing with per-SKU monthly free tiers (since March 2025). Check the current sheet before budgeting: https://developers.google.com/maps/billing-and-pricing/pricing |
| **Free tier** | Per SKU (Autocomplete and Geocoding each have their own monthly allowance) |
| **Rate limit** | Generous (thousands/sec) |
| **Client-safe?** | Yes — restrict to your domain |

**Setup:**
1. Go to https://console.cloud.google.com/
2. Create a project (or select existing)
3. Enable these APIs:
   - **Maps JavaScript API** — https://console.cloud.google.com/apis/library/maps-backend.googleapis.com
   - **Places API** — https://console.cloud.google.com/apis/library/places-backend.googleapis.com
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Click **Restrict Key**:
   - Application restrictions: **HTTP referrers**
   - Add: `balco.nyc/*`, `*.balco.nyc/*`, `localhost/*`, `*.vercel.app/*`
   - API restrictions: **Restrict key** → select Maps JavaScript API + Places API
6. Set up billing (required even for free tier): https://console.cloud.google.com/billing
7. Paste into `js/config.js`:
   ```js
   GOOGLE_API_KEY: 'AIzaSy...',
   ```

**Monthly cost at 1,000 estimates:** a few dollars at most; the per-SKU free tiers cover low volumes.

**Docs:** https://developers.google.com/maps/documentation/javascript/places-autocomplete

---

## 3. NYC Geoclient API (FREE)

Converts addresses to BBL (Borough-Block-Lot) and BIN (Building ID Number) for linking to NYC datasets.

| | |
|---|---|
| **Portal** | https://api-portal.nyc.gov/ |
| **Cost** | Free |
| **Auth** | Subscription key (Ocp-Apim-Subscription-Key header) |
| **Client-safe?** | **No** — must be server-side only (our Vercel proxy handles this) |

**Setup:**
1. Go to https://api-portal.nyc.gov/
2. Click **Sign Up** → create an account
3. After email verification, go to **Products** → **Geoclient v2**
4. Click **Subscribe** → select the free tier
5. Go to your **Profile** → **Subscriptions** → copy the **Primary key**
6. Add as Vercel environment variable:
   ```bash
   vercel env add NYC_GEOCLIENT_KEY
   # paste your subscription key when prompted
   # select: Production, Preview, Development
   ```

**Docs:** https://api-portal.nyc.gov/docs/services/geoclient/operations/geoclient-v2-address

---

## 4. NYC Open Data — Socrata App Token (FREE, OPTIONAL)

Higher rate limits for PLUTO and Building Footprints queries. Works without a token (just slower).

| | |
|---|---|
| **Portal** | https://data.cityofnewyork.us/ |
| **Cost** | Free |
| **Without token** | Throttled (works for low volume) |
| **With token** | 1,000 requests/hour |
| **Client-safe?** | Yes |

**Setup:**
1. Go to https://data.cityofnewyork.us/
2. Click **Sign Up** (top right) → create account
3. Go to your profile → **Edit Profile** → **Developer Settings**
4. Or directly: https://data.cityofnewyork.us/profile/edit/developer_settings
5. Click **Create New App Token**
6. Fill in app name ("balco.nyc"), description
7. Copy the **App Token** (not the Secret Token)
8. Paste into `js/config.js`:
   ```js
   SOCRATA_APP_TOKEN: 'your_token_here',
   ```

**Datasets accessed:**
- **PLUTO** — https://data.cityofnewyork.us/City-Government/Primary-Land-Use-Tax-Lot-Output-PLUTO-/64uk-42ks
- **Building Footprints**: https://data.cityofnewyork.us/City-Government/Building-Footprints/5zhs-2jue (queried with `intersects()`, in three tiers: everything within 200 m, buildings over 150 ft within 500 m, over 350 ft within 1.5 km)
- **Forestry Tree Points**: https://data.cityofnewyork.us/Environment/Forestry-Tree-Points/hn5i-inap (street trees within 80 m, for the shade model)

---

## Cost Summary

| API | Cost | Required? |
|---|---|---|
| NREL/NLR PVWatts | **Free** | Yes, core energy model (an offline PVWatts table for NYC covers outages) |
| Google Maps + Places | **Free at low volume** (per-SKU free tiers), a few $/1,000 estimates above that | Yes, address autocomplete |
| NYC Geoclient | **Free** | Recommended — enables building data lookup |
| NYC Socrata (PLUTO + Footprints + Tree Points) | **Free** | Recommended, building info, orientation, 3D shade |
| **Total at 1,000 estimates/month** | **about $0** | |
| **Total at 10,000 estimates/month** | **tens of dollars, Google only** | |

---

## Gemini (AI visualization, optional)

`/api/visualize-v3` fetches Street View imagery and calls Gemini to render panels onto the facade. Both cost money per call, so the endpoint is restricted to our own origins and rate-limited to 5 requests per IP per hour (`api/visualize-v3.js`). Set `GEMINI_API_KEY` and `GOOGLE_SV_KEY` as Vercel environment variables; never in `js/config.js`.

If you re-enable this feature, set a budget cap on the Gemini key in Google Cloud first.

---

## Running the tests

```bash
npm test        # node tests/run.js — no dependencies
```

The suite loads the shipped files in `js/` directly, so it tests exactly what the browser runs, including the PVWatts path against a recorded response in `tests/fixtures/`. Add a failing test before changing any model constant, and re-run `node scripts/build-pvwatts-table.mjs` after changing a PVWatts parameter.

---

## Quick Start (Local Development)

```bash
# 1. Set API keys in config
edit js/config.js
# → Add NREL_API_KEY, GOOGLE_API_KEY, SOCRATA_APP_TOKEN

# 2. Set Geoclient key for the serverless proxy (the proxy only answers
#    requests from balco.nyc or localhost:3000, 60 per IP per hour)
echo "NYC_GEOCLIENT_KEY=your_key" > .env.local

# 3. Run with Vercel dev server (needed for /api/geoclient proxy)
npx vercel dev
# → Opens at http://localhost:3000
```

## Production Deployment

```bash
# 1. Add Geoclient key to Vercel
vercel env add NYC_GEOCLIENT_KEY

# 2. Ensure js/config.js has production keys
# 3. Restrict Google API key to balco.nyc domain in Google Cloud Console
#    (this is the ONLY thing protecting it — the file is served publicly)
# 4. Add GEMINI_API_KEY + GOOGLE_SV_KEY if using /api/visualize-v3
# 5. Run the tests, then deploy
npm test && vercel --prod
```
