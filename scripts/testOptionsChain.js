// Standalone test script: direct Polygon API calls for options chain
// Run: node scripts/testOptionsChain.js
// No server.js modifications — read-only diagnostic only.

const POLYGON_KEY = '7SXSWfvbYfnc7ALI5xUGVauAjuw9nBf6';
const SYMBOL = 'AAPL';
const TEST_DATES = ['2026-06-18', '2026-07-18', '2026-08-15'];

async function testChain(expiration) {
  const url =
    `https://api.polygon.io/v3/snapshot/options/${SYMBOL}` +
    `?apiKey=${POLYGON_KEY}&limit=250&order=asc&sort=strike_price` +
    `&expiration_date=${expiration}`;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`CHAIN TEST  symbol=${SYMBOL}  expiration=${expiration}`);
  console.log(`URL: ${url.replace(POLYGON_KEY, '***KEY***')}`);

  try {
    const res = await fetch(url);
    console.log(`HTTP status: ${res.status}`);

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }

    if (!res.ok) {
      console.log('ERROR body:', text.slice(0, 600));
      return;
    }

    const results = data?.results || [];
    console.log(`Contracts returned: ${results.length}`);
    if (results.length > 0) {
      console.log('First contract (raw):');
      console.log(JSON.stringify(results[0], null, 2));
    } else {
      console.log('No contracts in response. Full body:');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.log('Fetch error:', err.message);
  }
}

async function testExpirations() {
  const url =
    `https://api.polygon.io/v3/reference/options/contracts` +
    `?underlying_ticker=${SYMBOL}` +
    `&apiKey=${POLYGON_KEY}` +
    `&limit=1000&expired=false` +
    `&order=asc&sort=expiration_date`;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`EXPIRATIONS TEST  symbol=${SYMBOL}`);
  console.log(`URL: ${url.replace(POLYGON_KEY, '***KEY***')}`);

  try {
    const res = await fetch(url);
    console.log(`HTTP status: ${res.status}`);

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }

    if (!res.ok) {
      console.log('ERROR body:', text.slice(0, 600));
      return;
    }

    const results = data?.results || [];
    console.log(`Total contracts returned (raw): ${results.length}`);

    const expDates = [...new Set(results.map(c => c.expiration_date).filter(Boolean))].sort();
    console.log(`Unique expiration dates found: ${expDates.length}`);
    console.log('All dates:', expDates);

    if (data?.next_url) {
      console.log('\n*** PAGINATION: next_url exists — more data available beyond limit=1000 ***');
      console.log('next_url:', data.next_url.replace(POLYGON_KEY, '***KEY***'));
    } else {
      console.log('\nNo next_url — all data fits within limit=1000');
    }
  } catch (err) {
    console.log('Fetch error:', err.message);
  }
}

(async () => {
  console.log('AlphaBot — Polygon Options Chain Diagnostic');
  console.log(`Symbol: ${SYMBOL}  |  Key: ***${POLYGON_KEY.slice(-6)}`);

  // Test expirations endpoint first (source of dropdown dates)
  await testExpirations();

  // Test chain for each date
  for (const date of TEST_DATES) {
    await testChain(date);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Done.');
})();
