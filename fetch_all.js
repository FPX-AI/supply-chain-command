// Fetch current + historical (Jan 15, 2025) prices for all missing TPU report tickers
const tickers = [
  // Missing US tickers
  "FN","CSCO","MXL","JNPR","LRCX","KLIC","TER","ROG","VRT","ABB",
  // Missing international tickers
  "2454.TW","2382.TW","2356.TW","2317.TW","3231.TW","6669.TW","4938.TW",
  "005930.KS","000660.KS","3037.TW","8046.TW","2802.T",
  "300308.SZ","5802.T","PRY.MI","SU.PA","2308.TW",
  "BESI.AS","0522.HK","6857.T","8035.T",
  // Already have current but need historical at TPU date
  "GOOGL","AVGO","TSM","ASML","AMAT","KLAC","SNPS","CDNS","COHR","LITE",
  "MRVL","GLW","ANET","ASX","ENTG","MU"
];

const TPU_DATE_P1 = Math.floor(new Date("2025-01-13").getTime()/1000);
const TPU_DATE_P2 = Math.floor(new Date("2025-01-17").getTime()/1000);

async function fetchBoth(ticker) {
  const hdrs = { 'User-Agent': 'Mozilla/5.0' };
  try {
    // Current price
    const r1 = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`, { headers: hdrs });
    const d1 = await r1.json();
    const now = d1?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
    const currency = d1?.chart?.result?.[0]?.meta?.currency || '?';
    
    // Historical price around Jan 15, 2025
    const r2 = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${TPU_DATE_P1}&period2=${TPU_DATE_P2}&interval=1d`, { headers: hdrs });
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
  for (let i = 0; i < tickers.length; i += 6) {
    const batch = tickers.slice(i, i+6);
    const res = await Promise.all(batch.map(fetchBoth));
    res.forEach(r => { results[r.ticker] = r; });
    await new Promise(r => setTimeout(r, 400));
  }
  console.log(JSON.stringify(results, null, 2));
}
main();
