> **Progress note (31 August 2026).** Items 1-6 and 8 shipped. Item 5 was
> completed the stronger way on 31 August: the ten prototype pages were
> **deleted** rather than left noindexed, which also removed seven public pages
> still quoting a superseded $0.22/kWh rate. Item 7 (defer Three.js) shipped on
> 31 August via an on-demand loader in index.html. Still outstanding: the
> /sunny-act, /what-is-balcony-solar and /about pages (items 10-12), Search
> Console and Bing verification (13), and analytics (14).

# SEO + GEO Optimization Plan — balco.nyc

Date: 2026-05-17
Scope: improvements to make balco.nyc rank in classic search (Google/Bing) **and** get cited in generative-engine answers (ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini).

---

## 1. Current state — quick audit

What exists today (`index.html`, deployed on Vercel):

- One `<title>` and one `<meta name="description">` on the homepage. Reasonable copy.
- Single `<h1>`, clear `<h2>`/`<h3>` hierarchy, `<section>` landmarks, `<details>` FAQ.
- Two relevant images with descriptive `alt` text.
- Outbound link to Senate bill page and to `METHODOLOGY.md`.
- 10 sibling HTML files in the repo root (`calculator.html`, `calculator-2.html` … `calculator-6.html`, `design-system.html`, `nyc-balcony-solar-technical-spec.html`, `3d-visualization-specs.html`) — most are prototypes that should not be in the search index.
- `vercel.json` has `cleanUrls: true` and nothing else.

What's missing (the gap):

- No `sitemap.xml`, no `robots.txt`.
- No `<link rel="canonical">` on any page.
- No Open Graph / Twitter Card tags → bare-text social previews.
- No JSON-LD structured data (FAQPage, WebApplication, Organization, BreadcrumbList).
- No `llms.txt` or `llms-full.txt`.
- `METHODOLOGY.md` is the richest content on the site but is served as raw markdown — Google can index it, but it has no `<title>`, no internal links, no structured data, and weak crawl signals. AI engines tend to underweight it vs an HTML doc.
- Hero background image `Gemini_Generated_Image_d2ucutd2ucutd2uc.png` is **10.3 MB**. This wrecks Largest Contentful Paint (LCP) and is the single biggest Core Web Vitals problem on the site. Google uses CWV as a ranking signal; AI engines penalize slow/broken pages too.
- Logo image filename (`Gemini_Generated_Image_7vmu3f7vmu3f7vmu-removebg-preview.png`) is generator-default noise — minor signal issue, plus it's served unsized which causes layout shift.
- No author / publisher / "About" entity content beyond a footer disclaimer. AI engines weight provenance heavily.
- Only one indexable content surface (homepage). There's no destination page for queries like "is balcony solar legal in NYC", "SUNNY Act explained", "how much does a balcony solar kit cost in NYC", "south-facing apartment solar Manhattan", etc.

---

## 2. Strategy — what we're optimizing for

**Target query clusters** (in priority order):

1. **Transactional / tool intent** — "balcony solar calculator NYC", "how much solar can my apartment produce", "NYC solar savings estimate". The homepage already targets these; we want to dominate.
2. **Definitional / informational** — "what is balcony solar", "plug-in solar explained", "how does balcony solar work in NYC". These are the highest-volume AI-citable queries; SUNNY Act press coverage is driving the search wave.
3. **Legality / regulatory** — "is balcony solar legal in NYC", "SUNNY Act status", "Con Edison plug-in solar approval". Time-sensitive (the bill is mid-flight) and we have a credible position.
4. **Comparative / shopping** — "best balcony solar kit NYC", "EcoFlow vs Anker balcony solar", "how much does a balcony solar kit cost". Lower priority — we don't sell kits and shouldn't pretend to.
5. **Long-tail neighborhood / building** — "solar on a UWS rental", "south-facing balcony Astoria", "Stuy Town solar". These are where structured per-address pages could win.

