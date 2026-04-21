const express = require('express');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const nodemailer = require('nodemailer');
const path    = require('path');
const fs      = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

// ─── Persistent Data Directory ──────────────────────────────────────────────
// Set DATA_DIR=/var/data on Render and attach a persistent disk so data.json,
// users.json, and the disclaimer signoffs survive redeploys.
function _resolveDataDir() {
  const requested = process.env.DATA_DIR;
  if (requested) {
    try {
      fs.mkdirSync(requested, { recursive: true });
      const probe = path.join(requested, '.write_probe');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return requested;
    } catch (e) {
      console.warn(`[tracknow] DATA_DIR='${requested}' not writable (${e.code||e.message}) — falling back to app dir. Data will not survive a redeploy until a Render disk is attached there.`);
    }
  }
  return __dirname;
}
const DATA_DIR       = _resolveDataDir();
const DATA_FILE      = path.join(DATA_DIR, 'data.json');
const USERS_FILE     = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE  = path.join(DATA_DIR, 'sessions.json');
const AUDIT_FILE     = path.join(DATA_DIR, 'audit.json');
const BACKUPS_DIR    = path.join(DATA_DIR, 'backups');
const SIGNOFF_DIR    = path.join(DATA_DIR, 'disclaimer-signoffs');
const SIGNOFF_INDEX  = path.join(SIGNOFF_DIR, '_index.json');
try { fs.mkdirSync(SIGNOFF_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(BACKUPS_DIR, { recursive: true }); } catch (e) {}
console.log(`[tracknow] DATA_DIR = ${DATA_DIR}`);

// ─── Backup system ───────────────────────────────────────────────────────────
// Two kinds of snapshots in DATA_DIR/backups/:
//   * data.<ISO-timestamp>.json          — rolling ring, 50 most recent
//   * data.PINNED.daily.<YYYY-MM-DD>.json — one per calendar day, never pruned
// A snapshot is written BEFORE every saveStore() so a bad write is always
// recoverable by restoring yesterday or the last known-good file.
const BACKUP_KEEP_COUNT = Number(process.env.BACKUP_KEEP_COUNT) || 50;

function _writeBackupSnapshot() {
  try {
    if (!fs.existsSync(DATA_FILE)) return; // nothing to back up yet
    const now = new Date();
    const iso = now.toISOString().replace(/[:.]/g, '-');
    // Rolling snapshot
    const rollingName = 'data.' + iso + '.json';
    fs.copyFileSync(DATA_FILE, path.join(BACKUPS_DIR, rollingName));

    // Daily pinned snapshot — one per UTC date. If a file for today
    // already exists we leave it alone (first write of the day wins)
    // so the daily pin captures the state at the start of the day, not
    // every intra-day save.
    const ymd = now.toISOString().slice(0, 10);
    const dailyName = `data.PINNED.daily.${ymd}.json`;
    const dailyPath = path.join(BACKUPS_DIR, dailyName);
    if (!fs.existsSync(dailyPath)) {
      fs.copyFileSync(DATA_FILE, dailyPath);
    }

    // Prune the rolling ring. NEVER prune anything with "PINNED" in the
    // name — those are either manual baselines or daily pins and must
    // survive forever.
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('data.') && f.endsWith('.json') && !f.includes('PINNED'))
      .sort();
    while (files.length > BACKUP_KEEP_COUNT) {
      const old = files.shift();
      try { fs.unlinkSync(path.join(BACKUPS_DIR, old)); } catch (_) {}
    }
  } catch (e) { console.warn('[backup] snapshot failed:', e.message); }
}

// ─── Body parser (scoped per route — no single 50 MB blanket) ───────────────
const jsonNormal = express.json({ limit: '2mb' });
const jsonLarge  = express.json({ limit: '10mb' }); // agreement HTML can be larger
const LARGE_ROUTES = new Set(['/api/agreement', '/api/agreement-signed']);
app.use((req, res, next) => {
  if (LARGE_ROUTES.has(req.path)) return jsonLarge(req, res, next);
  return jsonNormal(req, res, next);
});

// ─── Security headers ────────────────────────────────────────────────────────
// Sensible defaults for a single-file portal that loads Chart.js + inline UI.
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "frame-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

