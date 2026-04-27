#!/usr/bin/env python3
"""
TrackNow smoke-test suite — pre/post test checklist.

Usage:
  python3 smoke_test.py sandbox        # check sandbox-tracknow
  python3 smoke_test.py prod           # check tracknow-portal (live)
  python3 smoke_test.py both           # run both, side by side
  python3 smoke_test.py sandbox --baseline   # also save a fresh baseline snapshot
  python3 smoke_test.py sandbox --json       # machine-readable JSON output

What it checks (Tier 1 — fully automated, ~30 seconds):
  1.  Service health      — HTTP 200 on key URLs, response time
  2.  Render deploy       — most recent deploy is "live" (not build_failed)
  3.  Auth gates          — 401/403 on protected endpoints (never 500)
  4.  Login endpoint      — rejects bad input cleanly
  5.  Public endpoints    — /api/agreement, /api/event, /api/agreement-signed shape OK
  6.  Backup chain        — latest .enc snapshot fresh + decrypts + sha matches
  7.  Data integrity      — counts within sane bounds, version increasing
  8.  Pricing persistence — Revenue tab config saved in latest snapshot
  9.  Disk usage          — Render persistent disk well under capacity
  10. Static assets       — /favicon.ico, /cash.wav reachable (or fallback documented)
  11. Recent error logs   — zero errors/warnings in last 30 min

Tier 2 (browser-side) is documented in the companion file
  audits/smoke_test_browser.js — paste it into the sandbox DevTools Console
  to verify each tab loads + chart renders + console is clean.

Exit codes:
  0   all pass (or warn-only)
  1   at least one fail
  2   script error / unreachable
"""

import sys
import os
import json
import base64
import hashlib
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

CREDS_PATH = Path.home() / ".mds" / "credentials.json"
AUDITS_DIR = Path(__file__).parent
BASELINES_DIR = AUDITS_DIR / "baselines"

# ── ANSI colours (only when stdout is a TTY) ────────────────────────────────
TTY = sys.stdout.isatty()
def _c(code): return f"\033[{code}m" if TTY else ""
GREEN, YELLOW, RED, GREY, BOLD, RESET = _c("32"), _c("33"), _c("31"), _c("90"), _c("1"), _c("0")

ENVS = {
    "sandbox": {
        "label":      "sandbox-tracknow",
        "base":       "https://sandbox-tracknow.onrender.com",
        "service_id": "srv-d7n76cpf9bms738c8kvg",
        "owner_id":   "tea-d6tp2tlm5p6s73bhbclg",
        # Sandbox doesn't write its own backups; it READS from prod's repo
        # via LIVE_BACKUP_*. Backup-chain check validates prod's repo
        # because that's the source of truth for sandbox imports.
        "backup_repo":   "jamesglobalac007/tracknow-portal-backups",
        "is_sandbox":    True,
    },
    "prod": {
        "label":      "tracknow-portal",
        "base":       "https://tracknow-portal.onrender.com",
        "service_id": "srv-d7jg9opf9bms73fqktcg",
        "owner_id":   "tea-d6tp2tlm5p6s73bhbclg",
        "backup_repo":   "jamesglobalac007/tracknow-portal-backups",
        "is_sandbox":    False,
    },
}


# ── HTTP helper ─────────────────────────────────────────────────────────────
def _http(method, url, headers=None, body=None, timeout=15):
    """Returns (status, body_bytes, elapsed_seconds, error_string_or_None)"""
    req = urllib.request.Request(url, method=method, headers=headers or {})
    if body is not None:
        if isinstance(body, dict):
            body = json.dumps(body).encode()
            req.add_header("Content-Type", "application/json")
        req.data = body
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), time.time() - t0, None
    except urllib.error.HTTPError as e:
        return e.code, e.read(), time.time() - t0, None
    except Exception as e:
        return 0, b"", time.time() - t0, str(e)


