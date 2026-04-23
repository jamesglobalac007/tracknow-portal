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
// Marketing Hub → Content Library uploads (images, videos, PDFs, HTML packs).
// Bytes live here on the Render disk; metadata rides STORE.contentLibrary so
// it syncs alongside leads/prospects/customers.
const CONTENT_DIR    = path.join(DATA_DIR, 'content-library');
try { fs.mkdirSync(SIGNOFF_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(BACKUPS_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(CONTENT_DIR, { recursive: true }); } catch (e) {}
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
const jsonLarge  = express.json({ limit: '10mb' });   // agreement HTML can be larger
const jsonUpload = express.json({ limit: '60mb' });   // content-library uploads (base64 + 33% overhead)
const LARGE_ROUTES  = new Set(['/api/agreement', '/api/agreement-signed']);
const UPLOAD_ROUTES = new Set(['/api/content-library/upload']);
app.use((req, res, next) => {
  if (UPLOAD_ROUTES.has(req.path)) return jsonUpload(req, res, next);
  if (LARGE_ROUTES.has(req.path))  return jsonLarge(req, res, next);
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
// Default bumped from 4h → 30 days because the old 4h window meant any
// client who closed their browser for longer (overnight, weekend off) came
// back to an expired session and had to log in again. Sessions are rolling
// (refreshed on every API call) so active users never see expiry; idle
// sessions now survive up to 30 days. Admins can still override via the
// SESSION_HOURS env var if they want a tighter policy.
const SESSION_MS = (Number(process.env.SESSION_HOURS) || (30 * 24)) * 60 * 60 * 1000;
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
  // Marketing Hub → Content Library metadata (filename, approval state,
  // which platforms it's for, etc). File bytes live on disk under
  // CONTENT_DIR — this array just holds the metadata + stable URL.
  contentLibrary: [],
  // Names of seed files we've already auto-imported at boot. Keeps the
  // auto-seed idempotent — once a file's in here, we don't re-import it
  // even if James later deletes it from the library on purpose.
  seededContent: [],
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
const LOGIN_MAX_PAIR   = 10;  // per ip+email
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
// The customer-facing endpoints are in here because proposals + agreements
// are emailed out as self-contained HTML pages. When the customer clicks
// "Proceed" or "Sign" in that email, their browser calls back to the portal
// with NO session — they're not a portal user, they're the recipient. So
// those endpoints stay unauthenticated, but each one has its own sanity
// check (matching key, rate limit, or fixed recipient) so it can't be
// abused by random internet traffic.
const AUTH_EXEMPT = new Set([
  '/api/login',
  '/api/disclaimer-accept',      // disclaimer shown pre-login
  '/api/disclaimer-status',
  '/api/agreement',              // GET + POST: customer opens agreement HTML
  '/api/agreement-signed',       // GET + POST: customer uploads signed copy
  '/api/event',                  // POST: customer pushes proposal/agreement-accepted event
  '/api/status',                 // POST: customer dismisses a callback
  '/api/send-email',             // gated inside the handler — customers get a restricted path
  '/api/self-test-status',       // has its own SELFTEST_TOKEN guard
  '/api/reset-password',         // token-gated; user hasn't logged in yet
]);
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (AUTH_EXEMPT.has(req.path)) return next();
  // Content-library file serving (/api/content-library/:id/file) has to be
  // reachable without an Authorization header because the frontend opens
  // these via window.open() / <img src>, neither of which can attach a
  // bearer token. Filenames include unguessable random ids, and the
  // content in the library is intended for public social posting anyway.
  if (/^\/api\/content-library\/[^/]+\/file$/.test(req.path) && req.method === 'GET') return next();
  // Diagnostic endpoint — no secrets, just paths + counts. Open so James
  // can curl it without fishing out a bearer token when uploads go sideways.
  if (req.path === '/api/content-library-diag' && req.method === 'GET') return next();

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
  let { email, pass, totpCode } = req.body || {};
  const ip = clientIp(req);
  if (!email || !pass) return res.status(400).json({ ok: false, error: 'Email and password required' });
  // Trim stray whitespace that sneaks in via copy/paste (SMS, email, chat).
  // Passwords themselves never legitimately start/end with a space, so this
  // is safe + removes a common source of 'my password doesn't work' support.
  email = String(email).trim();
  pass  = String(pass).trim();
  const emailLower = email.toLowerCase();

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
  // Clear rate-limit buckets so a run of typos/autofill misses before this
  // successful login doesn't keep the user locked out on their next attempt.
  // (Matches the equivalent fix in sb-empire-portal server.js.)
  _rlPair.delete(`${ip}:${emailLower}`);
  _rlIP.delete(ip);
  _rlEmail.delete(emailLower);
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

// ─── Password reset links — James-generated, consumed by the user ──────────
// The manual 'Mark type this temp password' flow is fragile (whitespace
// from copy/paste, user typos, client stress). A signed single-use link is
// simpler + safer: James clicks Generate, gets a URL, SMS/email it to Mark,
// Mark opens it, types a password he picks, done. Token lives 15 min, is
// one-shot (consumed = invalid).
const PASSWORD_RESET_TOKENS = new Map(); // token -> { email, expiresAt, createdBy }
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
function _pruneResetTokens() {
  const now = Date.now();
  for (const [tok, rec] of PASSWORD_RESET_TOKENS) {
    if (rec.expiresAt < now) PASSWORD_RESET_TOKENS.delete(tok);
  }
}

app.post('/api/admin/generate-reset-link', requireAdmin, (req, res) => {
  try {
    const { email } = req.body || {};
    const target = USERS.find(u => u.email.toLowerCase() === String(email || '').toLowerCase());
    if (!target) return res.status(404).json({ ok: false, error: 'User not found' });
    _pruneResetTokens();
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
    PASSWORD_RESET_TOKENS.set(token, { email: target.email, expiresAt, createdBy: req.user.email });
    // Build a full URL so James can just copy + send. protocol comes from
    // the forwarded header (Render is behind https) with a sensible default.
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const resetUrl = proto + '://' + host + '/reset.html?token=' + encodeURIComponent(token);
    pushAudit({ email: target.email, ip: clientIp(req), success: true, reason: 'reset_link_generated_by:' + req.user.email });
    res.json({ ok: true, email: target.email, resetUrl, expiresAt, validForMinutes: 15 });
  } catch (err) {
    console.error('[tracknow] generate-reset-link error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// The token carries identity; no existing session needed. Consumes the token
// on first use. Resets mustChangePassword=false since the user has actively
// set the new password (they already proved ownership via the link). Also
// revokes all existing sessions for safety.
app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    const pass = String(newPassword || '').trim();
    if (!token || !pass) return res.status(400).json({ ok: false, error: 'token and newPassword required' });
    if (pass.length < 8) return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' });
    _pruneResetTokens();
    const rec = PASSWORD_RESET_TOKENS.get(token);
    if (!rec) return res.status(400).json({ ok: false, error: 'Link expired or already used. Ask James for a new one.' });
    PASSWORD_RESET_TOKENS.delete(token); // one-shot
    const target = USERS.find(u => u.email.toLowerCase() === rec.email.toLowerCase());
    if (!target) return res.status(404).json({ ok: false, error: 'User not found' });
    target.passHash = await bcrypt.hash(pass, 10);
    target.mustChangePassword = false;
    saveUsers();
    const before = SESSIONS.length;
    SESSIONS = SESSIONS.filter(s => s.email !== target.email);
    if (SESSIONS.length !== before) saveSessions();
    pushAudit({ email: target.email, ip: clientIp(req), success: true, reason: 'password_set_via_reset_link' });
    res.json({ ok: true, email: target.email });
  } catch (err) {
    console.error('[tracknow] reset-password error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Admin password reset — issues a one-time temporary password and forces
// the user to change it on next login. Also revokes every active session
// for that user (so if someone's phished them, they're kicked immediately)
// and clears 2FA state so the user can re-enrol cleanly if force2FA is on.
// Optional body: { email, newPassword } — if newPassword is omitted, the
// server generates a readable 12-char temp password.
app.post('/api/admin/reset-password', requireAdmin, async (req, res) => {
  try {
    const { email, newPassword, resetTwoFactor, skipMustChange, skipForce2FA } = req.body || {};
    const target = USERS.find(u => u.email.toLowerCase() === String(email||'').toLowerCase());
    if (!target) return res.status(404).json({ ok: false, error: 'User not found' });

    // Pick a password. If the admin supplied one (min 6 chars), use it
    // verbatim — trim whitespace so copy/paste artefacts don't creep in.
    // Otherwise generate a readable 12-char password (no I/l/1/0/O).
    const supplied = (typeof newPassword === 'string') ? String(newPassword).trim() : '';
    const tempPass = (supplied.length >= 6)
      ? supplied
      : (function() {
          const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
          let out = '';
          const buf = crypto.randomBytes(12);
          for (let i = 0; i < 12; i++) out += alphabet[buf[i] % alphabet.length];
          return out;
        })();

    target.passHash = await bcrypt.hash(tempPass, 10);
    // skipMustChange: admin wants the user to go straight in with the
    // preset password (no forced change on next login). Useful when
    // handing pre-set credentials to a colleague who'll just use them.
    target.mustChangePassword = !skipMustChange;

    // skipForce2FA: clear the force2FA flag so the user isn't shoved into
    // enrollment scope on next login. Only pair with resetTwoFactor if
    // you genuinely want the user past 2FA — this loosens security.
    if (skipForce2FA) target.force2FA = false;

    if (resetTwoFactor) {
      delete target.totpSecret;
      delete target._pendingTotpSecret;
      delete target.backupCodes;
      target.totpEnabled = false;
    }

    saveUsers();

    // Revoke every active session this user has — defensive, so if the
    // password reset was triggered because of a compromise, nothing keeps
    // the attacker in.
    const before = SESSIONS.length;
    SESSIONS = SESSIONS.filter(s => s.email !== target.email);
    if (SESSIONS.length !== before) saveSessions();

    pushAudit({ email: target.email, ip: clientIp(req), success: true, reason: 'password_reset_by_admin:' + req.user.email
                                                                     + (resetTwoFactor ? ' (2FA cleared)' : '')
                                                                     + (skipMustChange ? ' (skipMustChange)' : '')
                                                                     + (skipForce2FA ? ' (skipForce2FA)' : '') });
    res.json({
      ok: true,
      email: target.email,
      tempPassword: tempPass,
      mustChangePassword: !skipMustChange,
      twoFactorReset: !!resetTwoFactor,
      skipForce2FA: !!skipForce2FA,
      revokedSessions: before - SESSIONS.length,
      note: skipMustChange
        ? 'User can log in with this password — no forced change required.'
        : 'Give the user the temp password. They must change it on next login.'
    });
  } catch (err) {
    console.error('[tracknow] admin reset-password error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
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
    const { leads, prospects, customers, contentLibrary } = incoming;
    if (Array.isArray(leads))           STORE.leads          = leads;
    if (Array.isArray(prospects))       STORE.prospects      = prospects;
    if (Array.isArray(customers))       STORE.customers      = customers;
    // Content Library is DESTRUCTIVE-MERGE protected:
    //   - If the incoming array is empty but we have stuff, refuse and
    //     log a warning. This protects against the classic "fresh browser
    //     session, empty localStorage, sync push wipes everything" bug.
    //   - If the incoming array is non-empty, accept it — frontend has
    //     the authoritative view (including any deletes the user made).
    //   - Dedicated DELETE /api/content-library/:id is the only intended
    //     removal path; it handles file cleanup too.
    if (Array.isArray(contentLibrary)) {
      const existingCount = (STORE.contentLibrary || []).length;
      if (contentLibrary.length === 0 && existingCount > 0) {
        console.warn(`[tracknow] REFUSED to wipe contentLibrary — incoming=0, existing=${existingCount}, user=${req.user && req.user.email}`);
        // Silently skip the write — frontend will re-sync the server's copy on next pull.
      } else {
        STORE.contentLibrary = contentLibrary;
      }
    }
    STORE.version++;
    STORE.lastUpdate = Date.now();
    saveStore();
    res.json({ ok: true, version: STORE.version, leads: STORE.leads, prospects: STORE.prospects, customers: STORE.customers, contentLibrary: STORE.contentLibrary });
  } catch (err) {
    console.error('POST /api/data error:', err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

app.get('/api/data', (req, res) => {
  const sinceVersion = parseInt(req.query.v) || 0;
  if (sinceVersion >= STORE.version) return res.json({ ok: true, changed: false, version: STORE.version });
  res.json({ ok: true, changed: true, version: STORE.version, leads: STORE.leads, prospects: STORE.prospects, customers: STORE.customers, contentLibrary: STORE.contentLibrary || [] });
});

// ─── Content Library — file upload / serve / delete ────────────────────────
// Frontend POSTs { name, type, ext, dataUrl (base64), ...meta }.
// We write the bytes to DATA_DIR/content-library/<id>_<safeName> and append
// the metadata (including a stable URL) to STORE.contentLibrary so the next
// _syncPull pulls it back.
app.post('/api/content-library/upload', (req, res) => {
  try {
    const { name, ext, type, dataUrl, size, platforms, approval, desc } = req.body || {};
    if (!name || !dataUrl) return res.status(400).json({ ok: false, error: 'name and dataUrl required' });
    const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return res.status(400).json({ ok: false, error: 'Invalid dataUrl (expected base64 data URL)' });
    const buf = Buffer.from(m[2], 'base64');
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const safeBase = String(name).replace(/[^a-z0-9._-]/gi, '_').slice(0, 120);
    const filename = `${id}_${safeBase}`;
    try { fs.mkdirSync(CONTENT_DIR, { recursive: true }); } catch (e) {}
    try {
      fs.writeFileSync(path.join(CONTENT_DIR, filename), buf);
    } catch (writeErr) {
      console.error('[tracknow] content-library writeFileSync failed', writeErr);
      return res.status(500).json({ ok: false, error: 'Failed to write file: ' + (writeErr.code || writeErr.message || 'unknown') });
    }
    const record = {
      id,
      name,
      ext: ext || '',
      type: type || 'other',
      size: size || ((buf.length / (1024*1024)).toFixed(1) + ' MB'),
      platforms: Array.isArray(platforms) ? platforms : [],
      // Stable URL — survives redeploys as long as DATA_DIR disk is mounted.
      url: '/api/content-library/' + id + '/file',
      filename,
      desc: desc || '',
      uploaded: new Date().toLocaleDateString('en-AU'),
      uploadedBy: (req.user && req.user.email) || 'unknown',
      uploadedAt: new Date().toISOString(),
      approval: approval || { status: 'pending' }
    };
    STORE.contentLibrary = STORE.contentLibrary || [];
    STORE.contentLibrary.push(record);
    STORE.version++;
    STORE.lastUpdate = Date.now();
    saveStore();
    res.json({ ok: true, record, version: STORE.version });
  } catch (err) {
    console.error('POST /api/content-library/upload error:', err);
    res.status(500).json({ ok: false, error: 'Server error: ' + (err.code || err.message || 'unknown') });
  }
});

app.get('/api/content-library/:id/file', (req, res) => {
  const item = (STORE.contentLibrary || []).find(c => String(c.id) === String(req.params.id));
  if (!item || !item.filename) return res.status(404).json({ ok: false, error: 'Not found' });
  res.sendFile(path.join(CONTENT_DIR, item.filename));
});

// Diagnostic — tells us whether the Render disk is actually mounted and
// what's in STORE.contentLibrary. Hit /api/content-library-diag to see.
app.get('/api/content-library-diag', (req, res) => {
  const probe = (p) => {
    const out = { path: p, exists: false, writable: false };
    try { out.exists = fs.existsSync(p); } catch (e) { out.existsErr = String(e); }
    try {
      const test = path.join(p, '.probe_' + Date.now());
      fs.writeFileSync(test, 'ok');
      fs.unlinkSync(test);
      out.writable = true;
    } catch (e) { out.writeErr = String(e.code || e.message); }
    try { out.files = fs.existsSync(p) ? fs.readdirSync(p).length : 0; } catch (e) {}
    return out;
  };
  res.json({
    env: { DATA_DIR: process.env.DATA_DIR || '(unset)' },
    resolved: { DATA_DIR, CONTENT_DIR, DATA_FILE },
    dataDir: probe(DATA_DIR),
    contentDir: probe(CONTENT_DIR),
    dataFileExists: fs.existsSync(DATA_FILE),
    storeContentCount: (STORE.contentLibrary || []).length,
    storeContentSample: (STORE.contentLibrary || []).slice(-3).map(c => ({
      id: c.id, name: c.name, type: c.type, uploaded: c.uploaded, hasFile: !!c.filename,
      fileOnDisk: c.filename ? fs.existsSync(path.join(CONTENT_DIR, c.filename)) : false
    })),
    version: STORE.version
  });
});

app.delete('/api/content-library/:id', (req, res) => {
  const idx = (STORE.contentLibrary || []).findIndex(c => String(c.id) === String(req.params.id));
  if (idx < 0) return res.status(404).json({ ok: false, error: 'Not found' });
  const [removed] = STORE.contentLibrary.splice(idx, 1);
  try { if (removed && removed.filename) fs.unlinkSync(path.join(CONTENT_DIR, removed.filename)); } catch (e) {}
  STORE.version++;
  STORE.lastUpdate = Date.now();
  saveStore();
  res.json({ ok: true, version: STORE.version });
});

// ─── Content Library seeding — admin-triggered + auto on boot ─────────────
// The repo ships pre-generated assets in content-library-seed/ (e.g. the
// individual TrackNow social posts James spun out of the master pack).
// Files are imported into the Render disk's CONTENT_DIR and appended to
// STORE.contentLibrary. Two triggers:
//   1. Auto-seed runs on boot for any file not already listed in
//      STORE.seededContent[] — so newly-committed seed files land in the
//      library automatically the next time Render deploys.
//   2. Admin button hits /api/admin/seed-content-library to force a rescan.
// Both paths are idempotent — a file is imported at most once per name,
// tracked via STORE.seededContent[] so deleting from the library doesn't
// cause it to come back on the next boot.
const CONTENT_SEED_DIR = path.join(__dirname, 'content-library-seed');
const PLATFORM_ALL_SEED = ['facebook','linkedin','instagram','twitter','youtube','tiktok','gmb','bluesky','threads'];

function _seedContentExtToType(ext) {
  ext = (ext || '').toLowerCase();
  if (['mp4','mov','avi','webm','mkv'].includes(ext)) return 'video';
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'brochure';
  if (['html','htm','txt'].includes(ext)) return 'pack';
  return 'other';
}

function _seedContentLibraryFromRepo(triggeredBy) {
  if (!fs.existsSync(CONTENT_SEED_DIR)) return { scanned: 0, imported: 0, skipped: 0, errors: [] };
  try { fs.mkdirSync(CONTENT_DIR, { recursive: true }); } catch (e) {}

  const entries = fs.readdirSync(CONTENT_SEED_DIR).filter(n => !n.startsWith('.'));
  STORE.contentLibrary = STORE.contentLibrary || [];
  STORE.seededContent  = STORE.seededContent  || [];
  const seenSeeded = new Set(STORE.seededContent.map(s => s.toLowerCase()));
  const seenLib    = new Set(STORE.contentLibrary.map(c => String(c.name || '').toLowerCase()));

  let imported = 0, skipped = 0, errors = [];

  for (const name of entries) {
    if (seenSeeded.has(name.toLowerCase()) || seenLib.has(name.toLowerCase())) {
      skipped++;
      // Make sure the tracker knows about it for next time
      if (!seenSeeded.has(name.toLowerCase())) STORE.seededContent.push(name);
      continue;
    }
    try {
      const srcPath = path.join(CONTENT_SEED_DIR, name);
      const stat = fs.statSync(srcPath);
      if (!stat.isFile()) { skipped++; continue; }
      const ext = name.includes('.') ? name.split('.').pop() : '';
      const type = _seedContentExtToType(ext);
      const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const safeBase = name.replace(/[^a-z0-9._-]/gi, '_').slice(0, 120);
      const filename = `${id}_${safeBase}`;
      fs.copyFileSync(srcPath, path.join(CONTENT_DIR, filename));
      const sizeMB = (stat.size / (1024 * 1024)).toFixed(1) + ' MB';
      STORE.contentLibrary.push({
        id, name, ext, type,
        size: sizeMB,
        platforms: PLATFORM_ALL_SEED,
        url: '/api/content-library/' + id + '/file',
        filename,
        desc: 'Seeded from repo content-library-seed/',
        uploaded: new Date().toLocaleDateString('en-AU'),
        uploadedBy: triggeredBy || 'boot-autoseed',
        uploadedAt: new Date().toISOString(),
        approval: { status: 'pending' }
      });
      STORE.seededContent.push(name);
      imported++;
    } catch (e) {
      errors.push({ name, error: String(e.code || e.message) });
      console.warn('[tracknow] seed failed on', name, e);
    }
  }

  if (imported > 0) {
    STORE.version++;
    STORE.lastUpdate = Date.now();
    saveStore();
  }
  return { scanned: entries.length, imported, skipped, errors };
}

// Run the auto-seed once on boot, after loadStore() has populated STORE.
// Deferred with setImmediate so it doesn't block the listen() call.
setImmediate(function() {
  try {
    const r = _seedContentLibraryFromRepo('boot-autoseed');
    if (r.imported > 0) console.log(`[tracknow] auto-seed: imported ${r.imported}/${r.scanned} content-library seed file(s)`);
    else                console.log(`[tracknow] auto-seed: nothing new (${r.scanned} scanned, ${r.skipped} already present)`);
  } catch (e) { console.warn('[tracknow] auto-seed failed:', e.message); }
});
app.post('/api/admin/seed-content-library', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(CONTENT_SEED_DIR)) {
      return res.json({ ok: true, scanned: 0, imported: 0, skipped: 0, message: 'No content-library-seed/ folder in repo' });
    }
    const r = _seedContentLibraryFromRepo(req.user.email);
    pushAudit({ email: req.user.email, ip: clientIp(req), success: true, reason: `content_library_seed: imported=${r.imported} skipped=${r.skipped}` });
    res.json({ ok: true, ...r, version: STORE.version });
  } catch (err) {
    console.error('[tracknow] seed-content-library error:', err);
    res.status(500).json({ ok: false, error: 'Server error: ' + (err.code || err.message || 'unknown') });
  }
});

// Verify — for every STORE.contentLibrary record, confirm the file it
// points at is actually on disk. Returns any drift so we can see at a
// glance whether bytes and metadata are in sync.
app.get('/api/admin/content-library-verify', requireAdmin, (req, res) => {
  const lib = STORE.contentLibrary || [];
  const missing = [];
  const ok = [];
  for (const c of lib) {
    const full = c.filename ? path.join(CONTENT_DIR, c.filename) : null;
    if (full && fs.existsSync(full)) ok.push({ id: c.id, name: c.name, size: fs.statSync(full).size });
    else missing.push({ id: c.id, name: c.name, filename: c.filename || '(none)' });
  }
  // Also flag anything in the seed folder that isn't imported yet
  let unseeded = [];
  try {
    if (fs.existsSync(CONTENT_SEED_DIR)) {
      const entries = fs.readdirSync(CONTENT_SEED_DIR).filter(n => !n.startsWith('.'));
      const seen = new Set(lib.map(c => String(c.name || '').toLowerCase()).concat((STORE.seededContent || []).map(s => s.toLowerCase())));
      unseeded = entries.filter(n => !seen.has(n.toLowerCase()));
    }
  } catch (e) {}
  res.json({
    ok: missing.length === 0,
    total: lib.length,
    fileOnDisk: ok.length,
    missing: missing.length ? missing : undefined,
    unseededInRepo: unseeded.length ? unseeded : undefined,
    seededTracker: (STORE.seededContent || []).length
  });
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

// Per-IP rate limiter for unauthenticated (customer-side) send-email calls.
// A legit customer clicking "Accept" + "Sign" on a proposal generates 2-4
// emails across a session — 10 per 15 min per IP is plenty of headroom
// without letting someone spam the sales mailbox.
const _customerEmailRl = new Map();

// POST /api/send-email — replaces all client-side emailjs.send() calls.
// Accepts the same shape EmailJS was using: { to_email, subject,
// from_name, message_html } — OR nested under template_params if the
// monkey-patch passes through the raw EmailJS arg shape. Normalises both.
//
// Two access modes:
//   1. Authenticated (portal user) — full recipient allowlist.
//   2. Unauthenticated (customer clicking Accept / Sign in an emailed
//      proposal/agreement) — recipient MUST be the portal's own
//      SMTP_USER mailbox, per-IP rate-limited. Prevents the endpoint
//      being turned into a spam relay.
app.post('/api/send-email', async (req, res) => {
  try {
    const body = req.body || {};
    const params = (body.template_params && typeof body.template_params === 'object') ? body.template_params : body;
    const to       = params.to_email || params.to;
    const subject  = params.subject;
    const fromName = params.from_name || 'TrackNow';
    const html     = params.message_html || params.html || params.body || '';
    if (!to || !subject) return res.status(400).json({ ok: false, error: 'to_email and subject required' });

    const isAuthed = !!req.user;
    const internalAddr = String(process.env.SMTP_USER || '').toLowerCase();

    if (isAuthed) {
      // Authenticated path — full allowlist check.
      if (!_recipientAllowed(to)) {
        console.warn(`[security] send-email rejected recipient not on allowlist: ${to} (from ${req.user.email})`);
        return res.status(403).json({ ok: false, error: 'Recipient must match a lead / prospect / customer on file, or be listed in EMAIL_EXTRA_RECIPIENTS.' });
      }
    } else {
      // Customer path — locked to the sales mailbox only, rate-limited per IP.
      const recipientLower = String(to).toLowerCase();
      if (!internalAddr || !recipientLower.split(',').every(r => r.trim() === internalAddr)) {
        console.warn(`[security] public send-email rejected — recipient '${to}' is not the internal SMTP_USER`);
        return res.status(403).json({ ok: false, error: 'Unauthenticated sends can only go to the internal sales mailbox.' });
      }
      const ip = clientIp(req);
      const rl = rateLimit(_customerEmailRl, ip, 10);
      if (!rl.ok) return res.status(429).json({ ok: false, error: `Too many notifications from this IP. Try again in ${rl.waitMin} min.` });
      rl.bump();
    }

    const quota = _emailQuotaOk();
    if (!quota.ok) return res.status(429).json({ ok: false, error: `Daily email quota (${quota.cap}) reached. Try tomorrow.` });

    const mailer = getMailer();
    if (!mailer) return res.status(503).json({ ok: false, error: 'SMTP not configured.' });

    const info = await mailer.sendMail({
      from: process.env.SMTP_FROM || `${fromName} <${process.env.SMTP_USER}>`,
      to, subject, html
    });
    pushAudit({
      email: req.user ? req.user.email : '(customer)',
      to, subject: String(subject).slice(0,120),
      success: true, reason: 'email_sent', messageId: info.messageId || ''
    });
    res.json({ ok: true, messageId: info.messageId || '' });
  } catch (err) {
    console.error('[tracknow] send-email error:', err);
    pushAudit({ email: req.user && req.user.email, success: false, reason: 'email_failed', error: String(err.message || err).slice(0, 200) });
    res.status(500).json({ ok: false, error: 'Failed to send email: ' + (err.message || 'unknown') });
  }
});

// ─── Self-test status — read-only health probe for the nightly self-test ──
// Gated by env var SELFTEST_TOKEN. Returns 503 if the env var is missing
// (endpoint effectively disabled until explicitly enabled on Render). No
// login, no 2FA, no writes. Reports store counts + backup freshness so a
// scheduled task can alert when data disappears or backups stop running.
function _selfTestTimingSafeEqual(a, b) {
  const aBuf = Buffer.from(String(a || ''));
  const bBuf = Buffer.from(String(b || ''));
  if (aBuf.length !== bBuf.length) return false;
  try { return crypto.timingSafeEqual(aBuf, bBuf); }
  catch (_) { return false; }
}
app.get('/api/self-test-status', (req, res) => {
  const token = process.env.SELFTEST_TOKEN;
  if (!token) {
    return res.status(503).json({ ok: false, error: 'Self-test disabled (SELFTEST_TOKEN not set)' });
  }
  const header = req.headers['x-selftest-token'] || '';
  if (!_selfTestTimingSafeEqual(header, token)) {
    return res.status(401).json({ ok: false, error: 'bad token' });
  }
  try {
    const files = (function(){
      try {
        return fs.readdirSync(BACKUPS_DIR)
          .filter(f => f.startsWith('data.') && f.endsWith('.json'));
      } catch (_) { return []; }
    })();
    const latest = files
      .map(f => { try { return { f, m: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }; } catch(_){ return null; } })
      .filter(Boolean)
      .sort((a, b) => b.m - a.m)[0];
    const ageHours = latest ? +((Date.now() - latest.m) / 3600000).toFixed(2) : null;
    res.json({
      ok: true,
      portal: 'tracknow-portal',
      now: new Date().toISOString(),
      dataDir: DATA_DIR,
      data: {
        leads: (STORE.leads || []).length,
        prospects: (STORE.prospects || []).length,
        customers: (STORE.customers || []).length,
      },
      backups: {
        count: files.length,
        mostRecent: latest ? latest.f : null,
        ageHours
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message || 'self-test failed' });
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
