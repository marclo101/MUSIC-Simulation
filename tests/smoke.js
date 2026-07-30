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

  // ── Clean-boot contract: nothing is filled in for the user ──
  await page.waitForFunction(() => typeof recalcNow === "function", { timeout: 30000 });
  const BOOT = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const v = id => (g(id) ? g(id).value : "<missing>");
    return {
      presets: [v("cat-ac-ps"), v("an-ps"), v("cat-s-ps")],
      caps: [v("cat-ac-c1"), v("cat-ac-cN"), v("an-c1"), v("an-cN")],
      masses: [v("cat-mass"), v("cat-ld"), v("an-mass"), v("an-ld")],
      names: [v("cat-ac-name"), v("an-name")],
      idFieldsGone: !g("cat-label") && !g("an-label"),
      devDefaultsGone: typeof window.applyDevDefaults === "undefined",
      toasts: document.querySelectorAll("#tH .tst").length,
      resultsHidden: g("resPanel").style.display === "none",
    };
  });
  check("boot: material presets default to Custom", BOOT.presets.every(x => x === ""), JSON.stringify(BOOT.presets));
  check("boot: no capacities pre-filled", BOOT.caps.every(x => x === ""), JSON.stringify(BOOT.caps));
  check("boot: no masses/loadings pre-filled", BOOT.masses.every(x => x === ""), JSON.stringify(BOOT.masses));
  check("boot: no material names pre-filled", BOOT.names.every(x => x === ""), JSON.stringify(BOOT.names));
  check("boot: ID/Identity fields removed", BOOT.idFieldsGone === true);
  check("boot: dev-defaults prefill removed from the app", BOOT.devDefaultsGone === true);
  check("boot: no toast on load", BOOT.toasts === 0, "toasts=" + BOOT.toasts);
  check("boot: results panel hidden until Calculate", BOOT.resultsHidden === true);

  // The app ships an empty form — materials are always chosen by the user — so
  // the suite seeds its own known scenario here rather than relying on any
  // prefill baked into the product.
  await page.waitForFunction(() => typeof recalcNow === "function", { timeout: 30000 });
  await page.evaluate(() => {
    const g = id => document.getElementById(id);
    // Cathode: activated carbon (YP50), EDLC.
    g("cat-ac-name").value = "Activated carbon (YP50)";
    g("cat-ac-st").value = "capacitive";
    g("cat-ac-ocv").value = "3"; g("cat-ac-ref").value = "Na/Na+";
    g("cat-Vop-hi").value = "4.2"; g("cat-Vop-lo").value = "2";
    g("cat-ac-c1").value = "25"; g("cat-ac-cN").value = "50";
    setRateValue("cat-ac", "c1", 100, "mA/g", "100 mA/g");
    setRateValue("cat-ac", "cN", 100, "mA/g", "100 mA/g");
    // Anode: PAN Vapo 6h - MAA, EDLC.
    g("an-name").value = "PAN Vapo 6h - MAA";
    g("an-st").value = "capacitive";
    g("an-ocv").value = "3"; g("an-ref").value = "Na/Na+";
    g("an-Vop-hi").value = "2"; g("an-Vop-lo").value = "0.05";
    g("an-c1").value = "200"; g("an-cN").value = "100";
    setRateValue("an", "c1", 0.02, "A/g", "0.02 A/g");
    setRateValue("an", "cN", 0.02, "A/g", "0.02 A/g");
    // Anode pinned by loading: 1 mg/cm² over 1 cm² (⌀11.28 mm).
    sMM("an", "l", document.querySelector("#an-mmb .mmb:nth-child(2)"));
    g("an-ld").value = "1"; g("an-ar").value = "1"; g("an-dia").value = "11.28";
    updateFpVisibility("cat"); updateFpVisibility("an");
    recalcNow();
  });
  await page.waitForFunction(() => typeof window.lastR !== "undefined", { timeout: 30000 });

  // ── Feature 1: "Different 1st cycle" target (and the salt-mode N/P symmetry fix) ──
  const A = await page.evaluate(() => {
    const R = () => ({ r1: window.lastR.r1, rN: window.lastR.rN, mode: window.lastMode });
    if (!saltOn) tgSalt();
    document.getElementById("cat-s-c1").value = "300";
    document.getElementById("np-target").value = "1.2"; onNpTargetChange();
    recalcNow();                                       // manual-recalc mode: edits only mark stale
    const off = R();                                   // toggle off → r1 == rN == 1.2 (fix)
    if (!np1stOn) toggleNp1st();
    document.getElementById("np-target-1st").value = "1.0"; onNp1stChange();
    recalcNow();
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

  // ── Feature 2b: formation is always a charge — C1 uses the charge-first span ──
  const C = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    c1Manual.cat = false; c1Derived.cat = false;
    g("cat-ac-st").value = "capacitive";
    g("cat-ac-ocv").value = "3"; g("cat-ac-cN").value = "50";
    g("cat-Vth-hi").value = "4.2"; g("cat-Vth-lo").value = "2.0";
    g("cat-Vop-hi").value = "4.2"; g("cat-Vop-lo").value = "2.0";
    g("cat-ac-c1").value = "";
    deriveCapC1("cat");                                   // (4.2-3)/2.2 * 50 = 27.3
    return { chg: g("cat-ac-c1").value, dirCtrlGone: !g("startDirTg"), fixed: startDir };
  });
  check("C1 uses the charge-first formation span → 27.3", near(parseFloat(C.chg), 27.3), JSON.stringify(C));
  check("start-direction control removed; formation fixed to charge",
    C.dirCtrlGone === true && C.fixed === "charge", JSON.stringify(C));

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
    recalcNow();                                       // manual-recalc mode
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

  // ── Known / prepared cathode: fixed salt % → two candidate anode masses ──
  const K = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    if (!saltOn) tgSalt();
    if (np1stOn) toggleNp1st();
    g("cat-ac-st").value = "faradaic"; onStorageTypeChange("cat");
    g("an-st").value = "faradaic"; onStorageTypeChange("an");
    g("cat-ac-c1").value = "100"; g("cat-ac-cN").value = "100";
    g("an-c1").value = "200"; g("an-cN").value = "200";
    g("cat-s-c1").value = "300"; g("cat-s-cN").value = "";
    g("cat-wAM").value = "80"; g("cat-wC").value = "10"; g("cat-wB").value = "10";
    g("an-wAM").value = "90"; g("an-wC").value = "5"; g("an-wB").value = "5";
    g("cat-s-frac").value = "10";                       // known 10% salt → fixed split
    // Pin the cathode only, so the solver sizes the anode.
    mCatOverride = null; mAnOverride = null;
    sMM("cat", "d", document.querySelector("#cat-mmb .mmb"));
    sMM("an", "d", document.querySelector("#an-mmb .mmb"));
    g("an-mass").value = ""; g("an-ld").value = ""; g("cat-mass").value = "10";
    npTarget = 1.0; g("np-target").value = "1.00";
    recalcNow();
    const r = window.lastR || {};
    return { mode: window.lastMode, dual: r.dualAnode, nth: r.mAn, first: r.mAn1st, mAC: r.mAC, mS: r.mS };
  });
  check("known cathode (10% salt) → anode 3.89 mg (Nth) / 5.56 mg (1st)",
    K.mode === "anode" && K.dual === true && near(K.nth, 3.889, 0.01) && near(K.first, 5.556, 0.01) &&
    near(K.mAC, 7, 0.01) && near(K.mS, 1, 0.01), JSON.stringify(K));

  // ── View controls repaint immediately (no Recalculate needed) ──
  const V = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    recalcNow();                                        // start from a clean, non-stale solve
    const out = {};
    // 1st/Nth capacity bars
    const first = g("bar-chart").innerHTML;
    g("bTog").querySelector('button[data-p="Nth"]').click();
    const nth = g("bar-chart").innerHTML;
    out.barChanged = first !== nth;
    out.barStale = g("calcBtn").classList.contains("dirty");
    // Rate-table POV tabs
    const povBtns = g("cdTabBar").querySelectorAll(".norm-btn");
    const t0 = g("crate-table").innerHTML;
    povBtns[1].click();
    out.povChanged = g("crate-table").innerHTML !== t0;
    povBtns[0].click();
    // AM vs total loading — labels AND numbers must move together
    const ld0 = g("r-cld12").innerHTML;
    setShowTotalLoading(true);
    out.loadingChanged = g("r-cld12").innerHTML !== ld0;
    out.loadingLabel = g("r-cld12-lbl").textContent.includes("Total");
    setShowTotalLoading(false);
    out.anyStale = g("calcBtn").classList.contains("dirty");
    return out;
  });
  check("view control: 1st/Nth bar toggle repaints instantly", V.barChanged === true && V.barStale === false, JSON.stringify(V));
  check("view control: rate-table POV tabs repaint instantly", V.povChanged === true, JSON.stringify(V));
  check("view control: total-loading updates labels and numbers together",
    V.loadingChanged === true && V.loadingLabel === true, JSON.stringify(V));
  check("view controls never mark results stale", V.anyStale === false, JSON.stringify(V));

  // ── Cell Parameters: the design point drives the simulation currents ──
  const CP = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const out = {};
    out.aboveCards = !!(g("np-target").compareDocumentPosition(document.querySelector(".egrid")) &
                        Node.DOCUMENT_POSITION_FOLLOWING);   // N/P precedes the electrode cards
    clearSimRateSel();                                       // no manual override
    recalcNow();
    const Qcell = Math.min(window.lastR.QaN, window.lastR.QcN);
    g("cell-rate-nth").value = "0.5"; g("cell-rate-1st").value = "0.05";
    onCellRateChange();
    out.eq1 = g("cell-rate-1st-eq").textContent;             // "= C/20"
    out.eqN = g("cell-rate-nth-eq").textContent;             // "= C/2"
    out.iNth = cellRateCurrent("Nth"); out.expectNth = 0.5 * Qcell;
    out.i1st = cellRateCurrent("1st"); out.expect1st = 0.05 * Qcell;
    out.status = g("simRateNTxt").textContent;               // must name its source
    // Manual row pick must still win over the design rate.
    pickSimRate("crate", "1C", 12345);
    out.manualWins = (simRateSel[simAssignMode] || {}).I_uA === 12345;
    clearSimRateSel();
    g("cell-rate-1st").value = "0.1"; g("cell-rate-nth").value = "0.1"; onCellRateChange();
    return out;
  });
  check("Cell Parameters sits above the electrode cards", CP.aboveCards === true);
  check("design C-rates show readable equivalents (C/20, C/2)",
    CP.eq1 === "= C/20" && CP.eqN === "= C/2", CP.eq1 + " / " + CP.eqN);
  check("design rate sets the simulation current (0.5C, 0.05C of Q_cell)",
    near(CP.iNth, CP.expectNth, 0.01) && near(CP.i1st, CP.expect1st, 0.01), JSON.stringify(CP));
  check("sim status names Cell Parameters as the current source",
    /Cell parameters/i.test(CP.status), CP.status);
  check("an explicit Rates-tab pick still overrides the design rate", CP.manualWins === true);

  // ── One N/P mechanism: hero ratios are read-only, deviations share one basis ──
  const NP = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const out = {};
    out.editorGone = typeof window.onRatioEditClick === "undefined" &&
                     typeof window.applyRatioOverride === "undefined" &&
                     typeof window.ratioOverride === "undefined";
    out.msgBoxGone = !g("r-edit-msg");
    out.noClickHandler = !g("r-r1pct").getAttribute("onclick") && !g("r-rNpct").getAttribute("onclick");
    // Deviation basis: with target 1.20 the rGrid "vs target" column must agree
    // with the solver's own o1/oN rather than measuring against 1.00.
    g("np-target").value = "1.20"; onNpTargetChange(); recalcNow();
    out.header = g("rGrid").textContent.includes("vs target");
    const r = window.lastR;
    out.oNAgainstTarget = Math.abs(r.oN - (r.rN - 1.2) * 100) < 1e-6;
    g("np-target").value = "1.00"; onNpTargetChange(); recalcNow();
    return out;
  });
  check("ratio-override editor removed entirely", NP.editorGone === true && NP.msgBoxGone === true, JSON.stringify(NP));
  check("hero N/P values are read-only", NP.noClickHandler === true);
  check("diagnostics table measures against the target, not 1.00",
    NP.header === true && NP.oNAgainstTarget === true, JSON.stringify(NP));

  // ── Geometry is not guessed for the user ──
  const G = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const out = {};
    // A fresh reset must leave every mass/geometry field empty.
    resetAll({ silent: true });
    out.empty = ["cat-mass","cat-ld","an-mass","an-ld","cat-ar","an-ar","cat-dia","an-dia"]
      .map(id => g(id).value).every(v => v === "");
    out.placeholders = !!g("cat-ar").placeholder && !!g("cat-dia").placeholder;
    // Loading typed but no area → not pinned, and the hint appears.
    sMM("an", "l", document.querySelector("#an-mmb .mmb:nth-child(2)"));
    g("an-ld").value = "1"; g("an-ar").value = "";
    recalc();                                   // as a keystroke would
    out.notPinned = detectMode() !== "cathode";
    out.massNull = getEM("an") === null;
    out.hint = !!document.querySelector("#an-ml .ld-area-hint");
    g("an-ar").value = "1"; recalc();
    out.pinnedWithArea = detectMode() === "cathode";
    out.hintGone = !document.querySelector("#an-ml .ld-area-hint");
    return out;
  });
  check("boot/reset leaves mass and geometry fields empty", G.empty === true && G.placeholders === true, JSON.stringify(G));
  check("loading without an area is not treated as a pinned mass",
    G.notPinned === true && G.massNull === true, JSON.stringify(G));
  check("loading without an area explains what is missing", G.hint === true);
  check("supplying the area pins the electrode and clears the hint",
    G.pinnedWithArea === true && G.hintGone === true, JSON.stringify(G));

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
