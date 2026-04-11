#!/usr/bin/env python3
"""Push — per-asset calculator values + remove HC + MTM fix."""
import subprocess, os, sys

# Find the repo — use the directory this script lives in
REPO = os.path.dirname(os.path.abspath(__file__))
if not os.path.isdir(os.path.join(REPO, ".git")):
    print("\033[91m✗ Not a git repo: " + REPO + "\033[0m")
    sys.exit(1)

os.chdir(REPO)
print(f"\n\033[1m🚀 Pushing per-asset values + HC removal + MTM fix\033[0m")
print(f"  Repo: {REPO}\n")

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=REPO)
    return r.returncode == 0, r.stdout.strip() + "\n" + r.stderr.strip()

def status(msg, ok=True):
    sym = "\033[92m✓\033[0m" if ok else "\033[91m✗\033[0m"
    print(f"  {sym} {msg}")

# Pull first
ok, out = run("git pull origin main")
status("Pulled latest")

# Stage everything
ok, out = run("git add -A")
status("Staged all changes", ok)

# Check if there's anything to commit
ok, out = run("git diff --cached --name-only")
files = [f.strip() for f in out.strip().split("\n") if f.strip()]
if not files:
    print("\n  ⚠ No staged changes — nothing to push.")
    sys.exit(0)

for f in files:
    status(f"  → {f}")

COMMIT_MSG = """Per-asset calculator values, remove hidden cost section, fix MTM

- Per-asset working hours for Fuel Slippage calculator
- Per-asset idle hours for Idle Time calculator
- Per-asset after-hours % for After-Hours Use calculator
- Removed Hidden Cost & Fraud calculator section entirely
- Fixed MTM term dropdown (value 0 was treated as falsy)
- Removed Freight Overnight from optional extras
- All 3 calculator breakdowns show per-asset detail"""

ok, out = run('git commit -m """' + COMMIT_MSG + '"""')
status("Committed", ok)
if not ok:
    print(out)
    sys.exit(1)

ok, out = run("git push origin main")
status("Pushed to GitHub", ok)

if ok:
    print(f"\n\033[92m{'='*50}")
    print(f"  ✓ ALL DONE — deploying to Render")
    print(f"{'='*50}\033[0m\n")
else:
    print(f"\n\033[91m✗ Push failed:\033[0m\n{out}")
    sys.exit(1)
