// The judgement layer. Pure functions only: no network, no clock reads unless
// a clock is passed in. That is deliberate — the rules that decide "this bounty
// is bait" are the part of this project most likely to be argued with, so they
// have to be readable and testable in isolation.

/**
 * Hosts that actually hold money against a merged pull request. A bounty body
 * that says "escrowed" while pointing somewhere else is making a claim nobody
 * outside its own text can verify.
 */
export const ESCROW_HOSTS = [
  "algora.io",
  "polar.sh",
  "opire.dev",
  "gitcoin.co",
  "bountysource.com",
];

/** Words that mean the work is not paid in real value, whatever the amount says. */
const TESTNET_MARKERS = [
  "testnet",
  "sepolia",
  "goerli",
  "holesky",
  "devnet",
  "test network",
  "test-network",
  "测试网",
  "测试环境",
];

/** A private address literal with an explicit port: `http://1.2.3.4:8080/...` */
const BARE_IP_PORT =
  /\bhttps?:\/\/(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b/;

/** "human pull requests are not reviewed", "PRs from humans are ignored", ... */
const NO_HUMAN_REVIEW =
  /(human|manual)\s+(pull\s+requests?|prs?|submissions?)[^.]{0,60}(not\s+(be\s+)?reviewed|ignored|rejected|auto-?closed)/i;

/** A constant named like a wire format, used as if it were defined somewhere. */
const MAGIC_CONSTANT = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,4}\b/g;

const TOKEN_SPLIT = /[^a-z0-9]+/i;

/** Lowercase alphanumeric tokens of a string, length > 2, deduplicated. */
export function tokens(s) {
  return [
    ...new Set(
      String(s || "")
        .toLowerCase()
        .split(TOKEN_SPLIT)
        .filter((t) => t.length > 2),
    ),
  ];
}

/**
 * Does any meaningful word from the repository name appear in the text?
 *
 * The real signal is stronger than "the words are different": a repository
 * called `asyncpg-savepoint-harness` whose only issue is about PagedAttention
 * KV-cache desync is not a badly named project, it is a project whose name was
 * chosen to borrow another project's credibility. Generic words are dropped
 * first, because `harness`, `sdk` and `core` appear everywhere and would make
 * every pair look related.
 */
const GENERIC = new Set([
  "the", "and", "for", "with", "from", "harness", "repo", "project", "code",
  "test", "tests", "core", "main", "app", "api", "sdk", "lib", "src", "github",
  "com", "issues", "issue", "pull", "request", "bounty",
]);

/** Crude singular form. `widgets` and `widget` are the same word to a reader. */
const stem = (t) => (t.length > 3 ? t.replace(/(?:es|s)$/, "") : t);

export function titleBodyMismatch(repoName, text) {
  const repo = tokens(String(repoName || "").split("/").pop()).filter(
    (t) => !GENERIC.has(t),
  );
  if (repo.length === 0) return { mismatch: false, shared: [], repo: [] };
  const body = new Set(tokens(text).map(stem));
  const shared = repo.filter((t) => body.has(stem(t)));
  return { mismatch: shared.length === 0, shared, repo };
}

function daysBetween(aIso, bDate) {
  const a = new Date(aIso).getTime();
  const b = bDate.getTime();
  if (Number.isNaN(a)) return Infinity;
  return (b - a) / 86_400_000;
}

/**
 * Score one bounty-shaped object for the markers that show up together when a
 * listing is designed to attract an agent rather than to buy work.
 *
 * Every signal carries the substring that triggered it. A score without the
 * evidence is an opinion; this returns the quote.
 *
 * @param {{
 *   title?: string,
 *   body?: string,
 *   repoName?: string,
 *   repoCreatedAt?: string,
 *   comments?: number,
 *   now?: Date
 * }} item
 */
