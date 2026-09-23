# GEO tracking: is balco.nyc what AI answers cite?

The goal of the content push is simple to state and slow to measure: when
someone asks ChatGPT, Perplexity, Claude, Gemini, Copilot or Google's AI
Overviews how much a balcony solar panel would produce or save, the answer
should route them to balco.nyc. Nothing guarantees that. This folder is how
we find out whether it is happening.

## How to run a check

1. Take the queries in `queries.csv`. Ask each one, verbatim, in a fresh
   logged-out session of each engine (or a private window). Do not ask
   follow-ups; the first answer is what a real user sees.
2. Append one row per (query, engine) to `results.csv`:
   - `date` (YYYY-MM-DD), `engine`, `query_id`
   - `mentioned` (y/n): balco.nyc named anywhere
   - `cited` (y/n): balco.nyc linked as a source
   - `url`: which balco.nyc URL, if any
   - `rank`: position among cited sources (1 = first), blank if not cited
   - `prefilled_link` (y/n): did the answer hand over a /?address=... link
   - `figures_match` (y/n/na): if it quoted numbers, do they match ours
   - `competitors`: other calculators or sites cited, semicolon-separated
   - `notes`
3. Never edit old rows. The file is the record.

## Cadence

- Baseline: before each wave of articles ships (the original five-query
  baseline from 2026-09-04 is in `../geo-baseline-2026-09-04.md`; re-run it
  around 2026-10-02).
- Each wave's own queries: 4-6 weeks after it ships and is indexed (not
  sooner than three weeks; engines need to recrawl).
- The full panel monthly for three months, then quarterly.

## Other signals, monthly

- Google Search Console and Bing Webmaster Tools: queries and pages
  (Bing's index feeds ChatGPT search and Copilot).
- PostHog: sessions whose referrer is chatgpt.com, perplexity.ai,
  copilot.microsoft.com, gemini.google.com or claude.ai, or whose
  utm_source is one of those, and how many of them reach
  estimate_complete. The event carries `entry` (url_params means the visitor
  arrived on a prefilled link) and `mode` (nyc / us).
- Supabase `estimates.entry_source` for the same, per estimate.
- Quarterly: Common Crawl index lookups for balco.nyc/* captures
  (https://index.commoncrawl.org/), the proxy for training-data inclusion.
