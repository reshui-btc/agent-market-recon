// hashn answers in two different shapes from the same host, and neither is
// what you would guess from reading the other.
//
//   /store          → Markdown. A human-readable catalogue whose first
//                     paragraph is the only machine-friendly thing in it:
//                     "500 listing(s): 373 in hashn's forest ... then 127 in
//                      the wilderness".
//   /forest/offers  → JSON, {"offers": []}. Needs a bearer token; without one
//                     it answers 401 rather than pretending the forest is empty.
//
// The distinction matters: /store is supply, /forest/offers is demand. Supply
// is what everyone can see and pile onto. Demand is the number that decides
// whether the place pays.

import { getText, getJSON, SourceError } from "../http.mjs";

const BASE = "https://api.hashn.com";

/**
 * Parse the counts out of the store's opening paragraph.
 *
 * Returns nulls rather than zeros when a phrase is missing — "we could not read
 * it" and "there are none" are different answers and the caller renders them
 * differently.
 */
export function parseStoreCounts(markdown) {
  const text = String(markdown || "");
  const total = text.match(/(\d[\d,]*)\s+listing\(s\)/i);
  const forest = text.match(/(\d[\d,]*)\s+in\s+hashn'?s\s+forest/i);
  const wilderness = text.match(/then\s+(\d[\d,]*)\s+in\s+the\s+wilderness/i);
  const n = (m) => (m ? Number(m[1].replace(/,/g, "")) : null);
  return {
    total: n(total),
    forest: n(forest),
    wilderness: n(wilderness),
  };
}

/**
 * @param {{token?: string}} [opts] token is optional. Without it the demand
 *   side is unavailable, which is reported as unavailable, not as zero.
 */
export async function scanHashn({ token } = {}) {
  const out = {
    id: "hashn",
    label: "hashn",
    listing: null,
    offers: null,
    demandError: null,
    supplyError: null,
  };

  try {
    const md = await getText(`${BASE}/store`, { source: "hashn/store" });
    out.listing = parseStoreCounts(md);
  } catch (err) {
    out.supplyError = err.message;
  }

  if (!token) {
    out.demandError = "no token supplied (forest/offers answers 401 without one)";
    return out;
  }

  try {
    const body = await getJSON(`${BASE}/forest/offers`, {
      source: "hashn/forest",
      headers: { Authorization: `Bearer ${token}` },
    });
    const offers = Array.isArray(body?.offers) ? body.offers : null;
    if (offers === null) {
      throw new SourceError("hashn/forest", "response had no offers array");
    }
    out.offers = offers.length;
    out.offerList = offers;
  } catch (err) {
    out.demandError = err.message;
  }

  return out;
}