// ─── CORS (allowlist, not *) ────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.CORS_ORIGIN,
  'https://tracknow-portal.onrender.com',
  'http://localhost:10000',
  'http://localhost:3000'
].filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Users store — bcrypt hashes, file-backed ───────────────────────────────
// Seeded from env vars on first boot; after that the file is authoritative.
// Every seed user has mustChangePassword:true so the bootstrap password is a
// one-shot token, replaced on first login with a bcrypt hash of whatever the
// user chooses. No plaintext ever persists.
function _seedUsers() {
  // Default bootstrap password for any user row that lands without its
  // own hash. Pick a per-user env var first, then BOOTSTRAP_PASSWORD,
  // then fall back to a loud placeholder that forces an env var to be
  // set in production.
  const fallback = process.env.BOOTSTRAP_PASSWORD || 'change-me-tracknow-2026';
  const rows = [
    { email: 'james@tracknow.com.au',         pass: process.env.JAMES_PASSWORD || fallback, name: 'James',           role: 'admin',  force2FA: true },
    { email: 'team@tracknow.com.au',          pass: process.env.TEAM_PASSWORD  || fallback, name: 'TrackNow Team',   role: 'admin',  force2FA: false },
    { email: 'mark@mdsdiversified.com.au',    pass: process.env.MARK_PASSWORD  || fallback, name: 'Mark Speelmeyer', role: 'client', force2FA: true },
    { email: 'mark@tracknow.com.au',          pass: process.env.MARK_PASSWORD  || fallback, name: 'Mark Speelmeyer', role: 'client', force2FA: true },
  ];
  return rows.map(r => ({
    id: crypto.randomBytes(8).toString('hex'),
    email: r.email,
    name: r.name,
    role: r.role,
    passHash: bcrypt.hashSync(r.pass, 10),
    mustChangePassword: true,
    force2FA: !!r.force2FA,
    totpEnabled: false,
    createdAt: new Date().toISOString()
  }));
}

let USERS = [];
function loadUsers() {
  let loadedFromDisk = false;
  try {
    if (fs.existsSync(USERS_FILE)) {
      USERS = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      loadedFromDisk = true;
    }
  } catch (e) { console.error('[tracknow] loadUsers error:', e.message); }

  if (!loadedFromDisk) {
    USERS = _seedUsers();
    saveUsers();
    console.log(`[tracknow] Seeded ${USERS.length} users from defaults.`);
    return;
  }

  // Self-heal: for users that exist on disk from an older schema, raise
  // the force2FA flag if the current seed requires it. Never downgrade
  // (so an admin who turned 2FA off for someone doesn't get overridden
  // by a deploy). Only sets the flag — doesn't touch totpEnabled, so an
  // already-enrolled user is untouched.
  let changed = false;
  const seedMap = new Map(_seedUsers().map(s => [s.email.toLowerCase(), s]));
  USERS.forEach(u => {
    const seed = seedMap.get((u.email || '').toLowerCase());
    if (!seed) return;
    if (seed.force2FA && !u.force2FA) {
      u.force2FA = true;
      changed = true;
      console.log(`[tracknow] Upgraded force2FA=true on ${u.email} (will enrol on next login).`);
    }
    // Fresh fields on existing rows
    if (typeof u.totpEnabled !== 'boolean') { u.totpEnabled = false; changed = true; }
  });
  if (changed) saveUsers();
}
function saveUsers() {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2)); }
  catch (e) { console.error('[tracknow] saveUsers error:', e.message); }
}
function _publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, email: u.email, name: u.name, role: u.role,
    mustChangePassword: !!u.mustChangePassword,
    force2FA: !!u.force2FA,
    totpEnabled: !!u.totpEnabled,
    createdAt: u.createdAt, updatedAt: u.updatedAt
  };
}

// ─── Sessions — bearer tokens in a separate file (never backed up) ──────────
const SESSION_MS = (Number(process.env.SESSION_HOURS) || 4) * 60 * 60 * 1000;
let SESSIONS = [];
function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      SESSIONS = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    }
  } catch (e) { SESSIONS = []; }
}
function saveSessions() {
  try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(SESSIONS)); }
  catch (e) { console.error('[tracknow] saveSessions error:', e.message); }
}
function pruneSessions() {
  const now = Date.now();
  const before = SESSIONS.length;
  SESSIONS = SESSIONS.filter(s => s && !s.revoked && s.expiresAt > now);
  if (SESSIONS.length !== before) saveSessions();
}

// ─── Audit log — append-only, file-backed ───────────────────────────────────
let AUDIT = [];
function loadAudit() {
  try {
    if (fs.existsSync(AUDIT_FILE)) AUDIT = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
  } catch (e) { AUDIT = []; }
}
function saveAudit() {
  try { fs.writeFileSync(AUDIT_FILE, JSON.stringify(AUDIT)); }
  catch (e) {}
}
const AUDIT_CAP = Number(process.env.AUDIT_LOG_CAP) || 5000;
function pushAudit(entry) {
  AUDIT.push({ ts: new Date().toISOString(), ...entry });
  if (AUDIT.length > AUDIT_CAP) AUDIT = AUDIT.slice(-AUDIT_CAP);
  saveAudit();
}

// ─── Data store — file-backed ───────────────────────────────────────────────
let STORE = {
  leads: [], prospects: [], customers: [],
  version: 0, lastUpdate: Date.now()
};
function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const disk = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      STORE = Object.assign(STORE, disk);
    }
  } catch (e) { console.error('[tracknow] loadStore error:', e.message); }
}
function saveStore() {
  try {
    // Snapshot the PREVIOUS version before we overwrite — so a bad write
    // is always recoverable. Also triggers the daily pinned backup.
    _writeBackupSnapshot();
    fs.writeFileSync(DATA_FILE, JSON.stringify(STORE, null, 2));
  } catch (e) { console.error('[tracknow] saveStore error:', e.message); }
}

