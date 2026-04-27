# TrackNow smoke test — pre/post test checklist

Two scripts, one process. Run them before and after every test session so
you've got proof the system is healthy, not just a feeling.

---

## 1. Tier 1 — server-side (automated)

Runs against the running service, hits Render API + GitHub backup repo,
decrypts the latest snapshot to confirm the chain is intact end-to-end.

### Run it

```bash
# Sandbox only (default)
python3 ~/MDS/tracknow-portal/audits/smoke_test.py sandbox

# Live tracknow-portal
python3 ~/MDS/tracknow-portal/audits/smoke_test.py prod

# Both, side-by-side
python3 ~/MDS/tracknow-portal/audits/smoke_test.py both

# Also save a fresh BASELINE-{env}-{timestamp} snapshot to audits/baselines/
python3 ~/MDS/tracknow-portal/audits/smoke_test.py sandbox --baseline

# Machine-readable JSON output (for piping into CI / cron)
python3 ~/MDS/tracknow-portal/audits/smoke_test.py sandbox --json
```

### What it checks

| # | Check | Pass criteria |
|---|---|---|
| 1 | Service health | `/`, `/lead.html`, `/reset.html` all 200 with non-trivial body |
| 2 | Render deploy | Latest deploy is `live` (not `build_failed` / `update_in_progress`) |
| 3 | Auth gates | `/api/data`, admin endpoints, send-email all reject anon (401/403, never 500) |
| 4 | Login endpoint | Validates input cleanly; bad creds return 401, malformed body returns 400 |
| 5 | Public endpoints | `/api/agreement`, `/api/event`, `/api/agreement-signed` shape OK |
| 6 | Static assets | `/favicon.ico` and `/cash.wav` reachable (cha-ching has Web Audio fallback) |
| 7 | Backup chain | Latest .enc snapshot fresh (warn at >15 min, fail at >60 min), decrypts, sha matches |
| 8 | Data integrity | leads/prospects/customers within sane bounds; version > 0 |
| 9 | Pricing persistence | `pricing` block present in latest snapshot (warn if not — means nothing edited yet) |
| 10 | Disk usage | Render persistent disk well under capacity (warn >50%, fail >80%) |
| 11 | Sync version | `STORE.version` increasing; `lastUpdate` recent |
| 12 | Recent error logs | 0 errors / few warnings in last 30 min |

### Exit codes

- `0` — all pass (or warn-only). Safe to iterate / promote.
- `1` — at least one fail. Investigate.
- `2` — script error / unreachable.

---

## 2. Tier 2 — browser-side

Server checks can't catch UI regressions. The browser script walks every
main tab, confirms charts render, key buttons exist, and counts console
errors during the walk.

### Run it

1. Open the portal (`https://sandbox-tracknow.onrender.com` or live) and **log in**.
2. Open DevTools → Console.
3. If Chrome blocks pasting, type `allow pasting` + Enter first.
4. Open `audits/smoke_test_browser.js` in your editor, copy the whole file, paste into the console.
5. Read the colour-coded report.

### What it checks

- Sandbox banner present (when on sandbox host)
- Active session (`/api/me`)
- `/api/data` round-trip with leads/prospects/customers/version/pricing counts
- Each main tab navigates cleanly and key DOM elements render: Dashboard, Pipeline, Customers, Analytics, Marketing Hub, Tools, Revenue, Resources
- Critical Chart.js instances are alive on the canvas
- Critical buttons exist (`+ New Prospect`, `Import CSV`, global search)
- `_playCashRegister()` synth function defined
- Pricing globals (`HW_PRICES`, `OPTIONAL_EXTRAS`) populated
- Console error count during the tab walk

---

## 3. Tier 3 — needs human eyes

Things scripts can't verify. Spot-check after Tier 1 + 2 pass.

- **Email rendering** — send a fleet report / proposal to your own inbox, check subject + body + signed HTML render in Mail.app + Gmail
- **Cha-ching audio** — drag a lead to "Closed Won" and confirm it sounds like a cash register, not a single ding
- **PDF export quality** — open a proposal preview, render to PDF, eyeball formatting
- **Drag-drop in pipeline** — drag a lead column-to-column
- **Mobile / responsive** — phone view if the customer ever opens the portal on a phone

---

## Recommended workflow

| When | Run |
|---|---|
| Start of test session | `smoke_test.py sandbox --baseline` (snapshot for diff) |
| After major changes | `smoke_test.py sandbox` (Tier 1) + paste browser snippet (Tier 2) |
| Before promoting sandbox → prod | `smoke_test.py both` (compare envs) + Tier 2 + Tier 3 spot checks |
| After prod deploy | `smoke_test.py prod` to confirm prod still healthy |

---

## Files

- `smoke_test.py` — Tier 1 runner (Python 3, requires `cryptography`)
- `smoke_test_browser.js` — Tier 2 paste-into-console snippet
- `decrypt_backup.py` — used by Tier 1 to decrypt offsite snapshots
- `baselines/PRE-TEST-*` — pre-test snapshots used for post-test diff
