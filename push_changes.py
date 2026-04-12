#!/usr/bin/env python3
"""Push — Orange callback button, live callback detection, editable email, orange CTA."""
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
    ('contenteditable="true"', "Editable email preview body"),
    ("ep_editHint", "Edit hint banner on email preview"),
    ("var editedBody = document.getElementById('ep_body').innerHTML", "Send uses edited body content"),
    ("background:#FFA028;padding:14px 20px", "Orange pricing CTA header"),
    ("REQUEST A CALLBACK", "Bold callback button text"),
    ("editLeadModal", "Edit Lead modal (pipeline)"),
    ("handleSalesFeeCSV", "CSV import for sales fees"),
    ("_sendTimeout", "Send timeout safety net"),
    ("background:#FFA028;color:#fff;font-size:15px;font-weight:800;border:none;cursor:pointer;font-family:inherit;letter-spacing:.5px;transition:background .15s;border-radius:6px", "Orange callback landing page button"),
    ("addEventListener('storage'", "Live callback detection (cross-tab)"),
    ("new Notification('Callback Requested'", "Browser notification for callbacks"),
    ("AudioContext", "Audio ping for new callbacks"),
    ("setInterval(renderCallbackQueue, 15000)", "15s callback queue refresh"),
]

all_ok = True
for marker, label in checks:
    found = marker in t
    status(label, found)
    if not found:
        all_ok = False

if not all_ok:
    print("\n\033[91m\u2717 Some markers missing \u2014 aborting push.\033[0m")
    sys.exit(1)

ok, _ = run("git add index.html push_changes.py")
status("Staged files", ok)

ok, out = run('git commit -m "Orange callback btn, live callback detection with notifications and audio ping, editable email, orange pricing CTA"')
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
