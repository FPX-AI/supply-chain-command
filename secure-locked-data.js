#!/usr/bin/env node
/**
 * Security: Extract locked report company data to server-side,
 * redact it from the client bundle.
 *
 * Strategy: Find each locked report's boundary in data.js by its id string,
 * then replace ALL company objects within that boundary with CLASSIFIED placeholders.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const { REPORTS } = await import("./src/data.js");

  const lockedIds = REPORTS.filter(r => !r.unlocked).map(r => r.id);
  const freeIds = REPORTS.filter(r => r.unlocked).map(r => r.id);

  console.log("Free reports:", freeIds.join(", "));
  console.log("Locked reports:", lockedIds.join(", "));

  // ─── Extract locked data ───
  const lockedData = {};
  const freeTickers = new Set();
  const lockedTickers = new Set();

  for (const report of REPORTS) {
    const stages = report.chips
      ? report.chips.flatMap(c => c.stages)
      : report.stages;

    if (report.unlocked) {
      stages.forEach(s => s.companies.forEach(c => freeTickers.add(c.ticker)));
    } else {
      stages.forEach(s => s.companies.forEach(c => lockedTickers.add(c.ticker)));
      if (report.chips) {
        lockedData[report.id] = {
          chips: report.chips.map(chip => ({
            id: chip.id,
            stages: chip.stages.map(stage => ({
              id: stage.id,
              companies: stage.companies.map(c => ({ ...c })),
            })),
          })),
        };
      } else {
        lockedData[report.id] = {
          stages: report.stages.map(stage => ({
            id: stage.id,
            companies: stage.companies.map(c => ({ ...c })),
          })),
        };
      }
    }
  }

  const apiDataDir = join(__dirname, "api", "data");
  if (!existsSync(apiDataDir)) mkdirSync(apiDataDir, { recursive: true });
  writeFileSync(join(apiDataDir, "locked-reports.json"), JSON.stringify(lockedData, null, 2));
  console.log("\nWrote api/data/locked-reports.json");

  // ─── Redact data.js per-stage within locked reports ───
  let content = readFileSync(join(__dirname, "src", "data.js"), "utf-8");

  for (const lockedId of lockedIds) {
    const report = REPORTS.find(r => r.id === lockedId);
    const stages = report.chips
      ? report.chips.flatMap(c => c.stages)
      : report.stages;

    for (const stage of stages) {
      // Find stage id within the locked report context
      // Use the stage id which is unique (e.g., "mem-hbm-sand", "net-compute")
      const stageIdStr = `id: "${stage.id}"`;

      // Find this specific stage
      let searchFrom = 0;
      let stagePos = -1;

      // Make sure we find this stage within the right report
      // First find the report
      const reportIdStr = `id: "${lockedId}"`;
      const reportPos = content.indexOf(reportIdStr);
      if (reportPos === -1) continue;

      stagePos = content.indexOf(stageIdStr, reportPos);
      if (stagePos === -1) continue;

      // Find "companies: [" after stage id
      const companiesStr = "companies: [";
      const companiesIdx = content.indexOf(companiesStr, stagePos);
      if (companiesIdx === -1) continue;

      // Make sure this companies array is close to the stage id (within 500 chars)
      if (companiesIdx - stagePos > 500) continue;

      const arrayContentStart = companiesIdx + companiesStr.length;

      // Find matching ]
      let depth = 1;
      let arrayContentEnd = arrayContentStart;
      for (let i = arrayContentStart; i < content.length; i++) {
        if (content[i] === '[') depth++;
        if (content[i] === ']') {
          depth--;
          if (depth === 0) { arrayContentEnd = i; break; }
        }
      }

      // Build redacted entries (same count)
      const count = stage.companies.length;
      const entries = [];
      for (let i = 0; i < count; i++) {
        entries.push(
          `\n            { name: "CLASSIFIED-${i}", ticker: "XXXX-${i}", exchange: "---", country: "XX", sector: "REDACTED", start: 0, now: 0,\n` +
          `              role: "Upgrade to COMMAND access to reveal.",\n` +
          `              significance: "Classified supply chain intelligence.",\n` +
          `              keyFacts: ["Classified", "Classified", "Classified"] }`
        );
      }

      const replacement = entries.join(",") + "\n          ";
      content = content.slice(0, arrayContentStart) + replacement + content.slice(arrayContentEnd);
    }
  }

  writeFileSync(join(__dirname, "src", "data.js"), content);
  console.log("Redacted locked companies in data.js");

  // ─── Strip locked-only tickers from prices.json ───
  const pureLockedTickers = [...lockedTickers].filter(t => !freeTickers.has(t));
  const pricesPath = join(__dirname, "public", "prices.json");
  const prices = JSON.parse(readFileSync(pricesPath, "utf-8"));
  let removed = 0;
  for (const t of pureLockedTickers) {
    if (prices[t]) { delete prices[t]; removed++; }
  }
  writeFileSync(pricesPath, JSON.stringify(prices, null, 2));
  console.log(`Removed ${removed} locked-only tickers from prices.json`);

  console.log("\n--- DONE ---");
  console.log(`Secured ${Object.keys(lockedData).length} locked reports`);
  let total = 0;
  for (const [id, data] of Object.entries(lockedData)) {
    const st = data.chips ? data.chips.flatMap(c => c.stages) : data.stages;
    const n = st.reduce((a, s) => a + s.companies.length, 0);
    total += n;
    console.log(`  ${id}: ${n} companies`);
  }
  console.log(`Total: ${total} companies moved server-side`);
  console.log(`Tickers removed from prices.json: ${removed}`);
}

main().catch(console.error);
