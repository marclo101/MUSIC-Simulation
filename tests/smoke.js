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
    out.eq1 = g("cell-rate-1st-eq").textContent;             // "= C/20 · 20 h per charge or discharge"
    out.eqN = g("cell-rate-nth-eq").textContent;             // "= C/2 · 2 h per charge or discharge"
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
  check("design C-rates show the C-rate and the equivalent cycle time",
    /C\/20/.test(CP.eq1) && /20 h per charge or discharge/.test(CP.eq1) &&
    /C\/2\b/.test(CP.eqN) && /2 h per charge or discharge/.test(CP.eqN), CP.eq1 + "  /  " + CP.eqN);
  check("design rate sets the simulation current (0.5C, 0.05C of Q_cell)",
    near(CP.iNth, CP.expectNth, 0.01) && near(CP.i1st, CP.expect1st, 0.01), JSON.stringify(CP));
  check("sim status names Cell Parameters as the current source",
    /Cell parameters/i.test(CP.status), CP.status);
  check("an explicit Rates-tab pick still overrides the design rate", CP.manualWins === true);

  // ── The C x n and C/n boxes are one number written two ways ──
  const RC = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const out = {};
    // typing a multiplier fills the divisor
    g("cell-rate-nth").value = "0.25"; onCellRateChange();
    out.multToDiv = g("cell-rate-nth-div").value;        // 4
    out.eqA = g("cell-rate-nth-eq").textContent;
    // typing a divisor fills the multiplier
    g("cell-rate-nth-div").value = "20"; onCellRateDiv("nth");
    out.divToMult = g("cell-rate-nth").value;            // 0.05
    out.state = cellRateNth;                             // 0.05
    out.eqB = g("cell-rate-nth-eq").textContent;
    // a half-typed divisor must not corrupt the state
    g("cell-rate-nth-div").value = ""; onCellRateDiv("nth");
    out.blankKeeps = cellRateNth;                        // still 0.05
    // reset restores both boxes
    g("cell-rate-nth-div").value = "10"; onCellRateDiv("nth");
    g("cell-rate-1st").value = "0.1"; onCellRateChange();
    out.bothReset = [g("cell-rate-1st").value, g("cell-rate-1st-div").value,
                     g("cell-rate-nth").value, g("cell-rate-nth-div").value];
    return out;
  });
  check("editing C x n fills the C/n box (0.25C → C/4)", RC.multToDiv === "4", RC.multToDiv);
  check("editing C/n fills the C x n box (C/20 → 0.05C)",
    RC.divToMult === "0.05" && near(RC.state, 0.05, 1e-9), JSON.stringify(RC));
  check("a half-typed divisor does not corrupt the rate", near(RC.blankKeeps, 0.05, 1e-9), String(RC.blankKeeps));
  check("the cycle-time readout follows both boxes",
    /4 h per charge or discharge/.test(RC.eqA) && /20 h per charge or discharge/.test(RC.eqB),
    RC.eqA + "  |  " + RC.eqB);
  check("both boxes agree after editing back to C/10",
    RC.bothReset.join(",") === "0.1,10,0.1,10", RC.bothReset.join(","));

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

  // ── Linear flow: section order, numbering, and a single open drawer ──
  const FL = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const pos = sel => Array.from(document.querySelectorAll(".sec")).findIndex(s => s.matches(sel));
    const tabs = Array.from(document.querySelectorAll(".rtab-btn")).map(b => b.textContent.trim());
    return {
      // material is asked for before composition on both electrodes
      catOrder: pos('[data-step="cat-am"]') < pos('[data-step="cat-comp"]'),
      anOrder: pos('[data-step="an-am"]') < pos('[data-step="an-comp"]'),
      tabs,
      emptyMsgHelpful: (typeof chk === "function"),
    };
  });
  check("cathode asks for the material before its composition", FL.catOrder === true);
  check("anode asks for the material before its composition", FL.anOrder === true);
  check("results tabs run Balance → Diagnostics → Rates → Simulation",
    FL.tabs[0] === "Balance" && FL.tabs[1] === "Diagnostics" && /Rates/.test(FL.tabs[2]) && /Simulation/.test(FL.tabs[3]),
    JSON.stringify(FL.tabs));

  // Empty-state copy should tell the user what to do, not just name a field.
  const EM = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const saved = g("cat-ac-cN").value;
    g("cat-ac-cN").value = ""; recalcNow();
    const msg = g("r-mc").textContent;
    const stale = g("calcBtn").classList.contains("dirty");
    g("cat-ac-cN").value = saved; recalcNow();
    return { msg, stale };
  });
  check("missing input explains the next action", /Pick a cathode material/i.test(EM.msg), EM.msg);
  check("missing input does not also claim results are stale", EM.stale === false);

  // ── Guided tour ──
  const T = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const out = {};
    out.stepCount = TOUR_STEPS.length;
    out.allHaveCopy = TOUR_STEPS.every(s => s.sec && s.h && s.b && s.b.length > 60);
    startTour();
    out.veilOn = g("tourVeil").classList.contains("on");
    out.popOn = g("tourPop").classList.contains("on");
    out.firstTitle = g("tourTitle").textContent;
    out.highlighted = document.querySelectorAll(".tour-hi").length;
    out.counter = g("tourCount").textContent;
    tourGo(1);
    out.secondTitle = g("tourTitle").textContent;
    out.advanced = out.secondTitle !== out.firstTitle;
    out.onlyOneHi = document.querySelectorAll(".tour-hi").length === 1;
    tourGo(-1);
    out.wentBack = g("tourTitle").textContent === out.firstTitle;
    endTour();
    out.cleanedUp = !g("tourVeil").classList.contains("on") &&
                    !g("tourPop").classList.contains("on") &&
                    document.querySelectorAll(".tour-hi").length === 0;
    out.flagSet = localStorage.getItem(TOUR_KEY) === "1";
    return out;
  });
  check("tour steps all carry a section and real copy", T.stepCount >= 14 && T.allHaveCopy === true, JSON.stringify({n:T.stepCount, ok:T.allHaveCopy}));
  check("tour opens with veil, popover and one highlight",
    T.veilOn === true && T.popOn === true && T.highlighted === 1, JSON.stringify(T));
  check("tour starts on the cell-design step", /Start with the cell/i.test(T.firstTitle), T.firstTitle);
  check("tour advances and steps back", T.advanced === true && T.wentBack === true && T.onlyOneHi === true, JSON.stringify(T));
  check("ending the tour removes all its chrome", T.cleanedUp === true);
  check("taking the tour records that it was seen", T.flagSet === true);

  // Welcome prompt: offered on every load, dismissible.
  const W = await page.evaluate(() => {
    maybeOfferTour();
    const offered = document.getElementById("tourWelcome").classList.contains("on");
    dismissTourWelcome();
    const dismissed = !document.getElementById("tourWelcome").classList.contains("on");
    maybeOfferTour();                                   // as a page refresh would
    const reoffered = document.getElementById("tourWelcome").classList.contains("on");
    dismissTourWelcome();
    return { offered, dismissed, reoffered };
  });
  check("the tour is offered on load", W.offered === true);
  check("dismissing hides it, and it is offered again next load",
    W.dismissed === true && W.reoffered === true, JSON.stringify(W));

  // ── Section-scoped highlighting: sub-steps keep the section lit ──
  const TS = await page.evaluate(() => {
    const out = {};
    startTour();
    const sec0 = document.querySelector(".tour-hi");
    out.firstIsCellCard = sec0 && sec0.classList.contains("cellp-card");
    const pos0 = document.getElementById("tourPop").style.top;
    tourGo(1);                                          // still Cell parameters
    out.sameSection = document.querySelector(".tour-hi") === sec0;
    out.popMoved = document.getElementById("tourPop").style.top !== pos0 ||
                   document.getElementById("tourPop").style.left !== "";
    out.oneHighlight = document.querySelectorAll(".tour-hi").length === 1;
    // the lit section sits above the click-blocking veil, so it stays usable
    const cs = getComputedStyle(sec0), veil = getComputedStyle(document.getElementById("tourVeil"));
    out.secAboveVeil = parseInt(cs.zIndex, 10) > parseInt(veil.zIndex, 10);
    // walking the whole tour must not throw and must land on the library step
    let guard = 0; const titles = [];
    while (guard++ < 40 && document.getElementById("tourPop").classList.contains("on")) {
      titles.push(document.getElementById("tourTitle").textContent);
      tourGo(1);
    }
    out.titles = titles;
    out.reachedLibrary = titles.some(t => /library/i.test(t));
    out.advancedStep = titles.some(t => /Advanced options/i.test(t));
    out.libRecollapsed = document.getElementById("lib").classList.contains("cld");
    out.advClosed = (() => { const b = document.querySelector('.sec[data-step="cat-am"] .btn.gho');
                             return !b || b.nextElementSibling.classList.contains("hid"); })();
    out.cleanedUp = document.querySelectorAll(".tour-hi").length === 0;
    return out;
  });
  check("tour opens by lighting the whole Cell parameters section", TS.firstIsCellCard === true);
  check("a sub-step keeps the same section lit and only moves the message",
    TS.sameSection === true && TS.oneHighlight === true, JSON.stringify({s:TS.sameSection,o:TS.oneHighlight}));
  check("the lit section sits above the veil, so it stays interactive", TS.secAboveVeil === true);
  check("tour covers the advanced options and ends at the library",
    TS.advancedStep === true && TS.reachedLibrary === true, JSON.stringify(TS.titles));
  check("panels the tour opened are put back afterwards",
    TS.libRecollapsed === true && TS.advClosed === true && TS.cleanedUp === true, JSON.stringify(TS));

  // ── The design rate decides which library measurement is used ──
  // "Hard Carbon" carries a rate ladder (0.05 A/g @270 mAh/g … 0.4 A/g @165).
  const LR = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const out = {};
    c1Manual.an = false; c1Derived.an = false;
    g("cell-rate-nth").value = "0.1"; onCellRateChange();
    g("an-ps").value = "u_moregjf5"; applyPS("an");
    out.slow = { cN: g("an-cN").value, rate: g("an-rN-lbl").textContent };
    // Raising the design rate must re-pick a faster, lower-capacity measurement.
    g("cell-rate-nth").value = "1"; onCellRateChange();
    out.fast = { cN: g("an-cN").value, rate: g("an-rN-lbl").textContent };
    // A hand-typed capacity must not be overwritten by a later rate change.
    g("an-cN").value = "123"; onCapManual("an", "c1"); c1Manual.an = true;
    g("cell-rate-nth").value = "2"; onCellRateChange();
    out.manualKept = g("an-cN").value;
    c1Manual.an = false;
    g("cell-rate-nth").value = "0.1"; onCellRateChange();
    g("an-ps").value = ""; applyPS("an");
    return out;
  });
  check("library pick follows the design rate (C/10 → slowest, 270 mAh/g)",
    LR.slow.cN === "270", JSON.stringify(LR.slow));
  check("raising the design rate re-picks a faster measurement (1C → 225 mAh/g)",
    LR.fast.cN === "225" && LR.fast.cN !== LR.slow.cN, JSON.stringify(LR.fast));
  check("a hand-typed capacity survives a design-rate change", LR.manualKept === "123", LR.manualKept);

  // ── Capacity bars carry a colour key ──
  const LG = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    if (!saltOn) tgSalt();
    g("cat-s-c1").value = "300"; g("cat-s-frac").value = "10";
    recalcNow();
    const k = g("bar-key");
    // The salt only contributes on the first cycle, so read the key there; the
    // Nth-cycle key correctly omits it.
    g("bTog").querySelector('button[data-p="1st"]').click();
    const first = { txt: k.textContent, swatches: k.querySelectorAll("i").length };
    g("bTog").querySelector('button[data-p="Nth"]').click();
    const nth = k.textContent;
    return { ...first, nthTxt: nth };
  });
  check("capacity bars have a colour key naming every contribution",
    /Cathode active material/.test(LG.txt) && /Sacrificial salt/.test(LG.txt) &&
    /Anode active material/.test(LG.txt) && LG.swatches >= 4, JSON.stringify(LG));
  check("the key drops the salt on the Nth cycle, where it contributes nothing",
    !/Sacrificial salt/.test(LG.nthTxt), LG.nthTxt);

  // ── The tour never points at something that is not on screen ──
  const TV = await page.evaluate(() => {
    const walk = () => {
      startTour();
      const sizes = []; let g = 0;
      while (g++ < 30 && document.getElementById("tourPop").classList.contains("on")) {
        const hi = document.querySelector(".tour-hi");
        const r = hi ? hi.getBoundingClientRect() : { width: 0, height: 0 };
        sizes.push({ t: document.getElementById("tourTitle").textContent, w: r.width, h: r.height });
        tourGo(1);
      }
      return sizes;
    };
    const shown = document.getElementById("resPanel").style.display;
    document.getElementById("resPanel").style.display = "none";     // as before any Calculate
    const hidden = walk();
    document.getElementById("resPanel").style.display = "";          // results on screen
    const visible = walk();
    document.getElementById("resPanel").style.display = shown;
    return {
      hiddenZero: hidden.filter(x => x.w === 0 || x.h === 0).length,
      visibleZero: visible.filter(x => x.w === 0 || x.h === 0).length,
      hiddenHasResults: hidden.some(x => /Your answer/.test(x.t)),
      visibleHasResults: visible.some(x => /Your answer/.test(x.t)),
      grew: visible.length > hidden.length,
      calcMentionsResults: TOUR_STEPS.some(x => /Calculate/.test(x.h) && /Diagnostics/.test(x.b)),
    };
  });
  check("tour never highlights an off-screen target",
    TV.hiddenZero === 0 && TV.visibleZero === 0, JSON.stringify(TV));
  check("results steps are skipped before Calculate and included after",
    TV.hiddenHasResults === false && TV.visibleHasResults === true && TV.grew === true, JSON.stringify(TV));
  check("the always-visible Calculate step explains what the results give you",
    TV.calcMentionsResults === true);

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
