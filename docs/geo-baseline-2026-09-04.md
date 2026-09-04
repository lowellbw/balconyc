# Search & AI-citation baseline — 4 September 2026

Measured the day the five guide pages shipped, **before any of them could be
indexed**. That is the point: this is the "before" column. Re-run the same
queries in 4–8 weeks and compare.

Method: each query run once through a live web search, recording whether
balco.nyc appears in results and whether the generated answer cites it.
One run per query on one day — indicative, not rank tracking. Search
Console (still outstanding) is what turns this into real measurement.

## Baseline

| Query | balco.nyc in results | Cited in the AI answer | Who owns it today |
|---|---|---|---|
| balcony solar calculator NYC | **yes, 2nd** | **yes** — "the most detailed local analysis for the city" | brightsaver.org, then us |
| is balcony solar legal in NYC | no | no | pluginsolarhub, simplepluginsolar, thefortify, pluginsolarus |
| what is balcony solar / how it works | no | no | solarunitedneighbors, Wikipedia, solar.com, brightsaver, energysage |
| Con Edison rate: marginal vs supply-only for solar | no | no | **nobody** — see below |
| which states have legalised plug-in solar | no | no | canarymedia, pluginsolarhub |

## What the baseline says

**We already win the tool cluster.** Second place and an approving citation,
with no content work at all. The `llms.txt` and FAQ schema are doing their job.

**We are absent everywhere else.** Four of five clusters return nothing of ours.
That is what the five new pages are aimed at.

**The rate question has no good answer on the open web.** The search for why
calculators disagree on Con Edison's rate returned no calculator at all, and the
generated answer was *wrong* — it explained net-metering export credits and
annual avoided-cost true-ups, which do not apply to plug-in solar, since the
SUNNY Act exempts these devices from net metering entirely. Nobody is answering
the question that was asked. `/electricity-rate` is the page most likely to earn
citations, because it is the only one where the incumbent answer is mistaken
rather than merely absent.

## Re-test

Run the same five queries and fill in a second column. Watch for:

- **Legality cluster** — the page to beat is a thin status paragraph. If
  `/sunny-act` is not appearing within two months of indexing, the problem is
  authority, not content, and the answer is the press wave rather than more words.
- **Rate cluster** — the fastest signal. A correct answer where the incumbent is
  wrong is the kind of thing engines pick up quickly.
- **AI citation wording** — if answers begin quoting our lede paragraphs
  verbatim, the self-contained-first-paragraph structure is working and should be
  applied to any future page.

Do not read anything into a re-test run sooner than about three weeks; nothing
here is indexed yet.
