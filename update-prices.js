#!/usr/bin/env node
// Run daily (via cron or GitHub Actions) to update public/prices.json
// Usage: node update-prices.js

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Extract all unique tickers from data.js by regex (avoids import issues in Node)
const dataContent = readFileSync(join(__dirname, "src", "data.js"), "utf-8");
const tickerSet = new Set();
for (const match of dataContent.matchAll(/ticker:\s*"([^"]+)"/g)) {
  tickerSet.add(match[1]);
}
const tickers = [...tickerSet];

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

async function main() {
  console.log(`Fetching prices for ${tickers.length} tickers...`);
  const prices = {};

  // Fetch in batches of 8 with delay
  for (let i = 0; i < tickers.length; i += 8) {
    const batch = tickers.slice(i, i + 8);
    const results = await Promise.all(batch.map(fetchPrice));
    results.forEach((r) => {
      if (r.price != null) prices[r.ticker] = r.price;
    });
    if (i + 8 < tickers.length) await new Promise((r) => setTimeout(r, 300));
    console.log(`  ${Math.min(i + 8, tickers.length)}/${tickers.length} done`);
  }

  prices.updated = new Date().toISOString();

  const outPath = join(__dirname, "public", "prices.json");
  writeFileSync(outPath, JSON.stringify(prices, null, 2));
  console.log(`\nWrote ${Object.keys(prices).length - 1} prices to ${outPath}`);
  console.log(`Updated: ${prices.updated}`);
}

main();
