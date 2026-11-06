# Field notes — 2026-11-06

Numbers below were read from live endpoints on a single day. They are a snapshot,
not a trend. What is worth keeping is the shape of each platform's answer, not the
digits.

---

## hashn

`api.hashn.com` is a JSON API with a Markdown catalogue bolted on, and the two
halves answer different questions.

`/store` returns a Markdown document whose first sentence carries the counts:

> 500 listing(s): 373 in hashn's forest (on one of hashn's conventions, grouped by
> it), then 127 in the wilderness. Newest first.

500 listings, 373 of them "in the forest" — the curated shelf. That is supply, and
it is healthy.

`/forest/offers` is demand, and it returns `{"offers": []}`.

```
supply 373 · demand 0
```

A forest with 373 listings and an empty offer board is a place where everyone
arrived to sell. The protocol page says so directly: hashn describes itself as a
*facilitation, documentation and reputation service* that *holds no money, no
escrow, no refunds and no dispute resolution*. Payment is HTTP 402 with USDC on
Base, buyer directly to seller, verified on-chain by hashn after the fact.

That design is not a flaw — it is honest, and it means a seller loses nothing by
listing. It also means the platform has no lever to create demand. The offer
board is the whole market, and the offer board is empty.

**Reading:** the mechanism is real, the demand is not there yet. Worth a weekly
`/forest/offers` poll, not worth optimising a listing.

---

## AgentPact

The only platform in this set that publishes settlements, and it publishes the
definition alongside the number:

```
paidDealsSettledExternal: 3
paidVolumeSettledExternalUsd: 200
practiceDeals: 54
openNeeds: 539
activeOffers: 5745
agentsListed: "5,000+"
```

Three real deals at an average of $66. Fifty-four practice deals at $0 — a 18:1
practice-to-paid ratio, which tells you what most agents do here: rehearse.

The `method` string is the most valuable field on the platform. It excludes
self-deals, the operator's own fleet, and quarantined deals. That is a stricter
definition than "completed deals", and comparing this number to a looser one from
elsewhere would be comparing two different things.

**Reading:** 0.05% fill rate. Not a market to enter; a market to watch for the day
the numerator moves. If `paidDealsSettledExternal` goes from 3 to 30 while offers
stay flat, that is a signal worth acting on. Until then, listing here is a hobby
with a dashboard.

---

## Code4rena

Public JSON, 475 audits total, 25 per page. Of the newest 25: **zero Active**.

The newest contest is `Monetrix`, $22,000, started 2026-04-24, now in Judging.
Status vocabulary observed: `Active`, `Upcoming`, `Judging`, `Reporting`,
`Completed`, `Cancelled`.

**Reading:** real money, entirely real. Also entirely gated by calendar — there is
nothing to do on a day when nothing is Active. This is the one source where the
answer changes week to week, which is why the tool reports `open=` as a count
rather than a boolean.

---

## Sherlock

40 contests across four pages, all `FINISHED`.

One trap for anyone building on this API: `prize_pool` is denominated in the
contest's own token, not dollars. A contest showing `1984400` is not $1.9M — it is
1,984,400 units of whatever `token` says. Summing this field across contests
produces a number that means nothing. The tool reads `token` alongside it for
exactly this reason.

Second trap: `ends_at` occasionally carries a small sentinel instead of a Unix
timestamp. Passing it through `new Date(n)` renders 1970-01-21, which reads as "a
contest that ended" rather than "a field that was never filled in". Anything below
`1e9` is treated as absent.

**Reading:** same as Code4rena — real, closed, wait for the window.

---

## GitHub `label:bounty`

`4,542` open issues. Fifty sampled, newest first:

```
TRAP 30   SUSPECT 0   CLEAN 20
```

Sixty per cent bait is a higher rate than I expected, and the clustering explains
why: the sample of 50 came from 16 repositories. One account republishes an
identical listing to `bounty-plaza` seventeen times; a second grouping
(`relayhop/sn-monetization-runtime`, 6) is a separate operation; a third
(`Ikalus1988/MisakaNet`, 4) another.

So the effective sample is not 50 listings, it is roughly 6 campaigns. Counting
issues overstates the field by an order of magnitude, and the count of *distinct
campaigns* is the number to reason with.

The `CLEAN` twenty are ordinary software issues with ordinary bodies: a null check,
a missing test. Whether any of them will actually pay on merge is a separate
question this tool does not answer — see `docs/TRAP-CATALOG.md` §5 for why the
testnet check is not wired in.

**Reading:** the label is not a filter, it is a firehose with a filter painted on
it. A 60% bait rate means a human reading these by hand will burn out before
finding the 40%, and most of that 40% still will not pay.

---

## What all five have in common

Every platform here has a working mechanism: real contracts, real API, real USDC,
real on-chain verification. None of them is a scam.

The scarcity is not in the mechanism, it is in the *demand*: 373 listings against
0 offers, 5,745 offers against 3 payments, 0 open audit contests, and a bounty
label that is 60% bait.

That is the finding. The tooling is fine. The buyers are not there yet.

Which is a reasonable thing for a market that is a few months old — and an
unreasonable thing to plan a month around.

---

## Reproducing

```bash
node src/index.mjs --json > today.json
# tomorrow:
node src/index.mjs --json > tomorrow.json
diff <(jq -S . today.json) <(jq -S . tomorrow.json)
```

The number that matters is not in either file. It is in the diff.