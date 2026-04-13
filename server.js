const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

// ─── MDS Shield — Disclaimer Sign-off Storage ───────────────────────────────
const SIGNOFF_DIR = path.join(__dirname, 'disclaimer-signoffs');
const SIGNOFF_INDEX = path.join(SIGNOFF_DIR, '_index.json');
try { fs.mkdirSync(SIGNOFF_DIR, { recursive: true }); } catch (e) {}
let disclaimerSignoffs = [];
try {
  if (fs.existsSync(SIGNOFF_INDEX)) {
    disclaimerSignoffs = JSON.parse(fs.readFileSync(SIGNOFF_INDEX, 'utf8'));
  }
} catch (e) { disclaimerSignoffs = []; }
function persistSignoffIndex() {
  try { fs.writeFileSync(SIGNOFF_INDEX, JSON.stringify(disclaimerSignoffs, null, 2)); } catch (e) {}
}

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
    // Replace arrays outright so removals (e.g. "Not Going Ahead") are respected
    if (leads && Array.isArray(leads)) store.leads = leads;
    if (prospects && Array.isArray(prospects)) store.prospects = prospects;
    if (customers && Array.isArray(customers)) store.customers = customers;
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
const agreementSignedStore = {};

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

// Store the fully signed/executed agreement HTML (posted from the signing page)
app.post('/api/agreement-signed', (req, res) => {
  try {
    const { key, html, company, email } = req.body;
    if (!key || !html) return res.status(400).json({ ok: false, error: 'Missing key or html' });
    agreementSignedStore[key] = { html, company: company || '', email: email || '', ts: Date.now() };
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/agreement-signed error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Portal can fetch the signed version to store in dealFiles
app.get('/api/agreement-signed', (req, res) => {
  const key = req.query.key || '';
  const entry = agreementSignedStore[key];
  if (entry) {
    res.json({ ok: true, html: entry.html, company: entry.company, email: entry.email, ts: entry.ts });
  } else {
    res.json({ ok: false, html: '' });
  }
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

// ─── MDS Shield — Disclaimer Endpoints ──────────────────────────────────────
app.post('/api/disclaimer-accept', (req, res) => {
  try {
    const { user, displayName, clientCompany, acceptedAt } = req.body || {};
    if (!user) return res.status(400).json({ ok: false, error: 'user required' });
    const ts = acceptedAt || new Date().toISOString();
    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      username: user,
      displayName: displayName || user,
      clientCompany: clientCompany || 'TrackNow Pty Ltd',
      acceptedAt: ts,
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    };
    disclaimerSignoffs.push(record);
    persistSignoffIndex();
    const safe = String(user).replace(/[^a-z0-9._-]/gi, '_');
    const fname = path.join(SIGNOFF_DIR, `${safe}_${ts.replace(/[:.]/g, '-')}.txt`);
    const body =
      `MDS Shield — Disclaimer Sign-off\n` +
      `================================\n` +
      `Name:        ${record.displayName}\n` +
      `Username:    ${record.username}\n` +
      `Company:     ${record.clientCompany}\n` +
      `Accepted At: ${record.acceptedAt}\n` +
      `IP:          ${record.ip}\n` +
      `User Agent:  ${record.userAgent}\n`;
    try { fs.writeFileSync(fname, body); } catch (e) {}
    res.json({ ok: true, record });
  } catch (err) {
    console.error('disclaimer-accept error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

app.get('/api/disclaimer-status', (req, res) => {
  const user = req.query.user;
  if (!user) return res.json({ ok: true, accepted: false });
  res.json({ ok: true, accepted: disclaimerSignoffs.some(r => r.username === user) });
});

app.get('/api/disclaimer-signoffs', (req, res) => {
  res.json({ ok: true, signoffs: disclaimerSignoffs });
});

// ─── Catch-all ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => { console.log(`TrackNow Portal server running on port ${PORT}`); });
