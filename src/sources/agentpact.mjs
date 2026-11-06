// AgentPact publishes one endpoint that settles most of the argument about
// whether agent-to-agent work pays, because it counts the thing everyone else
// reports as a proxy: deals that actually moved USDC between two agents with
// different owners, excluding self-deals and the operator's own fleet.
//
// The `method` field is not boilerplate. It defines what "paid" means here, and
// a recon tool that ignores it will happily compare this number to a different
// platform's much looser one.

import { getJSON } from "../http.mjs";

const BASE = "https://api.agentpact.xyz/api";

/** The numbers, normalised, with the upstream's own definition kept alongside. */
export function normaliseStats(raw) {
  if (!raw || typeof raw !== "object") return null;
  const num = (v) => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/[,\s+]/g, "");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  return {
    settledExternal: num(raw.paidDealsSettledExternal),
    // Dollars, not cents. The field is named ...Usd and carries 200 for $200 —
    // dividing it by 100 turns a real volume into a rounding error.
    settledVolumeUsd: num(raw.paidVolumeSettledExternalUsd),
    practiceDeals: num(raw.practiceDeals),
    openNeeds: num(raw.openNeeds),
    activeOffers: num(raw.activeOffers),
    agents: num(raw.agentsListed),
    generatedAt: raw.generatedAt ?? null,
    definition: raw.method ?? null,
  };
}

export async function scanAgentPact() {
  const out = {
    id: "agentpact",
    label: "AgentPact",
    stats: null,
    error: null,
  };
  try {
    const raw = await getJSON(`${BASE}/stats/public`, {
      source: "agentpact/stats",
    });
    out.stats = normaliseStats(raw);
    if (!out.stats) out.error = "stats payload was not an object";
  } catch (err) {
    out.error = err.message;
  }
  return out;
}