#!/usr/bin/env python3
"""Push script — add segment selection checkboxes to fleet profile."""
import subprocess, os, sys, glob as _glob

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

for lockf in _glob.glob(os.path.join(REPO, ".git", "*.lock")) + _glob.glob(os.path.join(REPO, ".git", "refs", "**", "*.lock"), recursive=True):
    try: os.remove(lockf)
    except: pass

print(f"\n{O}{B}  ╔══════════════════════════════════════════╗{X}")
print(f"{O}{B}  ║       🚀  TrackNow Portal Deploy         ║{X}")
print(f"{O}{B}  ╚══════════════════════════════════════════╝{X}\n")

ok, out = run("git pull origin main")
status("Pulled latest from origin", ok)
if not ok and "CONFLICT" in out:
    print(out); sys.exit(1)

f = os.path.join(REPO, "index.html")
t = open(f, "r").read()
changed = False

# ── FIX 1: Add selected:true to new segments ──
OLD_SEG = "const seg = { id: ++_fpSegId, type, qty: 5, km: b.km, consumption: b.consumption, insurance: b.insurance, slippage: b.slippage, idle: b.idle };"
NEW_SEG = "const seg = { id: ++_fpSegId, type, qty: 5, km: b.km, consumption: b.consumption, insurance: b.insurance, slippage: b.slippage, idle: b.idle, selected: true };"
if OLD_SEG in t:
    t = t.replace(OLD_SEG, NEW_SEG); changed = True; status("Added selected:true to new fleet segments")
elif NEW_SEG in t:
    status("Segment selected property already added (skipping)")

# ── FIX 2: Add toggleFleetSegSelected function ──
OLD_UPDATEVAL = "function updateFleetSegVal(id, field, val) {"
NEW_TOGGLE = """function toggleFleetSegSelected(id) {
  const seg = _fpSegments.find(s => s.id === id);
  if (!seg) return;
  seg.selected = !seg.selected;
  renderFleetSegments();
  _autoRecalcProspectCosts();
}
function updateFleetSegVal(id, field, val) {"""
if "function toggleFleetSegSelected" not in t and OLD_UPDATEVAL in t:
    t = t.replace(OLD_UPDATEVAL, NEW_TOGGLE); changed = True; status("Added toggleFleetSegSelected function")
elif "function toggleFleetSegSelected" in t:
    status("Toggle function already exists (skipping)")

# ── FIX 3: Update segment card rendering with checkbox ──
OLD_CARD = """    return `<div style="background:#111;border:1px solid #333;padding:8px;margin-bottom:6px;position:relative">
      <button onclick="removeFleetSegment(${seg.id})" style="position:absolute;top:4px;right:6px;background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;font-weight:700" title="Remove">&times;</button>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:6px;margin-bottom:6px">
        <div><label style="font-size:8px;color:#0098d4;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:2px">Vehicle Type</label>
          <select onchange="updateFleetSegType(${seg.id},this.value)" style="width:100%;padding:5px;background:#0a0a0a;border:1px solid #222;color:#CCC;font-size:11px;font-family:inherit">${opts}</select></div>
        <div><label style="font-size:8px;color:#0098d4;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:2px">Qty</label>
          <input type="number" value="${seg.qty}" min="1" onchange="updateFleetSegVal(${seg.id},'qty',this.value)" style="width:100%;padding:5px;background:#0a0a0a;border:1px solid #222;color:#CCC;font-size:11px;font-family:inherit"></div>
      </div>
    </div>`;"""

NEW_CARD = """    const isSelected = seg.selected !== false;
    const borderColor = isSelected ? '#0098d4' : '#333';
    const opacity = isSelected ? '1' : '0.45';
    return `<div style="background:#111;border:1px solid ${borderColor};padding:8px;margin-bottom:6px;position:relative;opacity:${opacity};transition:opacity .2s,border-color .2s">
      <button onclick="removeFleetSegment(${seg.id})" style="position:absolute;top:4px;right:6px;background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;font-weight:700" title="Remove">&times;</button>
      <div style="display:grid;grid-template-columns:auto 2fr 1fr;gap:6px;align-items:end">
        <div style="padding-bottom:2px"><input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFleetSegSelected(${seg.id})" style="width:16px;height:16px;accent-color:#0098d4;cursor:pointer" title="Include in slippage calculation &amp; report"></div>
        <div><label style="font-size:8px;color:#0098d4;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:2px">Vehicle Type</label>
          <select onchange="updateFleetSegType(${seg.id},this.value)" style="width:100%;padding:5px;background:#0a0a0a;border:1px solid #222;color:#CCC;font-size:11px;font-family:inherit">${opts}</select></div>
        <div><label style="font-size:8px;color:#0098d4;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:2px">Qty</label>
          <input type="number" value="${seg.qty}" min="1" onchange="updateFleetSegVal(${seg.id},'qty',this.value)" style="width:100%;padding:5px;background:#0a0a0a;border:1px solid #222;color:#CCC;font-size:11px;font-family:inherit"></div>
      </div>
    </div>`;"""

