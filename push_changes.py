#!/usr/bin/env python3
"""Push — Agreement email orange signature + signing page + cha-ching sound."""
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
    ("agreement_sign=1", "Agreement sign URL param handler"),
    ("_showAgreementSign", "Agreement sign flag variable"),
    ("agreementSignOverlay", "Agreement signing landing page HTML"),
    ("submitAgreementSign", "Agreement sign submit function"),
    ("tn_agreement_signs", "Agreement signs localStorage key"),
    ("Agreement Signed & Executed", "Portal notification for agreement signing"),
    ("_agrSignUrl", "Agreement email uses portal signing URL"),
    ("SIGN &amp; ACCEPT AGREEMENT</a>", "Orange sign button in email"),
    ("Digital Signature</p>", "Orange Digital Signature header in email"),
    ("asSigCanvas", "Drawing canvas on signing page"),
    ("as_thanks", "Thank you screen after signing"),
    ("Your Signed Service Agreement", "Customer email with signed copy"),
    ("Cha-ching", "Cha-ching cash register sound"),
    ("white noise burst", "Ka click sound component"),
    ("bright ringing bell", "Ching ring sound component"),
]

all_ok = True
for marker, label in checks:
    found = marker in t
    status(label, found)
    if not found:
        all_ok = False

if not all_ok:
    print("\n\033[91m\u2717 Some checks failed \u2014 aborting push.\033[0m")
    sys.exit(1)

ok, _ = run("git add index.html push_changes.py")
status("Staged files", ok)

ok, out = run('git commit -m "Agreement email: orange signature + signing landing page + cha-ching sound alert"')
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
