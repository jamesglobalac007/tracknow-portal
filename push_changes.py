#!/usr/bin/env python3
"""Push script — 30-day cancellation notice update for proposal & agreement."""
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

f = os.path.join(REPO, "index.html")
t = open(f, "r").read()
changed = False

# ── FIX 1: Update proposal cancellation clause ──
OLD_PROP = """<strong>6. Cancellation:</strong> Either party may terminate with 30 days written notice after the minimum term. Early termination fees may apply."""

NEW_PROP = """<strong>6. Cancellation &amp; 30-Day Notice:</strong> Either party may cancel the subscription by providing a minimum of 30 days written notice. This notice period applies after the minimum term and during any month-to-month renewal period. Cancellation requests must be submitted in writing via email to support@tracknow.com.au. The subscription remains active and billable until the end of the 30-day notice period. Early termination during the initial contract term will incur an early exit fee equal to the remaining monthly fees for the balance of the term."""

if OLD_PROP in t:
    t = t.replace(OLD_PROP, NEW_PROP)
    changed = True
    status("Updated proposal cancellation clause — 30-day notice")
elif NEW_PROP in t:
    status("Proposal cancellation clause already updated (skipping)")
else:
    print(f"  {R}✗ Could not find proposal cancellation clause{X}")

# ── FIX 2: Update agreement termination clause ──
OLD_AGR = """<strong>Termination:</strong> Either party may terminate this agreement with 30 days written notice after the minimum term. Early termination during the initial term will incur an early exit fee equal to the remaining monthly fees for the balance of the term. Upon termination, all GPS devices must be made available for collection within 14 days."""

NEW_AGR = """<strong>Cancellation &amp; 30-Day Notice:</strong> Either party may cancel the subscription by providing a minimum of 30 days written notice. This notice period applies after the minimum contract term and during any month-to-month renewal period. Cancellation requests must be submitted in writing via email to support@tracknow.com.au. The subscription remains active and all fees remain billable until the end of the 30-day notice period. Early termination during the initial contract term will incur an early exit fee equal to the remaining monthly fees for the balance of the term. Upon cancellation, all GPS devices remain the property of TrackNow GPS and must be made available for collection within 14 days."""

if OLD_AGR in t:
    t = t.replace(OLD_AGR, NEW_AGR)
    changed = True
    status("Updated agreement cancellation clause — 30-day notice")
elif NEW_AGR in t:
    status("Agreement cancellation clause already updated (skipping)")
else:
    print(f"  {R}✗ Could not find agreement cancellation clause{X}")

# ── FIX 3: Generate button warning toast (from previous push) ──
OLD_TOAST = """  // If no fleet data yet, open the fleet profile modal instead
  if (!p.fleetSegments || !p.fleetSegments.length) {
    openProspectFleetProfile(prospectId);
    showToast('Add fleet details first, then generate the report');
    return;
  }"""

NEW_TOAST = """  // If no fleet data saved yet, show clear message — don't re-open the data panel
  if (!p.fleetSegments || !p.fleetSegments.length) {
    showToast('Please save fleet profile first — click Fleet, add vehicles, then Save Fleet Profile', 'warn');
    return;
  }"""

if OLD_TOAST in t:
    t = t.replace(OLD_TOAST, NEW_TOAST)
    changed = True
    status("Generate button warning toast fix applied")
elif NEW_TOAST in t:
    status("Generate button warning toast already applied (skipping)")

# ── FIX 4: Popup blocker fix (from previous push) ──
OLD_POPUP = """const reportWin = window.open('', '_blank', 'width=900,height=1100');
  reportWin.document.write(`"""
NEW_POPUP = """// Use a Blob URL to avoid popup blockers
  const reportHTML = `"""

OLD_CLOSE = """</body></html>`);
  reportWin.document.close();
  showToast('Fleet Optimisation Report generated for ' + l.co);"""
NEW_CLOSE = """</body></html>`;
  var blob = new Blob([reportHTML], {type: 'text/html'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
  showToast('Fleet Optimisation Report generated for ' + l.co);"""

if OLD_POPUP in t:
    t = t.replace(OLD_POPUP, NEW_POPUP)
    changed = True
    status("Popup blocker fix applied")
elif NEW_POPUP in t:
    status("Popup blocker fix already applied (skipping)")

if OLD_CLOSE in t:
    t = t.replace(OLD_CLOSE, NEW_CLOSE)
    changed = True
    status("Blob link click fix applied")
elif NEW_CLOSE in t:
    status("Blob link click fix already applied (skipping)")

if changed:
    open(f, "w").write(t)
    status("Saved index.html")

# Commit and push
ok, out = run("git status --porcelain")
if out.strip():
    ok, _ = run("git add -A")
    status("Staged all changes", ok)

    MSG = "update: 30-day cancellation notice in proposal and agreement T&Cs"
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
    print(f"\n  {D}No changes to commit — already up to date.{X}\n")