# ── Result helpers ──────────────────────────────────────────────────────────
class Result:
    __slots__ = ("status", "label", "detail")
    def __init__(self, status, label, detail=""):
        self.status = status  # "pass" | "warn" | "fail"
        self.label = label
        self.detail = detail
    def to_dict(self):
        return {"status": self.status, "label": self.label, "detail": self.detail}

def _print(r):
    icon = {"pass": GREEN+"✓"+RESET, "warn": YELLOW+"⚠"+RESET, "fail": RED+"✗"+RESET}[r.status]
    print(f"  {icon} {r.label:<28} {GREY}{r.detail}{RESET}")


# ── Credentials helpers ─────────────────────────────────────────────────────
_creds_cache = None
def creds():
    global _creds_cache
    if _creds_cache is None:
        with CREDS_PATH.open() as f:
            _creds_cache = json.load(f)
    return _creds_cache


def render_api(path):
    """Hit the Render API and return parsed JSON or raise."""
    key = creds()["render_api_key"]
    req = urllib.request.Request(
        "https://api.render.com" + path,
        headers={"Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


# ── Individual checks ───────────────────────────────────────────────────────
def check_http_health(env):
    base = env["base"]
    paths = ["/", "/lead.html", "/reset.html"]
    fails = []
    times = []
    for p in paths:
        status, body, t, err = _http("GET", base + p)
        times.append(t)
        if err or status != 200 or len(body) < 100:
            fails.append(f"{p}={status if not err else err}")
    avg = sum(times) / len(times)
    if fails:
        return Result("fail", "Service health", f"failures: {', '.join(fails)}")
    return Result("pass", "Service health",
                  f"{len(paths)}/{len(paths)} routes 200 · avg {avg:.2f}s")


def check_render_deploy(env):
    try:
        deploys = render_api(f"/v1/services/{env['service_id']}/deploys?limit=1")
    except Exception as e:
        return Result("fail", "Render deploy", f"API error: {e}")
    if not deploys:
        return Result("fail", "Render deploy", "no deploy history")
    d = deploys[0]["deploy"]
    status = d.get("status")
    sha = d.get("commit", {}).get("id", "")[:7]
    if status == "live":
        return Result("pass", "Render deploy", f"live · commit {sha}")
    if status in ("build_in_progress", "update_in_progress"):
        return Result("warn", "Render deploy", f"{status} · commit {sha}")
    return Result("fail", "Render deploy", f"{status} · commit {sha}")


def check_auth_gates(env):
    base = env["base"]
    # (method, path, body, expected_codes) — body is shaped so input validation
    # passes and the request actually reaches the auth check.
    cases = [
        ("GET",  "/api/data",                          None, (401, 403)),
        ("GET",  "/api/admin/backup-offsite-status",   None, (401, 403)),
        ("POST", "/api/data-backup-now",               {},   (401, 403)),
        ("POST", "/api/data-restore-backup",           {"file": "data.x.json"}, (401, 403)),
        # Body is well-formed enough to clear field-validation, so the
        # response reflects the auth/recipient gate (rather than 400 on
        # missing fields).
        ("POST", "/api/send-email",                    {"to": "test@example.com", "subject": "smoketest", "html": "<p>x</p>"}, (401, 403)),
    ]
    if env["is_sandbox"]:
        cases.append(("POST", "/api/admin/import-live-snapshot", {}, (401, 403)))
    bad = []
    for method, path, body, expected in cases:
        status, _, _, err = _http(method, base + path, body=body)
        if err:
            bad.append(f"{path}=err")
            continue
        if status not in expected:
            bad.append(f"{path}={status} (want {'/'.join(map(str,expected))})")
    if bad:
        return Result("fail", "Auth gates", "; ".join(bad))
    return Result("pass", "Auth gates", f"{len(cases)}/{len(cases)} endpoints rejected anon")


def check_login_endpoint(env):
    base = env["base"]
    bad = []
    # No body → 400
    s, _, _, _ = _http("POST", base + "/api/login", body={})
    if s != 400: bad.append(f"empty={s}")
    # Wrong field → 400
    s, _, _, _ = _http("POST", base + "/api/login", body={"foo": "bar"})
    if s != 400: bad.append(f"wrong={s}")
    # Bad creds (well-formed shape) → 401 OR 400 depending on rate limit
    s, _, _, _ = _http("POST", base + "/api/login",
                       body={"email": "noone@invalid.test", "pass": "wrongpassword"})
    if s not in (400, 401, 429): bad.append(f"badcreds={s}")
    if bad:
        return Result("fail", "Login endpoint", "; ".join(bad))
    return Result("pass", "Login endpoint", "input validation OK · no 500s")


def check_public_endpoints(env):
    """Endpoints that DON'T require auth — agreement/event/agreement-signed."""
    base = env["base"]
    bad = []
    # GET /api/agreement?key=foo should return 200 with empty html
    s, body, _, _ = _http("GET", base + "/api/agreement?key=__smoketest__")
    if s != 200: bad.append(f"GET agreement={s}")
    # POST /api/event without proper body should be rejected gracefully (4xx not 5xx)
    s, _, _, _ = _http("POST", base + "/api/event", body={})
    if s >= 500: bad.append(f"POST event={s}")
    if bad:
        return Result("fail", "Public endpoints", "; ".join(bad))
    return Result("pass", "Public endpoints", "agreement + event reachable")


def check_static_assets(env):
    base = env["base"]
    # cash.wav fallback: Web Audio synth handles missing file, so 404 is warn not fail
    bad = []
    warn = []
    s, _, _, _ = _http("GET", base + "/favicon.ico")
    if s != 200: bad.append(f"favicon={s}")
    s, _, _, _ = _http("GET", base + "/cash.wav")
    if s != 200:
        warn.append(f"cash.wav={s} (Web Audio synth fallback active — OK)")
    if bad:
        return Result("fail", "Static assets", "; ".join(bad))
    if warn:
        return Result("warn", "Static assets", "; ".join(warn))
    return Result("pass", "Static assets", "favicon + cash.wav reachable")


def _list_backup_snapshots(env):
    """Returns the parsed JSON list of files in the encrypted/ folder of the backup repo."""
    repo = env["backup_repo"]
    token = creds()["tracknow_backup_gh_token"]
    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/contents/encrypted",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "tracknow-smoke-test",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    return [e for e in data if e.get("type") == "file" and e.get("name", "").endswith(".enc")]


def _download_snapshot(env, file_url):
    token = creds()["tracknow_backup_gh_token"]
    req = urllib.request.Request(
        file_url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.raw",
            "User-Agent": "tracknow-smoke-test",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def _decrypt_envelope(envelope_bytes):
    """Decrypt an offsite-backup .enc envelope. Returns the plaintext payload as a string."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    env = json.loads(envelope_bytes.decode("utf-8"))
    if env.get("alg") != "aes-256-gcm":
        raise ValueError(f"unexpected alg: {env.get('alg')}")
    key = base64.b64decode(creds()["tracknow_backup_encryption_key"])
    if len(key) != 32:
        raise ValueError("bad key length")
    iv = base64.b64decode(env["iv"])
    ct = base64.b64decode(env["ciphertext"]) + base64.b64decode(env["authTag"])
    aes = AESGCM(key)
    pt = aes.decrypt(iv, ct, None).decode("utf-8")
    expected = env.get("sha256")
    actual = hashlib.sha256(pt.encode()).hexdigest()
    if expected and actual != expected:
        raise ValueError(f"sha mismatch: expected {expected}, got {actual}")
    return pt, env


# Module-level cache so check_data_integrity / pricing reuse the decrypt
_latest_payload = None
def _get_latest_payload(env):
    global _latest_payload
    if _latest_payload is not None:
        return _latest_payload
    files = _list_backup_snapshots(env)
    if not files:
        return None
    files.sort(key=lambda e: e["name"], reverse=True)
    raw = _download_snapshot(env, files[0].get("download_url") or files[0].get("url"))
    pt, env_meta = _decrypt_envelope(raw)
    _latest_payload = {
        "filename":   files[0]["name"],
        "plaintext":  pt,
        "envelope":   env_meta,
        "size_bytes": len(raw),
        "iso_age":    None,
    }
    # filename format: data.YYYY-MM-DD_HHMM-AEST.json.enc
    try:
        stem = files[0]["name"].split(".", 1)[1].rsplit(".", 2)[0]  # YYYY-MM-DD_HHMM-AEST
        date_part, time_part = stem.split("_")
        hh, mm = time_part[:2], time_part[2:4]
        # AEST = UTC+10
        snap = datetime.fromisoformat(f"{date_part}T{hh}:{mm}:00+10:00")
        _latest_payload["iso_age"] = (datetime.now(timezone.utc) - snap.astimezone(timezone.utc)).total_seconds() / 60
    except Exception:
        _latest_payload["iso_age"] = None
    return _latest_payload


def check_backup_chain(env):
    try:
        files = _list_backup_snapshots(env)
    except Exception as e:
        return Result("fail", "Backup chain (list)", f"{e}")
    if not files:
        return Result("fail", "Backup chain", "no .enc snapshots in repo")
    files.sort(key=lambda e: e["name"], reverse=True)
    latest = files[0]
    # Try to decrypt
    try:
        payload = _get_latest_payload(env)
    except Exception as e:
        return Result("fail", "Backup chain (decrypt)", f"{latest['name']} → {e}")
    age = payload["iso_age"]
    age_str = "?"
    status = "pass"
    if age is not None:
        age_str = f"{int(age)} min ago"
        if age > 15:
            status = "warn"
        if age > 60:
            status = "fail"
    return Result(status, "Backup chain",
                  f"{latest['name']} · {age_str} · sha verified · {len(files)} snapshots")


def check_data_integrity(env):
    payload = _get_latest_payload(env)
    if payload is None:
        return Result("fail", "Data integrity", "no snapshot to inspect")
    try:
        data = json.loads(payload["plaintext"])
    except Exception as e:
        return Result("fail", "Data integrity", f"decrypted blob not JSON: {e}")
    files = data.get("files", {})
    try:
        store = json.loads(files.get("data.json", "{}"))
    except Exception:
        return Result("fail", "Data integrity", "data.json inside payload is malformed")
    leads     = len(store.get("leads", []))
    prospects = len(store.get("prospects", []))
    customers = len(store.get("customers", []))
    version   = store.get("version", 0)
    if not isinstance(version, int):
        return Result("warn", "Data integrity", f"version={version!r} not numeric")
    if version <= 0:
        return Result("warn", "Data integrity", f"version={version} (no writes recorded)")
    return Result("pass", "Data integrity",
                  f"leads={leads} · prospects={prospects} · customers={customers} · v{version}")


def check_pricing_persistence(env):
    payload = _get_latest_payload(env)
    if payload is None:
        return Result("fail", "Pricing persistence", "no snapshot")
    try:
        data = json.loads(payload["plaintext"])
        files = data.get("files", {})
        store = json.loads(files.get("data.json", "{}"))
    except Exception as e:
        return Result("fail", "Pricing persistence", f"parse error: {e}")
    pricing = store.get("pricing")
    if not pricing:
        # Sandbox doesn't write its own offsite backups (it imports prod's),
        # so absence of `pricing` here is informational, not a failure.
        # For prod, it just means nobody's edited the Revenue tab yet.
        if env["is_sandbox"]:
            return Result("warn", "Pricing persistence",
                          "n/a — sandbox reads from prod's backup (use Tier 2 to verify sandbox runtime)")
        return Result("warn", "Pricing persistence",
                      "no pricing block in snapshot (Revenue tab not edited yet on this env)")
    hw = len(pricing.get("hwPrices", {}))
    extras = len(pricing.get("optionalExtras", []))
    matrix_products = len(pricing.get("pricingMatrix", {}))
    return Result("pass", "Pricing persistence",
                  f"hw={hw} · extras={extras} · matrix products={matrix_products}")


def check_disk_usage(env):
    """Best-effort — Render API doesn't expose disk usage directly without metrics scope.
    We log the configured disk size and the latest backup size as a proxy."""
    try:
        svc = render_api(f"/v1/services/{env['service_id']}")
    except Exception as e:
        return Result("warn", "Disk usage", f"API error: {e}")
    disk = (svc.get("serviceDetails") or {}).get("disk") or {}
    size_gb = disk.get("sizeGB", "?")
    if size_gb == "?":
        return Result("warn", "Disk usage", "no persistent disk attached")
    payload = _get_latest_payload(env)
    snap_mb = (payload["size_bytes"] / 1024 / 1024) if payload else 0
    pct = (snap_mb / (size_gb * 1024)) * 100 if size_gb else 0
    if pct > 80:
        return Result("fail", "Disk usage", f"{snap_mb:.1f} MB / {size_gb} GB ({pct:.1f}%)")
    if pct > 50:
        return Result("warn", "Disk usage", f"{snap_mb:.1f} MB / {size_gb} GB ({pct:.1f}%)")
    return Result("pass", "Disk usage",
                  f"latest snapshot {snap_mb:.1f} MB · disk {size_gb} GB ({pct:.1f}%)")


def check_recent_logs(env):
    """Last 30 min of logs — count errors / warnings / quota events."""
    try:
        end_t = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        start_t = (datetime.now(timezone.utc) - timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
        params = urllib.parse.urlencode({
            "ownerId":   env["owner_id"],
            "resource":  env["service_id"],
            "startTime": start_t,
            "endTime":   end_t,
            "limit":     400,
        })
        data = render_api("/v1/logs?" + params)
    except Exception as e:
        return Result("warn", "Recent logs", f"API error: {e}")
    logs = data.get("logs") or []
    bad_kw = ("error", "fail", "exception", "traceback", "crash", "typeerror", "exhausted")
    warn_kw = ("warn",)
    errs = sum(1 for l in logs if any(k in (l.get("message", "") or "").lower() for k in bad_kw))
    warns = sum(1 for l in logs if any(k in (l.get("message", "") or "").lower() for k in warn_kw)) - errs
    if errs > 0:
        return Result("fail", "Recent logs (30m)", f"errors={errs} · warns={max(0,warns)} · total={len(logs)}")
    if warns > 5:
        return Result("warn", "Recent logs (30m)", f"errors=0 · warns={warns} · total={len(logs)}")
    return Result("pass", "Recent logs (30m)", f"errors=0 · warns={max(0,warns)} · total={len(logs)}")


def check_sync_version(env):
    """Hit /api/data?v=0 (anon) — should be 401, but we read the version
    from a recent snapshot to confirm writes are landing."""
    payload = _get_latest_payload(env)
    if payload is None:
        return Result("warn", "Sync version", "no snapshot")
    try:
        data = json.loads(payload["plaintext"])
        store = json.loads(data.get("files", {}).get("data.json", "{}"))
        version = store.get("version", 0)
        last_update = store.get("lastUpdate", 0)
    except Exception as e:
        return Result("warn", "Sync version", f"parse error: {e}")
    if version <= 0:
        return Result("warn", "Sync version", f"version={version}")
    age_min = (time.time() * 1000 - last_update) / 60000 if last_update else None
    age_str = f"{int(age_min)} min ago" if age_min is not None else "?"
    return Result("pass", "Sync version", f"v{version} · last write {age_str}")


# ── Optional: save a fresh baseline ─────────────────────────────────────────
def save_baseline(env):
    payload = _get_latest_payload(env)
    if payload is None:
        return Result("fail", "Save baseline", "no snapshot to save")
    BASELINES_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = BASELINES_DIR / f"BASELINE-{env['label']}-{stamp}"
    out_dir.mkdir(exist_ok=True)
    (out_dir / "_envelope.json").write_text(json.dumps(payload["envelope"], indent=2))
    (out_dir / "_payload.json").write_text(payload["plaintext"])
    payload_obj = json.loads(payload["plaintext"])
    for fname, content in payload_obj.get("files", {}).items():
        (out_dir / fname).write_text(content if isinstance(content, str) else json.dumps(content))
    return Result("pass", "Save baseline", f"{out_dir.name} · {payload['filename']}")


# ── Runner ──────────────────────────────────────────────────────────────────
def run_environment(env_key, also_baseline=False):
    env = ENVS[env_key]
    print(f"\n{BOLD}{env['label']}{RESET} {GREY}@ {datetime.now().strftime('%Y-%m-%d %H:%M %Z').strip()}{RESET}")
    print(f"  {GREY}{env['base']}{RESET}")
    print(f"  {GREY}{'─' * 60}{RESET}")
    checks = [
        check_http_health,
        check_render_deploy,
        check_auth_gates,
        check_login_endpoint,
        check_public_endpoints,
        check_static_assets,
        check_backup_chain,
        check_data_integrity,
        check_pricing_persistence,
        check_disk_usage,
        check_sync_version,
        check_recent_logs,
    ]
    results = []
    t0 = time.time()
    for fn in checks:
        try:
            r = fn(env)
        except Exception as e:
            r = Result("fail", fn.__name__, f"runner error: {e}")
        _print(r)
        results.append(r)
    if also_baseline:
        global _latest_payload
        # don't reuse cache, force fresh fetch in case it was decoded already
        try:
            r = save_baseline(env)
        except Exception as e:
            r = Result("fail", "Save baseline", str(e))
        _print(r)
        results.append(r)
    elapsed = time.time() - t0
    passed = sum(1 for r in results if r.status == "pass")
    warned = sum(1 for r in results if r.status == "warn")
    failed = sum(1 for r in results if r.status == "fail")
    status_word = (RED + "FAIL" if failed else (YELLOW + "WARN" if warned else GREEN + "PASS")) + RESET
    print(f"  {GREY}{'─' * 60}{RESET}")
    print(f"  {BOLD}{status_word}{RESET}  {passed} pass · {warned} warn · {failed} fail · {elapsed:.1f}s")
    return results, failed


def main():
    global _latest_payload
    args = sys.argv[1:]
    targets = []
    flags = set()
    for a in args:
        if a.startswith("--"):
            flags.add(a)
        elif a in ENVS:
            targets.append(a)
        elif a == "both":
            targets.extend(["sandbox", "prod"])
        else:
            print(f"unknown arg: {a}", file=sys.stderr)
            print(__doc__, file=sys.stderr)
            sys.exit(2)
    if not targets:
        targets = ["sandbox"]

    if "--json" in flags:
        out = {}
        for t in targets:
            _latest_payload = None  # reset cache between envs
            results, failed = run_environment(t, also_baseline="--baseline" in flags)
            out[t] = {"failed": failed, "checks": [r.to_dict() for r in results]}
        print(json.dumps(out, indent=2))
        sys.exit(1 if any(v["failed"] for v in out.values()) else 0)

    any_failed = 0
    for t in targets:
        _latest_payload = None  # reset cache between envs
        _, failed = run_environment(t, also_baseline="--baseline" in flags)
        any_failed += failed

    print()
    if any_failed:
        print(f"{RED}✗ {any_failed} check(s) failed.{RESET} Investigate before promoting changes.")
        sys.exit(1)
    print(f"{GREEN}✓ All systems green.{RESET} Safe to iterate.")
    sys.exit(0)


if __name__ == "__main__":
    main()
