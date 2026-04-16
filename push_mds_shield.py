#!/usr/bin/env python3
"""Push TrackNow MDS Shield update via local git.
Copies updated index.html + server.js into ~/mds/tracknow-portal,
commits, and pushes — triggering a Render redeploy.
"""
import subprocess, os, sys, shutil

REPO = os.path.expanduser("~/mds/tracknow-portal")
SRC  = os.path.dirname(os.path.abspath(__file__))

def run(cmd, cwd=None):
    r = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    return r.returncode == 0, r.stdout + r.stderr

def status(msg, ok=True):
    sym = "\033[92m✓\033[0m" if ok else "\033[91m✗\033[0m"
    print(f"  {sym} {msg}")

print("\n\033[1m🛡  Pushing TrackNow MDS Shield update\033[0m\n")

if not os.path.isdir(REPO):
    print(f"\033[91m  ✗ Local repo not found at {REPO}\033[0m")
    print(f"  Clone it first:  git clone https://github.com/jamesglobalac007/tracknow-portal {REPO}")
    sys.exit(1)
status(f"Repo: {REPO}")

ok, out = run("git pull origin main", cwd=REPO)
status("Pulled latest from origin", ok)
if not ok:
    print(out); sys.exit(1)

for fname in ("index.html", "server.js"):
    src = os.path.join(SRC, fname)
    dst = os.path.join(REPO, fname)
    if not os.path.exists(src):
        status(f"{fname} missing in source folder", False); sys.exit(1)
    if os.path.abspath(src) != os.path.abspath(dst):
        shutil.copyfile(src, dst)
        status(f"Copied {fname} ({os.path.getsize(dst):,} bytes)")
    else:
        status(f"{fname} already in repo ({os.path.getsize(dst):,} bytes)")

ok, _ = run("git add index.html server.js", cwd=REPO)
status("Staged files", ok)

msg = "MDS Shield: stronger no-data/no-cyber-security position + server-side disclaimer signoff log"
ok, out = run(f'git commit -m "{msg}"', cwd=REPO)
if ok:
    status("Committed")
elif "nothing to commit" in out:
    status("Already committed")
else:
    status("Commit failed", False); print(out); sys.exit(1)

ok, out = run("git push origin main", cwd=REPO)
status("Pushed to GitHub", ok)
if not ok:
    print(f"\n\033[91m✗ Push failed:\033[0m\n{out}"); sys.exit(1)

print(f"\n\033[92m{'='*55}")
print(f"  ✓ ALL DONE — Render will auto-deploy now")
print(f"  https://tracknow-portal-sync.onrender.com")
print(f"{'='*55}\033[0m\n")
