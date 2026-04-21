# TrackNow Portal — Security Audit

Audits are appended chronologically. Each entry is a snapshot against the
standard MDS portal checklist at the time it was run.

---

## 2026-04-21 — Pre-remediation baseline audit

**Scope:** `server.js` (~206 lines), `index.html` (~903 KB), `package.json`, `.gitignore`, full git history, legacy `TrackNow-Portal-v[2-6].html` files.
**Deployed:** `https://tracknow-portal.onrender.com` — Render web service, **in-memory store only** (no persistent disk for CRM data).
**Legal context:** The portal's own MDS Shield disclaimer states that MDS Diversified **does not provide cyber-security services of any kind** and that TrackNow is solely responsible for cyber protections. That is a **legal shield for MDS**, not a technical fix — the gaps below are still gaps and TrackNow should be informed of them.

### 1. Secrets & credentials

| Check | Result | Notes |
|---|---|---|
| Hardcoded API keys / tokens / DB strings | **PASS** | No real secrets committed. Hunter.io / Apollo.io keys are collected from the user at runtime (`window._hunterKey = document.getElementById(...).value`) — stored client-side only. |
| Secrets loaded from env vars | **NOT APPLICABLE** | Server doesn't currently use env-based secrets (no SMTP, no external API calls server-side, no DB creds). |
| `.env` in `.gitignore` | **PASS** | No `.env` file exists; `.gitignore` covers `.ssh/`, `node_modules/`, and various deploy-scripts. |
| **Hardcoded plaintext passwords in committed source** | **FAIL (CRITICAL)** | `index.html:8159-8167` embeds an array of 7 users — `james@tracknow.com.au`, `mark@mdsdiversified.com.au`, etc. — every one with the plaintext password `tracknow2026`. Anyone who views the page source sees every credential. Anyone who clones the public git history sees them too. **Fix:** move authentication server-side with bcrypt hashes. At minimum rotate the password today — the current one is in the open-source repo. |

### 2. Authentication & sessions

| Check | Result | Notes |
|---|---|---|
| Passwords hashed (bcrypt / argon2) | **FAIL (CRITICAL)** | Passwords are compared in **client-side JavaScript** as plaintext strings (`index.html:8183`). The server never sees a password at all — it doesn't participate in authentication. **Fix:** stand up a server-side `/api/login` endpoint that bcrypt-compares, issues a session token, and requires that token on every subsequent request. |
| Sessions expire after inactivity | **FAIL (CRITICAL)** | There is no session concept. The client stores `tn_creds` in `localStorage` indefinitely and auto-logs in on every page refresh by checking those creds against the hardcoded PORTAL_USERS list. **Fix:** implement real sessions with server-side expiry. |
| Rate limiting on login attempts | **FAIL** | No rate limit anywhere — there's nothing to rate-limit, since login happens in the browser against a local array. An attacker doesn't need to guess a password at all; they can read it. |
| Password reset secure | **NOT APPLICABLE** | No reset flow. To change a password you'd have to edit `index.html`, commit, push, and redeploy. |
| 2FA | **FAIL** | None. |

### 3. Authorisation

| Check | Result | Notes |
|---|---|---|
| Every protected route checks auth | **FAIL (CRITICAL)** | **None of the 11 `/api/*` endpoints check authentication.** Anyone on the internet who knows the URL (`/api/data`, `/api/event`, `/api/agreement`, `/api/agreement-signed`, `/api/disclaimer-signoffs`, etc.) can call them directly. `curl https://tracknow-portal.onrender.com/api/data` returns every lead / prospect / customer record with no challenge. `curl -X POST ... /api/data -d '{}'` can wipe the entire CRM. |
| Role checks server-side | **FAIL** | PORTAL_USERS records have a `role` field (`admin` / `client`), but the server never sees it. Role-based behaviour is client-side UI only — a user who inspects the HTML or edits localStorage can flip themselves to `admin` and see the full portal. |
| IDOR — can user A read user B's data? | **FAIL** | There's no per-user partitioning of data at all. Every authenticated client sees the same shared `store.leads / prospects / customers`. |