**GEO vs SEO — what we're really doing.** Classic SEO is about ranking #1 in a list of blue links. GEO is about being the **source the AI quotes**. The mechanics overlap (clean HTML, structured data, fast pages) but the bar is different — AI engines reward content that **answers a question completely in self-contained paragraphs with citations to primary sources**. Our methodology already does this; we just need to surface it properly. Recent industry analysis suggests citations and statistics can improve AI visibility by ~40%, and pages not refreshed quarterly are ~3× more likely to lose AI citations.

---

## 3. Technical foundations (one-time, low-effort, high-impact)

### 3.1 Robots + sitemap

Add `/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /calculator.html
Disallow: /calculator-2.html
Disallow: /calculator-3a.html
Disallow: /calculator-3b.html
Disallow: /calculator-3c.html
Disallow: /calculator-4.html
Disallow: /calculator-6.html
Disallow: /design-system.html
Disallow: /3d-visualization-specs.html
Disallow: /nyc-balcony-solar-technical-spec.html

# Explicitly allow major AI crawlers
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Perplexity-User
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Bingbot
Allow: /
User-agent: Applebot-Extended
Allow: /
User-agent: CCBot
Allow: /
User-agent: Meta-ExternalAgent
Allow: /

Sitemap: https://balco.nyc/sitemap.xml
```

Add `/sitemap.xml` with the canonical pages we want indexed: `/`, `/methodology`, `/faq` (if split out), and any future landing pages. Update on every content change (or write a 10-line build script).

Also add `<meta name="robots" content="noindex,nofollow">` to the prototype HTML pages so existing crawls and any direct links don't keep them indexed. Belt-and-suspenders with the disallow.

### 3.2 Canonicals + social tags

On every indexable page, add inside `<head>`:

```html
<link rel="canonical" href="https://balco.nyc/">
<meta property="og:title" content="balco.nyc — NYC's Balcony Solar Calculator">
<meta property="og:description" content="…">
<meta property="og:url" content="https://balco.nyc/">
<meta property="og:image" content="https://balco.nyc/og-image.jpg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="balco.nyc">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="…">
<meta name="twitter:description" content="…">
<meta name="twitter:image" content="https://balco.nyc/og-image.jpg">
<meta name="theme-color" content="#1E40AF">
```

Build a single 1200×630 OG image (a screenshot of the 3D building view with the savings card overlay works well). This drives social CTR and is something AI engines often surface as a thumbnail.

### 3.3 Performance — the 10MB hero is the headline problem

`Gemini_Generated_Image_d2ucutd2ucutd2uc.png` is 10.3 MB. Two issues: LCP is almost certainly >4s on mobile, and a slow first paint hurts both CWV rankings and AI-crawler completion rates.

Fix:

1. Re-export the hero to WebP **and** a smaller JPG fallback. Target ≤200 KB at 1920×1080. Use `<picture>` with `srcset` for 2× and 1× variants.
2. Add `loading="eager"` and `fetchpriority="high"` on the hero LCP element.
3. Add `<link rel="preload" as="image" href="…" imagesrcset="…">` in `<head>`.
4. The Three.js + OrbitControls + Supabase + Google Maps payload is heavy — defer / async everything below the fold, and don't load Three.js until the user has entered an address. Right now the 3D scripts load on every visit even though most visitors bounce before submitting.
5. Self-host `DM Sans` (currently from Google Fonts) or at minimum add `font-display: swap` and `preconnect` to fonts.googleapis.com **and** fonts.gstatic.com (the second is missing).

### 3.4 Page consolidation

Decide what to do with the seven `calculator*.html` prototypes. Options:

