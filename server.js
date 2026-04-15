const express  = require('express');
const fetch    = require('node-fetch');
const cors     = require('cors');
const app      = express();

// ── YOUR API KEYS GO HERE ──────────────────────────────────────
const POLYGON_KEY = process.env.POLYGON_KEY || 'YOUR_POLYGON_KEY_HERE';
// ──────────────────────────────────────────────────────────────

app.use(cors()); // Allow requests from your Netlify frontend
app.use(express.json());

// Health check
app.get('/', (req, res) => res.json({ status: 'WillStreet API running' }));

// ── STOCK / ETF PRICE (Polygon previous close) ─────────────────
app.get('/api/stock/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    // Try snapshot first (real-time if market open)
    const snapRes = await fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_KEY}`
    );
    if (snapRes.ok) {
      const snap = await snapRes.json();
      const day  = snap?.ticker?.day;
      const prev = snap?.ticker?.prevDay;
      if (day && day.c) {
        const price    = day.c;
        const prevClose= prev?.c || day.o;
        const change   = price - prevClose;
        const changePct= prevClose ? (change / prevClose * 100) : 0;
        return res.json({
          price, change, changePct,
          high: day.h, low: day.l,
          open: day.o, prevClose,
          vol: day.v
        });
      }
    }
    // Fallback: previous close
    const prevRes = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_KEY}`
    );
    if (!prevRes.ok) return res.status(502).json({ error: 'Upstream error' });
    const data   = await prevRes.json();
    const result = data?.results?.[0];
    if (!result)  return res.status(404).json({ error: 'No data' });
    const price    = result.c;
    const change   = result.c - result.o;
    const changePct= result.o ? (change / result.o * 100) : 0;
    return res.json({
      price, change, changePct,
      high: result.h, low: result.l,
      open: result.o, prevClose: result.c,
      vol:  result.v
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── STOCK DETAILS (fundamentals) ───────────────────────────────
app.get('/api/details/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    const r = await fetch(
      `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${POLYGON_KEY}`
    );
    if (!r.ok) return res.status(502).json({ error: 'Upstream error' });
    const data = await r.json();
    return res.json(data?.results || {});
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── CRYPTO PRICE (Coinbase — no key needed) ────────────────────
app.get('/api/crypto/:symbol', async (req, res) => {
  const { symbol } = req.params; // e.g. BTC-USD
  try {
    const [spotRes, statsRes] = await Promise.all([
      fetch(`https://api.coinbase.com/v2/prices/${symbol}/spot`),
      fetch(`https://api.exchange.coinbase.com/products/${symbol}/stats`)
    ]);
    if (!spotRes.ok) return res.status(502).json({ error: 'Upstream error' });
    const spot  = await spotRes.json();
    const price = parseFloat(spot?.data?.amount);
    let high = price, low = price, open = price, vol = 0;
    if (statsRes.ok) {
      const stats = await statsRes.json();
      high = parseFloat(stats.high)   || price;
      low  = parseFloat(stats.low)    || price;
      open = parseFloat(stats.open)   || price;
      vol  = parseFloat(stats.volume) || 0;
    }
    const change    = price - open;
    const changePct = open ? (change / open * 100) : 0;
    return res.json({ price, change, changePct, high, low, open, prevClose: open, vol });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── NEWS (Polygon) ─────────────────────────────────────────────
app.get('/api/news/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    const r = await fetch(
      `https://api.polygon.io/v2/reference/news?ticker=${ticker}&limit=10&apiKey=${POLYGON_KEY}`
    );
    if (!r.ok) return res.status(502).json({ error: 'Upstream error' });
    const data = await r.json();
    return res.json(data?.results || []);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── SEARCH (Polygon) ───────────────────────────────────────────
app.get('/api/search/:query', async (req, res) => {
  const { query } = req.params;
  try {
    const r = await fetch(
      `https://api.polygon.io/v3/reference/tickers?search=${encodeURIComponent(query)}&active=true&limit=10&apiKey=${POLYGON_KEY}`
    );
    if (!r.ok) return res.status(502).json({ error: 'Upstream error' });
    const data = await r.json();
    return res.json(data?.results || []);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`WillStreet API running on port ${PORT}`));
