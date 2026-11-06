// Tests for the parts that decide things. The fixtures are the real listings
// that made the rules necessary — a bounty that says "escrowed" while pointing
// at a raw IP, and a marketplace that reports thousands of offers against three
// settlements. Both were copied verbatim so a future change to a threshold has
// to argue with the actual text.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  tokens,
  titleBodyMismatch,
  inspectBounty,
  valueReality,
  fillRate,
  marketVerdict,
} from "../src/judge.mjs";

import { parseStoreCounts } from "../src/sources/hashn.mjs";
import { normaliseStats } from "../src/sources/agentpact.mjs";
import { parseAmount, classify } from "../src/sources/code4rena.mjs";
import { classifyContest } from "../src/sources/sherlock.mjs";
import { repoFromUrl } from "../src/sources/github.mjs";

// ── the bait listing ────────────────────────────────────────────────────────
const BAIT = {
  repoName: "IES-BoilerRoom/asyncpg-savepoint-harness",
  title:
    "💎 [Escrowed $600 USDC] 24-Vector Conformance Suite: PagedAttention KV-Cache Block Desync on Prefix-Aware Chunked Preemption",
  body: [
    "Automated CI Regression Mirror Notice: Automated CI conformance runner issue;",
    "manual pull requests from human engineers are not reviewed on this mirror.",
    "Escrow Rail: https://algora.io / https://polar.sh / https://opire.dev",
    "External Edge Conformance Mirror: http://132.145.159.202:11449/v1/conformance/epoch",
    "Implement unwind_slab_state_a85 in candidate_submission.py and align the 48-bit",
    "STREAM_WATERMARK_MASK and EPOCH_STRIDE_MATRIX until the vectors pass.",
  ].join(" "),
  comments: 0,
};

// ── tokenising ──────────────────────────────────────────────────────────────
test("tokens drops short words and duplicates", () => {
  assert.deepEqual(tokens("KV-Cache kv cache, of the A B"), [
    "cache",
    "the",
  ]);
});

test("titleBodyMismatch fires when no meaningful repo word appears in the text", () => {
  const r = titleBodyMismatch("org/asyncpg-savepoint-harness", BAIT.title + BAIT.body);
  assert.equal(r.mismatch, true);
  assert.deepEqual(r.repo, ["asyncpg", "savepoint"]);
  assert.deepEqual(r.shared, []);
});

test("titleBodyMismatch stays quiet when the repo name is used in the text", () => {
  const r = titleBodyMismatch(
    "org/pagedattention-conformance",
    "This PagedAttention conformance suite covers KV cache desync.",
  );
  assert.equal(r.mismatch, false);
  assert.ok(r.shared.includes("pagedattention"));
});

test("titleBodyMismatch ignores a repo name that is all generic words", () => {
  const r = titleBodyMismatch("org/sdk-core-tests", "");
  assert.equal(r.mismatch, false);
});

// ── the bait listing, scored ────────────────────────────────────────────────
test("the escrow bait listing is scored TRAP and quotes its own evidence", () => {
  const f = inspectBounty(BAIT, new Date("2026-11-06T00:00:00Z"));
  assert.equal(f.verdict, "TRAP");
  assert.ok(f.score >= 5, `expected score >= 5, got ${f.score}`);

  const codes = f.signals.map((s) => s.code);
  assert.ok(codes.includes("bare_ip_endpoint"));
  assert.ok(codes.includes("no_human_review"));
  assert.ok(codes.includes("title_body_mismatch"));
  assert.ok(codes.includes("undefined_magic_constant"));

  const ip = f.signals.find((s) => s.code === "bare_ip_endpoint");
  assert.match(ip.evidence, /132\.145\.159\.202/);

  // Every signal must carry the text that triggered it. A score without the
  // quote is an opinion.
  for (const s of f.signals) assert.ok(s.evidence.length > 0, s.code);
});

test("a plain issue with a normal body scores CLEAN", () => {
  const f = inspectBounty(
    {
      repoName: "acme/widgets",
      title: "Add a null check to the widget parser",
      body: "The widget parser throws on an empty file. Add a null check before parsing and a test named parses-empty.",
      comments: 2,
    },
    new Date("2026-11-06T00:00:00Z"),
  );
  assert.equal(f.verdict, "CLEAN");
  assert.equal(f.signals.length, 0);
});

test("a fresh repo alone is not a trap", () => {
  const f = inspectBounty(
    {
      repoName: "acme/widgets",
      title: "Fix the widget parser",
      body: "Handle the empty file case.",
      repoCreatedAt: new Date("2026-11-05T00:00:00Z").toISOString(),
      comments: 0,
    },
    new Date("2026-11-06T00:00:00Z"),
  );
  assert.equal(f.verdict, "CLEAN");
  assert.equal(f.signals[0].code, "fresh_repo");
});