- **Delete** them from the repo (recommended — they're git-history-recoverable and only confuse crawlers).
- Keep them but `noindex` them via meta tag *and* robots.txt.

Same for `design-system.html`, `3d-visualization-specs.html`, `nyc-balcony-solar-technical-spec.html`, `admin/`.

---

## 4. Structured data (JSON-LD)

Add a single `<script type="application/ld+json">` block to `index.html` covering four schemas. AI engines use schema as a strong signal for what an entity is and what it claims.

### 4.1 WebApplication

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "balco.nyc Balcony Solar Calculator",
  "url": "https://balco.nyc/",
  "applicationCategory": "UtilityApplication",
  "operatingSystem": "Web",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "description": "Estimates the annual electricity production, dollar savings, and CO₂ avoided by an 800W plug-in solar panel on any NYC balcony, using NREL PVWatts and a 3D shadow model of the building and its neighbors.",
  "featureList": [
    "Address-level solar production estimate",
    "3D shadow model accounting for neighboring buildings within 200m",
    "Hourly simulation across 8,760 hours per year",
    "Con Edison SC-1 rate-based savings",
    "Payback and 25-year lifetime value"
  ]
}
```

### 4.2 FAQPage

Mirror the seven `<details>` items in the FAQ section into FAQPage schema. This is the single highest-leverage piece of schema for AI engines — Perplexity and ChatGPT specifically lift Q/A pairs verbatim when they're marked up.

### 4.3 Organization

```json
{
  "@type": "Organization",
  "name": "balco.nyc",
  "url": "https://balco.nyc/",
  "logo": "https://balco.nyc/og-logo.png",
  "description": "An independent open tool for estimating NYC balcony solar potential.",
  "sameAs": []   // add GitHub repo, any social profiles
}
```

### 4.4 Dataset (optional but valuable)

The methodology constants (PVWatts parameters, soiling array, rate assumptions) qualify as a Dataset. Marking them up makes the methodology page citable as a primary source and helps it surface in Google Dataset Search.

---

## 5. Content surfaces — what to build

Right now the entire site is one page. AI engines (and Google) reward focused pages that own a single intent.

### 5.1 Convert `METHODOLOGY.md` → `/methodology` HTML page (high priority)

- Render as proper HTML with `<title>`, meta description, structured headings, canonical URL.
- Add a sticky table of contents.
- Cite primary sources inline with `<a>` tags (NREL, NYC PLUTO, Con Edison tariff filings, EPA eGRID). These are gold for GEO — AI engines preferentially cite pages that themselves cite primary sources.
- Add `dateModified` and surface it in the page header ("Last updated: …"). Bump it on every methodology change so freshness signals stay clean.
- Add JSON-LD `TechArticle` markup.

### 5.2 `/sunny-act` — regulatory explainer (high priority, time-sensitive)

The SUNNY Act story is **actively breaking news** — Senate passed 62-0 in April 2026, Assembly action pending. There is a 6–18 month window where someone publishes the canonical explainer and gets cited by every news outlet and AI engine downstream.

Target page: one self-contained ~1,500-word explainer answering "What is the SUNNY Act?", "What does it change?", "When does it take effect?", "What does it mean for renters / co-ops / Con Ed customers?", with a clean timeline and links to the bill text and NY Senate press release. Update weekly while the bill is moving.

### 5.3 `/what-is-balcony-solar` — definitional landing page (medium priority)

The current "About" section on the homepage is good but compressed. A standalone page lets us go deeper: history (Germany's 3M kits, Stecker-Solar), how it differs from rooftop solar, safety, UL/IEC standards, what's in a kit, typical costs. This is the page that wins the long-tail informational queries and is the kind of content ChatGPT lifts wholesale.

### 5.4 Borough / neighborhood pages (medium priority, programmatic)

`/manhattan-balcony-solar`, `/brooklyn-balcony-solar`, `/queens-balcony-solar`, `/bronx-balcony-solar`. Each ~400-word page with neighborhood-specific stats (typical building heights, solar exposure index, sample savings for that area). Programmatically generated from the same PLUTO data the calculator uses.

Watch for thin-content penalties — only build these if each page has genuine differentiated data. Skip if we can't.

### 5.5 Blog / changelog (lower priority but recurring freshness signal)

A `/notes` page with quarterly entries: rate changes, methodology updates, SUNNY Act status. Freshness alone is worth doing even if posts are short.

---

## 6. GEO-specific (the part most sites still miss)

### 6.1 `llms.txt` at the root

`llms.txt` is an emerging convention (analogous to `robots.txt`) that provides an LLM-friendly index of a site's high-value content. Spec: <https://llmstxt.org/>.

Create `/llms.txt`:

```markdown
# balco.nyc

