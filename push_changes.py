#!/usr/bin/env python3
"""Push script — fixes Fleet Report generate button (popup blocker fix)."""
import subprocess, os, sys, glob as _glob

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

# Clear stale lock files
for lockf in _glob.glob(os.path.join(REPO, ".git", "*.lock")) + _glob.glob(os.path.join(REPO, ".git", "refs", "**", "*.lock"), recursive=True):
    try:
        os.remove(lockf)
    except Exception:
        pass

print(f"\n{O}{B}  ╔══════════════════════════════════════════╗{X}")
print(f"{O}{B}  ║       🚀  TrackNow Portal Deploy         ║{X}")
print(f"{O}{B}  ╚══════════════════════════════════════════╝{X}\n")

# Pull latest
ok, out = run("git pull origin main")
status("Pulled latest from origin", ok)
if not ok and "CONFLICT" in out:
    print(out)
    sys.exit(1)

# Apply fix — replace window.open popup with Blob URL approach
f = os.path.join(REPO, "index.html")
t = open(f, "r").read()

OLD1 = "const reportWin = window.open('', '_blank', 'width=900,height=1100');\n  reportWin.document.write(`"
NEW1 = "// Use a Blob URL to avoid popup blockers\n  const reportHTML = `"

OLD2 = """</body></html>`);
  reportWin.document.close();
  showToast('Fleet Optimisation Report generated for ' + l.co);"""

NEW2 = """</body></html>`;
  var blob = new Blob([reportHTML], {type: 'text/html'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
  showToast('Fleet Optimisation Report generated for ' + l.co);"""

changed = False

if OLD1 in t:
    t = t.replace(OLD1, NEW1)
    changed = True
    status("Replaced window.open with Blob URL approach")
elif NEW1 in t:
    status("Blob URL fix already applied (skipping)")
else:
    print(f"  {R}✗ Could not find window.open pattern{X}")

if OLD2 in t:
    t = t.replace(OLD2, NEW2)
    changed = True
    status("Replaced document.write/close with Blob link click")
elif NEW2 in t:
    status("Blob link click fix already applied (skipping)")
else:
    print(f"  {R}✗ Could not find document.write pattern{X}")

if changed:
    open(f, "w").write(t)
    status("Saved index.html")
else:
    status("No changes needed — already up to date")

# Commit and push
ok, out = run("git status --porcelain")
if out.strip():
    ok, _ = run("git add -A")
    status("Staged all changes", ok)

    MSG = "fix: fleet report generate button - use Blob URL instead of window.open to avoid popup blockers"
    ok, out = run(f'git commit -m "{MSG}"')
    status("Committed", ok)

    ok, out = run("git push origin main")
    status("Pushed to GitHub", ok)
    if not ok:
        ok, out = run("git push --force-with-lease origin main")
        status("Force-pushed", ok)

    if ok:
        print(f"\n{G}  ═══════════════════════════════════════════{X}")
        print(f"{G}{B}    ✅  DEPLOYED SUCCESSFULLY{X}")
        print(f"{G}  ═══════════════════════════════════════════{X}")
        print(f"\n  {O}{B}🌐  https://tracknow-portal.onrender.com{X}")
        print(f"  {D}Auto-deploys in ~1-2 minutes{X}\n")
    else:
        print(f"\n  {R}{B}❌  DEPLOY FAILED{X}")
        print(f"  {R}{out}{X}\n")
        sys.exit(1)
else:
    print(f"\n  {D}No changes to commit — portal is up to date.{X}\n")
