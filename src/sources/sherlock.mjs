// Sherlock's contest API is a plain paged list with a `status` string and Unix
// timestamps. Two things about it are worth knowing before trusting a reading:
//
//   1. `prize_pool` is denominated in whole tokens, not dollars — a contest
//      showing 1984400 is $1,984,400 of the contest's own token, and comparing
//      that to a USDC-denominated pool is meaningless. The token field is read
//      and reported for exactly this reason.
//   2. `FINISHED` is the only status this scan treats as closed. Anything else
//      is surfaced for a human to look at rather than bucketed silently.

import { getJSON } from "../http.mjs";

const BASE = "https://audits.sherlock.xyz/api/contests";

const CLOSED = new Set(["FINISHED", "CANCELLED"]);

/**
 * Unix seconds, or null. Sherlock occasionally emits a small sentinel here
 * instead of a timestamp, and `0` rendered as a date reads as 1970 — which is
 * not a contest that ended, it is a field that was never filled in.
 */
function unixSeconds(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 1_000_000_000 ? n : null;
}

export function classifyContest(c) {
  const status = String(c?.status || "");
  const endsAt = unixSeconds(c?.ends_at);
  return {
    id: c?.id ?? null,
    title: c?.title ?? "",
    status,
    open: Boolean(status) && !CLOSED.has(status),
    known: Boolean(status),
    prizePool: Number(c?.prize_pool) || 0,
    token: c?.token ?? null,
    type: c?.type_label ?? "",
    private: Boolean(c?.private),
    startsAt: unixSeconds(c?.starts_at),
    endsAt,
    startsIso: unixSeconds(c?.starts_at)
      ? new Date(unixSeconds(c.starts_at) * 1000).toISOString()
      : null,
    endsIso: endsAt ? new Date(endsAt * 1000).toISOString() : null,
  };
}

/**
 * @param {{pages?: number}} [opts]
 */
export async function scanSherlock({ pages = 2 } = {}) {
  const out = {
    id: "sherlock",
    label: "Sherlock",
    open: [],
    recent: [],
    checked: 0,
    error: null,
  };
  try {
    const all = [];
    for (let page = 1; page <= pages; page++) {
      const body = await getJSON(`${BASE}?page=${page}`, {
        source: `sherlock/p${page}`,
      });
      const items = body?.items;
      if (!Array.isArray(items)) throw new Error("response had no items array");
      all.push(...items.map(classifyContest));
      if (!body?.next_page) break;
    }
    out.checked = all.length;
    out.open = all.filter((c) => c.open);
    out.recent = all.slice(0, 6);
  } catch (err) {
    out.error = err.message;
  }
  return out;
}