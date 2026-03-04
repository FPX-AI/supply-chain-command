#!/usr/bin/env node
// Updates data.js with accurate start prices (from report date) and current prices
// Handles tickers appearing in multiple reports correctly

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataPath = join(__dirname, "src", "data.js");
let content = readFileSync(dataPath, "utf-8");
const lines = content.split("\n");

// Report dates
const reportDates = {
  tpu: "2025-09-13",
  copper: "2026-02-20",
  cpu: "2026-01-29",
  rubin: "2026-01-19",
  networking: "2025-12-09",
};

// Parse: find every ticker + start + now with its report context
const entries = [];
let currentReport = null;
for (let i = 0; i < lines.length; i++) {
  const reportMatch = lines[i].match(/id:\s*"(tpu|copper|cpu|rubin|networking)"/);
  if (reportMatch) currentReport = reportMatch[1];

  const tickerMatch = lines[i].match(/ticker:\s*"([^"]+)"/);
  if (tickerMatch && currentReport) {
    // Find the start: and now: lines nearby (within next 15 lines)
    let startLine = null, nowLine = null;
    // First check if start/now are on the same line as ticker (inline format)
    if (lines[i].match(/start:\s*[\d.]+/)) {
      startLine = i;
      nowLine = i;
    } else {
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        if (!startLine && lines[j].match(/start:\s*[\d.]+/)) startLine = j;
        if (!nowLine && lines[j].match(/now:\s*[\d.]+/)) nowLine = j;
      }
    }
    entries.push({
      ticker: tickerMatch[1],
      report: currentReport,
      reportDate: reportDates[currentReport],
      startLine,
      nowLine,
    });
  }
}

console.log(`Found ${entries.length} ticker entries across reports\n`);

// Deduplicate fetch requests by (ticker, date) pair
const fetchMap = new Map(); // "ticker|date" -> price
const currentPrices = new Map(); // ticker -> price

async function fetchHistoricalPrice(ticker, dateStr) {
  const key = `${ticker}|${dateStr}`;
  if (fetchMap.has(key)) return fetchMap.get(key);

  const d = new Date(dateStr + "T00:00:00");
  const p1 = Math.floor((d.getTime() - 2 * 86400000) / 1000);
  const p2 = Math.floor((d.getTime() + 5 * 86400000) / 1000);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${p1}&period2=${p2}&interval=1d`;
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result) { fetchMap.set(key, null); return null; }

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const targetTs = d.getTime() / 1000;
    let bestIdx = 0, bestDiff = Infinity;
    for (let i = 0; i < timestamps.length; i++) {
      const diff = Math.abs(timestamps[i] - targetTs);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    const price = closes[bestIdx] ? parseFloat(closes[bestIdx].toFixed(2)) : null;
    fetchMap.set(key, price);
    return price;
  } catch (e) {
    console.error(`  Failed historical ${ticker} @ ${dateStr}: ${e.message}`);
    fetchMap.set(key, null);
    return null;
  }
}

async function fetchCurrentPrice(ticker) {
  if (currentPrices.has(ticker)) return currentPrices.get(ticker);
  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const data = await resp.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    const p = price ? parseFloat(price.toFixed(2)) : null;
    currentPrices.set(ticker, p);
    return p;
  } catch (e) {
    console.error(`  Failed current ${ticker}: ${e.message}`);
    currentPrices.set(ticker, null);
    return null;
  }
}

async function main() {
  const replacements = []; // { line, oldVal, newVal }

  // Process in batches of 5
  for (let i = 0; i < entries.length; i += 5) {
    const batch = entries.slice(i, i + 5);
    await Promise.all(batch.map(async (entry) => {
      const [startPrice, nowPrice] = await Promise.all([
        fetchHistoricalPrice(entry.ticker, entry.reportDate),
        fetchCurrentPrice(entry.ticker),
      ]);

      if (startPrice != null && entry.startLine != null) {
        replacements.push({ line: entry.startLine, ticker: entry.ticker, field: "start", price: startPrice });
      }
      if (nowPrice != null && entry.nowLine != null) {
        replacements.push({ line: entry.nowLine, ticker: entry.ticker, field: "now", price: nowPrice });
      }

      const pct = startPrice && nowPrice ? ((nowPrice - startPrice) / startPrice * 100).toFixed(1) : "N/A";
      console.log(`${entry.ticker.padEnd(12)} ${entry.report.padEnd(12)} ${entry.reportDate}  start: ${String(startPrice).padEnd(10)} now: ${String(nowPrice).padEnd(10)} ${pct}%`);
    }));

    if (i + 5 < entries.length) await new Promise(r => setTimeout(r, 400));
  }

  // Apply replacements to lines
  let changed = 0;
  for (const rep of replacements) {
    const line = lines[rep.line];
    const regex = new RegExp(`(${rep.field}:\\s*)([\\d.]+)`);
    const match = line.match(regex);
    if (match) {
      lines[rep.line] = line.replace(regex, `$1${rep.price}`);
      changed++;
    }
  }

  writeFileSync(dataPath, lines.join("\n"));
  console.log(`\nUpdated ${changed} price values in data.js`);
}

main();
