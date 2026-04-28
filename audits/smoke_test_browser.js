/* TrackNow smoke test — Tier 2 (browser-side).
 *
 * Run:
 *   1. Open https://sandbox-tracknow.onrender.com (or https://tracknow-portal.onrender.com)
 *      and log in.
 *   2. Open DevTools → Console.
 *   3. If Chrome blocks paste, type "allow pasting" + Enter first.
 *   4. Paste this entire file as one block.
 *
 * Output: a tagged report of which tabs render, whether charts initialised,
 * any console errors during navigation, and whether key buttons exist.
 */
(async function tnBrowserSmoke() {
  const out = (status, label, detail = '') => {
    const colour = status === 'pass' ? '#00CC66' : status === 'warn' ? '#d97706' : '#FF4444';
    const icon   = status === 'pass' ? '✓'        : status === 'warn' ? '⚠'        : '✗';
    console.log(`%c${icon} %c${label.padEnd(28)} %c${detail}`,
      `color:${colour};font-weight:bold`, 'color:#0098d4;font-weight:600', 'color:#888');
  };
  const summary = { pass: 0, warn: 0, fail: 0 };
  const tally = (status, label, detail) => { summary[status]++; out(status, label, detail); };

  console.log('%c\nTrackNow browser smoke test', 'color:#0098d4;font-size:14px;font-weight:800');
  console.log(`%c${location.host} · ${new Date().toLocaleString('en-AU')}`, 'color:#888');
  console.log('%c' + '─'.repeat(60), 'color:#888');

  // 1. Hostname-guarded sandbox banner present?
  const banner = document.querySelector('[id*="sandboxBanner"], [class*="sandbox-banner"]');
  if (location.hostname.startsWith('sandbox-')) {
    if (banner && banner.offsetHeight > 0) tally('pass', 'Sandbox banner', 'visible at top');
    else tally('warn', 'Sandbox banner', 'not found — confirm you are NOT mistaking this for live');
  } else {
    tally('pass', 'Hostname check', 'live host (no sandbox banner expected)');
  }

  // 2. Does the user have an active session?
  let auth = null;
  try {
    const r = await fetch('/api/me', { credentials: 'include' });
    auth = r.ok ? await r.json() : null;
  } catch (e) {}
  if (auth && auth.email) tally('pass', 'Session', `logged in as ${auth.email}`);
  else { tally('fail', 'Session', 'not logged in — log in then re-run'); return summary; }

  // 3. /api/data round-trip
  let store = null;
  try {
    const r = await fetch('/api/data?v=0', { credentials: 'include' });
    store = r.ok ? await r.json() : null;
  } catch (e) {}
  if (store && (store.leads || store.prospects || store.customers)) {
    tally('pass', 'Data round-trip',
      `leads=${store.leads?.length||0} prospects=${store.prospects?.length||0} customers=${store.customers?.length||0} v${store.version||'?'} pricing=${!!store.pricing}`);
  } else {
    tally('fail', 'Data round-trip', 'GET /api/data returned no usable payload');
  }

  // 4. Walk every main tab — confirm it renders + chart canvases get a 2D context
  const tabs = [
    { id: 'page-dashboard',  nav: 'dashboard',  must: ['#chartMonthly', '#dashTopKpis'] },
    { id: 'page-pipeline',   nav: 'pipeline',   must: ['.stage-col', '.stage-label'] },
    { id: 'page-scraper',    nav: 'scraper',    must: ['#prospectsTable', '#custTabBtn-prospects'] },
    { id: 'page-analytics',  nav: 'analytics',  must: ['.kpi-grid'] },
    { id: 'page-marketing',  nav: 'marketing',  must: ['#mktSection-overview', '#chartMktActivity'] },
    { id: 'page-tools',      nav: 'tools',      must: [] },
    { id: 'page-revenue',    nav: 'revenue',    must: ['#hwPriceTable'] },
    { id: 'page-resources',  nav: 'resources',  must: [] },
  ];
  const consoleErrors = [];
  const origErr = console.error;
  console.error = function () { consoleErrors.push(Array.from(arguments).join(' ')); origErr.apply(console, arguments); };

  const showPage = window.showPage;
  if (typeof showPage !== 'function') {
    tally('fail', 'Tab navigation', 'showPage() not defined globally');
    console.error = origErr;
    return summary;
  }
  for (const t of tabs) {
    try {
      showPage(t.nav);
      await new Promise(r => setTimeout(r, 250)); // allow render
      const page = document.getElementById(t.id);
      if (!page) { tally('fail', `Tab ${t.nav}`, `#${t.id} not found`); continue; }
      const visible = page.style.display !== 'none' && page.offsetHeight > 50;
      if (!visible) { tally('fail', `Tab ${t.nav}`, 'page-element hidden after showPage()'); continue; }
      const missing = t.must.filter(sel => !page.querySelector(sel));
      if (missing.length) tally('warn', `Tab ${t.nav}`, `missing: ${missing.join(' ')}`);
      else tally('pass', `Tab ${t.nav}`, `rendered · ${t.must.length} key elements present`);
    } catch (e) {
      tally('fail', `Tab ${t.nav}`, `threw: ${e.message}`);
    }
  }

  // 5. Chart instances — Chart.js attaches them to `__chart` on the canvas in newer versions
  const chartChecks = [
    { canvas: 'chartMonthly',     label: 'Monthly Prospects chart' },
    { canvas: 'chartMktActivity', label: 'Marketing Activity chart' },
  ];
  for (const c of chartChecks) {
    const el = document.getElementById(c.canvas);
    if (!el) { tally('warn', c.label, `canvas #${c.canvas} not in DOM`); continue; }
    // chart.js stores instance on Chart.getChart(canvas) — guard if not loaded
    const inst = window.Chart && Chart.getChart ? Chart.getChart(el) : null;
    if (inst) tally('pass', c.label, `chart instance live · datasets=${inst.data.datasets.length}`);
    else tally('warn', c.label, 'no Chart instance attached (may not have rendered yet)');
  }

  // 6. Critical buttons exist
  const btnChecks = [
    { selector: '#btnNewProspect',      label: '+ New Prospect button' },
    { selector: '#btnImportCsv',        label: 'Import CSV button' },
    { selector: '#globalSearch',        label: 'Global search input' },
    { selector: '#callbackQueuePanel',  label: 'Callback queue panel (hidden until needed)' },
  ];
  for (const b of btnChecks) {
    const el = document.querySelector(b.selector);
    if (el) tally('pass', b.label, 'present in DOM');
    else tally('warn', b.label, `not found: ${b.selector}`);
  }

  // 7. _playCashRegister() exists (cha-ching synth)
  if (typeof window._playCashRegister === 'function') tally('pass', 'Cha-ching synth', 'function defined');
  else tally('fail', 'Cha-ching synth', '_playCashRegister not defined');

  // 8. Pricing persistence visible to the runtime
  const hasPricing = Array.isArray(window.OPTIONAL_EXTRAS) && Object.keys(window.HW_PRICES || {}).length > 0;
  if (hasPricing) tally('pass', 'Pricing globals', `HW_PRICES=${Object.keys(window.HW_PRICES).length} · extras=${window.OPTIONAL_EXTRAS.length}`);
  else tally('warn', 'Pricing globals', 'HW_PRICES / OPTIONAL_EXTRAS not on window — variable scope check');

  // 9. Customer-action links — proposal accept, agreement sign, fleet/agreement
  // callback. These are the URLs the email builder embeds in outgoing emails;
  // if they break, customers click an Accept/Sign link in their inbox and land
  // on a 404 even though everything looks fine on the admin side. Two checks:
  //   (a) source-scan — fail outright if the dead 'tracknow-portal-sync' host
  //       has crept back into the bundled index.html via a regression
  //       (e.g. a sandbox→live promote that stomped a previous fix).
  //   (b) live-fetch — build the four URLs the way the email code does and
  //       GET them; the signing/accept/callback landing pages are query-string
  //       routes into index.html itself, so they always 200 on the same origin
  //       when wired correctly.
  try {
    const indexSrc = await (await fetch('/index.html', { credentials: 'include' })).text();
    const deadHosts = ['tracknow-portal-sync.onrender.com'];
    const hits = deadHosts.filter(h => indexSrc.includes(h));
    if (hits.length === 0) tally('pass', 'No dead host refs', 'index.html clean of retired services');
    else tally('fail', 'Dead host refs', `regression — found: ${hits.join(', ')}`);
  } catch (e) {
    tally('warn', 'Dead host scan', 'could not fetch /index.html — ' + (e && e.message || e));
  }

  const customerLinks = [
    { label: 'Proposal accept link',     path: '/?proposal_accept=1&name=Smoke&company=Test&proposal=TN-9999' },
    { label: 'Agreement sign link',      path: '/?agreement_sign=1&name=Smoke&company=Test&agreement=TN-AGR-9999' },
    { label: 'Callback (fleet report)',  path: '/?callback=1&source=fleet_report&name=Smoke&company=Test' },
    { label: 'Callback (agreement)',     path: '/?callback=1&source=agreement&name=Smoke&company=Test' },
  ];
  for (const link of customerLinks) {
    const url = window.location.origin + link.path;
    try {
      const r = await fetch(url, { method: 'GET', credentials: 'omit', redirect: 'follow' });
      if (r.ok) tally('pass', link.label, `${r.status} · ${link.path}`);
      else tally('fail', link.label, `${r.status} on ${url}`);
    } catch (e) {
      tally('fail', link.label, 'fetch threw — ' + (e && e.message || e));
    }
  }

  // 10. Console error count during the test
  console.error = origErr;
  if (consoleErrors.length === 0) tally('pass', 'Console errors', '0 during tab walk');
  else tally('warn', 'Console errors', `${consoleErrors.length} captured (see Console)`);

  // Summary
  console.log('%c' + '─'.repeat(60), 'color:#888');
  const final = summary.fail ? '✗ FAIL' : summary.warn ? '⚠ WARN' : '✓ PASS';
  const finalColour = summary.fail ? '#FF4444' : summary.warn ? '#d97706' : '#00CC66';
  console.log(`%c${final}%c · ${summary.pass} pass · ${summary.warn} warn · ${summary.fail} fail`,
    `color:${finalColour};font-size:14px;font-weight:800`, 'color:#888');
  return summary;
})();
