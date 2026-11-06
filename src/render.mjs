// Output. Two modes: a table for a person reading a terminal, and JSON for
// whatever runs this on a schedule. The table is the product; the JSON exists
// so the table can be diffed against yesterday.

const W = { market: 16, num: 9, rate: 9, verdict: 12 };

const pad = (v, n) => String(v ?? "—").padEnd(n).slice(0, n);
const padL = (v, n) => String(v ?? "—").padStart(n).slice(-n);
const pct = (r) => (r === null ? "—" : `${(r * 100).toFixed(2)}%`);
const dash = (v) => (v === null || v === undefined ? "—" : v);

function header(title) {
  return `\n${title}\n${"─".repeat(Math.max(28, title.length))}`;
}

function marketRow(name, supply, demand, settled, rate, verdict) {
  return (
    pad(name, W.market) +
    padL(dash(supply), W.num) +
    padL(dash(demand), W.num) +
    padL(dash(settled), W.num) +
    padL(pct(rate), W.rate) +
    "  " +
    pad(verdict, W.verdict)
  );
}

/**
 * The date of a contest, as an ISO date, or null.
 *
 * Only ISO strings reach this function. A source that hands over raw Unix
 * seconds has already converted them, because mixing the two is exactly how
 * 1.8e9 renders as 1970-01-21.
 */
function day(contest) {
  const iso = contest?.startsIso || contest?.endsIso || "";
  return iso.slice(0, 10) || null;
}

function marketplaceSection(report, lines) {
  const h = report.hashn;
  const a = report.agentpact;
  // Omitted entirely when neither was requested. An empty table under a header
  // reads as "both are dead", which is a claim this report would be making
  // without having asked.
  if (!h && !a) return;

  lines.push(header("MARKETPLACES"));
  lines.push(
    pad("", W.market) +
      padL("supply", W.num) +
      padL("demand", W.num) +
      padL("settled", W.num) +
      padL("rate", W.rate) +
      "  verdict",
  );

  if (h) {
    const demand = h.offers;
    lines.push(
      marketRow(
        "hashn",
        h.listing?.forest ?? null,
        h.demandError ? null : demand,
        null,
        null,
        h.demandError ? "NO DEMAND API" : demand === 0 ? "DEAD" : "UNKNOWN",
      ),
    );
    if (h.demandError) lines.push(`    ! ${h.demandError}`);
    if (h.supplyError) lines.push(`    ! ${h.supplyError}`);
    if (h.listing) {
      lines.push(
        `    store: ${h.listing.total ?? "?"} listings total ` +
          `(${h.listing.forest ?? "?"} in forest, ${h.listing.wilderness ?? "?"} wilderness)`,
      );
    }
  }

  if (a?.stats) {
    const s = a.stats;
    lines.push(
      marketRow(
        "AgentPact",
        s.activeOffers,
        s.openNeeds,
        s.settledExternal,
        report.agentpactRate,
        report.agentpactVerdict,
      ),
    );
    lines.push(
      `    settled volume: $${(s.settledVolumeUsd ?? 0).toLocaleString("en-US")} over ` +
        `${s.settledExternal} deals · practice ($0) deals: ${s.practiceDeals} · agents: ${s.agents ?? "?"}`,
    );
    lines.push(
      `    the platform's own definition of "paid" is included in the JSON; ` +
        `it excludes self-deals and its own fleet`,
    );
  } else if (a?.error) {
    lines.push(`AgentPact  ! ${a.error}`);
  }
}

function contestSection(report, lines) {
  const sources = [report.code4rena, report.sherlock].filter(Boolean);
  if (!sources.length) return;

  lines.push(header("AUDIT CONTESTS (the only reliably cash-denominated work)"));
  for (const src of sources) {
    if (src.error) {
      lines.push(`${pad(src.label, 12)} ! ${src.error}`);
      continue;
    }
    const openTitles = src.open.map((x) => x.title).join(" · ") || "none";
    lines.push(`${pad(src.label, 12)} open=${src.open.length}  ${openTitles}`);

    if (src.recent?.length) {
      const last = src.recent[0];
      const amount = last.amount
        ? `$${last.amount.toLocaleString("en-US")}`
        : "";
      lines.push(
        `             newest: ${last.title} (${day(last) ?? "?"}) ${amount}`.trimEnd(),
      );
    }
    if (src.unknownStatuses?.length) {
      lines.push(
        `             unrecognised status: ${src.unknownStatuses.join(", ")}`,
      );
    }
  }
}

function githubSection(report, lines) {
  const g = report.github;
  if (!g) return;

  lines.push(header("GITHUB BOUNTIES"));
  if (g.error) {
    lines.push(
      `  ! ${g.error}${g.rateLimited ? " (unauthenticated search is 10/min)" : ""}`,
    );
    return;
  }

  lines.push(`${g.totalCount?.toLocaleString("en-US") ?? "?"} open · ${g.sampled} sampled`);
  lines.push(
    `  TRAP ${g.byVerdict.TRAP}   SUSPECT ${g.byVerdict.SUSPECT}   CLEAN ${g.byVerdict.CLEAN}`,
  );
  if (g.distinctRepos != null) {
    lines.push(
      `  ${g.distinctRepos} distinct repositories in the sample — clustering is itself a signal`,
    );
    for (const c of g.topClusters ?? []) {
      lines.push(`    ${String(c.count).padStart(3)}× ${c.repo}`);
    }
  }

  for (const t of g.traps.slice(0, 5)) {
    lines.push(`\n  [${t.score}] ${t.repo}#${t.number}`);
    lines.push(`      ${t.title.slice(0, 96)}`);
    for (const s of t.signals) {
      lines.push(`      · ${s.code}: ${s.evidence.slice(0, 92)}`);
    }
  }

  if (g.suspects.length) {
    lines.push("\n  borderline:");
    for (const s of g.suspects.slice(0, 4)) {
      lines.push(
        `      [${s.score}] ${s.repo}#${s.number} — ${s.signals.map((x) => x.code).join(", ")}`,
      );
    }
  }
}

export function renderText(report) {
  const lines = [];
  lines.push(`agent-market-recon  ${report.generatedAt}`);
  lines.push("Question: which of these places has ever paid somebody for work?");

  marketplaceSection(report, lines);
  contestSection(report, lines);
  githubSection(report, lines);

  if (report.failures.length) {
    lines.push(header("FAILURES"));
    for (const f of report.failures) lines.push(`  ${f}`);
  }

  lines.push("");
  lines.push(
    "A low settlement rate is not a reason to try harder at listing. " +
      "It is a reason to list somewhere else.",
  );
  return lines.join("\n");
}

export const renderJSON = (report) => JSON.stringify(report, null, 2);