// ─── Disclaimer signoffs (unchanged from old server, persist to disk) ──────
let disclaimerSignoffs = [];
function loadSignoffs() {
  try { if (fs.existsSync(SIGNOFF_INDEX)) disclaimerSignoffs = JSON.parse(fs.readFileSync(SIGNOFF_INDEX, 'utf8')); }
  catch (e) { disclaimerSignoffs = []; }
}
function persistSignoffIndex() {
  try { fs.writeFileSync(SIGNOFF_INDEX, JSON.stringify(disclaimerSignoffs, null, 2)); } catch (e) {}
}

// Events (tamper-resistant enough for a small audit trail)
const events = [];
let eventIdCounter = 1;

// ─── Rate limiter helper ────────────────────────────────────────────────────
const LOGIN_WINDOW = 15 * 60 * 1000;
const LOGIN_MAX_PAIR   = 5;   // per ip+email
const LOGIN_MAX_IP     = 30;  // per ip (distributed stuffing)
const LOGIN_MAX_EMAIL  = 10;  // per email (credential stuffing)
const _rlPair  = new Map();
const _rlIP    = new Map();
const _rlEmail = new Map();
function rateLimit(map, key, max) {
  const now = Date.now();
  let rec = map.get(key);
  if (!rec || now - rec.windowStart > LOGIN_WINDOW) rec = { count: 0, windowStart: now };
  return {
    ok: rec.count < max,
    waitMin: Math.max(1, Math.ceil((rec.windowStart + LOGIN_WINDOW - now) / 60000)),
    bump() { rec.count++; map.set(key, rec); }
  };
}
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
         req.socket?.remoteAddress || req.ip || 'unknown';
}

// ─── Auth middleware — gates every /api/* EXCEPT the whitelist ─────────────
const AUTH_EXEMPT = new Set([
  '/api/login',
  '/api/disclaimer-accept',  // disclaimer is shown pre-login; it needs to record sign-off for the calling user
  '/api/disclaimer-status',
]);
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (AUTH_EXEMPT.has(req.path)) return next();

  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ ok: false, error: 'not authenticated' });
  pruneSessions();
  const session = SESSIONS.find(s => s.token === m[1]);
  if (!session) return res.status(401).json({ ok: false, error: 'invalid or expired session' });

  // Catch-up safeguard — if a session was issued as 'full' but the user
  // still has force2FA + !totpEnabled (e.g. because of the earlier bug
  // where change-password skipped the enrolment scope), retroactively
  // clamp the session down so they can't reach the API until they enrol.
  const sessionUser = USERS.find(u => u.email === session.email);
  if (session.scope === 'full' && sessionUser && sessionUser.force2FA && !sessionUser.totpEnabled) {
    session.scope = 'enrollment';
    session.expiresAt = Date.now() + 15 * 60 * 1000;
    saveSessions();
    console.warn(`[security] Clamped session for ${session.email} back to 'enrollment' scope — 2FA not yet set up.`);
  }

  // Narrow-scope sessions only reach the mandatory-setup endpoints.
  if (session.scope === 'password_change') {
    const allowed = ['/api/me', '/api/logout', '/api/change-password'];
    if (!allowed.includes(req.path)) {
      return res.status(403).json({ ok: false, error: 'must_change_password' });
    }
  } else if (session.scope === 'enrollment') {
    const allowed = ['/api/me', '/api/logout', '/api/2fa/setup-start', '/api/2fa/setup-verify'];
    if (!allowed.includes(req.path)) {
      return res.status(403).json({ ok: false, error: 'must_enroll_2fa' });
    }
  }
  req.session = session;
  req.user = sessionUser;
  next();
});

// ─── requireAdmin ───────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    console.warn(`[security] admin-only endpoint hit by non-admin: ${req.user && req.user.email} (${req.ip}) ${req.method} ${req.path}`);
    return res.status(403).json({ ok: false, error: 'admin only' });
  }
  next();
}

