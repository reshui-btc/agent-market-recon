// Every source here talks to somebody else's server. That server can be slow,
// rate-limited, or answer 200 with an HTML error page behind a JSON content
// type. The failure mode this file exists to prevent is the quiet one: a source
// that fails to load must never be reported as a source that has no data,
// because "0 open bounties" and "the API is down" lead to opposite decisions.

const DEFAULT_UA =
  "agent-market-recon/0.1 (+https://github.com/aaabbbbya/agent-market-recon)";

export class SourceError extends Error {
  constructor(source, message, { status, url } = {}) {
    super(`[${source}] ${message}`);
    this.name = "SourceError";
    this.source = source;
    this.status = status;
    this.url = url;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET a URL and parse it as JSON, with a deadline per attempt and bounded
 * retries. Retries only cover transport errors and 5xx/429; a 404 is an answer,
 * not a glitch, and retrying it just wastes the reader's time.
 *
 * @param {string} url
 * @param {{source?: string, timeoutMs?: number, retries?: number, headers?: Record<string,string>}} [opts]
 */
export async function getJSON(url, opts = {}) {
  const {
    source = "http",
    timeoutMs = 12_000,
    retries = 2,
    headers = {},
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: {
          // GitHub's API rejects requests without a User-Agent, and several of
          // these endpoints sit behind CDNs that serve a bot page to the
          // default undici string.
          "User-Agent": DEFAULT_UA,
          Accept: "application/json",
          ...headers,
        },
      });

      if (res.status === 404) {
        throw new SourceError(source, "not found", { status: 404, url });
      }
      if (res.status === 429 || res.status >= 500) {
        throw new SourceError(source, `upstream ${res.status}`, {
          status: res.status,
          url,
        });
      }
      if (!res.ok) {
        throw new SourceError(source, `unexpected ${res.status}`, {
          status: res.status,
          url,
        });
      }

      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        // A CDN interstitial or a login wall arrives as 200 text/html. Saying
        // so is the whole point: the caller must not read this as empty.
        throw new SourceError(
          source,
          `expected JSON, got ${text.slice(0, 80).replace(/\s+/g, " ")}`,
          { status: res.status, url },
        );
      }
    } catch (err) {
      lastErr = err instanceof SourceError ? err : new SourceError(source, String(err.message || err), { url });
      const retryable =
        !(lastErr instanceof SourceError) ||
        lastErr.status === undefined ||
        lastErr.status === 429 ||
        lastErr.status >= 500 ||
        /aborted|timeout|fetch failed|ENOTFOUND|ECONNRESET/i.test(String(err?.message));
      if (!retryable || attempt === retries) break;
      await sleep(400 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/**
 * GET a URL as text. Used for the one source that has no JSON API and has to
 * be read off its HTML.
 */
export async function getText(url, opts = {}) {
  const {
    source = "http",
    // The hashn store is a full Markdown catalogue and takes far longer than a
    // JSON endpoint to assemble. There is no cheap way to ask it for a count.
    timeoutMs = 45_000,
    retries = 1,
    headers = {},
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: { "User-Agent": DEFAULT_UA, ...headers },
      });
      if (!res.ok) {
        throw new SourceError(source, `upstream ${res.status}`, {
          status: res.status,
          url,
        });
      }
      return await res.text();
    } catch (err) {
      lastErr =
        err instanceof SourceError
          ? err
          : new SourceError(source, String(err.message || err), { url });
      const retryable =
        lastErr.status === undefined ||
        lastErr.status === 429 ||
        lastErr.status >= 500 ||
        /aborted|timeout|fetch failed|ENOTFOUND|ECONNRESET/i.test(
          String(err?.message),
        );
      if (!retryable || attempt === retries) break;
      await sleep(600 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}