if OLD_CARD in t:
    t = t.replace(OLD_CARD, NEW_CARD); changed = True; status("Added checkboxes to fleet segment cards")
elif NEW_CARD in t:
    status("Segment checkboxes already added (skipping)")

# ── FIX 4: Filter slippage calculator to selected segments only ──
OLD_CALC = """  _fpSegments.forEach(function(seg) {"""
NEW_CALC = """  var _selectedSegments = _fpSegments.filter(function(seg) { return seg.selected !== false; });
  _selectedSegments.forEach(function(seg) {"""
# Only replace the one in recalcProspectCosts (after the fuel slippage inputs)
if "var _selectedSegments = _fpSegments.filter" not in t and OLD_CALC in t:
    # Replace only the first occurrence (in recalcProspectCosts)
    t = t.replace(OLD_CALC, NEW_CALC, 1); changed = True; status("Slippage calculator now uses selected segments only")
elif "var _selectedSegments = _fpSegments.filter" in t:
    status("Selected segments filter already applied (skipping)")

# ── FIX 5: Update summary label to show selected count ──
OLD_SUMMARY = """  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:10px;color:#666">' + totalUnits + ' vehicles across ' + _fpSegments.length + ' categor' + (_fpSegments.length===1?'y':'ies') + '</div><div style="font-size:10px;color:#5a6675">Annual fuel spend: <b style="color:#0098d4">' + fmt(totalAnnualFuelSpend) + '</b></div></div>';"""

NEW_SUMMARY = """  var selCount = _selectedSegments.length;
  var totalCount = _fpSegments.length;
  var selLabel = selCount === totalCount ? (totalCount + ' categor' + (totalCount===1?'y':'ies')) : (selCount + ' of ' + totalCount + ' selected');
  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:10px;color:#666">' + totalUnits + ' vehicles across ' + selLabel + '</div><div style="font-size:10px;color:#5a6675">Annual fuel spend: <b style="color:#0098d4">' + fmt(totalAnnualFuelSpend) + '</b></div></div>';"""

if OLD_SUMMARY in t:
    t = t.replace(OLD_SUMMARY, NEW_SUMMARY); changed = True; status("Summary now shows selected vs total count")
elif NEW_SUMMARY in t:
    status("Summary label already updated (skipping)")

# ── FIX 6: Report generation uses selected segments only ──
OLD_REPORT = """  const totalUnits = _fpSegments.reduce((s, seg) => s + (seg.qty || 0), 0);
  const fmt = n => '$' + Math.round(n).toLocaleString('en-AU');

  // ── PER-SEGMENT CALCULATIONS ──
  let annualSlippage = 0, annualIdleWaste = 0, totalInsurance = 0, afterHoursCost = 0, annualWear = 0, annualFraud = 0;
  const segResults = _fpSegments.map(seg => {"""

NEW_REPORT = """  const _reportSegments = _fpSegments.filter(seg => seg.selected !== false);
  const totalUnits = _reportSegments.reduce((s, seg) => s + (seg.qty || 0), 0);
  const fmt = n => '$' + Math.round(n).toLocaleString('en-AU');

  // ── PER-SEGMENT CALCULATIONS (only selected segments) ──
  let annualSlippage = 0, annualIdleWaste = 0, totalInsurance = 0, afterHoursCost = 0, annualWear = 0, annualFraud = 0;
  const segResults = _reportSegments.map(seg => {"""

if OLD_REPORT in t:
    t = t.replace(OLD_REPORT, NEW_REPORT); changed = True; status("Report generation uses selected segments only")
elif NEW_REPORT in t:
    status("Report segment filter already applied (skipping)")

