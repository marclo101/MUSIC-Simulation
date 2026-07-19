/*
 * Headless regression smoke test for MUSIC_electrode_balance_V10.html.
 *
 * Loads the real page in Chromium and exercises the solver + the two
 * 1st-cycle features, plus a broad health check (Plotly, simulation, export,
 * library). Pure read/exercise — it does not modify the app.
 *
 * Setup (one-time):  npm install  &&  npx playwright install chromium
 * Run:               npm test
 */
const { chromium } = require("playwright");
const path = require("path");

const APP = "file://" + path.resolve(__dirname, "..", "MUSIC_electrode_balance_V10.html");
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
const checks = [];
const check = (name, pass, detail = "") => { checks.push({ name, pass, detail }); };

(async () => {
  let browser;
  try {
    // CHROMIUM_PATH: optional override for environments with a pre-installed
    // browser that doesn't match Playwright's pinned revision.
    browser = await chromium.launch(
      process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  } catch (e) {
    console.error("Could not launch Chromium. Run: npx playwright install chromium\n" + e.message);
    process.exit(2);
  }
  const page = await browser.newPage();
  const jsErrors = [];
  page.on("pageerror", e => jsErrors.push("PAGEERROR: " + e.message.split("\n")[0]));
  page.on("console", m => {
    if (m.type() !== "error") return;
    const t = m.text();
    // The Google-Fonts CDN cert failure is an expected offline/sandbox artifact.
    if (/ERR_CERT|fonts\.googleapis|net::ERR/.test(t)) return;
    jsErrors.push("CONSOLE.ERROR: " + t.slice(0, 160));
  });

  await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 90000 });
  // Production ships with DEV_DEFAULTS_ON=false (empty form, no lastR), so the
  // test loads the known dev scenario explicitly via the force parameter.
  await page.waitForFunction(() => typeof applyDevDefaults === "function", { timeout: 30000 });
  await page.evaluate(() => applyDevDefaults(true));
  await page.waitForFunction(() => typeof window.lastR !== "undefined", { timeout: 30000 });

  // ── Feature 1: "Different 1st cycle" target (and the salt-mode N/P symmetry fix) ──
  const A = await page.evaluate(() => {
    const R = () => ({ r1: window.lastR.r1, rN: window.lastR.rN, mode: window.lastMode });
    if (!saltOn) tgSalt();
    document.getElementById("cat-s-c1").value = "300";
    document.getElementById("np-target").value = "1.2"; onNpTargetChange();
    const off = R();                                   // toggle off → r1 == rN == 1.2 (fix)
    if (!np1stOn) toggleNp1st();
    document.getElementById("np-target-1st").value = "1.0"; onNp1stChange();
    const on = R();                                    // 1st=1.0, Nth=1.2
    return { off, on, wrap: getComputedStyle(document.getElementById("np-target-1st-wrap")).display };
  });
  check("salt-mode N/P symmetric (toggle off, target 1.2 → r1=rN=1.2)", near(A.off.r1, 1.2) && near(A.off.rN, 1.2), JSON.stringify(A.off));
  check("distinct 1st-cycle target (1st=1.0, Nth=1.2 → r1=1.0, rN=1.2)", near(A.on.r1, 1.0) && near(A.on.rN, 1.2), JSON.stringify(A.on));
  check("1st-cycle input revealed by toggle", A.wrap !== "none");

  // ── Feature 2: OCV-derived C1 for capacitive / pseudocapacitive electrodes ──
  const B = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    c1Manual.cat = false; c1Derived.cat = false;
    g("cat-ac-st").value = "capacitive";
    g("cat-ac-ocv").value = "3"; g("cat-ac-cN").value = "50";
    g("cat-Vth-hi").value = "4.2"; g("cat-Vth-lo").value = "2.0"; g("cat-Vop-hi").value = "4.2";
    g("cat-ac-c1").value = ""; deriveCapC1("cat");
    const d3 = g("cat-ac-c1").value;
    g("cat-ac-ocv").value = "3.5"; scaleVW("cat");
    const d35 = g("cat-ac-c1").value;
    g("cat-ac-c1").value = "99"; onCapManual("cat-ac", "c1"); deriveCapC1("cat");
    return { d3, d35, locked: g("cat-ac-c1").value };
  });
  check("C1 derived from OCV=3 → 27.3", near(parseFloat(B.d3), 27.3), "got " + B.d3);
  check("C1 re-derived on OCV edit 3→3.5 → 15.9", near(parseFloat(B.d35), 15.9), "got " + B.d35);
  check("hand-typed C1 not overridden by derivation", B.locked === "99", "got " + B.locked);

  // ── Feature 2b: derived C1 follows the "Start in cell" (formation) direction ──
  const C = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    c1Manual.cat = false; c1Derived.cat = false;
    g("cat-ac-st").value = "capacitive";
    g("cat-ac-ocv").value = "3"; g("cat-ac-cN").value = "50";
    g("cat-Vth-hi").value = "4.2"; g("cat-Vth-lo").value = "2.0";
    g("cat-Vop-hi").value = "4.2"; g("cat-Vop-lo").value = "2.0";
    g("cat-ac-c1").value = "";
    setStartDir("charge"); deriveCapC1("cat"); const chg = g("cat-ac-c1").value;   // (4.2-3)/2.2 * 50
    setStartDir("discharge"); const dis = g("cat-ac-c1").value;                    // (3-2)/2.2 * 50, re-derived
    setStartDir("charge");
    return { chg, dis };
  });
  check("C1 follows start dir (charge→27.3, discharge→22.7)", near(parseFloat(C.chg), 27.3) && near(parseFloat(C.dis), 22.7), JSON.stringify(C));

  // ── Broad health check ──
  const H = await page.evaluate(() => {
    const r = {};
    r.plotly = typeof Plotly !== "undefined";
    try { r.sim = !!(simComputeSeries() || {}).ok; } catch (e) { r.sim = "THREW:" + e.message; }
    try { renderSimPlot(); r.simRender = true; } catch (e) { r.simRender = "THREW:" + e.message; }
    try { const t = buildTXT(gatherExportData(), { summary:1,materials:1,masses:1,composition:1,ratios:1,loadings:1,rates:1,currents:1 }); r.txt = t.length; } catch (e) { r.txt = "THREW:" + e.message; }
    try { r.lib = lib.ac.length + lib.anode.length + lib.saltNa.length + lib.saltLi.length; renderLT(); } catch (e) { r.lib = "THREW:" + e.message; }
    return r;
  });
  check("Plotly bundle loaded locally", H.plotly === true);
  check("simulation computes", H.sim === true, String(H.sim));
  check("simulation plot renders", H.simRender === true, String(H.simRender));
  check("TXT export builds", typeof H.txt === "number" && H.txt > 200, String(H.txt));
  check("library loaded + renders", typeof H.lib === "number" && H.lib > 0, String(H.lib));

  // ── Faradaic health check: plateau editor → staircase GCD on the real page ──
  const F = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    g("cat-ac-st").value = "faradaic"; onStorageTypeChange("cat");
    g("cat-Vth-hi").value = "4.2"; g("cat-Vth-lo").value = "2.5"; g("cat-ac-ocv").value = "3.0";
    g("cat-ac-c1").value = "55"; g("cat-ac-cN").value = "50";
    g("cat-fp-v").value = "3.45"; g("cat-fp-p").value = "90"; onFpEdit("cat");
    recalc();
    const out = { editorShown: g("cat-fp-wrap").style.display !== "none" };
    const s = simComputeSeries();
    out.ok = s.ok === true; out.msg = s.msg || "";
    out.plateau = s.ok && s.catSegs.some(x => x.kind === "plateau" && x.counts === true &&
                                              Math.abs(x.V_start - 3.45) < 1e-6);
    try { renderSimPlot(); out.render = true; } catch (e) { out.render = "THREW:" + e.message; }
    return out;
  });
  check("faradaic: plateau editor shown for faradaic storage", F.editorShown === true);
  check("faradaic: cathode simulates through the opened gate", F.ok === true, F.msg);
  check("faradaic: staircase carries reversible plateau at 3.45 V", F.plateau === true);
  check("faradaic: plot renders", F.render === true, String(F.render));

  check("no uncaught JS errors", jsErrors.length === 0, jsErrors.join(" | "));

  await browser.close();

  let failed = 0;
  for (const c of checks) {
    console.log((c.pass ? "  PASS  " : "  FAIL  ") + c.name + (c.pass ? "" : "  →  " + c.detail));
    if (!c.pass) failed++;
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("FATAL:", e.message); process.exit(2); });
