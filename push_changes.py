#!/usr/bin/env python3
"""Push script — TrackNow Portal via git (no API token needed)."""
import subprocess, os, sys
from datetime import datetime

# Find the tracknow-portal repo
for p in ("~/MDS/tracknow-portal", "~/mds/tracknow-portal"):
    rp = os.path.expanduser(p)
    if os.path.isdir(os.path.join(rp, ".git")):
        REPO = rp
        break
else:
    print("\033[91m✗ Could not find tracknow-portal repo\033[0m")
    sys.exit(1)

os.chdir(REPO)

G = "\033[92m"
O = "\033[38;5;214m"
R = "\033[91m"
D = "\033[2m"
B = "\033[1m"
X = "\033[0m"

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r.returncode == 0, r.stdout + r.stderr

def status(msg, ok=True):
    sym = f"{G}✓{X}" if ok else f"{R}✗{X}"
    print(f"  {sym} {msg}")

print(f"\n{O}{B}  ╔══════════════════════════════════════════╗{X}")
print(f"{O}{B}  ║       🚀  TrackNow Portal Deploy         ║{X}")
print(f"{O}{B}  ╚══════════════════════════════════════════╝{X}\n")

# Check portal file exists
portal = os.path.join(REPO, "index.html")
if not os.path.isfile(portal):
    print(f"  {R}✗  index.html not found in {REPO}{X}")
    sys.exit(1)

size_kb = os.path.getsize(portal) / 1024
print(f"  {G}✓{X}  Portal found {D}({size_kb:.0f} KB){X}")

# Pull latest
ok, out = run("git pull --rebase origin main")
status("Pulled latest from origin", ok)
if not ok and "CONFLICT" in out:
    print(out)
    sys.exit(1)

# Check for changes
ok, out = run("git status --porcelain")
if out.strip():
    print(f"\n  Changed files:")
    for line in out.strip().splitlines():
        print(f"    {line}")

    ok, _ = run("git add -A")
    status("Staged all changes", ok)

    timestamp = datetime.now().strftime("%d %b %Y %I:%M%p")
    MSG = f"Portal update — {timestamp}"
    ok, out = run(f'git commit -m "{MSG}"')
    if not ok and "nothing to commit" in out:
        print(f"\n{O}⚠ No changes to commit — portal is up to date{X}\n")
        sys.exit(0)
    status("Committed", ok)
    if not ok:
        print(out)
        sys.exit(1)
else:
    print(f"\n  {D}No local changes to commit.{X}")
    sys.exit(0)

ok, out = run("git push origin main")
status("Pushed to GitHub", ok)
if not ok:
    ok, out = run("git push --force-with-lease origin main")
    status("Force-pushed", ok)

if ok:
    print(f"\n{G}  ═══════════════════════════════════════════{X}")
    print(f"{G}{B}    ✅  DEPLOYED SUCCESSFULLY{X}")
    print(f"{G}  ═══════════════════════════════════════════{X}")
    print(f"  {D}Size:{X}    {size_kb:.0f} KB")
    print(f"\n  {O}{B}🌐  https://tracknow-portal.onrender.com{X}")
    print(f"  {D}Auto-deploys in ~1-2 minutes{X}\n")
else:
    print(f"\n  {R}{B}❌  DEPLOY FAILED{X}")
    print(f"  {R}{out}{X}\n")
    sys.exit(1)
