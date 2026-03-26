# API Setup Guide — balco.nyc Solar Calculator

Complete guide to setting up every API the calculator uses. Most are free. Google is the only paid service.

---

## 1. NREL API Key (FREE)

Powers the core energy model (PVWatts) and solar resource data.

| | |
|---|---|
| **Signup** | https://developer.nrel.gov/signup/ |
| **Cost** | Free |
| **Rate limit** | 1,000 requests/hour per key |
| **What you get** | API key emailed instantly |
| **Client-safe?** | Yes — free key, rate-limited, no billing risk |

**Setup:**
1. Go to https://developer.nrel.gov/signup/
2. Fill in name, email, reason ("Solar energy modeling")
3. You'll receive your API key by email within minutes
4. Paste into `js/config.js`:
   ```js
   NREL_API_KEY: 'your_key_here',
   ```

**Used by:**
- `NREL PVWatts V8` — https://developer.nrel.gov/api/pvwatts/v8.json (energy production model)
- `NREL Solar Resource` — https://developer.nrel.gov/api/solar/solar_resource/v1.json (irradiance data)

**Docs:** https://developer.nrel.gov/docs/solar/pvwatts/v8/

---

## 2. Google Cloud — Maps JavaScript API + Places API (PAID)

Powers address autocomplete and geocoding.

| | |
|---|---|
| **Console** | https://console.cloud.google.com/ |
| **Cost** | ~$2.83 per 1,000 autocomplete sessions + ~$5 per 1,000 geocode requests |
| **Free tier** | $200/month free credit (covers ~25,000 autocomplete sessions) |
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

**Monthly cost at 1,000 estimates:** ~$8 (well within $200 free credit)

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
- **Building Footprints** — https://data.cityofnewyork.us/City-Government/Building-Footprints/5zhs-2jue

---

## Cost Summary

| API | Cost | Required? |
|---|---|---|
| NREL PVWatts + Solar Resource | **Free** | Yes — core energy model |
| Google Maps + Places | **~$8/mo** at 1K estimates (has $200/mo free credit) | Yes — address autocomplete |
| NYC Geoclient | **Free** | Recommended — enables building data lookup |
| NYC Socrata (PLUTO + Footprints) | **Free** | Recommended — building info + orientation |
| **Total at 1,000 estimates/month** | **~$8/month** | |
| **Total at 10,000 estimates/month** | **~$80/month** | |

The $200/month Google free credit means you pay **$0 until ~25,000 estimates/month**.

---

## Quick Start (Local Development)

```bash
# 1. Set API keys in config
edit js/config.js
# → Add NREL_API_KEY, GOOGLE_API_KEY, SOCRATA_APP_TOKEN

# 2. Set Geoclient key for the serverless proxy
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
# 4. Deploy
vercel --prod
```
