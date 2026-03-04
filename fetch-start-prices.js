#!/usr/bin/env node
// Fetches historical closing price for each ticker on its report date + current price
// Usage: node fetch-start-prices.js

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataContent = readFileSync(join(__dirname, "src", "data.js"), "utf-8");

// Map report id -> date
const reportDates = {
  tpu: "2025-09-13",
  copper: "2026-02-20",
  cpu: "2026-01-29",
  rubin: "2026-01-19",
  networking: "2025-12-09",
};

// Extract ticker -> report mapping
// We need to know which report each ticker belongs to
const tickerReportMap = {};

// Parse tickers per report section
const reportIds = ["tpu", "copper", "cpu", "rubin", "networking"];
const reportRegex = /id:\s*"(\w+)"/g;
let lastReportId = null;
let lineNum = 0;

const lines = dataContent.split("\n");
for (const line of lines) {
  lineNum++;
  const idMatch = line.match(/id:\s*"(tpu|copper|cpu|rubin|networking)"/);
  if (idMatch) lastReportId = idMatch[1];

  const tickerMatch = line.match(/ticker:\s*"([^"]+)"/);
  if (tickerMatch && lastReportId) {
    tickerReportMap[tickerMatch[1]] = lastReportId;
  }
}

const tickers = Object.keys(tickerReportMap);
console.log(`Found ${tickers.length} tickers across ${Object.keys(reportDates).length} reports\n`);

async function fetchHistoricalPrice(ticker, dateStr) {
  // Get closing price on or near the given date
  const d = new Date(dateStr + "T00:00:00");
  // period1 = 2 days before, period2 = 5 days after (to handle weekends)
  const p1 = Math.floor((d.getTime() - 2 * 86400000) / 1000);
  const p2 = Math.floor((d.getTime() + 5 * 86400000) / 1000);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${p1}&period2=${p2}&interval=1d`;
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];

    // Find the closest date on or after the target
    const targetTs = d.getTime() / 1000;
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < timestamps.length; i++) {
      const diff = Math.abs(timestamps[i] - targetTs);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }

    return closes[bestIdx] ? parseFloat(closes[bestIdx].toFixed(2)) : null;
  } catch (e) {
    console.error(`  Failed ${ticker}: ${e.message}`);
    return null;
  }
}

async function fetchCurrentPrice(ticker) {
  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const data = await resp.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price ? parseFloat(price.toFixed(2)) : null;
  } catch (e) {
    console.error(`  Failed current ${ticker}: ${e.message}`);
    return null;
  }
}

async function main() {
  const results = {};

  // Process in batches of 5
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(async (ticker) => {
      const reportId = tickerReportMap[ticker];
      const reportDate = reportDates[reportId];
      const [startPrice, nowPrice] = await Promise.all([
        fetchHistoricalPrice(ticker, reportDate),
        fetchCurrentPrice(ticker),
      ]);
      return { ticker, reportId, reportDate, startPrice, nowPrice };
    }));

    for (const r of batchResults) {
      results[r.ticker] = r;
      const pctChange = r.startPrice && r.nowPrice
        ? ((r.nowPrice - r.startPrice) / r.startPrice * 100).toFixed(1)
        : "N/A";
      console.log(`${r.ticker.padEnd(12)} ${r.reportId.padEnd(12)} ${r.reportDate}  start: ${String(r.startPrice).padEnd(10)} now: ${String(r.nowPrice).padEnd(10)} ${pctChange}%`);
    }

    if (i + 5 < tickers.length) await new Promise(r => setTimeout(r, 500));
  }

  // Output as JSON for easy copy-paste into data.js
  console.log("\n\n// Copy this to update data.js:");
  console.log("const PRICE_UPDATES = " + JSON.stringify(results, null, 2));
}

main();