# ── Previous fixes (remove form fields, all idempotent) ──
OLD_FORM = """        <div><label class="form-label">Approx. Fleet Size</label><input id="pm_fleet" class="form-input" type="number" placeholder="10"></div>
        <div><label class="form-label">Trackers Wanted</label><input id="pm_trackers" class="form-input" type="number" placeholder="e.g. 8"></div>"""
NEW_FORM = """        <input type="hidden" id="pm_fleet" value="0">
        <input type="hidden" id="pm_trackers" value="0">"""
if OLD_FORM in t: t = t.replace(OLD_FORM, NEW_FORM); changed = True; status("Removed fleet/trackers from prospect form")
elif NEW_FORM in t: status("Prospect form already cleaned (skipping)")

# Remove old 5-col or 3-col detail grids from segment cards
OLD_5COL = """      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:4px">
        <div><label style="font-size:7px;color:#888;text-transform:uppercase;display:block;margin-bottom:1px">KM/Wk</label>"""
OLD_3COL = """      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
        <div><label style="font-size:7px;color:#888;text-transform:uppercase;display:block;margin-bottom:1px">L/100km</label>"""
# These are already removed in our local copy but handle remote

# T&C, toast, popup fixes (all idempotent)
OLD_PROP = """<strong>6. Cancellation:</strong> Either party may terminate with 30 days written notice after the minimum term. Early termination fees may apply."""
NEW_PROP = """<strong>6. Cancellation &amp; 30-Day Notice:</strong> Either party may cancel the subscription by providing a minimum of 30 days written notice. This notice period applies after the minimum term and during any month-to-month renewal period. Cancellation requests must be submitted in writing via email to support@tracknow.com.au. The subscription remains active and billable until the end of the 30-day notice period. Early termination during the initial contract term will incur an early exit fee equal to the remaining monthly fees for the balance of the term."""
if OLD_PROP in t: t = t.replace(OLD_PROP, NEW_PROP); changed = True; status("Updated proposal cancellation clause")
elif NEW_PROP in t: status("Proposal cancellation already updated (skipping)")

OLD_AGR = """<strong>Termination:</strong> Either party may terminate this agreement with 30 days written notice after the minimum term. Early termination during the initial term will incur an early exit fee equal to the remaining monthly fees for the balance of the term. Upon termination, all GPS devices must be made available for collection within 14 days."""
NEW_AGR = """<strong>Cancellation &amp; 30-Day Notice:</strong> Either party may cancel the subscription by providing a minimum of 30 days written notice. This notice period applies after the minimum contract term and during any month-to-month renewal period. Cancellation requests must be submitted in writing via email to support@tracknow.com.au. The subscription remains active and all fees remain billable until the end of the 30-day notice period. Early termination during the initial contract term will incur an early exit fee equal to the remaining monthly fees for the balance of the term. Upon cancellation, all GPS devices remain the property of TrackNow GPS and must be made available for collection within 14 days."""
if OLD_AGR in t: t = t.replace(OLD_AGR, NEW_AGR); changed = True; status("Updated agreement cancellation clause")
elif NEW_AGR in t: status("Agreement cancellation already updated (skipping)")

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
if OLD_TOAST in t: t = t.replace(OLD_TOAST, NEW_TOAST); changed = True; status("Generate warning toast applied")
elif NEW_TOAST in t: status("Generate warning toast already applied (skipping)")

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
if OLD_POPUP in t: t = t.replace(OLD_POPUP, NEW_POPUP); changed = True; status("Popup blocker fix applied")
elif NEW_POPUP in t: status("Popup blocker fix already applied (skipping)")
if OLD_CLOSE in t: t = t.replace(OLD_CLOSE, NEW_CLOSE); changed = True; status("Blob link click fix applied")
elif NEW_CLOSE in t: status("Blob link click fix already applied (skipping)")

if changed:
    open(f, "w").write(t)
    status("Saved index.html")

ok, out = run("git status --porcelain")
if out.strip():
    ok, _ = run("git add -A")
    status("Staged all changes", ok)
    MSG = "feature: fleet segment checkboxes — select which assets to include in slippage calc and report"
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
        print(f"\n  {R}{B}❌  DEPLOY FAILED{X}"); print(f"  {R}{out}{X}\n"); sys.exit(1)
else:
    print(f"\n  {D}No changes to commit — already up to date.{X}\n")