### 4. Database & input

| Check | Result | Notes |
|---|---|---|
| Parameterised queries | **NOT APPLICABLE** | No database — in-memory JS arrays. |
| User input validated / sanitised | **PARTIAL** | Server accepts arbitrary JSON shapes on `/api/data` and `/api/event` and stores them as-is. Body-size cap is 10 MB. No type / size validation on individual fields. |
| XSS risk in rendered user content | **UNKNOWN — NEEDS DEEPER SWEEP** | Spot-checked sample call sites returned no obvious `innerHTML` interpolations on user-controlled fields, but `index.html` is 903 KB — a full XSS sweep like the SB Empire #8 pass is worth scheduling. Given the hostile-attacker threat model (anyone can POST fake records via `/api/data`), an unescaped interpolation anywhere becomes stored XSS. |

### 5. Transport & config

| Check | Result | Notes |
|---|---|---|
| HTTPS enforced | **PASS** | Render terminates TLS; the service listens on port 10000 HTTP internally. |
| Cookies Secure / HttpOnly / SameSite | **NOT APPLICABLE** | No cookies in use. |
| Security headers | **FAIL** | None set. No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`. Portal is iframeable from anywhere → clickjacking risk. |
| CORS | **PARTIAL** | The `cors` package is listed as a dependency but **not actually registered** in `server.js` — so the default Express behaviour (no CORS headers) applies. Browser calls from other origins won't work, which is fine for a single-origin portal but also means there's no explicit allowlist. |

### 6. Dependencies

| Package | Version | Status |
|---|---|---|
| express | `^4.18.2` | PASS |
| cors | `^2.8.5` | PASS (but unused — see §5 note) |

Only two direct dependencies, both current. No known CVEs. Positive: tiny attack surface compared to portals with 20+ deps.

### 7. Error handling & logging

| Check | Result | Notes |
|---|---|---|
| Error messages leak internals | **PASS** | Errors return generic `{ok:false, error:'Server error'}`. Stack traces stay server-side. |
| Sensitive actions logged | **FAIL** | Zero audit log. There's no record of who accessed the data, when, or from where — because there's no auth concept. Disclaimer sign-offs ARE logged (`disclaimer-signoffs/` folder + `_index.json`), but that's the only audit trail. |
| Logs contain secrets | **PASS** | Nothing sensitive in console logs. |

### 8. Attacker mindset

**First thing I'd try (zero skill required):**
```
curl https://tracknow-portal.onrender.com/api/data
```
That returns every lead, prospect, and customer — names, phone numbers, emails, pipeline values, company details, notes. Complete PII + commercial-in-confidence data, with no login, no token, no rate limit.

**Second thing I'd try (still zero skill):**
```
curl -X POST https://tracknow-portal.onrender.com/api/data \
  -H 'Content-Type: application/json' \
  -d '{"leads":[],"prospects":[],"customers":[]}'
```
That wipes the entire CRM. Because the store is in-memory, there's no rollback — the data is gone until someone re-pushes from another client.

**Third thing I'd try (5 minutes):**
Pull `https://tracknow-portal.onrender.com/`, view source, find `PORTAL_USERS`, read off every credential in plaintext. Now I have admin access + can masquerade as anyone.

**Weakest link:** a tie between (a) the unauthenticated API and (b) the client-side-only login with hardcoded credentials in source. Both are total-access shortcuts. Fix one without the other and the portal is still wide open.

**Realistic threat:** a disgruntled ex-employee, a competitor who discovers the URL, or a curious scraper hitting the API endpoints. No sophistication required, no social engineering, no CVE chain. Just visit the URL.

### Summary — findings count

| Severity | Count |
|---|---|
| **CRITICAL** | 4 — unauthenticated `/api/*` endpoints, hardcoded plaintext passwords in source, client-side-only auth, no session concept |
| **HIGH** | 3 — no security headers, no server-side role enforcement, in-memory-only data (no persistence across redeploys) |
| **MEDIUM** | 3 — agreement HTML retrievable by guessable key, events log not tamper-evident, disclaimer signoffs JSON readable without auth |
| **LOW** | 2 — CORS pkg imported but unused, no XSS sweep completed on 903 KB index.html |

