#!/usr/bin/env python3
"""Push — all calculator, proposal, payment & agreement updates."""
import subprocess, os, sys

REPO = os.path.dirname(os.path.abspath(__file__))
if not os.path.isdir(os.path.join(REPO, ".git")):
    print("\033[91m✗ Not a git repo: " + REPO + "\033[0m")
    sys.exit(1)

os.chdir(REPO)
print(f"\n\033[1m🚀 Pushing: Full calculator + proposal + agreement updates\033[0m")
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

for f in files:
    status(f"  {f}")

COMMIT_MSG = """Per-asset calculators + proposal restructure + payment lock + agreement update

Calculators — per-asset values for all 3:
- Fuel slippage: per-asset working hrs/day
- Idle cost: per-asset idle hrs/day
- After-hours: per-asset AH % (vehicles only by default)
- Trucks, equipment, excavators, trailers: calcAH=false, afterHrsPct=0
- Removed global calculator inputs (workHrs, idleHrs, afterHrsPct)
- Removed Hidden Cost & Fraud calculator section entirely

Payment structure locked to term:
- MTM (month-to-month): auto-selects Monthly, disables Contract
- 12/24/36/60mo contract: auto-selects Contract, disables Monthly
- Lock note shows active mode and reason
- Fixed MTM term persistence (0 was treated as falsy)

Proposal document restructured:
- 3 separate pricing sections: Hardware, Software, Optional Extras
- MTM: hardware upfront + monthly subscription
- Contract: hardware spread into single monthly amount
- Removed Contract Value field
- Blue highlighted total monthly payment box with breakdown

Agreement stage card updated:
- Replaced Fleet Optimisation Report indicator with VIEW PROPOSAL button
- Agreement card now shows: View Proposal + View Agreement + Send

Other:
- Removed Freight Overnight from optional extras
- Summary renamed to Fleet Losses & Savings Summary"""

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
