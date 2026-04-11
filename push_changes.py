#!/usr/bin/env python3
"""Push script — 3-calculator model + industry references + report update. Commits and pushes."""
import subprocess, os, sys, glob

# Find the repo
HOME = os.path.expanduser("~")
CANDIDATES = [
    os.path.join(HOME, "mds", "tracknow-portal"),
    os.path.join(HOME, "MDS", "tracknow-portal"),
]
REPO = None
for c in CANDIDATES:
    if os.path.isdir(os.path.join(c, ".git")):
        REPO = c
        break
if not REPO:
    print("\033[91m✗ Could not find tracknow-portal repo\033[0m")
    sys.exit(1)

os.chdir(REPO)

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r.returncode == 0, r.stdout + r.stderr

def status(msg, ok=True):
    sym = "\033[92m✓\033[0m" if ok else "\033[91m✗\033[0m"
    print(f"  {sym} {msg}")

print(f"\n\033[1m🚀 Pushing 3-calculator update to GitHub\033[0m")
print(f"  Repo: {REPO}\n")

# Clear stale lock files
for lockfile in glob.glob(os.path.join(REPO, ".git", "*.lock")):
    os.remove(lockfile)
    status(f"Removed stale lock: {os.path.basename(lockfile)}")

# 1. Pull latest
ok, out = run("git pull origin main")
if not ok and "Already up to date" not in out:
    status("Pull from origin", False)
    print(out)
    sys.exit(1)
status("Pulled latest from origin")

# 2. Check for changes
ok, diff_out = run("git diff --name-only")
ok2, untracked = run("git ls-files --others --exclude-standard")
changed = [f.strip() for f in diff_out.strip().split("\n") if f.strip()]
new_files = [f.strip() for f in untracked.strip().split("\n") if f.strip()]

if not changed and not new_files:
    print("\n  ⚠ No changes detected — nothing to push.")
    sys.exit(0)

for f in changed:
    status(f"Modified: {f}")
for f in new_files:
    status(f"New file: {f}")

# 3. Stage, commit, push
COMMIT_MSG = """Restructure fuel calculators into 3 separate models with industry references

- Split fuel slippage into 3 calculators: Working Hours, Idle Time, After-Hours
- New working-hours model: workHrs x slippage% = wasted mins/hrs per day
- Idle time now uses direct burn rate (L/hr) from Radius Fleet Data AU
- Each calculator shows transparent breakdown with source references
- Updated fleet report to use new calculation model
- Added industry data source citations (Radius.com AU 2024)
- Save/restore new fields (workHrs, idleBurnRate) in prospect data
- Clarified Hidden Cost idle tab as accountability/fraud focus"""

all_files = changed + new_files
run("git add " + " ".join(f'"{f}"' for f in all_files))
status("Staged files")

ok, out = run(f'git commit -m """{COMMIT_MSG}"""')
if not ok and "nothing to commit" in out:
    print("\n  ⚠ Nothing to commit.")
    sys.exit(0)
status("Committed", ok)
if not ok:
    print(out)
    sys.exit(1)

ok, out = run("git push origin main")
status("Pushed to GitHub", ok)

if ok:
    print(f"\n\033[92m{'='*45}")
    print(f"  ✓ ALL DONE — deploying to Render")
    print(f"  3 calculators + industry refs live shortly")
    print(f"{'='*45}\033[0m\n")
else:
    print(f"\n\033[91m✗ Push failed:\033[0m\n{out}")
    sys.exit(1)
