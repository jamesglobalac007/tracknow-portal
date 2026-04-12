#!/usr/bin/env python3
"""
Push all fixes to BOTH repos:
1. tracknow-portal — agreement fixes, orange boxes, Supply Nation removed
2. tracknow-site — Supply Nation added to website footer
"""
import subprocess, os, sys

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r.returncode == 0, r.stdout + r.stderr

def status(msg, ok=True):
    sym = "\033[92m✓\033[0m" if ok else "\033[91m✗\033[0m"
    print(f"  {sym} {msg}")

# ══════════════════════════════════════════════════
# REPO 1: PORTAL
# ══════════════════════════════════════════════════
print("\n\033[1m🚀 [1/2] Portal — Push All Fixes\033[0m\n")
PORTAL = os.path.expanduser("~/mds/tracknow-portal")
os.chdir(PORTAL)

ok, out = run("git pull origin main")
status("Pulled latest", ok)

# Verify key fixes
t = open("index.html", "r", encoding="utf-8").read()
checks = {
    "No sync on landing pages": "window._showAgreementSign || window._showProposalAccept || window._showCallbackForm",
    "No premature localStorage write": "Do NOT also write to localStorage here",
    "Canvas signature capture": "cv.toDataURL",
    "Agreement sign dashboard panel": "agreementSignPanel",
    "renderAgreementSigns function": "function renderAgreementSigns()",
    "Send button reset": "Reset send button to default state",
    "Fleet report compression": "Fleet reports are very large",
    "Orange boxes (no green)": "#FFA028",
    "Supply Nation removed": "supply-nation" not in t.lower(),
    "Email sig row-per-field table": "row-per-field table so lines always align",
    "Signing page flex columns": "display:flex;flex-direction:column",
}

for label, needle in checks.items():
    if isinstance(needle, bool):
        status(label, needle)
        if not needle: sys.exit(1)
    else:
        found = needle in t
        status(label, found)
        if not found: sys.exit(1)

ok, _ = run("git add index.html push_changes.py")
status("Staged files", ok)

ok, out = run('git commit -m "Fix email signature block alignment — row-per-field table structure for bulletproof email rendering"')
if ok:
    status("Committed")
elif "nothing to commit" in out:
    status("Already committed")
else:
    status("Commit failed", False)
    print(out)
    sys.exit(1)

ok, out = run("git push origin main")
status("Pushed portal to GitHub", ok)
if not ok:
    print(f"\n\033[91m✗ Push failed:\033[0m\n{out}")
    sys.exit(1)

# ══════════════════════════════════════════════════
# REPO 2: WEBSITE
# ══════════════════════════════════════════════════
print(f"\n\033[1m🚀 [2/2] Website — Add Supply Nation\033[0m\n")
SITE = os.path.expanduser("~/mds/tracknow-site")
os.chdir(SITE)

ok, out = run("git pull origin main")
status("Pulled latest", ok)

wt = open("index.html", "r", encoding="utf-8").read()
if "Supply Nation Indigenous Company" in wt:
    status("Supply Nation text present in website")
else:
    status("Supply Nation NOT found in website — applying fix")
    old_foot = '''    <div class="foot-bot">
      <div>© 2026 Track Now Proprietary Limited. Gold Coast, QLD 4217. ABN 12 634 559 970</div>'''
    new_foot = '''    <div style="text-align:center;padding:24px 0 20px;border-top:1px solid #1b2a3e;margin-bottom:20px">
      <img src="https://tracknow-portal-sync.onrender.com/assets/supply-nation-registered.avif" alt="Supply Nation Registered" style="height:56px;margin-bottom:10px;display:inline-block">
      <div style="font-size:13px;color:#a3adbd;line-height:1.6">TrackNow is proud to be a certified<br><strong style="color:#FFA028">Supply Nation Indigenous Company</strong></div>
    </div>
    <div class="foot-bot">
      <div>© 2026 Track Now Proprietary Limited. Gold Coast, QLD 4217. ABN 12 634 559 970</div>'''
    if old_foot in wt:
        wt = wt.replace(old_foot, new_foot)
        open("index.html", "w", encoding="utf-8").write(wt)
        status("Added Supply Nation to website footer")
    else:
        status("Could not match footer — check manually", False)
        sys.exit(1)

ok, _ = run("git add index.html")
status("Staged index.html", ok)

ok, out = run('git commit -m "Add Supply Nation certified indigenous company badge to website footer"')
if ok:
    status("Committed")
elif "nothing to commit" in out:
    status("Already committed")
else:
    status("Commit failed", False)
    print(out)
    sys.exit(1)

ok, out = run("git push origin main")
status("Pushed website to GitHub", ok)
if not ok:
    print(f"\n\033[91m✗ Push failed:\033[0m\n{out}")
    sys.exit(1)

print(f"\n\033[92m{'='*60}")
print(f"  ✓ BOTH REPOS PUSHED — Render deploying in ~60s")
print(f"{'='*60}\033[0m\n")
print("  Portal fixes:")
print("  • Agreement signing: no premature alerts, single notification")
print("  • Dashboard box for signed agreements")
print("  • Real drawn signature in confirmation email")
print("  • All notification boxes orange")
print("  • Supply Nation removed from portal")
print("  • Fleet/proposal/agreement email compression")
print("  • Send button resets between emails")
print()
print("  Website:")
print("  • Supply Nation logo + 'certified indigenous company' in footer")
print()
print("  Watch for TWO Render deploy confirmation emails.")
print()
