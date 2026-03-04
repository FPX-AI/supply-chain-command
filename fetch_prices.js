const tickers = [
  "NVDA","GOOGL","AVGO","TSM","ASML","AMAT","LRCX","KLAC","SNPS","CDNS",
  "COHR","LITE","MRVL","GLW","ANET","AMD","INTC","ARM","DELL","HPE","SMCI",
  "FCX","SCCO","BHP","RIO","ETN","ABB","VRT","GEV","PWR","EME",
  "APH","TEL","TTMI","AMKR","ASX","MU","MPWR","TXN","NVT","FN",
  "ENTG","JBL","CLS","ON","PLAB","LIN","APD","DD","ADI","PH",
  "DOV","FORM","TER","CSCO","VICR","FLEX","VSH"
];

async function fetchPrice(ticker) {
  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const data = await resp.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return { ticker, price };
  } catch(e) {
    return { ticker, price: null, error: e.message };
  }
}

async function main() {
  const results = {};
  // fetch in batches of 10
  for (let i = 0; i < tickers.length; i += 10) {
    const batch = tickers.slice(i, i+10);
    const batchResults = await Promise.all(batch.map(fetchPrice));
    batchResults.forEach(r => { results[r.ticker] = r.price; });
    // small delay between batches
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(JSON.stringify(results, null, 2));
}

main();