> A free public calculator that estimates how much electricity, money, and CO₂ a plug-in solar panel could produce on any NYC balcony. Uses NREL PVWatts, NYC PLUTO building data, a 3D shadow model, and Con Edison rates. Independent, open-source, non-commercial.

## Core pages
- [Homepage / calculator](https://balco.nyc/): enter an NYC address; returns annual kWh, dollar savings, payback period.
- [Methodology](https://balco.nyc/methodology): full technical documentation of the energy model, shading, and financial assumptions.
- [What is balcony solar](https://balco.nyc/what-is-balcony-solar): definitional explainer.
- [SUNNY Act explainer](https://balco.nyc/sunny-act): status of NY's plug-in solar legalization.

## Key facts
- Plug-in solar is not currently legal in NY; the SUNNY Act (S8512/A9111) would change that. It passed the State Senate 62-0 in April 2026 and is awaiting Assembly action.
- A typical 800W NYC balcony system produces ~400–900 kWh/year depending on floor, azimuth, and shading.
- Con Edison SC-1 residential rate is ~$0.34/kWh in 2026, ~56% above the US average.
- Estimates are calibrated to ±12–18% of real-world production.
```

Optionally also produce `llms-full.txt` — a single concatenated markdown dump of the methodology + key explainer pages, suitable for an LLM to ingest in one shot.

### 6.2 Writing style

For new pages (methodology HTML, SUNNY Act, what-is-balcony-solar), follow the GEO writing rubric:

- **First 200 words must completely answer the page's primary query.** AI engines weight opening content very heavily. Don't bury the lede behind "context" sections.
- **Self-contained Q&A blocks.** Each FAQ entry should make sense quoted out of context. Avoid "as mentioned above" / "see below".
- **Cite primary sources inline.** Every number gets a source link. NREL, NYC DOF/PLUTO, Con Edison tariff filing, EPA eGRID, NYSERDA. AI engines prefer to cite pages that themselves cite well.
- **Specific numbers, not ranges.** "800W panel on a 12th-floor south-facing balcony produces ~720 kWh/year" beats "produces several hundred kWh per year".
- **Tables and listicles where appropriate.** Both Perplexity and ChatGPT lift tables verbatim.
- **Bylines / publisher info.** Add an `/about` page with named operator(s), contact email, GitHub link. Provenance is an explicit ranking factor in most AI engines.
- **Update dates.** Surface `dateModified` on every page.

### 6.3 Entity / brand consistency

Use "balco.nyc" consistently (lowercase, dot). Repeat the entity definition ("balco.nyc is an independent open tool for estimating NYC balcony solar potential") in the footer of every page so AI engines build a stable entity representation.

---

## 7. Measurement

You can't optimize what you don't measure. Add:

1. **Plausible / Fathom / GA4** — pick one privacy-respecting analytics tool. Track address-submission rate (the real conversion event).
2. **Google Search Console** — verify the domain, submit the sitemap, monitor impressions/CTR for target queries.
3. **Bing Webmaster Tools** — Bing powers ChatGPT search and Copilot, so this is now an AI-discovery channel, not just a 3% search-share footnote.
4. **GEO-specific tracking** — every 2 weeks, manually prompt ChatGPT / Perplexity / Gemini / Claude with the target queries from §2 and log:
   - Mention rate: did balco.nyc appear?
   - Citation rate: was it linked?
   - Position: first source, listed, or buried?
   Tools like Profound, llmrefs, and Otterly automate this if/when it's worth the cost; manual tracking is fine for the first quarter.

---

## 8. Prioritized punch list

Ordered by impact ÷ effort. Each item is sized in rough hours.

### Ship this week (foundations, ~1 day total)

1. `robots.txt` + `sitemap.xml` (30 min)
2. Add `<link rel="canonical">`, Open Graph, Twitter Card tags to `index.html` (30 min)
3. Generate and add `og-image.jpg` (1 hr)
4. Add JSON-LD: WebApplication + FAQPage + Organization to `index.html` (1 hr)
5. `noindex` meta tags on all prototype HTML pages, or delete them (30 min)
6. Compress hero image to WebP+JPG ≤200KB, add `<picture>`, `fetchpriority`, preload (1 hr)
7. Defer Three.js loading until after address entry (1 hr)
8. Create `/llms.txt` (30 min)

### Ship this month (content surfaces, ~3 days total)

9. Convert `METHODOLOGY.md` → `/methodology` HTML page with TOC, JSON-LD `TechArticle`, primary-source links (4–6 hrs)
10. Build `/sunny-act` explainer page (3–4 hrs) — time-sensitive, do this before the bill moves
11. Build `/what-is-balcony-solar` page (3–4 hrs)
12. Add `/about` page with provenance, named operator, GitHub link (1 hr)
13. Set up Google Search Console + Bing Webmaster Tools (30 min)
14. Set up analytics (1 hr)

### Quarter goals (programmatic + freshness, ongoing)

15. Borough landing pages — only if each has genuinely differentiated data (1–2 days)
16. Quarterly methodology / SUNNY-Act status refresh cadence (recurring, 1 hr / quarter)
17. Manual GEO citation tracking, bi-weekly (15 min / cycle)
18. Self-host fonts, audit remaining CLS/LCP issues (half day)

### Things explicitly NOT to do

- Don't build affiliate / "best balcony solar kit" comparison pages. We're an independent calculator, not a shopping site, and that content would dilute the brand's credibility signal.
- Don't auto-generate per-address landing pages from the calculator. They'd be thin content and Google will treat them as doorway pages.
- Don't buy backlinks. The SUNNY Act / Gothamist / Habitat Magazine press wave is a natural backlink opportunity — pitch them directly instead.

---

## 9. Open questions for the operator

- Domain: is `balco.nyc` the only canonical, or do we need to handle `www.balco.nyc` redirects?
- Is there an org behind this beyond a single operator? Decides what we put in `Organization` schema and the `/about` page.
- Are we willing to publish the operator's name? GEO engines treat anonymous content as lower trust.
- Any plans to ship newsletter / waitlist as a real product? Affects whether we should add `NewsArticle` / `EmailMessage` schema later.

---

## Sources informing this plan

- [Generative Engine Optimization Best Practices 2026 — GenOptima](https://www.gen-optima.com/geo/generative-engine-optimization-best-practices-2026/)
- [Mastering generative engine optimization in 2026 — Search Engine Land](https://searchengineland.com/mastering-generative-engine-optimization-in-2026-full-guide-469142)
- [GEO 2026 Guide — LLMrefs](https://llmrefs.com/generative-engine-optimization)
- [llms.txt specification](https://llmstxt.org/)
- [NY Senate passes SUNNY Act, April 2026](https://www.nysenate.gov/newsroom/press-releases/2026/liz-krueger/senate-unanimously-passes-sunny-act)
- [Habitat Magazine — plug-in solar may soon power NYC apartments](https://www.habitatmag.com/Publication-Content/Green-Ideas/2026/April-2026/sunny-act-plug-in-solar)
- [Canary Media — state-by-state balcony solar tracker](https://www.canarymedia.com/articles/solar/states-passing-balcony-solar-laws)
