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
      const extractStage = (stage) => ({
        id: stage.id,
        name: stage.name,
        desc: stage.desc,
        codename: stage.codename,
        companies: stage.companies.map(c => ({ ...c })),
      });
      if (report.chips) {
        lockedData[report.id] = {
          chips: report.chips.map(chip => ({
            id: chip.id,
            stages: chip.stages.map(extractStage),
          })),
        };
      } else {
        lockedData[report.id] = {
          stages: report.stages.map(extractStage),
        };
      }
    }
  }

  const apiDataDir = join(__dirname, "api", "data");
  if (!existsSync(apiDataDir)) mkdirSync(apiDataDir, { recursive: true });
  writeFileSync(join(apiDataDir, "locked-reports.json"), JSON.stringify(lockedData, null, 2));
  console.log("\nWrote api/data/locked-reports.json");

  // ─── Compute and inject lockedStats for each locked report ───
  let content = readFileSync(join(__dirname, "src", "data.js"), "utf-8");

  for (const lockedId of lockedIds) {
    const report = REPORTS.find(r => r.id === lockedId);
    const allStages = report.chips ? report.chips.flatMap(c => c.stages) : report.stages;
    const allCos = allStages.flatMap(s => s.companies);
    const seen = new Set();
    const unique = allCos.filter(c => { if (seen.has(c.ticker)) return false; seen.add(c.ticker); return true; });
    const gains = unique.map(c => c.start === 0 ? 0 : ((c.now - c.start) / c.start) * 100);
    const avg = gains.reduce((a, g) => a + g, 0) / gains.length;
    const best = Math.max(...gains);

    // Inject lockedStats after "unlocked: false,"
    const marker = `id: "${lockedId}"`;
    const markerPos = content.indexOf(marker);
    if (markerPos === -1) continue;
    const unlockedStr = "unlocked: false,";
    const unlockedPos = content.indexOf(unlockedStr, markerPos);
    if (unlockedPos === -1 || unlockedPos - markerPos > 300) continue;

    // Only inject if not already present
    const afterUnlocked = content.substring(unlockedPos + unlockedStr.length, unlockedPos + unlockedStr.length + 50);
    if (!afterUnlocked.includes("lockedStats")) {
      const statsStr = `\n    lockedStats: { avgGain: ${parseFloat(avg.toFixed(1))}, bestPick: ${parseFloat(best.toFixed(1))} },`;
      content = content.slice(0, unlockedPos + unlockedStr.length) + statsStr + content.slice(unlockedPos + unlockedStr.length);
    }
    console.log(`  ${lockedId}: avgGain=${avg.toFixed(1)}%, bestPick=${best.toFixed(1)}%`);
  }

  // ─── Redact data.js per-stage within locked reports ───

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

  // ─── Redact stage names, descriptions, and codenames ───
  let stageIdx = 0;
  for (const lockedId of lockedIds) {
    const report = REPORTS.find(r => r.id === lockedId);
    const stages = report.chips
      ? report.chips.flatMap(c => c.stages)
      : report.stages;

    const reportIdStr = `id: "${lockedId}"`;
    const reportPos = content.indexOf(reportIdStr);
    if (reportPos === -1) continue;

    for (const stage of stages) {
      stageIdx++;
      const stageIdStr = `id: "${stage.id}"`;
      const stagePos = content.indexOf(stageIdStr, reportPos);
      if (stagePos === -1) continue;

      // Find and replace name: "..." within 200 chars of stage id
      const nameRegex = /name:\s*"([^"]*)"/;
      const chunk = content.substring(stagePos, stagePos + 200);
      const nameMatch = chunk.match(nameRegex);
      if (nameMatch) {
        const nameStart = stagePos + chunk.indexOf(nameMatch[0]);
        content = content.slice(0, nameStart) + `name: "Classified Sector ${stageIdx}"` + content.slice(nameStart + nameMatch[0].length);
      }

      // Re-find stage position (content shifted)
      const stagePos2 = content.indexOf(stageIdStr, reportPos);
      if (stagePos2 === -1) continue;
      const chunk2 = content.substring(stagePos2, stagePos2 + 300);

      // Replace codename
      const codeMatch = chunk2.match(/codename:\s*"([^"]*)"/);
      if (codeMatch) {
        const codeStart = stagePos2 + chunk2.indexOf(codeMatch[0]);
        content = content.slice(0, codeStart) + `codename: "REDACTED-${stageIdx}"` + content.slice(codeStart + codeMatch[0].length);
      }

      // Re-find and replace desc
      const stagePos3 = content.indexOf(stageIdStr, reportPos);
      if (stagePos3 === -1) continue;
      const chunk3 = content.substring(stagePos3, stagePos3 + 500);
      const descMatch = chunk3.match(/desc:\s*"([^"]*)"/);
      if (descMatch) {
        const descStart = stagePos3 + chunk3.indexOf(descMatch[0]);
        content = content.slice(0, descStart) + `desc: "Classified supply chain intelligence. Upgrade to COMMAND access."` + content.slice(descStart + descMatch[0].length);
      }
    }
  }
  console.log(`Redacted ${stageIdx} stage names/descriptions`);

  writeFileSync(join(__dirname, "src", "data.js"), content);
  console.log("Redacted locked companies and stage metadata in data.js");

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