export function inspectBounty(item, now = new Date()) {
  const title = String(item.title || "");
  const body = String(item.body || "");
  const text = `${title}\n${body}`;
  const signals = [];

  // 1. Claims escrow, but not at a host that holds escrow.
  const claimsEscrow = /\b(escrowed|in escrow|held in escrow)\b/i.test(text);
  const escrowHost = ESCROW_HOSTS.find((h) =>
    text.toLowerCase().includes(h),
  );
  if (claimsEscrow && !escrowHost) {
    signals.push({
      code: "escrow_self_claim",
      weight: 3,
      evidence: firstMatch(text, /\b(escrowed|held in escrow)\b[^.\n]{0,80}/i),
    });
  }

  // 2. An endpoint that is a raw address, not a service name.
  const bare = text.match(BARE_IP_PORT);
  if (bare) {
    signals.push({
      code: "bare_ip_endpoint",
      weight: 3,
      evidence: bare[0],
    });
  }

  // 3. Tells humans their work is not read — the audience is an automated agent.
  const noHuman = text.match(NO_HUMAN_REVIEW);
  if (noHuman) {
    signals.push({
      code: "no_human_review",
      weight: 3,
      evidence: noHuman[0],
    });
  }

  // 4. Repository name and problem statement do not share a single word.
  if (item.repoName) {
    const m = titleBodyMismatch(item.repoName, text);
    if (m.mismatch) {
      signals.push({
        code: "title_body_mismatch",
        weight: 2,
        evidence: `repo tokens [${m.repo.join(", ")}] appear nowhere in the body`,
      });
    }
  }

  // 5. Constants used as acceptance criteria without ever being defined.
  const magic = [...new Set(text.match(MAGIC_CONSTANT) || [])].filter(
    (c) => /MASK|STRIDE|MATRIX|EPOCH|SEED|IV$|VECTOR/.test(c),
  );
  if (magic.length >= 2) {
    signals.push({
      code: "undefined_magic_constant",
      weight: 2,
      evidence: magic.slice(0, 4).join(", "),
    });
  }

  // 6. Brand-new repository, zero discussion, and a "good first issue" label on
  //    something nobody could call a first issue.
  if (item.repoCreatedAt) {
    const age = daysBetween(item.repoCreatedAt, now);
    if (age < 7) {
      signals.push({
        code: "fresh_repo",
        weight: 1,
        evidence: `repository is ${age.toFixed(1)} days old`,
      });
    }
  }
  if (Number(item.comments) === 0 && /\bgood first issue\b/i.test(text)) {
    signals.push({
      code: "good_first_issue_on_hard_task",
      weight: 1,
      evidence: "no comments, labelled good first issue",
    });
  }

  const score = signals.reduce((n, s) => n + s.weight, 0);
  return {
    score,
    verdict: score >= 5 ? "TRAP" : score >= 3 ? "SUSPECT" : "CLEAN",
    signals,
  };
}

function firstMatch(text, re) {
  const m = text.match(re);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}

/**
 * Is this repository's payment denominated in something that exists?
 *
 * READMEs are read here because that is where a hackathon project says, in its
 * own words, that real value is not moving.
 */
export function valueReality(text) {
  const lowered = String(text || "").toLowerCase();
  const hit = TESTNET_MARKERS.find((m) => lowered.includes(m));
  return hit ? { real: false, marker: hit } : { real: true, marker: null };
}

/**
 * The one number that decides whether a marketplace is worth watching:
 * paid outcomes per available listing.
 *
 * A market with 5,745 offers and 3 settlements is not a market with a supply
 * problem, it is a market with a demand problem, and no amount of listing
 * effort fixes it.
 */
export function fillRate(settled, offers) {
  if (!Number.isFinite(offers) || offers <= 0) return null;
  return settled / offers;
}

/**
 * @param {{settled:number, offers:number, needs?:number}} m
 */
export function marketVerdict({ settled, offers, needs }) {
  const rate = fillRate(settled, offers);
  if (rate === null) return { rate, verdict: "NO_SUPPLY", note: "no offers listed" };
  if (rate >= 0.05) return { rate, verdict: "REAL", note: "enough settlement history to work with" };
  if (rate >= 0.005) return { rate, verdict: "THIN", note: "payments happen, but rarely" };
  if (Number(needs) === 0) return { rate, verdict: "DEAD", note: "no open demand at all" };
  return { rate, verdict: "SHOWCASE", note: "demand exists but almost nothing settles" };
}