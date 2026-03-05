#!/usr/bin/env node
// Run daily (via cron or GitHub Actions) to update prices
// - public/prices.json: free report tickers (served to everyone)
// - api/data/locked-prices.json: locked report tickers (served only via authenticated API)
// Usage: node update-prices.js

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Extract free tickers from data.js (these now only contain real free tickers + XXXX-N placeholders)
const dataContent = readFileSync(join(__dirname, "src", "data.js"), "utf-8");
const freeTickerSet = new Set();
for (const match of dataContent.matchAll(/ticker:\s*"([^"]+)"/g)) {
  // Skip CLASSIFIED placeholder tickers
  if (!match[1].startsWith("XXXX-")) {
    freeTickerSet.add(match[1]);
  }
}
const freeTickers = [...freeTickerSet];

// Extract locked tickers from locked-reports.json
const lockedTickerSet = new Set();
const lockedPath = join(__dirname, "api", "data", "locked-reports.json");
if (existsSync(lockedPath)) {
  const lockedData = JSON.parse(readFileSync(lockedPath, "utf-8"));
  for (const [, report] of Object.entries(lockedData)) {
    const stages = report.chips
      ? report.chips.flatMap((c) => c.stages)
      : report.stages;
    for (const stage of stages) {
      for (const company of stage.companies) {
        lockedTickerSet.add(company.ticker);
      }
    }
  }
}
const lockedTickers = [...lockedTickerSet].filter((t) => !freeTickerSet.has(t));

async function fetchPrice(ticker) {
  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const data = await resp.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return { ticker, price: price ? parseFloat(price.toFixed(2)) : null };
  } catch (e) {
    console.error(`Failed to fetch ${ticker}: ${e.message}`);
    return { ticker, price: null };
  }
}

async function fetchBatch(tickers, label) {
  console.log(`\nFetching ${label}: ${tickers.length} tickers...`);
  const prices = {};

  for (let i = 0; i < tickers.length; i += 8) {
    const batch = tickers.slice(i, i + 8);
    const results = await Promise.all(batch.map(fetchPrice));
    results.forEach((r) => {
      if (r.price != null) prices[r.ticker] = r.price;
    });
    if (i + 8 < tickers.length) await new Promise((r) => setTimeout(r, 300));
    console.log(`  ${Math.min(i + 8, tickers.length)}/${tickers.length} done`);
  }

  return prices;
}

async function main() {
  // Fetch free prices → public/prices.json
  const freePrices = await fetchBatch(freeTickers, "FREE tickers");
  freePrices.updated = new Date().toISOString();
  const freeOutPath = join(__dirname, "public", "prices.json");
  writeFileSync(freeOutPath, JSON.stringify(freePrices, null, 2));
  console.log(`Wrote ${Object.keys(freePrices).length - 1} free prices to ${freeOutPath}`);

  // Fetch locked prices → api/data/locked-prices.json
  if (lockedTickers.length > 0) {
    const lockedPrices = await fetchBatch(lockedTickers, "LOCKED tickers");
    lockedPrices.updated = new Date().toISOString();
    const lockedOutPath = join(__dirname, "api", "data", "locked-prices.json");
    writeFileSync(lockedOutPath, JSON.stringify(lockedPrices, null, 2));
    console.log(`Wrote ${Object.keys(lockedPrices).length - 1} locked prices to ${lockedOutPath}`);

    // Also update company.now values in locked-reports.json
    const lockedData = JSON.parse(readFileSync(lockedPath, "utf-8"));
    let updated = 0;
    for (const [, report] of Object.entries(lockedData)) {
      const stages = report.chips
        ? report.chips.flatMap((c) => c.stages)
        : report.stages;
      for (const stage of stages) {
        for (const company of stage.companies) {
          const allPrices = { ...freePrices, ...lockedPrices };
          if (allPrices[company.ticker] != null) {
            company.now = allPrices[company.ticker];
            updated++;
          }
        }
      }
    }
    writeFileSync(lockedPath, JSON.stringify(lockedData, null, 2));
    console.log(`Updated ${updated} company prices in locked-reports.json`);
  }

  console.log(`\n--- DONE ---`);
  console.log(`Updated: ${freePrices.updated}`);
}

main();
