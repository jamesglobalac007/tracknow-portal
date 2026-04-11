#!/usr/bin/env python3
"""Push script — Per-calculator asset selection + payment structure toggle."""
import subprocess, os, sys, glob

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

print(f"\n\033[1m🚀 Pushing asset selection + payment structure to GitHub\033[0m")
print(f"  Repo: {REPO}\n")

for lockfile in glob.glob(os.path.join(REPO, ".git", "*.lock")):
    os.remove(lockfile)
    status(f"Removed stale lock: {os.path.basename(lockfile)}")

ok, out = run("git pull origin main")
if not ok and "Already up to date" not in out:
    status("Pull from origin", False)
    print(out)
    sys.exit(1)
status("Pulled latest from origin")

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

COMMIT_MSG = """Add per-calculator asset selection and payment structure toggle

Per-calculator asset selection:
- Each calculator (Slippage, Idle, After-Hours) gets asset type chips
- Toggle which vehicle categories apply to each calculator
- E.g. idle time only for trucks/equipment, after-hours only for vans/utes
- Breakdown shows which assets included and their unit counts
- Fleet report respects per-calculator asset selection
- Selections persist with fleet profile data

Payment structure (Monthly vs Contract):
- New toggle in deal products: Monthly or Contract
- Monthly: hardware paid upfront, then subscription only
- Contract: hardware spread across term, added to monthly
- Proposal and agreement dynamically reflect payment type
- Hardware ownership T&Cs adjust per payment method"""

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
    print(f"\n\033[92m{'='*50}")
    print(f"  ✓ ALL DONE — deploying to Render")
    print(f"  Asset selection + payment toggle live shortly")
    print(f"{'='*50}\033[0m\n")
else:
    print(f"\n\033[91m✗ Push failed:\033[0m\n{out}")
    sys.exit(1)
