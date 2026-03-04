// Fetch current + historical prices for Networking report tickers
// Historical date: May 1, 2025 (report publication date)
const tickers = [
  // Compute Vendors & Hyperscalers
  "NVDA","AMD","GOOGL","AMZN","MSFT",
  // HBM Memory
  "000660.KS","005930.KS","MU",
  // Advanced Packaging & OSAT
  "TSM","INTC","ASX","AMKR",
  // Substrates & Materials
  "2802.T","4062.T","6967.T","3037.TW","ATS.VI","TTMI","ROG",
  // Connectors & Cable Assemblies
  "TEL","APH","002475.SZ","6088.HK",
  // SerDes, Retimers & Signal Conditioning
  "AVGO","MRVL","CRDO","ALAB","ADI","TXN","MXL",
  // Networking Equipment
  "ANET","CSCO","JNPR","HPE","CLS","2345.TW",
  // Optical Transceivers & Silicon Photonics
  "COHR","LITE","AAOI","300502.SZ","300308.SZ","600060.SS","FN","STM",
  // Coherent DSP & Analog Drivers
  "CIEN","NOK","INFN","MTSI","SMTC",
  // Optical Transport & Line Systems
  "000063.SZ","0763.HK","600498.SS",
  // Fiber Optic Cable & Connectivity
  "GLW","COMM","PRY.MI","5803.T","5801.T","5802.T","NEX.PA",
  // Subsea, OCS & DC Infrastructure
  "6701.T","HUBN.SW","VRT","NVT"
];

const REPORT_DATE_P1 = Math.floor(new Date("2025-04-29").getTime()/1000);
const REPORT_DATE_P2 = Math.floor(new Date("2025-05-03").getTime()/1000);

async function fetchBoth(ticker) {
  const hdrs = { 'User-Agent': 'Mozilla/5.0' };
  try {
    const r1 = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`, { headers: hdrs });
    const d1 = await r1.json();
    const now = d1?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
    const currency = d1?.chart?.result?.[0]?.meta?.currency || '?';

    const r2 = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${REPORT_DATE_P1}&period2=${REPORT_DATE_P2}&interval=1d`, { headers: hdrs });
    const d2 = await r2.json();
    const closes = d2?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    const start = closes ? closes.find(p => p !== null) : null;

    return { ticker, now: now ? parseFloat(now.toFixed(2)) : null, start: start ? parseFloat(start.toFixed(2)) : null, currency };
  } catch(e) {
    return { ticker, now: null, start: null, error: e.message };
  }
}

async function main() {
  const results = {};
  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i+5);
    const res = await Promise.all(batch.map(fetchBoth));
    res.forEach(r => { results[r.ticker] = r; });
    if (i + 5 < tickers.length) await new Promise(r => setTimeout(r, 500));
  }
  console.log(JSON.stringify(results, null, 2));
}
main();
