#!/usr/bin/env python3
"""One-shot force push — clears locks, resets index, pushes."""
import subprocess, os, sys, glob
from datetime import datetime

REPO = os.path.expanduser("~/MDS/tracknow-portal")
if not os.path.isdir(REPO):
    print("Repo not found at", REPO)
    sys.exit(1)
os.chdir(REPO)

# Kill ALL lock files
for lf in glob.glob(os.path.join(REPO, ".git", "*.lock")):
    try: os.remove(lf)
    except: pass
for lf in glob.glob(os.path.join(REPO, ".git", "refs", "**", "*.lock"), recursive=True):
    try: os.remove(lf)
    except: pass
print("Lock files cleared")

# Reset index so git sees the actual working tree state
subprocess.run("git reset", shell=True, capture_output=True)
print("Index reset")

# Show what git sees now
r = subprocess.run("git status --porcelain", shell=True, capture_output=True, text=True)
print("Status:", r.stdout.strip() if r.stdout.strip() else "(no changes detected)")

if not r.stdout.strip():
    subprocess.run("git update-index --refresh", shell=True, capture_output=True)
    r = subprocess.run("git status --porcelain", shell=True, capture_output=True, text=True)
    print("After refresh:", r.stdout.strip() if r.stdout.strip() else "(still clean)")

# Stage and commit
subprocess.run("git add -A", shell=True, capture_output=True)
ts = datetime.now().strftime("%d %b %Y %I:%M%p")
result = subprocess.run(f'git commit -m "Portal update — {ts}"', shell=True, capture_output=True, text=True)
print(result.stdout.strip())
if result.returncode != 0 and "nothing to commit" in result.stderr + result.stdout:
    print("Nothing to commit — already up to date")
    sys.exit(0)

# Push
result = subprocess.run("git push origin main", shell=True, capture_output=True, text=True)
if result.returncode == 0:
    print("\n✅ PUSHED SUCCESSFULLY — deploying to Render")
else:
    print("Push output:", result.stdout + result.stderr)
