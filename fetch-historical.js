#!/usr/bin/env node
// Fetches historical weekly prices from Yahoo Finance for all tickers.
// Output: public/historical.json (free tickers) + api/data/locked-historical.json (locked-only tickers)
// Usage: node fetch-historical.js

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Gather tickers ───────────────────────────────────────────────────────────
const dataContent = readFileSync(join(__dirname, "src", "data.js"), "utf-8");
const freeTickerSet = new Set();
for (const match of dataContent.matchAll(/ticker:\s*"([^"]+)"/g)) {
  if (!match[1].startsWith("XXXX-")) freeTickerSet.add(match[1]);
}

const lockedTickerSet = new Set();
const lockedPath = join(__dirname, "api", "data", "locked-reports.json");
if (existsSync(lockedPath)) {
  const lockedData = JSON.parse(readFileSync(lockedPath, "utf-8"));
  for (const [, report] of Object.entries(lockedData)) {
    const stages = report.chips ? report.chips.flatMap(c => c.stages) : report.stages;
    for (const stage of stages) {
      for (const company of stage.companies) lockedTickerSet.add(company.ticker);
    }
  }
}

const freeTickers = [...freeTickerSet];
const lockedOnlyTickers = [...lockedTickerSet].filter(t => !freeTickerSet.has(t));
const allTickers = [...new Set([...freeTickers, ...lockedOnlyTickers])];

console.log(`Free tickers: ${freeTickers.length}`);
console.log(`Locked-only tickers: ${lockedOnlyTickers.length}`);
console.log(`Total unique tickers: ${allTickers.length}`);

// ─── Fetch historical data from Yahoo Finance ─────────────────────────────────
async function fetchHistorical(ticker) {
  try {
    // Fetch ~8 months of daily data (from Aug 2025 to cover all report dates)
    const period1 = Math.floor(new Date("2025-08-01").getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1wk`;

    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const json = await resp.json();
    const result = json?.chart?.result?.[0];
    if (!result) return { ticker, data: null };

    const timestamps = result.timestamp;
    const closes = result.indicators?.quote?.[0]?.close;
    if (!timestamps || !closes) return { ticker, data: null };

    // Build compact [unix_seconds, price] pairs, skip nulls
    const points = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        points.push([timestamps[i], parseFloat(closes[i].toFixed(2))]);
      }
    }

    return { ticker, data: points.length > 0 ? points : null };
  } catch (e) {
    console.error(`  ✗ ${ticker}: ${e.message}`);
    return { ticker, data: null };
  }
}

async function main() {
  const allHistorical = {};
  let failed = 0;

  for (let i = 0; i < allTickers.length; i += 5) {
    const batch = allTickers.slice(i, i + 5);
    const results = await Promise.all(batch.map(fetchHistorical));
    for (const r of results) {
      if (r.data) {
        allHistorical[r.ticker] = r.data;
      } else {
        failed++;
      }
    }
    const done = Math.min(i + 5, allTickers.length);
    process.stdout.write(`\r  ${done}/${allTickers.length} fetched (${failed} failed)`);
    if (i + 5 < allTickers.length) await new Promise(r => setTimeout(r, 400));
  }
  console.log();

  // ─── Split into free and locked files ──────────────────────────────────────
  const freeHistorical = { updated: new Date().toISOString() };
  const lockedHistorical = { updated: new Date().toISOString() };

  for (const [ticker, data] of Object.entries(allHistorical)) {
    if (freeTickerSet.has(ticker)) {
      freeHistorical[ticker] = data;
    }
    if (lockedTickerSet.has(ticker) && !freeTickerSet.has(ticker)) {
      lockedHistorical[ticker] = data;
    }
    // If ticker is in both free and locked, put in free (it's already visible)
    if (freeTickerSet.has(ticker)) {
      freeHistorical[ticker] = data;
    }
  }

  // Write free historical → public/historical.json
  const freePath = join(__dirname, "public", "historical.json");
  writeFileSync(freePath, JSON.stringify(freeHistorical));
  const freeSize = readFileSync(freePath).length;
  console.log(`\nWrote ${Object.keys(freeHistorical).length - 1} free ticker histories → ${freePath} (${(freeSize / 1024).toFixed(0)} KB)`);

  // Write locked historical → api/data/locked-historical.json
  const apiDataDir = join(__dirname, "api", "data");
  if (!existsSync(apiDataDir)) mkdirSync(apiDataDir, { recursive: true });
  const lockedOutPath = join(apiDataDir, "locked-historical.json");
  writeFileSync(lockedOutPath, JSON.stringify(lockedHistorical));
  const lockedSize = readFileSync(lockedOutPath).length;
  console.log(`Wrote ${Object.keys(lockedHistorical).length - 1} locked ticker histories → ${lockedOutPath} (${(lockedSize / 1024).toFixed(0)} KB)`);

  console.log(`\n--- DONE ---`);
}

main().catch(console.error);