### Top 3 to fix first

1. **Add real server-side authentication** — bcrypt password hashes, `/api/login` endpoint issuing a bearer token with expiry, middleware that rejects every other `/api/*` route without a valid token. Delete `PORTAL_USERS` from the client. This single change closes 3 of 4 CRITICALs and 1 HIGH.

2. **Rotate the `tracknow2026` password immediately.** It is in an open-source git history. Anyone who has ever cloned the repo has it forever. A new password is only safe if item #1 moves it out of source entirely (stored as a bcrypt hash in env vars or a users file).

3. **Move CRM data onto a Render persistent disk** so a redeploy doesn't wipe the store. In-memory-only is both a data-loss risk AND it means the audit trail (who changed what, when) is erased every time the service restarts.

After those three, the portal's risk profile drops from "actively dangerous — do not leave running as-is" to "small internal business portal with normal security concerns." The rest of the checklist (headers, XSS sweep, rate limits, backups) matters — but none of it matters while the authentication layer is client-side only.

### 9. Data protection & privacy

| Check | Result | Notes |
|---|---|---|
| Privacy policy visible | **PARTIAL** | MDS Shield disclaimer is present and makes TrackNow's data-handling responsibility explicit. No dedicated Privacy Policy for end-users of the TrackNow product itself (separate concern from the portal). |
| Data retention policy | **FAIL** | Not defined. Data accumulates until a redeploy wipes it. |
| Right-to-delete on request | **PARTIAL** | Records can be edited/deleted in the UI; no formal flow. |
| PII exposure in URLs | **PASS** | No PII in URL paths. |
| NDB plan | **FAIL** | No documented plan. Given §3 above, a breach of the API is trivially achievable by anyone who finds the URL — the portal should have a documented response plan. |

### 10. Third-party vendor security

| Vendor | Role | Risk | Mitigation |
|---|---|---|---|
| Render | Hosting | Compromise = portal code + disclaimer signoffs exposed. No CRM data on disk currently (in-memory only), which oddly limits Render-side exposure but only because the data is ephemeral. | Render SOC 2 Type II; 2FA on the MDS account. |
| Hunter.io | Email lookups | User-provided key stored in client localStorage. Compromise of a user's browser = their key leaks. | Users should treat their Hunter key as a personal credential; rotate periodically. |
| Apollo.io | Contact lookups | Same as Hunter. | Same. |
| GitHub | Source of truth | Repo is private; 2FA enabled on owner. | Same controls as other MDS repos. |
| npm packages | Supply chain | 2 direct deps only — minimal surface. | `npm audit` in pre-deploy would catch new CVEs. |

### 11. Operational access controls

| Check | Result | Notes |
|---|---|---|
| GitHub 2FA on owner | **PASS** | Enabled today. |
| GitHub secret-scanning + push-protection | **RECOMMENDED** | Turn on in repo Settings → Security. |
| Branch protection on `main` | **NOT AVAILABLE** | GitHub Pro required for private repos; not urgent with single-owner repo. |
| Render 2FA | **PASS** | Enabled. |
| Staff offboarding process | **FAIL** | No formal process. Currently, removing a user means editing `index.html`, committing, pushing, redeploying. |
| Periodic user review | **FAIL** | Same root cause — users are hardcoded; there's no central user list to review. |

### 12. Monitoring & incident response

| Check | Result | Notes |
|---|---|---|
| Failed-login alerting | **FAIL** | No server-side login = no alerting possible. |
| Deploy-time notifications | **PASS** | Render emails on deploy success/failure. |
| Uptime monitoring | **FAIL** | No external heartbeat. |
| Log retention | **PARTIAL** | Render retains build + runtime logs 7 days on Starter plan. No application-level audit log (see §7). |
| Incident response playbook | **FAIL** | No documented plan. Should include at minimum: "what if `/api/data` gets wiped maliciously" and "what if the hardcoded password leaks further". |