// ─── Static files — with a blocklist for sensitive paths ───────────────────
app.use((req, res, next) => {
  const blocked = [
    /^\/data\.json$/,
    /^\/users\.json$/,
    /^\/sessions\.json$/,
    /^\/audit\.json$/,
    /^\/disclaimer-signoffs(\/|$)/,
    /^\/\.env$/,
    /^\/\.git(\/|$)/,
    /^\/server\.js$/,
    /^\/package-lock\.json$/,
    // Legacy portal HTMLs — keep git history, don't serve from the web
    /^\/TrackNow-Portal(-v[0-9]+)?\.html$/,
    /^\/TrackNow-Sales-Portal\.(html|jsx)$/,
    /^\/Mark-Login\.html$/
  ];
  if (blocked.some(rx => rx.test(req.path))) return res.status(404).send('Not found');
  next();
});
app.use(express.static(__dirname, {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// ═══════════════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/login', async (req, res) => {
  const { email, pass, totpCode } = req.body || {};
  const ip = clientIp(req);
  if (!email || !pass) return res.status(400).json({ ok: false, error: 'Email and password required' });
  const emailLower = String(email).toLowerCase();

  // Three parallel rate-limit buckets.
  const pairRl  = rateLimit(_rlPair,  `${ip}:${emailLower}`, LOGIN_MAX_PAIR);
  const ipRl    = rateLimit(_rlIP,    ip,                    LOGIN_MAX_IP);
  const emailRl = rateLimit(_rlEmail, emailLower,            LOGIN_MAX_EMAIL);
  if (!pairRl.ok || !ipRl.ok || !emailRl.ok) {
    const waitMin = Math.max(pairRl.ok?0:pairRl.waitMin, ipRl.ok?0:ipRl.waitMin, emailRl.ok?0:emailRl.waitMin);
    pushAudit({ email: emailLower, ip, success: false, reason: 'rate_limited' });
    return res.status(429).json({ ok: false, error: `Too many attempts. Try again in ${waitMin} min.` });
  }

  const user = USERS.find(u => u.email.toLowerCase() === emailLower);
  let ok = false;
  if (user && user.passHash) ok = await bcrypt.compare(pass, user.passHash);
  if (!ok) {
    pairRl.bump(); ipRl.bump(); emailRl.bump();
    pushAudit({ email: emailLower, ip, success: false, reason: user ? 'bad_password' : 'no_user' });
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }

  // 2FA step. If the user has TOTP enabled, require a valid code (or a
  // backup code) before issuing the full session. If 2FA is NOT enabled
  // but force2FA is set, we issue a narrow-scope enrollment session
  // instead — they must finish enrolling before they can do anything else.
  if (user.totpEnabled && user.totpSecret) {
    if (!totpCode) return res.json({ ok: true, requires2FA: true });
    const code = String(totpCode).replace(/\s+/g, '');
    let ok2fa = authenticator.check(code, user.totpSecret);
    if (!ok2fa && Array.isArray(user.backupCodes)) {
      for (const bc of user.backupCodes) {
        if (!bc.used && await bcrypt.compare(code, bc.hash)) {
          bc.used = true; bc.usedAt = new Date().toISOString();
          ok2fa = true; saveUsers(); break;
        }
      }
    }
    if (!ok2fa) {
      pairRl.bump(); ipRl.bump(); emailRl.bump();
      pushAudit({ email: user.email, ip, success: false, reason: 'bad_totp' });
      return res.status(401).json({ ok: false, error: 'Invalid 2FA code' });
    }
  }

  // Successful password (+ TOTP if applicable). Prune old sessions, issue one now.
  pruneSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  // Pick the session scope based on what setup steps are outstanding.
  //   mustChangePassword → 'password_change' (narrow, 15 min)
  //   force2FA && !totpEnabled → 'enrollment' (narrow, 15 min)
  //   otherwise → 'full' (SESSION_MS)
  let scope = 'full';
  let ttl = SESSION_MS;
  if (user.mustChangePassword)            { scope = 'password_change'; ttl = 15 * 60 * 1000; }
  else if (user.force2FA && !user.totpEnabled) { scope = 'enrollment';  ttl = 15 * 60 * 1000; }

  const session = { token, email: user.email, role: user.role, scope, createdAt: now, expiresAt: now + ttl, ip };
  SESSIONS.push(session);
  saveSessions();
  pushAudit({
    email: user.email, ip, success: true,
    reason: scope === 'full' ? 'ok' : ('ok_pending_' + scope)
  });

  res.json({
    ok: true,
    token,
    mustChangePassword: !!user.mustChangePassword,
    mustEnroll2FA: scope === 'enrollment',
    user: _publicUser(user),
    expiresAt: session.expiresAt
  });
});

// ═══ 2FA ENDPOINTS ═══
// Enrolment is a two-step dance:
//   1. POST /api/2fa/setup-start → returns { otpauth, qrDataUrl, secret }
//   2. POST /api/2fa/setup-verify { code } → enables 2FA + returns 10 one-time backup codes
// Disable requires the current password.
app.post('/api/2fa/setup-start', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ ok: false, error: 'not authenticated' });
  const secret = authenticator.generateSecret();
  user._pendingTotpSecret = secret;
  saveUsers();
  const otpauth = authenticator.keyuri(user.email, 'TrackNow Portal', secret);
  const qrDataUrl = await qrcode.toDataURL(otpauth);
  res.json({ ok: true, otpauth, qrDataUrl, secret });
});

