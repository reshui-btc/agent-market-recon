# agent-market-recon

Measure whether an AI-agent marketplace has ever actually paid somebody, before you spend a week listing on it.

```
                   supply   demand  settled     rate  verdict
hashn                 373        0        —        —  DEAD
AgentPact            5745      539        3    0.05%  SHOWCASE
```

Zero dependencies. Node 20+. Reads live endpoints. No API keys required (one optional token raises a limit).

---

## The question

Every "make money with your AI agent" post in 2026 has the same shape: sign up, list your service, wait for work. What none of them do is divide the number of offers by the number of times someone got paid.

That ratio is the whole argument.

**5,745 active offers. 3 settled deals. 0.05%.**

That is not a market with a supply problem. It is a market with a demand problem, and no amount of listing effort moves it. A seller can improve their offer, sharpen their pricing, ship a better demo — none of it changes a numerator that is being set by somebody else's budget.

The second question this tool answers is on the buy side: of the thousands of open bounties labelled `bounty`, how many are actually buying a change to code?

[`docs/sample-output.txt`](docs/sample-output.txt) is a full run. 30 of 50 sampled issues are bait.

---

## Run it

```bash
node src/index.mjs              # everything
node src/index.mjs --json       # same report, machine readable
node src/index.mjs --only=github,agentpact
node --test test/               # 21 tests, no network
```

Optional, for the demand side of hashn:

```bash
HASHN_TOKEN_FILE=~/.secrets/hashn_token.txt node src/index.mjs
```

Exit code is 0 whenever a report was produced. Individual sources fail loudly and independently — one dead endpoint does not blank the other four. Exit 1 only when every requested source failed.

---

## What it reads

| Source | Endpoint | What it is |
|---|---|---|
| hashn | `/store` | Markdown catalogue. The opening sentence carries the counts. |
| hashn | `/forest/offers` | JSON demand board. Needs a bearer token; answers 401 rather than pretending to be empty. |
| AgentPact | `/api/stats/public` | The only platform in this set that publishes settlements, with its own definition of the word. |
| Code4rena | `/api/v1/audits` | Real USD prize pools. Mostly closed. |
| Sherlock | `/api/contests` | Prize pools denominated in the contest's own token, not dollars. |
| GitHub | `/search/issues` | `label:bounty is:open no:assignee`, newest first. |

---

## The trap detector

GitHub's bounty label is the largest supply of agent-shaped work on the internet and the easiest place to lose a week. Listings written to attract an automated worker look different from listings written to buy work, and the difference is measurable.

| Signal | Weight | What it means |
|---|---|---|
| `escrow_self_claim` | 3 | Says "escrowed" and points nowhere that holds escrow. |
| `bare_ip_endpoint` | 3 | Acceptance criteria live at `http://1.2.3.4:11449/...`. |
| `no_human_review` | 3 | "Manual pull requests from human engineers are not reviewed." The audience is a bot. |
| `title_body_mismatch` | 2 | Repo is `asyncpg-savepoint-harness`; the only issue is about PagedAttention KV-cache desync. The name is borrowed credibility. |
| `undefined_magic_constant` | 2 | Two or more wire-format-looking constants (`STREAM_WATERMARK_MASK`) used as acceptance criteria and defined nowhere. |
| `fresh_repo` | 1 | Repository younger than a week. |
| `good_first_issue_on_hard_task` | 1 | No comments, labelled "good first issue" on something nobody could call a first issue. |

`score >= 5` → **TRAP**. `>= 3` → **SUSPECT**. Otherwise **CLEAN**.

Every signal carries the substring that fired it. A score without the quote is an opinion:

```
  [10] IES-BoilerRoom/asyncpg-savepoint-harness#1
      💎 [Escrowed $450 USDC] 24-Vector Conformance Suite: Streaming MCP SSE Chunk Boundary…
      · bare_ip_endpoint: http://132.145.159.202:11449
      · no_human_review: manual pull requests from human engineers are not reviewed
      · title_body_mismatch: repo tokens [asyncpg, savepoint] appear nowhere in the body
      · undefined_magic_constant: STREAM_WATERMARK_MASK, EPOCH_STRIDE_MATRIX
```

The clustering printout is the part that surprised me. In the sample above, 30 traps came from a handful of repositories: one account republishes the same bait listing to `bounty-plaza` seventeen times, and a second grouping is a separate operation running the identical text. Counting *issues* overstates the field by a factor of three. Counting *campaigns* is the honest number.

---

## What this does not do

- **It does not tell you whether you are good enough to win an audit contest.** It tells you whether one is open and what it pays. Those are different questions, and the second one is the only one a script can answer.
- **It does not verify escrow.** The only trustworthy source for "this bounty is funded" is the escrow provider's own API (`algora.io`, `polar.sh`, `opire.dev`). A repo *saying* it is escrowed is a string in a text field. `escrow_self_claim` fires when that string appears with no provider host anywhere in the listing — it is evidence of an unverifiable claim, not proof of fraud.
- **It cannot see demand that has not been posted.** A quiet marketplace and a dead one look the same from outside.
- **The `CLEAN` bucket is not a recommendation.** It means none of seven signals fired. `native-value-reality` — the check that reads a README for "testnet", "Sepolia", "real value is not moving yet" — is implemented in `judge.mjs` but not wired into the scan, because fetching a README per issue multiplies the request count by fifty.
- **One page of each source.** 25 audits, 40 contests, 50 issues. Enough to characterise a field; not enough to enumerate it.

---

## Design notes

Three decisions shaped everything else.

**Failures and emptiness are different values.** `parseStoreCounts` returns `null`, never `0`, when a phrase is missing. `getJSON` throws rather than returning `[]` when a CDN serves an HTML page with a 200. A dashboard that reads "0 open bounties" when the truth is "the API is down" causes the reader to quit a working plan. A dashboard that reads `—` causes them to check.

**The judgement layer has no I/O.** `src/judge.mjs` takes strings and a clock and returns a score. No fetch, no `Date.now()` inside the scoring path. The rules that decide "this is bait" are the part of this project most likely to be argued with, so they have to be readable and testable without a network.

**`--json` exists so the table can be diffed against yesterday.** The interesting signal is not the number, it is the number moving.

Six dependencies would have been shorter. Node's `fetch` and `node:test` are enough.

---

## Licence

MIT.