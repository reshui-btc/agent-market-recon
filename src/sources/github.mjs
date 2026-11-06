// The largest supply of bounty-shaped work on the internet, and the one where a
// naive count misleads the most: `label:bounty is:open` returns thousands of
// issues, and the overwhelming majority are either testnet demos or listings
// written to attract an automated agent rather than to buy a change.
//
// This source does not try to find the good ones. It tries to make the bad ones
// cheap to skip, because that is the part a human does badly and slowly.

import { getJSON } from "../http.mjs";
import { inspectBounty } from "../judge.mjs";

const SEARCH = "https://api.github.com/search/issues";

/** `https://api.github.com/repos/owner/name` → `owner/name` */
export function repoFromUrl(apiRepoUrl) {
  const parts = String(apiRepoUrl || "").split("/repos/");
  return parts.length === 2 ? parts[1] : "";
}

/**
 * GitHub search caps at 1,000 results and rate-limits unauthenticated calls
 * hard (10 searches a minute). One query, sorted by recency, is enough to
 * characterise the field; more pages buy noise, not signal.
 */
export async function scanGitHub({ token, perPage = 50, query } = {}) {
  const q =
    query ?? "label:bounty is:issue is:open no:assignee sort:created-desc";
  const out = {
    id: "github",
    label: "GitHub bounties",
    totalCount: null,
    sampled: 0,
    byVerdict: { TRAP: 0, SUSPECT: 0, CLEAN: 0 },
    traps: [],
    suspects: [],
    error: null,
    rateLimited: false,
  };

  try {
    const url = `${SEARCH}?q=${encodeURIComponent(q)}&per_page=${perPage}&sort=created&order=desc`;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const body = await getJSON(url, {
      source: "github/search",
      headers,
      retries: 0, // a rate-limited search does not get better by asking again immediately
    });

    out.totalCount = body?.total_count ?? null;
    const items = Array.isArray(body?.items) ? body.items : [];
    out.sampled = items.length;

    // How many repositories the sample is spread across. A sample of 50 drawn
    // from 2 repositories is not 50 independent listings — it is one campaign.
    const repoCounts = new Map();
    for (const it of items) {
      const r = repoFromUrl(it.repository_url);
      repoCounts.set(r, (repoCounts.get(r) ?? 0) + 1);
    }
    out.distinctRepos = repoCounts.size;
    out.topClusters = [...repoCounts.entries()]
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([repo, n]) => ({ repo, count: n }));

    for (const it of items) {
      const repoName = repoFromUrl(it.repository_url);
      const finding = inspectBounty(
        {
          title: it.title,
          body: it.body,
          repoName,
          comments: it.comments,
        },
        new Date(),
      );
      const row = {
        repo: repoName,
        number: it.number,
        title: it.title,
        url: it.html_url,
        createdAt: it.created_at,
        score: finding.score,
        verdict: finding.verdict,
        signals: finding.signals,
      };
      out.byVerdict[row.verdict] += 1;
      if (row.verdict === "TRAP") out.traps.push(row);
      else if (row.verdict === "SUSPECT") out.suspects.push(row);
    }

    out.traps.sort((a, b) => b.score - a.score);
    out.suspects.sort((a, b) => b.score - a.score);
  } catch (err) {
    out.error = err.message;
    if (/403|rate limit/i.test(String(err.message))) out.rateLimited = true;
  }

  return out;
}