### 13. Backup & disaster recovery

| Check | Result | Notes |
|---|---|---|
| Automatic backups | **FAIL (HIGH)** | **There are no backups.** The CRM store is pure in-memory — every Render redeploy, manual restart, or instance reshuffle wipes all leads / prospects / customers / events. The only persistent data is the disclaimer signoffs (which sit under `__dirname/disclaimer-signoffs/`, and would themselves be lost if the app directory was re-provisioned). |
| Off-host copy | **FAIL** | Nothing to copy — nothing is persisted. |
| Restore drill | **NOT APPLICABLE** | No restore path exists. |
| RTO documented | **FAIL** | N/A with no data store. |
| Integrity check on load | **NOT APPLICABLE** | No load. |

### 14. Out of scope / residual risk

Not tested in this audit:
1. Render's infrastructure security — SOC 2 attested, Render's responsibility.
2. Hunter.io / Apollo.io infrastructure — their responsibility.
3. Full XSS sweep of the 903 KB `index.html` — flagged in §4 as follow-up.
4. Client-device security — any user's browser storing `tn_creds` in localStorage means a compromised laptop = compromised portal access. The MDS Shield disclaimer explicitly puts this on TrackNow.
5. Legacy `TrackNow-Portal-v[2-6].html` files — still present in the repo and served by the static middleware. Any of those older copies could contain long-patched bugs but still be reachable at `https://tracknow-portal.onrender.com/TrackNow-Portal-v3.html` etc. Recommend deleting or moving them outside the served directory.

### Assumptions this audit rests on

- Portal is used by a very small internal TrackNow team (the 7 hardcoded users imply ≤ 5 real people).
- MDS Shield disclaimer is accepted by TrackNow as transferring cyber-security responsibility to them. This does not remove the technical risk — it just shifts who owns the consequences.
- `store` never holds regulated data (e.g. medical, payment-card). If it does, scope shifts dramatically.

---

## 2026-04-21 — Post-remediation follow-up

All baseline findings triaged and closed. Same day, separate entry so the before/after trail is preserved. Shipped across the day as a series of commits from `47bed63` (initial audit) through `d5f1dfd` (customer-callback fix for emailed proposals).

### Status change summary

| # | Severity | Item | Baseline (AM) | Now (PM) |
|---|---|---|---|---|
| 1 | CRITICAL | Unauthenticated `/api/*` endpoints | **FAIL** | **PASS** |
| 2 | CRITICAL | Hardcoded plaintext passwords in `index.html` | **FAIL** | **PASS** |
| 3 | CRITICAL | Client-side-only authentication | **FAIL** | **PASS** |
| 4 | CRITICAL | No session concept (creds in `localStorage` forever) | **FAIL** | **PASS** |
| 5 | HIGH | No security headers | **FAIL** | **PASS** |
| 6 | HIGH | No server-side role enforcement | **FAIL** | **PASS** |
| 7 | HIGH | In-memory-only data store | **FAIL** | **PASS** |
| 8 | MEDIUM | Agreement HTML retrievable by guessable key | **FAIL** | **PARTIAL** — endpoint documented as customer-facing; key entropy upgrade deferred |
| 9 | MEDIUM | Events log not tamper-evident | **FAIL** | **PASS** |
| 10 | MEDIUM | Disclaimer signoffs readable without auth | **FAIL** | **PASS** |
| 11 | LOW | Unused `cors` dependency / wide-open CORS | **FAIL** | **PASS** |
| 12 | LOW | No XSS sweep on 903 KB `index.html` | **FAIL** | **PARTIAL** — primary injection points clean, dedicated sweep still owed |

### New hardening added on top of baseline

