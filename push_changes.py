#!/usr/bin/env python3
"""Push — after-hours trucks/cars/vans + remove monthly payment box from proposal."""
import subprocess, os, sys

REPO = os.path.dirname(os.path.abspath(__file__))
if not os.path.isdir(os.path.join(REPO, ".git")):
    print("\033[91m✗ Not a git repo: " + REPO + "\033[0m")
    sys.exit(1)

os.chdir(REPO)
print(f"\n\033[1m🚀 Pushing: AH trucks/cars/vans + remove proposal payment box\033[0m")
print(f"  Repo: {REPO}\n")

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=REPO)
    return r.returncode == 0, r.stdout.strip() + "\n" + r.stderr.strip()

def status(msg, ok=True):
    sym = "\033[92m✓\033[0m" if ok else "\033[91m✗\033[0m"
    print(f"  {sym} {msg}")

ok, out = run("git pull origin main")
status("Pulled latest")

ok, out = run("git add -A")
status("Staged all changes", ok)

ok, out = run("git diff --cached --name-only")
files = [f.strip() for f in out.strip().split("\n") if f.strip()]
if not files:
    print("\n  No staged changes — nothing to push.")
    sys.exit(0)

print(f"\n  📦 {len(files)} file(s) changed:")
for f in files:
    status(f"  {f}")

COMMIT_MSG = """After-hours: trucks/cars/vans only + remove proposal payment box

After-hours calculator:
- Only trucks, cars, vans now appear as selectable options
- Trucks added back (calcAH true, default 8%)
- Utes and refrigerated excluded (calcAH false)
- Updated description text

Proposal:
- Removed blue monthly payment summary box below pricing schedule
- Pricing sections (Hardware, Software, Extras) flow into Agreement Details"""

ok, out = run("git commit -m " + repr(COMMIT_MSG))
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
