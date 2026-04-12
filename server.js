const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname), { index: 'index.html' }));

// ─── In-Memory Shared Data Store ─────────────────────────────────────────────
const store = {
  leads: [],
  prospects: [],
  customers: [],
  version: 0,
  lastUpdate: Date.now()
};

const events = [];
let eventIdCounter = 1;

// ─── Merge Helper ────────────────────────────────────────────────────────────
function mergeById(existing, incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) return existing;
  if (!Array.isArray(existing) || existing.length === 0) return incoming.slice();
  const map = new Map();
  existing.forEach(item => { if (item && item.id != null) map.set(item.id, item); });
  incoming.forEach(item => { if (item && item.id != null) map.set(item.id, item); });
  return Array.from(map.values());
}

// ─── POST /api/data ─────────────────────────────────────────────────────────
app.post('/api/data', (req, res) => {
  try {
    const { leads, prospects, customers } = req.body;
    if (leads && Array.isArray(leads)) store.leads = mergeById(store.leads, leads);
    if (prospects && Array.isArray(prospects)) store.prospects = mergeById(store.prospects, prospects);
    if (customers && Array.isArray(customers)) store.customers = mergeById(store.customers, customers);
    store.version++;
    store.lastUpdate = Date.now();
    res.json({ ok: true, version: store.version, leads: store.leads, prospects: store.prospects, customers: store.customers });
  } catch (err) {
    console.error('POST /api/data error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ─── GET /api/data ──────────────────────────────────────────────────────────
app.get('/api/data', (req, res) => {
  const sinceVersion = parseInt(req.query.v) || 0;
  if (sinceVersion >= store.version) return res.json({ ok: true, changed: false, version: store.version });
  res.json({ ok: true, changed: true, version: store.version, leads: store.leads, prospects: store.prospects, customers: store.customers });
});

// ─── POST /api/event ────────────────────────────────────────────────────────
app.post('/api/event', (req, res) => {
  try {
    const { type, data } = req.body;
    if (!type || !data) return res.status(400).json({ ok: false, error: 'Missing type or data' });
    const evt = { id: eventIdCounter++, type, data, ts: Date.now() };
    events.push(evt);
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    while (events.length > 0 && (events[0].ts < cutoff || events.length > 500)) events.shift();
    res.json({ ok: true, id: evt.id });
  } catch (err) {
    console.error('POST /api/event error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ─── GET /api/events ────────────────────────────────────────────────────────
app.get('/api/events', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const newEvents = events.filter(e => e.id > since);
  res.json({ ok: true, events: newEvents, lastId: events.length > 0 ? events[events.length - 1].id : 0 });
});

// ─── Agreement HTML Storage ─────────────────────────────────────────────────
const agreementStore = {};

app.post('/api/agreement', (req, res) => {
  try {
    const { key, html } = req.body;
    if (!key || !html) return res.status(400).json({ ok: false, error: 'Missing key or html' });
    agreementStore[key] = html;
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/agreement error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

app.get('/api/agreement', (req, res) => {
  const key = req.query.key || '';
  res.json({ ok: true, html: agreementStore[key] || '' });
});

// ─── Status Sync (callback/proposal dismiss) ───────────────────────────────
app.post('/api/status', (req, res) => {
  try {
    const { itemType, id, status, completedAt } = req.body;
    if (!itemType || !id || !status) return res.status(400).json({ ok: false, error: 'Missing itemType, id, or status' });
    const evt = { id: eventIdCounter++, type: 'status_update', data: { itemType, id, status, completedAt: completedAt || null }, ts: Date.now() };
    events.push(evt);
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    while (events.length > 0 && (events[0].ts < cutoff || events.length > 500)) events.shift();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/status error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// ─── Catch-all ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => { console.log(`TrackNow Portal server running on port ${PORT}`); });