app.post('/api/2fa/setup-verify', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ ok: false, error: 'not authenticated' });
  if (!user._pendingTotpSecret) return res.status(400).json({ ok: false, error: 'No setup in progress — click "Enable 2FA" first.' });
  const ip = clientIp(req);
  const rl = rateLimit(_rlPair, `${ip}:${user.email}:2fa-setup`, LOGIN_MAX_PAIR);
  if (!rl.ok) return res.status(429).json({ ok: false, error: `Too many attempts. Try again in ${rl.waitMin} min.` });
  const code = String(req.body?.code || '').replace(/\s+/g, '');
  if (!authenticator.check(code, user._pendingTotpSecret)) {
    rl.bump();
    return res.status(400).json({ ok: false, error: 'Code does not match. Check the authenticator app time.' });
  }
  user.totpSecret = user._pendingTotpSecret;
  delete user._pendingTotpSecret;
  user.totpEnabled = true;
  // Ten single-use backup codes. Hashed on disk, shown plain ONCE here.
  const plainCodes = [];
  user.backupCodes = [];
  for (let i = 0; i < 10; i++) {
    const p = crypto.randomBytes(5).toString('hex');
    plainCodes.push(p);
    user.backupCodes.push({ hash: await bcrypt.hash(p, 10), used: false });
  }
  // Upgrade this session from 'enrollment' → 'full' so the user can
  // use the portal immediately after enrolment (no re-login).
  if (req.session && req.session.scope === 'enrollment') {
    req.session.scope = 'full';
    req.session.expiresAt = Date.now() + SESSION_MS;
    saveSessions();
  }
  saveUsers();
  pushAudit({ email: user.email, ip, success: true, reason: '2fa_enrolled' });
  res.json({ ok: true, backupCodes: plainCodes });
});

app.post('/api/2fa/disable', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ ok: false, error: 'not authenticated' });
  const { currentPass } = req.body || {};
  if (!currentPass) return res.status(400).json({ ok: false, error: 'Current password required' });
  const ok = await bcrypt.compare(currentPass, user.passHash);
  if (!ok) return res.status(401).json({ ok: false, error: 'Current password is incorrect' });
  delete user.totpSecret;
  delete user._pendingTotpSecret;
  delete user.backupCodes;
  user.totpEnabled = false;
  saveUsers();
  pushAudit({ email: user.email, ip: clientIp(req), success: true, reason: '2fa_disabled' });
  res.json({ ok: true });
});

// Admin reset — clears 2FA on a target account so they can re-enrol.
app.post('/api/admin/reset-2fa', requireAdmin, (req, res) => {
  const { email } = req.body || {};
  const target = USERS.find(u => u.email.toLowerCase() === String(email||'').toLowerCase());
  if (!target) return res.status(404).json({ ok: false, error: 'User not found' });
  delete target.totpSecret;
  delete target._pendingTotpSecret;
  delete target.backupCodes;
  target.totpEnabled = false;
  saveUsers();
  pushAudit({ email: target.email, ip: clientIp(req), success: true, reason: '2fa_reset_by_admin:' + req.user.email });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  if (req.session) {
    SESSIONS = SESSIONS.filter(s => s.token !== req.session.token);
    saveSessions();
  }
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({
    ok: true,
    user: _publicUser(req.user),
    session: req.session ? { expiresAt: req.session.expiresAt, scope: req.session.scope } : null
  });
});

app.post('/api/change-password', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ ok: false, error: 'not authenticated' });
  const ip = clientIp(req);
  const rl = rateLimit(_rlPair, `${ip}:${user.email}:change`, LOGIN_MAX_PAIR);
  if (!rl.ok) return res.status(429).json({ ok: false, error: `Too many attempts. Try again in ${rl.waitMin} min.` });
  const { currentPass, newPass } = req.body || {};
  if (!currentPass || !newPass) return res.status(400).json({ ok: false, error: 'currentPass and newPass required' });
  if (String(newPass).length < 8) return res.status(400).json({ ok: false, error: 'New password must be at least 8 characters.' });
  if (newPass === currentPass) return res.status(400).json({ ok: false, error: 'New password must be different.' });
  const ok = await bcrypt.compare(currentPass, user.passHash);
  if (!ok) { rl.bump(); return res.status(401).json({ ok: false, error: 'Current password is incorrect' }); }

  user.passHash = await bcrypt.hash(newPass, 10);
  user.mustChangePassword = false;
  user.passwordEverChanged = true;
  user.updatedAt = new Date().toISOString();
  saveUsers();
  // Upgrade the session. If force2FA is set and the user hasn't enrolled
  // yet, go to 'enrollment' scope (NOT 'full') so they're still gated
  // until 2FA setup completes. This was the bug that let james skip 2FA
  // after his first-login password change.
  if (req.session) {
    if (user.force2FA && !user.totpEnabled) {
      req.session.scope = 'enrollment';
      req.session.expiresAt = Date.now() + 15 * 60 * 1000;
    } else {
      req.session.scope = 'full';
      req.session.expiresAt = Date.now() + SESSION_MS;
    }
    saveSessions();
  }
  pushAudit({ email: user.email, ip, success: true, reason: 'password_changed' });
  res.json({ ok: true, nextStep: (user.force2FA && !user.totpEnabled) ? 'enroll_2fa' : 'done' });
});

// Admin-only audit log viewer
app.get('/api/audit/logins', requireAdmin, (req, res) => {
  res.json({ ok: true, entries: AUDIT.slice(-200).reverse() });
});

