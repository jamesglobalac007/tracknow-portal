#!/usr/bin/env python3
"""Force push — clears stale git locks, resets index, commits & pushes."""
import subprocess, os, sys, glob
from datetime import datetime

REPO = os.path.expanduser("~/MDS/tracknow-portal")
if not os.path.isdir(REPO):
    print("\033[91m✗ Repo not found at " + REPO + "\033[0m")
    sys.exit(1)
os.chdir(REPO)

G = "\033[92m"; R = "\033[91m"; O = "\033[38;5;214m"; B = "\033[1m"; D = "\033[2m"; X = "\033[0m"

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=REPO)
    return r.returncode == 0, r.stdout + r.stderr

def status(msg, ok=True):
    sym = f"{G}✓{X}" if ok else f"{R}✗{X}"
    print(f"  {sym} {msg}")

print(f"\n{O}{B}  ╔══════════════════════════════════════════╗{X}")
print(f"{O}{B}  ║       🚀  TrackNow Portal Deploy         ║{X}")
print(f"{O}{B}  ╚══════════════════════════════════════════╝{X}\n")

# 1. Clear ALL stale lock files
locks_cleared = 0
for pattern in [".git/*.lock", ".git/refs/**/*.lock"]:
    for lf in glob.glob(os.path.join(REPO, pattern), recursive=True):
        try:
            os.remove(lf)
            locks_cleared += 1
        except:
            pass
if locks_cleared:
    status(f"Cleared {locks_cleared} stale lock file(s)")

# 2. Reset git index so it sees the actual working tree
run("git reset")
status("Reset git index")

# 3. Pull latest
ok, out = run("git pull --rebase origin main")
status("Pulled latest from origin", ok)
if not ok and "CONFLICT" in out:
    print(out)
    sys.exit(1)

# 4. Check file
portal = os.path.join(REPO, "index.html")
size_kb = os.path.getsize(portal) / 1024
print(f"\n  {G}✓{X}  Portal: {D}{size_kb:.0f} KB{X}")

# 5. Check for changes
ok, out = run("git status --porcelain")
if out.strip():
    print(f"\n  Changed files:")
    for line in out.strip().splitlines():
        print(f"    {line}")

    ok, _ = run("git add -A")
    status("Staged all changes", ok)

    ts = datetime.now().strftime("%d %b %Y %I:%M%p")
    MSG = f"Portal update — {ts}"
    ok, out = run(f'git commit -m "{MSG}"')
    if not ok and "nothing to commit" in out:
        print(f"\n{O}⚠ Nothing to commit{X}\n")
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
