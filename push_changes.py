#!/usr/bin/env python3
"""Push — marketing calendar + vertical alignment + asset dropdown."""
import subprocess, os, sys

REPO = os.path.dirname(os.path.abspath(__file__))
if not os.path.isdir(os.path.join(REPO, ".git")):
    print("\033[91m✗ Not a git repo: " + REPO + "\033[0m")
    sys.exit(1)

os.chdir(REPO)
print(f"\n\033[1m🚀 Pushing: Marketing calendar + alignment + asset dropdown\033[0m")
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

COMMIT_MSG = """Marketing calendar + vertical alignment + asset dropdown

Marketing Hub calendar:
- 5 platforms: LinkedIn, Facebook, Instagram, Google Business, X
- 4-week rotating content plan auto-generated per month
- Content types: product features, ROI/savings, industry news, testimonials
- 3-4 posts per week across all platforms
- Color-coded platform legend
- Posts display on calendar day cells with platform and description

Layout fixes:
- Fleet segments stack vertically (flex-direction column)
- Slippage, idle, after-hours asset rows stack vertically
- All asset rows full width

Deal products:
- Asset field changed from text input to dropdown select
- Options from FLEET_BENCHMARKS (all vehicle types)"""

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
