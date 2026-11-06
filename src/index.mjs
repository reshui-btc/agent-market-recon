#!/usr/bin/env node
// CLI. Every source is optional and every source can fail without taking the
// run down: a recon report that refuses to print because one endpoint moved is
// worse than one that prints the eleven things it did read.

import { readFileSync, existsSync } from "node:fs";
import { scanHashn } from "./sources/hashn.mjs";
import { scanAgentPact } from "./sources/agentpact.mjs";
import { scanCode4rena } from "./sources/code4rena.mjs";
import { scanSherlock } from "./sources/sherlock.mjs";
import { scanGitHub } from "./sources/github.mjs";
import { fillRate, marketVerdict } from "./judge.mjs";
import { renderText, renderJSON } from "./render.mjs";

const HELP = `agent-market-recon — measure whether an agent marketplace actually pays

Usage
  node src/index.mjs [options]

Options
  --all                every source (default)
  --only=<list>        comma separated: hashn,agentpact,code4rena,sherlock,github
  --json               machine-readable report on stdout
  --pages=<n>          pages of audit history to read (default 2)
  --per-page=<n>       GitHub issues to sample (default 50)
  --token=<file>       file holding a hashn bearer token
  --github-token=<t>   GitHub token; raises the search limit from 10/min
  --help

Environment
  HASHN_TOKEN          same as --token, as a literal value
  GITHUB_TOKEN         same as --github-token
  HASHN_TOKEN_FILE     path to a file containing the token

Exit codes
  0  the report was produced (individual source failures are reported, not fatal)
  1  every requested source failed
`;

function parseArgs(argv) {
  const args = { only: null, json: false, pages: 2, perPage: 50 };
  for (const a of argv) {
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--all") args.only = null;
    else if (a === "--json") args.json = true;
    else if (a.startsWith("--only=")) args.only = a.slice(7).split(",").filter(Boolean);
    else if (a.startsWith("--pages=")) args.pages = Number(a.slice(8)) || 2;
    else if (a.startsWith("--per-page=")) args.perPage = Number(a.slice(11)) || 50;
    else if (a.startsWith("--token=")) args.tokenFile = a.slice(8);
    else if (a.startsWith("--github-token=")) args.githubToken = a.slice(15);
    else if (!a.startsWith("-")) args.only = a.split(",").filter(Boolean);
  }
  return args;
}

function readToken(args) {
  if (process.env.HASHN_TOKEN) return process.env.HASHN_TOKEN.trim();
  const file = args.tokenFile || process.env.HASHN_TOKEN_FILE;
  if (file && existsSync(file)) {
    return readFileSync(file, "utf8").trim() || null;
  }
  return null;
}

const wanted = (args, id) => !args.only || args.only.includes(id);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const failures = [];
  const report = {
    generatedAt: new Date().toISOString(),
    sources: {},
    failures,
  };

  const jobs = [];

  if (wanted(args, "hashn")) {
    jobs.push(
      scanHashn({ token: readToken(args) }).then((r) => {
        report.hashn = r;
        report.sources.hashn = r.demandError && r.supplyError ? "failed" : "ok";
        if (r.demandError) failures.push(`hashn demand: ${r.demandError}`);
        if (r.supplyError) failures.push(`hashn supply: ${r.supplyError}`);
      }),
    );
  }

  if (wanted(args, "agentpact")) {
    jobs.push(
      scanAgentPact().then((r) => {
        report.agentpact = r;
        if (r.error) {
          report.sources.agentpact = "failed";
          failures.push(`agentpact: ${r.error}`);
        } else {
          report.sources.agentpact = "ok";
          report.agentpactRate = fillRate(
            r.stats.settledExternal ?? 0,
            r.stats.activeOffers ?? 0,
          );
          report.agentpactVerdict = marketVerdict({
            settled: r.stats.settledExternal ?? 0,
            offers: r.stats.activeOffers ?? 0,
            needs: r.stats.openNeeds ?? null,
          }).verdict;
        }
      }),
    );
  }

  if (wanted(args, "code4rena")) {
    jobs.push(
      scanCode4rena({ pages: args.pages }).then((r) => {
        report.code4rena = r;
        report.sources.code4rena = r.error ? "failed" : "ok";
        if (r.error) failures.push(`code4rena: ${r.error}`);
      }),
    );
  }

  if (wanted(args, "sherlock")) {
    jobs.push(
      scanSherlock({ pages: args.pages }).then((r) => {
        report.sherlock = r;
        report.sources.sherlock = r.error ? "failed" : "ok";
        if (r.error) failures.push(`sherlock: ${r.error}`);
      }),
    );
  }

  if (wanted(args, "github")) {
    jobs.push(
      scanGitHub({
        token: args.githubToken || process.env.GITHUB_TOKEN,
        perPage: args.perPage,
      }).then((r) => {
        report.github = r;
        report.sources.github = r.error ? "failed" : "ok";
        if (r.error) failures.push(`github: ${r.error}`);
      }),
    );
  }

  await Promise.all(jobs);

  const requested = Object.keys(report.sources).length;
  const failed = Object.values(report.sources).filter((s) => s === "failed").length;

  process.stdout.write(
    (args.json ? renderJSON(report) : renderText(report)) + "\n",
  );

  return requested > 0 && failed === requested ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`fatal: ${err?.stack || err}\n`);
    process.exit(1);
  },
);