// ─── Backups — admin only ───────────────────────────────────────────────────
// List all snapshot files (rolling + pinned), newest first. Each entry has
// filename, size, created timestamp, and a quick summary of what's in it so
// you can pick a sensible restore point without needing to open the JSON.
app.get('/api/data-backup-list', requireAdmin, (req, res) => {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('data.') && f.endsWith('.json'))
      .sort().reverse();
    const out = files.map(f => {
      const full = path.join(BACKUPS_DIR, f);
      let size = 0, leads = 0, prospects = 0, customers = 0;
      try {
        const s = fs.statSync(full);
        size = s.size;
        const j = JSON.parse(fs.readFileSync(full, 'utf8'));
        leads     = Array.isArray(j.leads)     ? j.leads.length     : 0;
        prospects = Array.isArray(j.prospects) ? j.prospects.length : 0;
        customers = Array.isArray(j.customers) ? j.customers.length : 0;
      } catch (_) {}
      return { file: f, size, leads, prospects, customers, pinned: f.includes('PINNED') };
    });
    res.json({ ok: true, backups: out });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Pin a manual baseline — "this is a known-good state, keep it forever".
app.post('/api/data-backup-now', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) return res.status(404).json({ ok: false, error: 'No data file to back up yet' });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const label = (req.body && req.body.label)
      ? String(req.body.label).replace(/[^a-z0-9_-]/gi, '-').slice(0, 40) : 'manual';
    const filename = `data.PINNED.${label}.${stamp}.json`;
    fs.copyFileSync(DATA_FILE, path.join(BACKUPS_DIR, filename));
    res.json({ ok: true, file: filename });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Restore a named backup as the live data.json. Snapshots the CURRENT data
// first (via _writeBackupSnapshot) so the restore is itself reversible.
app.post('/api/data-restore-backup', requireAdmin, (req, res) => {
  try {
    const file = req.body && req.body.file;
    if (!file || !/^data\.[\w\-T:.]+\.json$/.test(file)) {
      return res.status(400).json({ ok: false, error: 'Invalid backup filename' });
    }
    const src = path.join(BACKUPS_DIR, file);
    if (!fs.existsSync(src)) return res.status(404).json({ ok: false, error: 'Backup not found' });
    _writeBackupSnapshot(); // safety snapshot before overwriting
    fs.copyFileSync(src, DATA_FILE);
    // Reload in-memory store from the restored file.
    STORE = { leads: [], prospects: [], customers: [], version: 0, lastUpdate: Date.now() };
    loadStore();
    STORE.version++;
    STORE.lastUpdate = Date.now();
    pushAudit({ email: req.user.email, success: true, reason: 'backup_restored:' + file });
    res.json({ ok: true, restored: file, version: STORE.version });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Download a specific backup file as JSON — lets an admin pull a copy off
// the Render disk to keep somewhere external (S3 / Dropbox / etc.).
app.get('/api/data-backup-download', requireAdmin, (req, res) => {
  const file = req.query.file || '';
  if (!/^data\.[\w\-T:.]+\.json$/.test(file)) return res.status(400).json({ ok: false, error: 'Invalid filename' });
  const src = path.join(BACKUPS_DIR, file);
  if (!fs.existsSync(src)) return res.status(404).json({ ok: false, error: 'Not found' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${file.replace(/[^a-z0-9._-]/gi,'_')}"`);
  fs.createReadStream(src).pipe(res);
});

// ═══════════════════════════════════════════════════════════════════════════
// DATA ENDPOINTS (auth-gated)
// ═══════════════════════════════════════════════════════════════════════════

const DATA_SENSITIVE_KEYS = ['users', 'sessions', 'audit', 'loginAudit'];

app.post('/api/data', (req, res) => {
  try {
    const incoming = req.body || {};
    DATA_SENSITIVE_KEYS.forEach(k => {
      if (Object.prototype.hasOwnProperty.call(incoming, k)) {
        console.warn(`[security] Refused write to protected key '${k}' from ${req.user && req.user.email}`);
        delete incoming[k];
      }
    });
    const { leads, prospects, customers } = incoming;
    if (Array.isArray(leads))     STORE.leads     = leads;
    if (Array.isArray(prospects)) STORE.prospects = prospects;
    if (Array.isArray(customers)) STORE.customers = customers;
    STORE.version++;
    STORE.lastUpdate = Date.now();
    saveStore();
    res.json({ ok: true, version: STORE.version, leads: STORE.leads, prospects: STORE.prospects, customers: STORE.customers });
  } catch (err) {
    console.error('POST /api/data error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

app.get('/api/data', (req, res) => {
  const sinceVersion = parseInt(req.query.v) || 0;
  if (sinceVersion >= STORE.version) return res.json({ ok: true, changed: false, version: STORE.version });
  res.json({ ok: true, changed: true, version: STORE.version, leads: STORE.leads, prospects: STORE.prospects, customers: STORE.customers });
});

app.post('/api/event', (req, res) => {
  try {
    const { type, data } = req.body;
    if (!type || !data) return res.status(400).json({ ok: false, error: 'Missing type or data' });
    const evt = { id: eventIdCounter++, type, data, ts: Date.now(), by: req.user && req.user.email };
    events.push(evt);
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    while (events.length > 0 && (events[0].ts < cutoff || events.length > 500)) events.shift();
    res.json({ ok: true, id: evt.id });
  } catch (err) {
    console.error('POST /api/event error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

app.get('/api/events', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const newEvents = events.filter(e => e.id > since);
  res.json({ ok: true, events: newEvents, lastId: events.length > 0 ? events[events.length - 1].id : 0 });
});

// Agreement HTML — persisted in memory only (as before); could upgrade to
// disk later. Keys are opaque from the client side.
const agreementStore = {};
const agreementSignedStore = {};

app.post('/api/agreement', (req, res) => {
  try {
    const { key, html } = req.body;
    if (!key || !html) return res.status(400).json({ ok: false, error: 'Missing key or html' });
    agreementStore[key] = html;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

app.get('/api/agreement', (req, res) => {
  const key = req.query.key || '';
  res.json({ ok: true, html: agreementStore[key] || '' });
});

app.post('/api/agreement-signed', (req, res) => {
  try {
    const { key, html, company, email } = req.body;
    if (!key || !html) return res.status(400).json({ ok: false, error: 'Missing key or html' });
    agreementSignedStore[key] = { html, company: company || '', email: email || '', ts: Date.now() };
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

app.get('/api/agreement-signed', (req, res) => {
  const key = req.query.key || '';
  const entry = agreementSignedStore[key];
  if (entry) res.json({ ok: true, html: entry.html, company: entry.company, email: entry.email, ts: entry.ts });
  else res.json({ ok: false, html: '' });
});

app.post('/api/status', (req, res) => {
  try {
    const { itemType, id, status, completedAt } = req.body;
    if (!itemType || !id || !status) return res.status(400).json({ ok: false, error: 'Missing fields' });
    const evt = { id: eventIdCounter++, type: 'status_update', data: { itemType, id, status, completedAt: completedAt || null }, ts: Date.now(), by: req.user && req.user.email };
    events.push(evt);
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    while (events.length > 0 && (events[0].ts < cutoff || events.length > 500)) events.shift();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// MDS SHIELD — DISCLAIMER ENDPOINTS (unauthenticated — pre-login flow)
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/disclaimer-accept', (req, res) => {
  try {
    const { user, displayName, clientCompany, acceptedAt } = req.body || {};
    if (!user) return res.status(400).json({ ok: false, error: 'user required' });
    const ts = acceptedAt || new Date().toISOString();
    const record = {
      id: crypto.randomBytes(8).toString('hex'),
      username: user,
      displayName: displayName || user,
      clientCompany: clientCompany || 'TrackNow Pty Ltd',
      acceptedAt: ts,
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    };
    disclaimerSignoffs.push(record);
    persistSignoffIndex();
    const safe = String(user).replace(/[^a-z0-9._-]/gi, '_').slice(0, 64);
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
  } catch (err) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

app.get('/api/disclaimer-status', (req, res) => {
  const user = req.query.user;
  if (!user) return res.json({ ok: true, accepted: false });
  res.json({ ok: true, accepted: disclaimerSignoffs.some(r => r.username === user) });
});

// Admin-only view of all signoffs.
app.get('/api/disclaimer-signoffs', requireAdmin, (req, res) => {
  res.json({ ok: true, signoffs: disclaimerSignoffs });
});

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL — nodemailer via SMTP (replaces client-side EmailJS)
// ═══════════════════════════════════════════════════════════════════════════
//
// Every outbound email now goes through POST /api/send-email. The client's
// existing emailjs.send() calls are monkey-patched in index.html so they
// route here instead — no call-site refactor needed. The SMTP password
// stays server-side (Render env var), so it's never exposed to the browser
// like the EmailJS public key was.
//
// Env vars (all loaded lazily — blank values just mean email is disabled):
//   SMTP_HOST    e.g. smtpout.secureserver.net (GoDaddy) /
//                    smtp.office365.com (Microsoft 365) /
//                    smtp.gmail.com (Google Workspace)
//   SMTP_PORT    465 for SSL, 587 for STARTTLS (default 587)
//   SMTP_SECURE  "true" for 465, "false" for 587 (default: auto based on port)
//   SMTP_USER    sales@tracknow.com.au (also the From: address)
//   SMTP_PASS    mailbox password or SMTP app password
//   SMTP_FROM    optional override, e.g. "TrackNow Sales <sales@tracknow.com.au>"
//   EMAIL_DAILY_QUOTA  default 200 (override per-deploy)
//   EMAIL_EXTRA_RECIPIENTS  comma-sep allowlisted addresses beyond leads/prospects/customers

let _mailer = null;
function getMailer() {
  if (_mailer) return _mailer;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = (process.env.SMTP_SECURE != null)
    ? String(process.env.SMTP_SECURE) === 'true'
    : (port === 465);
  try {
    _mailer = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
    console.log(`[tracknow] SMTP ready (${host}:${port} ${secure?'SSL':'STARTTLS'} as ${user})`);
  } catch (e) {
    console.error('[tracknow] nodemailer init failed:', e.message);
  }
  return _mailer;
}

// Build the allowlist of acceptable recipient addresses: every lead /
// prospect / customer email currently in the store, plus any extras
// pinned in env vars. Admins additionally get to send to the same-domain
// internal addresses (sales@tracknow.com.au, the sender itself) so the
// internal "proceed to agreement" notifications can reach the team.
function _emailAllowlist() {
  const set = new Set();
  const add = (e) => { if (e && typeof e === 'string') set.add(String(e).trim().toLowerCase()); };
  (STORE.leads     || []).forEach(l => add(l.email));
  (STORE.prospects || []).forEach(p => add(p.email));
  (STORE.customers || []).forEach(c => add(c.email));
  // Internal alias — emails to the sender's own mailbox are always safe
  // (that's how the "client wants to proceed" notifications work).
  add(process.env.SMTP_USER);
  add(process.env.SMTP_FROM);
  (process.env.EMAIL_EXTRA_RECIPIENTS || '').split(',').forEach(e => add(e.trim()));
  return set;
}
function _recipientAllowed(to) {
  const allowed = _emailAllowlist();
  return String(to || '').split(',').every(r => allowed.has(r.trim().toLowerCase()));
}
function _emailQuotaOk() {
  const today = new Date().toISOString().slice(0, 10);
  const used = (AUDIT || []).filter(a => a.reason === 'email_sent' && String(a.ts||'').slice(0,10) === today).length;
  const cap = Number(process.env.EMAIL_DAILY_QUOTA) || 200;
  return { ok: used < cap, used, cap };
}

// POST /api/send-email — replaces all client-side emailjs.send() calls.
// Accepts the same shape EmailJS was using: { to_email, subject,
// from_name, message_html } — OR nested under template_params if the
// monkey-patch passes through the raw EmailJS arg shape. Normalises both.
app.post('/api/send-email', async (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false, error: 'not authenticated' });
  try {
    // Unpack either flavour (flat or nested under template_params)
    const body = req.body || {};
    const params = (body.template_params && typeof body.template_params === 'object') ? body.template_params : body;
    const to       = params.to_email || params.to;
    const subject  = params.subject;
    const fromName = params.from_name || 'TrackNow';
    const html     = params.message_html || params.html || params.body || '';

    if (!to || !subject) return res.status(400).json({ ok: false, error: 'to_email and subject required' });

    if (!_recipientAllowed(to)) {
      console.warn(`[security] send-email rejected recipient not on allowlist: ${to} (from ${req.user.email})`);
      return res.status(403).json({ ok: false, error: 'Recipient must match a lead / prospect / customer on file, or be listed in EMAIL_EXTRA_RECIPIENTS.' });
    }
    const quota = _emailQuotaOk();
    if (!quota.ok) return res.status(429).json({ ok: false, error: `Daily email quota (${quota.cap}) reached. Try tomorrow.` });

    const mailer = getMailer();
    if (!mailer) {
      return res.status(503).json({ ok: false, error: 'SMTP not configured — set SMTP_HOST / SMTP_USER / SMTP_PASS env vars on Render.' });
    }

    // Strip the <!doctype html> etc. if the client sent raw html — keep
    // nodemailer happy with a plain html body.
    const info = await mailer.sendMail({
      from: process.env.SMTP_FROM || `${fromName} <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });
    pushAudit({ email: req.user.email, to, subject: String(subject).slice(0,120), success: true, reason: 'email_sent', messageId: info.messageId || '' });
    res.json({ ok: true, messageId: info.messageId || '' });
  } catch (err) {
    console.error('[tracknow] send-email error:', err);
    pushAudit({ email: req.user && req.user.email, success: false, reason: 'email_failed', error: String(err.message || err).slice(0, 200) });
    res.status(500).json({ ok: false, error: 'Failed to send email: ' + (err.message || 'unknown') });
  }
});

// ─── Catch-all ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Boot ───────────────────────────────────────────────────────────────────
loadUsers();
loadSessions();
loadAudit();
loadStore();
loadSignoffs();

app.listen(PORT, () => {
  console.log(`TrackNow Portal server running on port ${PORT}`);
  console.log(`Users: ${USERS.length} · Sessions: ${SESSIONS.length} · Audit entries: ${AUDIT.length}`);
  if (!process.env.BOOTSTRAP_PASSWORD && !process.env.JAMES_PASSWORD) {
    console.warn('[security] No BOOTSTRAP_PASSWORD env var set — seeded users will use the hard-coded placeholder if users.json does not exist yet. Set one in Render env vars before first boot.');
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[email] SMTP not configured — /api/send-email will return 503 until SMTP_HOST, SMTP_USER, and SMTP_PASS are set in Render env vars. All existing emailjs.send() calls in the client route through this endpoint, so email is disabled until SMTP is live.');
  }
});
