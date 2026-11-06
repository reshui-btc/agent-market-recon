// Code4rena's public API. `status` is the field that decides whether there is
// anything to do today; the prize pool is the field that decides whether it is
// worth doing. Most of the time the answer to the first one is "no", and saying
// so plainly is the service.

import { getJSON } from "../http.mjs";

const BASE = "https://code4rena.com/api/v1/audits";

/**
 * Statuses that mean a submission is still possible. `Reporting` and `Judging`
 * are after the deadline: the code is frozen and the only people working are
 * judges.
 */
const OPEN_STATUSES = new Set(["Active", "Upcoming"]);

const CLOSED_STATUSES = new Set([
  "Completed",
  "Judging",
  "Reporting",
  "Cancelled",
]);

/** Dollars out of "$135,000 in USDC (all rounds)". */
export function parseAmount(formatted) {
  const m = String(formatted || "").match(/\$\s?([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

export function classify(audit) {
  const status = String(audit?.status || "");
  const open = OPEN_STATUSES.has(status);
  return {
    slug: audit?.slug ?? "",
    title: audit?.title ?? "",
    status,
    open,
    // An unknown status is not evidence of a closed contest. It is evidence
    // that this tool does not know this platform's vocabulary any more.
    known: OPEN_STATUSES.has(status) || CLOSED_STATUSES.has(status),
    amount: parseAmount(audit?.formattedAmount),
    // Both timestamps arrive as ISO strings here; keeping a separate `startsIso`
    // means the renderer never has to know whether a number is seconds or ms.
    endsAt: audit?.endTime ?? null,
    startsAt: audit?.startTime ?? null,
    startsIso: audit?.startTime ?? null,
    endsIso: audit?.endTime ?? null,
    needsPoc: Boolean(audit?.hasMandatoryProofOfConcept),
    repo: audit?.repo ?? null,
    type: audit?.auditType ?? "",
  };
}

/**
 * @param {{pages?: number}} [opts] how many pages of the newest audits to read.
 *   One page is 25 contests and covers roughly a year at this platform's pace.
 */
export async function scanCode4rena({ pages = 2 } = {}) {
  const out = {
    id: "code4rena",
    label: "Code4rena",
    total: null,
    newest: null,
    open: [],
    recent: [],
    error: null,
  };
  try {
    const all = [];
    for (let page = 1; page <= pages; page++) {
      const body = await getJSON(`${BASE}?page=${page}`, {
        source: `code4rena/p${page}`,
      });
      const audits = body?.data?.audits;
      if (!Array.isArray(audits)) {
        throw new Error("response had no data.audits array");
      }
      out.total = body?.pagination?.total ?? out.total;
      all.push(...audits.map(classify));
      const nextPage = body?.pagination?.nextPage;
      if (!nextPage) break;
    }
    out.open = all.filter((a) => a.open);
    out.recent = all.slice(0, 6);
    out.newest = all[0]?.startsAt ?? null;
    out.unknownStatuses = [
      ...new Set(all.filter((a) => !a.known).map((a) => a.status)),
    ];
  } catch (err) {
    out.error = err.message;
  }
  return out;
}