// ── testnet detection ───────────────────────────────────────────────────────
test("valueReality catches the sentence that a project writes about itself", () => {
  const r = valueReality(
    "It is on a testnet. The contracts are deployed and verified on GIWA Sepolia.",
  );
  assert.equal(r.real, false);
  assert.equal(r.marker, "testnet");
});

test("valueReality leaves an ordinary README alone", () => {
  assert.equal(valueReality("Install with npm i and run the tests.").real, true);
});

// ── the number that decides ─────────────────────────────────────────────────
test("fillRate is null rather than zero when there is no supply", () => {
  assert.equal(fillRate(3, 0), null);
  assert.equal(fillRate(0, 0), null);
});

test("3 settlements against 5745 offers is a showcase, not a market", () => {
  const rate = fillRate(3, 5745);
  assert.ok(Math.abs(rate - 0.000522) < 1e-6);
  const v = marketVerdict({ settled: 3, offers: 5745, needs: 539 });
  assert.equal(v.verdict, "SHOWCASE");
});

test("no demand at all is DEAD regardless of the rate", () => {
  assert.equal(marketVerdict({ settled: 0, offers: 100, needs: 0 }).verdict, "DEAD");
  assert.equal(marketVerdict({ settled: 0, offers: 0, needs: 0 }).verdict, "NO_SUPPLY");
});

test("a healthy ratio is REAL", () => {
  assert.equal(marketVerdict({ settled: 40, offers: 500, needs: 20 }).verdict, "REAL");
});

// ── source parsers ──────────────────────────────────────────────────────────
test("parseStoreCounts reads the sentence hashn actually prints", () => {
  const md =
    "Need/Can listings from agents on hashn: what they need and what they can deliver. " +
    "500 listing(s): 373 in hashn's forest (on one of hashn's conventions, grouped by it), " +
    "then 127 in the wilderness. Newest first.";
  assert.deepEqual(parseStoreCounts(md), {
    total: 500,
    forest: 373,
    wilderness: 127,
  });
});

test("parseStoreCounts returns nulls, not zeros, when the phrase is absent", () => {
  assert.deepEqual(parseStoreCounts("maintenance"), {
    total: null,
    forest: null,
    wilderness: null,
  });
});

test("normaliseStats keeps the platform's own definition of paid", () => {
  const s = normaliseStats({
    paidDealsSettledExternal: 3,
    paidVolumeSettledExternalUsd: "200",
    practiceDeals: 54,
    agentsListed: "5,000+",
    openNeeds: 539,
    activeOffers: 5745,
    generatedAt: "2026-11-06T08:15:30.377Z",
    method: "excluding self-deals",
  });
  assert.equal(s.settledExternal, 3);
  assert.equal(s.settledVolumeUsd, 200, "the field is dollars, not cents");
  assert.equal(s.agents, 5000);
  assert.equal(s.openNeeds, 539);
  assert.equal(s.definition, "excluding self-deals");
});

test("parseAmount reads the USDC figure and ignores the wording after it", () => {
  assert.equal(parseAmount("$135,000 in USDC (all rounds)"), 135000);
  assert.equal(parseAmount("$4,000 in USDC"), 4000);
  assert.equal(parseAmount(undefined), null);
});

test("classify treats Judging and Reporting as closed", () => {
  const judged = classify({ status: "Judging", slug: "x", endTime: "2026-05-27T20:00:00Z" });
  assert.equal(judged.open, false);
  assert.equal(judged.known, true);

  const active = classify({ status: "Active", slug: "y" });
  assert.equal(active.open, true);

  const weird = classify({ status: "Something New" });
  assert.equal(weird.open, false);
  assert.equal(weird.known, false, "an unknown status must be reported, not bucketed");
});

test("classifyContest only treats FINISHED and CANCELLED as closed", () => {
  assert.equal(classifyContest({ status: "FINISHED" }).open, false);
  assert.equal(classifyContest({ status: "JUDGING" }).open, true);
  const c = classifyContest({ status: "FINISHED", ends_at: 1760367600 });
  assert.equal(c.endsIso, new Date(1760367600 * 1000).toISOString());
});

test("classifyContest refuses to read a sentinel as a 1970 date", () => {
  const c = classifyContest({ status: "FINISHED", ends_at: 0, starts_at: 1800000 });
  assert.equal(c.endsAt, null);
  assert.equal(c.endsIso, null);
  assert.equal(c.startsAt, null);
});

test("repoFromUrl survives the api/repos prefix", () => {
  assert.equal(
    repoFromUrl("https://api.github.com/repos/odiseo159-beep/mergit"),
    "odiseo159-beep/mergit",
  );
  assert.equal(repoFromUrl(""), "");
});