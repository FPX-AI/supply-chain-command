// Fetch prices at specific dates for each report
// TPU: Jan 15, 2025 | Copper: Feb 1, 2025 | CPU: Mar 1, 2025 | Rubin: Apr 15, 2025

const reports = {
  tpu: { date: "2025-01-15", period1: Math.floor(new Date("2025-01-13").getTime()/1000), period2: Math.floor(new Date("2025-01-17").getTime()/1000) },
  copper: { date: "2025-02-01", period1: Math.floor(new Date("2025-01-30").getTime()/1000), period2: Math.floor(new Date("2025-02-05").getTime()/1000) },
  cpu: { date: "2025-03-01", period1: Math.floor(new Date("2025-02-27").getTime()/1000), period2: Math.floor(new Date("2025-03-05").getTime()/1000) },
  rubin: { date: "2025-04-15", period1: Math.floor(new Date("2025-04-13").getTime()/1000), period2: Math.floor(new Date("2025-04-17").getTime()/1000) },
};

// Map tickers to their primary report
const tickerReports = {
  // TPU report tickers
  GOOGL:"tpu", AVGO:"tpu", TSM:"tpu", ASML:"tpu", AMAT:"tpu", KLAC:"tpu", SNPS:"tpu",
  CDNS:"tpu", COHR:"tpu", LITE:"tpu", MRVL:"tpu", GLW:"tpu", ANET:"tpu", ASX:"tpu", ENTG:"tpu",
  // Copper report tickers
  FCX:"copper", SCCO:"copper", BHP:"copper", RIO:"copper", ETN:"copper", ABB:"copper",
  VRT:"copper", GEV:"copper", PWR:"copper", EME:"copper", APH:"copper", TEL:"copper", TTMI:"copper",
  // CPU report tickers
  NVDA:"cpu", AMD:"cpu", INTC:"cpu", ARM:"cpu", DELL:"cpu", HPE:"cpu", SMCI:"cpu",
  MU:"cpu", AMKR:"cpu", PLAB:"cpu",
  // Rubin report tickers
  MPWR:"rubin", TXN:"rubin", NVT:"rubin", FN:"rubin", JBL:"rubin", CLS:"rubin",
  ON:"rubin", LIN:"rubin", APD:"rubin", DD:"rubin", ADI:"rubin", PH:"rubin",
  DOV:"rubin", FORM:"rubin", TER:"rubin", CSCO:"rubin", VICR:"rubin", FLEX:"rubin", VSH:"rubin",
};

async function fetchHistorical(ticker, report) {
  const r = reports[report];
  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${r.period1}&period2=${r.period2}&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const data = await resp.json();
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (closes && closes.length > 0) {
      // Get the first available close price
      const price = closes.find(p => p !== null);
      return { ticker, startPrice: price ? parseFloat(price.toFixed(2)) : null, report };
    }
    return { ticker, startPrice: null, report };
  } catch(e) {
    return { ticker, startPrice: null, report, error: e.message };
  }
}

async function main() {
  const results = {};
  const entries = Object.entries(tickerReports);
  for (let i = 0; i < entries.length; i += 8) {
    const batch = entries.slice(i, i+8);
    const batchResults = await Promise.all(batch.map(([t, r]) => fetchHistorical(t, r)));
    batchResults.forEach(r => { results[r.ticker] = { start: r.startPrice, report: r.report }; });
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(JSON.stringify(results, null, 2));
}

main();