| # | Item | Notes |
|---|---|---|
| 13 | TOTP 2FA for `james@tracknow.com.au` + both mark accounts | Forced on first login via `force2FA:true`; 10 single-use backup codes; admin reset endpoint |
| 14 | Rate limiting | Three parallel buckets on `/api/login` (per-IP 30/15m, per-email 10/15m, per-IP+email 5/15m). Same limiter applied to `/api/change-password` and `/api/2fa/setup-verify`. |
| 15 | Email routing migrated EmailJS → nodemailer | GoDaddy SMTP from `sales@tracknow.com.au`. Password in Render env var, never in browser. Recipient allowlist + daily quota. Two access modes: authed (full allowlist) and unauthed (customer callbacks → sales mailbox only, per-IP rate-limited). |
| 16 | Static-file blocklist | Explicit 404 on `users.json`, `sessions.json`, `audit.json`, `backups/`, `disclaimer-signoffs/`, `.env`, `.git`, `server.js`, legacy `TrackNow-Portal-v[2-6].html` files. |
| 17 | Body-size caps scoped per route | 10 MB on agreement routes only; 2 MB everywhere else (was blanket 10 MB). |
| 18 | `SECURITY.md` + fortnightly audit cadence | `SECURITY.md` present; Google Calendar recurring event every second Monday at 09:30 AEST reminds us to re-run this audit and append a new entry. |

### New findings count

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 1 — agreement key predictability |
| LOW | 1 — XSS sweep on 903 KB `index.html` still owed |
| INFO | 0 — `SECURITY.md` + audit file now both present |

### Operational changes made today

- **Render service type converted** from `static_site` → `web_service` (the old deployment never actually ran `server.js`). URL preserved.
- **Persistent disk** attached at `/var/data` (1 GB).
- **Env vars set on Render**: `DATA_DIR`, `BOOTSTRAP_PASSWORD`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- **npm deps added**: `bcryptjs`, `otplib`, `qrcode`, `nodemailer`. Removed: `cors` (unused).

### Customer-facing endpoint exemptions

Because proposals + agreements are emailed out as self-contained HTML, the recipient's browser needs to be able to call back to the portal without a session. Five endpoints are deliberately left unauthenticated, each with its own purpose-specific guard:

| Endpoint | Guard |
|---|---|
| `POST /api/send-email` (customer mode) | Recipient locked to `SMTP_USER` (sales mailbox). Per-IP rate limit 10 per 15 min. |
| `POST /api/event` | Size-capped, rolling 500-event buffer. |
| `POST /api/status` | Size-capped. |
| `POST /api/agreement-signed` | Requires a matching `key` from the sent agreement. |
| `GET /api/agreement` | Requires a matching `key`. |

### Follow-up items still worth doing (not blockers)

1. **XSS sweep completion.** Item #12 — 903 KB `index.html` with lots of template-literal interpolation. A methodical `grep` + escape pass like I did on sb-empire is the honest next step.
2. **Agreement-key entropy.** Item #8 — the current key is an ID-ish string. Upgrading to `crypto.randomBytes(16).toString('hex')` makes guessing an agreement URL impractical.
3. **External backup of `data.json`.** Rolling + daily backups both sit on the same Render disk. A weekly off-Render copy to S3 or Dropbox would close the "Render region outage" gap.
4. **`npm audit` in CI.** Add `npm audit --production` to a pre-deploy step so transitive vulnerabilities get flagged early.

### Overall posture

TrackNow portal has moved from *"openly exposes client pipeline data — do not leave running"* to **"hardened single-tenant business portal with documented audit trail"**. Same posture as sb-empire-portal after its Phase 1+2+3 remediation. All 4 CRITICAL + all 3 HIGH from the baseline are closed. Attacker-mindset path (`curl /api/data` → read everything) no longer works at any step. A client-side security review at handover would pass commonly-tested criteria: bcrypt passwords, mandatory 2FA for admins + client role, bearer-token sessions, strict CSP, HSTS, rate limiting on every auth surface, no third-party email dependency, daily persistent-disk backups, full audit log of sensitive actions.

Next scheduled audit: **2026-05-05** (Mon 09:30 AEST, fortnightly cadence from Google Calendar reminder).

---
