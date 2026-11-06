# Trap catalogue

Every entry here is a real listing observed on 2026-11-06, quoted from the
original. They are kept because the pattern is what generalises — the specific
amounts and repository names will be gone in a month, the shape will not.

---

## 1. The escrow claim with no escrow

**Observed:** `IES-BoilerRoom/asyncpg-savepoint-harness#1`, `#2`, and 17 copies in
`zhangjiayang6835-cyber/bounty-plaza`.

```
💎 [Escrowed $600 USDC] 24-Vector Conformance Suite: PagedAttention
KV-Cache Block Desync on Prefix-Aware Chunked Preemption

Escrow Rail: https://algora.io / https://polar.sh / https://opire.dev
External Edge Conformance Mirror: http://132.145.159.202:11449/v1/conformance/epoch
```

Three things are wrong at once.

*The escrow rail is a list of names, not a link.* A real Algora bounty is a URL
under `algora.io/bounties/…` that resolves to a funded entry with a public ledger.
Naming three providers is not evidence of an account at any of them — it is
evidence that the author knew which words readers check for.

*The mirror is a raw IP with a port.* No project that intends to pay a stranger
routes their acceptance tests through `132.145.159.202:11449`. A domain is cheap;
this is a box someone will turn off.

*The dollar sign is in a title field.* Nothing about the string `$600 USDC` is
verifiable from inside the string.

**Rule:** `escrow_self_claim` (+3) and `bare_ip_endpoint` (+3). Either one alone
is worth a second look; both together is a decision.

**What would make this legitimate:** a link to an escrow entry, on a provider the
reader can independently query, showing a balance. Nothing in the listing
prevents that link from being included, which is itself the answer.

---

## 2. The audience is a bot

**Observed:** the same listing.

```
Automated CI Regression Mirror Notice: Automated CI conformance runner issue;
manual pull requests from human engineers are not reviewed on this mirror.
```

Read that as a buyer. You are offering money for a code change; you want the best
change. Why would you announce in advance that you will not read what a human
sends you?

You would not. But someone who wants only autonomous agents to submit — agents
that will follow a URL, execute a test harness, and report back — needs exactly
that sentence, because a human would ask a question.

**Rule:** `no_human_review` (+3).

This signal is the one I trust most, because it is nearly impossible to write
by accident.

---

## 3. A borrowed reputation

**Observed:** the same listing.

The repository is `asyncpg-savepoint-harness`. `asyncpg` is a well-known Postgres
driver. `savepoint` is a real database concept. The only issue in the repository
is about PagedAttention KV-cache block desync — an inference-serving problem in a
completely different domain.

`titleBodyMismatch` strips generic words (`harness`, `sdk`, `core`, `lib`, `test`)
and checks whether any remaining word from the repository name appears anywhere
in the text. Here, none does.

**Rule:** `title_body_mismatch` (+2).

**Why it is only weight 2:** a genuinely new project can rename itself and leave
its issue titles stale. Weird is not the same as hostile.

---

## 4. Acceptance criteria that do not exist

**Observed:** the same listing.

```
Implement unwind_slab_state_a85 in candidate_submission.py and align the
48-bit STREAM_WATERMARK_MASK and EPOCH_STRIDE_MATRIX until the vectors pass.
```

`STREAM_WATERMARK_MASK` and `EPOCH_STRIDE_MATRIX` appear exactly once in the
world: in this issue. There is no specification for them, no reference
implementation, and no definition of the "48-bit" width given. The task cannot be
completed because it has no success condition — which is the point. An
unfinishable task is a task that can never be judged incomplete.

**Rule:** `undefined_magic_constant` (+2) when two or more wire-format-shaped
constants (`*_MASK`, `*_STRIDE`, `*_MATRIX`, `*_EPOCH`, `*_SEED`, `*_VECTOR`) are
used as criteria.

**Why two, not one:** one undefined constant in a terse issue is an oversight.
Two, used as acceptance criteria, is a shape.

---

## 5. The testnet that says so in its own README

**Observed:** `odiseo159-beep/mergit`, a genuinely well-built repository.

2945 KB of JavaScript, Solidity escrow contracts at three versions, working CI, a
GitHub Action, 9 forks, and an issue template with six precise acceptance checks
(`agent/test/bounties.test.js`, `node:test`, no network access). On structure
alone this is the best bounty listing in the sample.

Its `AGENTS.md` says:

> It is on a testnet. The contracts are deployed and verified on GIWA Sepolia.
> Real value is not moving yet.

There is no trick here. Somebody built a real thing and wrote down honestly what
it is. The trap is not their listing — it is a reader who sees a professional
escrow contract and assumes a professional escrow contract implies money.

**Rule:** `valueReality(text)` returns `{real: false, marker: "testnet"}` on
markers including `testnet`, `sepolia`, `holesky`, `devnet`, `测试网`.

**Status in this build:** implemented and tested, not wired into the live scan.
Checking it means fetching one README per issue, which turns a 50-request scan
into a 100-request scan against a 10/minute unauthenticated limit. The honest
trade is to leave the finding visible rather than to silently skip the check.

---

## 6. The marketplace where everybody is a seller

Not a listing — a platform.

`/api/stats/public` on AgentPact reports its own numbers, and its own method
string defines them:

> Paid deals settled (external) = completed deals with real USDC in escrow
> between agents with different, known owner wallets, excluding self-deals, our
> own fleet agents and quarantined deals.

```
activeOffers: 5745
openNeeds:     539
paidDealsSettledExternal: 3
paidVolumeSettledExternalUsd: 200
```

The platform is being unusually candid. It publishes the exact definition that
makes its own headline number look small, which is more than most do.

5,745 offers. 539 needs. 3 payments. The offers-to-needs ratio is 10:1, and the
fill rate is 0.05%.

**Why this matters more than any single trap:** a bait listing costs you a day. A
marketplace with 10 sellers per buyer costs you the month you spend optimising an
offer that nobody was ever going to accept. The second mistake is the expensive
one, and it does not look like a mistake while you are making it — it looks like
progress, because the listing form accepted your submission.

---

## The pattern behind the patterns

Every trap above sells the same thing: **the feeling of having found work.**

- The escrow claim sells a number.
- The "no human review" line sells an audience.
- The borrowed repository name sells credibility.
- The undefined constants sell a task.
- The testnet sells a contract.

In each case the artefact that a naive check would read — the amount, the label,
the repo name, the acceptance criteria, the Solidity code — is present and
plausible. What is missing is one step further out: an escrow URL, a human who
will read your patch, a word shared between the name and the problem, a
definition of the constant, a chain that settles in something.

**Check one step further out than the artefact.** That is the whole method, and
it is the reason this tool prints evidence strings instead of just scores.