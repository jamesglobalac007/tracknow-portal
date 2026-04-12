#!/usr/bin/env python3
"""Push — All pending: first name, blue CTA, orange queue, logo fix, send timeout, CSV import."""
import subprocess, os, sys

REPO = os.path.expanduser("~/mds/tracknow-portal")
os.chdir(REPO)

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r.returncode == 0, r.stdout + r.stderr

def status(msg, ok=True):
    sym = "\033[92m\u2713\033[0m" if ok else "\033[91m\u2717\033[0m"
    print(f"  {sym} {msg}")

print("\n\033[1m\U0001f680 Pushing TrackNow Portal changes to GitHub\033[0m\n")

lock = os.path.join(REPO, ".git", "index.lock")
if os.path.exists(lock):
    os.remove(lock)
    status("Removed stale git lock")

ok, out = run("git pull origin main")
status("Pulled latest from origin", ok)
if not ok and "conflict" in out.lower():
    print(out)
    sys.exit(1)

f = os.path.join(REPO, "index.html")
t = open(f, "r").read()

checks = [
    (".split(' ')[0]", "First name only in emails"),
    ("background:#FFA028;border-radius:50%;animation:pulse", "Orange callback queue"),
    ("background:#0098d4;color:#ffffff;font-size:15px;font-weight:800", "Blue callback button in emails"),
    ("goToCallbackProspect", "Clickable prospect name in queue"),
    ('data-id="${p.id}"', "Prospect row data-id for highlight"),
    ("_sendTimeout", "Send timeout safety net (30s)"),
    ("clearTimeout(_sendTimeout)", "Timeout cleared on resolve/reject"),
    ("background:#fff;padding:12px 24px;border-radius:8px", "White pill behind logo"),
    ("handleSalesFeeCSV", "CSV import for sales fees"),
    ("sfCsvDropZone", "CSV drag-and-drop zone"),
    ("importSalesFeeCSV", "Bulk CSV import function"),
    ("downloadSalesFeeTemplate", "CSV template download"),
]

all_ok = True
for marker, label in checks:
    found = marker in t
    status(label, found)
    if not found:
        all_ok = False

if not all_ok:
    print("\n\033[91m\u2717 Some markers missing — aborting push.\033[0m")
    sys.exit(1)

ok, _ = run("git add index.html push_changes.py")
status("Staged files", ok)

ok, out = run('git commit -m "First name emails, blue CTA, orange queue, logo fix, send timeout, CSV sales fee import"')
if ok:
    status("Committed")
elif "nothing to commit" in out:
    status("Nothing new to commit (already pushed)")
    print("\n\033[92m" + "=" * 44)
    print("  \u2713 ALL DONE \u2014 already up to date")
    print("=" * 44 + "\033[0m\n")
    sys.exit(0)
else:
    status("Commit failed", False)
    print(out)
    sys.exit(1)

ok, out = run("git push origin main")
status("Pushed to GitHub", ok)

if ok:
    print("\n\033[92m" + "=" * 44)
    print("  \u2713 ALL DONE \u2014 deploying to Render")
    print("=" * 44 + "\033[0m\n")
else:
    print(f"\n\033[91m\u2717 Push failed:\033[0m\n{out}")
    sys.exit(1)
