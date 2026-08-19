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
      libKB: Math.round(JSON.stringify(window.MUSIC_LIBRARY).length / 1024),
      plotlyDeferred: typeof Plotly === "undefined",
      figuresDeferred: typeof window.MUSIC_LIBRARY_IMAGES === "undefined",
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
  check("boot: library payload is small enough to parse instantly", BOOT.libKB < 500, BOOT.libKB + " KB");
  check("boot: Plotly is not paid for at startup", BOOT.plotlyDeferred === true);
  check("boot: reference figures are not paid for at startup", BOOT.figuresDeferred === true);

  // ── Simple mode: the front door, and the whole of it ──
  const SM = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const vis = el => el.checkVisibility();
    const shownInputs = () => [...document.querySelectorAll("#simpleMode input")].filter(vis).length;
    const o = {
      // It is what a first-time visitor lands on, with nothing in front of it.
      bootsSimple: uiMode === "simple" && vis(g("simpleMode")),
      advHidden: !vis(g("advancedMode")),
      noWelcome: !g("tourWelcome").classList.contains("on"),
      // Single/Stack belongs to the advanced layout, not the masthead.
      stackTogHidden: !vis(g("modeTog")),
      stackTogInsideAdvanced: g("advancedMode").contains(g("modeTog")),
      // The library stays open at the foot of the page, for reference.
      libOpen: !g("lib").classList.contains("cld") && vis(g("lib")),
      // Four values by default; the salt is an option, not a step.
      inputCount: shownInputs(),
      saltBoxHidden: !vis(g("sm-salt-on")),
      detachOffered: vis(g("sm-salt-off")),
      // Each electrode reads 1st cycle first, then the reversible value.
      posOrder: [...g("sm-salt-off").parentNode.querySelectorAll(".sm-pos label")].map(e => e.textContent.trim()),
      // The positive 1st-cycle figure counts the whole active zone by default.
      unitCombined: g("sm-pos-c1-u").textContent,
      emptyMsg: g("sm-msg").textContent,
      emptyPie: g("sm-pie").querySelectorAll("path,circle").length,
      emptyRatio: !vis(g("sm-ratio")),
    };
    // The basis is the part that differs between these fields, so it has to be
    // readable: it used to be 8.5px in the palest ink on the page.
    {
      const u = g("sm-pos-c1-u"), sub = u.querySelector("sub");
      const cs = getComputedStyle(u), sc = getComputedStyle(sub);
      o.unitPx = parseFloat(cs.fontSize);
      o.unitSubPx = parseFloat(sc.fontSize);
      o.unitSubWeight = parseInt(sc.fontWeight, 10);
      o.unitSubInk = sc.color;
      o.inkStrong = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
      o.inkFaint = getComputedStyle(document.documentElement).getPropertyValue("--ink3").trim();
    }

    // COMBINED: a composite positive measured at 92.4528 mAh/g(AM+salt), its AM
    // giving 70 mAh/g reversible, against a 350/250 negative.
    g("sm-pos-c1").value = "92.4528"; g("sm-pos-cn").value = "70";
    g("sm-neg-c1").value = "350";     g("sm-neg-cn").value = "250";
    const rc = recalcSimple();
    o.combinedRatio = rc.ratio;
    o.slices = g("sm-pie").querySelectorAll("path,circle").length;
    o.legend = g("sm-legend").textContent;
    o.quietWhenSolved = getComputedStyle(g("sm-msg")).display === "none";
    o.hintOffWhenCombined = !vis(g("sm-pos-c1-hint"));
    // The second answer: how much positive electrode against the negative.
    // m_pos/m_neg = C⁻N/(fAM·C⁺N) = 250/(0.943396·70) = 3.7858.
    o.massRatio = rc.massRatio;
    o.ratioShown = vis(g("sm-ratio"));
    o.ratioV = g("sm-ratio").querySelector(".sm-ratio-v").textContent;
    o.ratioSides = g("sm-ratio").querySelector(".sm-ratio-sides").textContent;
    o.ratioBasis = g("sm-ratio").querySelector(".sm-ratio-basis").textContent;
    o.ratioPx = parseFloat(getComputedStyle(g("sm-ratio").querySelector(".sm-ratio-v")).fontSize);
    o.ratioBesidePie = Math.round(g("sm-ratio").getBoundingClientRect().left) >
                       Math.round(g("sm-pie").getBoundingClientRect().right) - 4;

    // DETACHED: the SAME cell described the other way — the positive AM alone
    // gives 80 mAh/g on the first cycle and the salt brings 300 of its own.
    // Both descriptions must land on the same split.
    setSaltDetached(true);
    o.unitDetached = g("sm-pos-c1-u").textContent;
    o.inputsAfterDetach = shownInputs();
    g("sm-pos-c1").value = "80"; g("sm-salt-c1").value = "300";
    o.detachedRatio = recalcSimple().ratio;

    // A capacitive positive reporting the same 1st and Nth capacity has almost
    // certainly been measured over the full window, not from the cell's OCV.
    g("sm-pos-c1").value = "70";
    recalcSimple();
    o.hintWhenEqual = vis(g("sm-pos-c1-hint"));
    o.hintText = g("sm-pos-c1-hint").textContent.trim();
    g("sm-pos-c1").value = "80"; recalcSimple();

    // Folding the salt back restores the four-value form and its basis.
    setSaltDetached(false);
    o.backToFour = shownInputs() === 4 && g("sm-pos-c1-u").textContent === o.unitCombined;

    // A positive whose own 1st cycle already covers the negative's loss implies
    // no salt, and says so rather than showing a bare 0%.
    // 98 mAh/g(AM+salt) is what this AM alone would give here; above it, the
    // measurement implies no salt at all.
    g("sm-pos-c1").value = "110"; g("sm-pos-cn").value = "70";
    const r0 = recalcSimple();
    o.noSaltRatio = r0.ratio;
    o.noSaltExplained = /no salt/i.test(g("sm-msg").textContent) &&
                        getComputedStyle(g("sm-msg")).display !== "none";

    o.noSaltBasis = g("sm-ratio").querySelector(".sm-ratio-basis").textContent;
    // A positive electrode lighter than the negative flips which side carries
    // the 1 — the pair is still printed positive-first.
    g("sm-pos-c1").value = "800"; g("sm-pos-cn").value = "600";
    o.lightPosRatio = recalcSimple().massRatio;
    o.lightPosV = g("sm-ratio").querySelector(".sm-ratio-v").textContent;

    o.advStackTogShown = (setUiMode("advanced"), g("modeTog").checkVisibility());
    setUiMode("simple");
    return o;
  });
  check("simple mode is the front door, with no dialog over it",
    SM.bootsSimple === true && SM.advHidden === true && SM.noWelcome === true, JSON.stringify(SM));
  check("Single/Stack lives inside advanced mode, not the masthead",
    SM.stackTogHidden === true && SM.stackTogInsideAdvanced === true && SM.advStackTogShown === true, JSON.stringify(SM));
  check("simple mode asks for four values, with the salt box behind an option",
    SM.inputCount === 4 && SM.saltBoxHidden === true && SM.detachOffered === true, JSON.stringify(SM));
  check("each electrode reads 1st cycle first, then the reversible Nth",
    /^1st cycle$/i.test(SM.posOrder[0]) && /^Nth cycle \(reversible\)$/i.test(SM.posOrder[1]),
    JSON.stringify(SM.posOrder));
  check("the positive 1st-cycle capacity counts AM + salt until the salt is detached",
    /AM\+salt/.test(SM.unitCombined) && /AM$/.test(SM.unitDetached) && SM.inputsAfterDetach === 5,
    JSON.stringify(SM));
  check("the library stays open at the foot of simple mode", SM.libOpen === true, JSON.stringify(SM));
  check("an empty simple form says what is missing and draws no split",
    /four capacities/i.test(SM.emptyMsg) && SM.emptyPie === 1, JSON.stringify(SM));
  check("the two ways of describing one cell give the same carbon:salt split",
    near(SM.combinedRatio, 0.06, 1e-4) && near(SM.detachedRatio, 0.06, 1e-9) &&
    near(SM.combinedRatio, SM.detachedRatio, 1e-4), JSON.stringify(SM));
  check("the result is one two-slice pie and its legend, and nothing else speaks",
    SM.slices === 2 && /Sacrificial salt/.test(SM.legend) && SM.quietWhenSolved === true, JSON.stringify(SM));
  check("equal 1st and Nth on a detached positive prompts the OCV window, and only there",
    SM.hintWhenEqual === true && SM.hintOffWhenCombined === true &&
    SM.hintText === "Consider actual operating window starting from OCV", JSON.stringify(SM));
  check("folding the salt back restores the four-value form", SM.backToFour === true, JSON.stringify(SM));
  check("a cell that needs no salt reports 0 and explains why",
    SM.noSaltRatio === 0 && SM.noSaltExplained === true, JSON.stringify(SM));
  check("the capacity basis is legible, not 8.5px of the faintest ink",
    SM.unitPx >= 12 && SM.unitSubPx >= 10 && SM.unitSubWeight >= 700 &&
    SM.unitSubInk !== SM.inkFaint, JSON.stringify(SM));
  check("the electrode mass ratio sits beside the pie, at headline size",
    SM.ratioShown === true && SM.ratioBesidePie === true && SM.ratioPx >= 40 &&
    SM.emptyRatio === true, JSON.stringify(SM));
  check("the mass ratio is positive-over-negative, normalised to 1 (3.79 : 1)",
    near(SM.massRatio, 3.7858, 1e-3) && SM.ratioV.replace(/\s/g, "") === "3.79:1", JSON.stringify(SM));
  check("a lighter positive puts the 1 on its side, still printed positive-first",
    near(SM.lightPosRatio, 0.4375, 1e-4) && SM.lightPosV.replace(/\s/g, "") === "1:2.29", JSON.stringify(SM));
  check("the ratio names its sides and its basis, and drops the salt when there is none",
    /positive\s*:\s*negative/.test(SM.ratioSides) &&
    SM.ratioBasis.replace(/\s/g, "") === "(AMp+salt):AMn" &&
    SM.noSaltBasis.replace(/\s/g, "") === "AMp:AMn", JSON.stringify(SM));

  // Everything below exercises the full tool, so bring it up.
  await page.evaluate(() => setUiMode("advanced"));

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

  // ── Feature 1: one always-open N/P target per cycle (and the salt-mode symmetry fix) ──
  const A = await page.evaluate(() => {
    const R = () => ({ r1: window.lastR.r1, rN: window.lastR.rN, mode: window.lastMode });
    if (!saltOn) tgSalt();
    document.getElementById("cat-s-c1").value = "300";
    document.getElementById("np-target").value = "1.2"; onNpTargetChange();
    document.getElementById("np-target-1st").value = "1.2"; onNp1stChange();
    recalcNow();                                       // manual-recalc mode: edits only mark stale
    const same = R();                                  // both targets 1.2 → r1 == rN == 1.2
    document.getElementById("np-target-1st").value = "1.0"; onNp1stChange();
    recalcNow();
    const split = R();                                 // 1st=1.0, Nth=1.2
    return { same, split,
             live: getComputedStyle(document.getElementById("np-target-1st")).display,
             enabled: document.getElementById("np-target-1st").disabled === false };
  });
  check("salt-mode N/P symmetric (both targets 1.2 → r1=rN=1.2)", near(A.same.r1, 1.2) && near(A.same.rN, 1.2), JSON.stringify(A.same));
  check("distinct 1st-cycle target (1st=1.0, Nth=1.2 → r1=1.0, rN=1.2)", near(A.split.r1, 1.0) && near(A.split.rN, 1.2), JSON.stringify(A.split));
  check("1st-cycle target is always open and editable", A.live !== "none" && A.enabled === true, JSON.stringify(A));

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
    try { r.sim = !!(simComputeSeries() || {}).ok; } catch (e) { r.sim = "THREW:" + e.message; }
    try { renderSimPlot(); r.simRender = true; } catch (e) { r.simRender = "THREW:" + e.message; }
    try { const t = buildTXT(gatherExportData(), { summary:1,materials:1,masses:1,composition:1,ratios:1,loadings:1,rates:1,currents:1,ratioTbl:1,cratesTbl:1,catpovTbl:1,anpovTbl:1 }); r.txt = t.length; } catch (e) { r.txt = "THREW:" + e.message; }
    try { r.lib = lib.ac.length + lib.anode.length + lib.saltNa.length + lib.saltLi.length; renderLT(); } catch (e) { r.lib = "THREW:" + e.message; }
    return r;
  });
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
    g("np-target-1st").value = "1.00"; onNp1stChange();
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
    // Deviation basis: with target 1.20 the rate-response "vs target" column
    // must agree with the solver's own o1/oN, not measure against 1.00.
    g("np-target").value = "1.20"; onNpTargetChange(); recalcNow();
    out.header = g("rrTable").textContent.includes("vs target");
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
    // The zone stays usable because nothing is drawn over it — hit-test rather
    // than compare z-indexes (the spotlight frames the zone, it does not cover it).
    const zr = sec0.getBoundingClientRect();
    out.secUsable = !document.elementsFromPoint(zr.left + 30, zr.top + zr.height / 2)
      .some(e => e.parentElement && e.parentElement.id === "tourVeil");
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
  check("nothing is drawn over the lit section, so it stays interactive", TS.secUsable === true);
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
    // Set the scenario up completely — the toggle now re-solves, so the state
    // it reads must be the state this check intends, not whatever a previous
    // block happened to leave behind.
    if (!saltOn) tgSalt();
    g("cat-ac-st").value = "faradaic"; onStorageTypeChange("cat");
    g("cat-ac-c1").value = "100"; g("cat-ac-cN").value = "100";
    g("an-c1").value = "200"; g("an-cN").value = "200";
    g("cat-s-c1").value = "300"; g("cat-s-cN").value = "";
    g("cat-s-frac").value = "10";
    mCatOverride = null; mAnOverride = null;
    sMM("cat", "d", document.querySelector("#cat-mmb .mmb"));
    sMM("an", "d", document.querySelector("#an-mmb .mmb"));
    g("cat-mass").value = "10"; g("an-mass").value = ""; g("an-ld").value = "";
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

  // ── Spotlight: the zone is lit and usable, everything else is dimmed ──
  await page.evaluate(() => startTour());
  // The tour scrolls to its own target smoothly. Let that finish BEFORE parking
  // the zone, or the smooth scroll lands after our instant one and the probe
  // measures a zone that has since moved off-screen.
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const z = document.querySelector(".tour-hi");
    if (z) z.scrollIntoView({ block: "center", behavior: "instant" });
  });
  await page.waitForTimeout(250);
  const SP = await page.evaluate(() => {
    _tourSpotlight();                                    // re-frame after the scroll
    const blocked = (x, y) => document.elementsFromPoint(x, y)
      .some(e => e.parentElement && e.parentElement.id === "tourVeil");
    const z = document.querySelector(".tour-hi").getBoundingClientRect();
    // Probe inside the *visible* part of the zone, never off-screen.
    const midY = (Math.max(0, z.top) + Math.min(innerHeight, z.bottom)) / 2;
    const clamp = r => Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left)) *
                       Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top));
    const dimmed = [...document.getElementById("tourVeil").children]
      .reduce((a, d) => a + clamp(d.getBoundingClientRect()), 0);
    return {
      zoneBox: [Math.round(z.left), Math.round(z.top), Math.round(z.width), Math.round(z.height)],
      dimmedFraction: dimmed / (innerWidth * innerHeight),
      insideOpen: !blocked(z.left + 40, midY),
      sideDim:  z.left > 20 ? blocked(Math.round(z.left / 2), midY) : true,
      belowDim: z.bottom + 40 < innerHeight ? blocked(60, z.bottom + 40) : true,
      aboveDim: z.top > 40 ? blocked(60, z.top - 20) : true,
    };
  });
  check("tour dims everything outside the lit zone",
    SP.dimmedFraction > 0.4 && SP.sideDim === true && SP.belowDim === true && SP.aboveDim === true,
    JSON.stringify(SP));
  check("the lit zone itself is not covered", SP.insideOpen === true, JSON.stringify(SP));

  await page.evaluate(() => { tourGo(1); tourGo(1); });
  await page.waitForTimeout(500);
  const SF = await page.evaluate(() => {
    const blocked = (x, y) => document.elementsFromPoint(x, y)
      .some(e => e.parentElement && e.parentElement.id === "tourVeil");
    const f = document.querySelector(".tour-focus");
    // A neighbouring control in the same zone must not be dimmed away.
    const other = document.getElementById("np-target");
    const r = other.getBoundingClientRect();
    const out = {
      focusRinged: !!f && getComputedStyle(f).boxShadow !== "none",
      focusIsWrapper: !!f && f.classList.contains("fld"),
      neighbourNotBlocked: !blocked(r.left + r.width / 2, r.top + r.height / 2),
    };
    endTour();
    out.ringCleared = document.querySelectorAll(".tour-focus").length === 0;
    out.veilOff = !document.getElementById("tourVeil").classList.contains("on");
    return out;
  });
  check("a sub-step rings its field and leaves neighbours usable",
    SF.focusRinged === true && SF.neighbourNotBlocked === true, JSON.stringify(SF));
  check("ending the tour clears the ring and the dimming",
    SF.ringCleared === true && SF.veilOff === true, JSON.stringify(SF));

  // ── The results are always explained, even before the first Calculate ──
  const RS = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    g("resPanel").style.display = "none";              // as before any Calculate
    startTour();
    const titles = []; let guard = 0, revealed = false;
    while (guard++ < 40 && g("tourPop").classList.contains("on")) {
      titles.push(g("tourTitle").textContent);
      if (/results|Diagnostics|Simulation|Rates and/i.test(g("tourTitle").textContent) &&
          g("resPanel").style.display !== "none") revealed = true;
      tourGo(1);
    }
    return {
      titles,
      hasResults: titles.some(t => /^The results/.test(t)),
      hasDiagnostics: titles.some(t => /Diagnostics/.test(t)),
      hasSimulation: titles.some(t => /Simulation/.test(t)),
      revealedWhileExplaining: revealed,
      panelRestored: g("resPanel").style.display === "none",
    };
  });
  check("the results section is explained even before Calculate",
    RS.hasResults === true && RS.hasDiagnostics === true && RS.hasSimulation === true, JSON.stringify(RS.titles));
  check("the results panel is revealed for those steps and put back after",
    RS.revealedWhileExplaining === true && RS.panelRestored === true, JSON.stringify(RS));

  // ── The current-density step sits between capacities and advanced options ──
  const CD = await page.evaluate(() => {
    const titles = TOUR_STEPS.map(s => s.h);
    const i = titles.findIndex(t => /current density/i.test(t));
    const step = TOUR_STEPS[i];
    return {
      exists: i >= 0,
      afterCapacities: /Two capacities/.test(titles[i - 1] || ""),
      beforeAdvanced: /Advanced options/.test(titles[i + 1] || ""),
      anchorsRateChip: step && step.at === "#cat-ac-rN-lbl",
      saysAuto: step && /closest to your cell target automatically/i.test(step.b),
      saysManual: step && /measured at the current density matching your target rate/i.test(step.b),
    };
  });
  check("a current-density step follows the capacities step",
    CD.exists === true && CD.afterCapacities === true && CD.beforeAdvanced === true, JSON.stringify(CD));
  check("it points at the rate chip and covers both library and manual entry",
    CD.anchorsRateChip === true && CD.saysAuto === true && CD.saysManual === true, JSON.stringify(CD));

  // The chip it rings must stay clickable — that was the original complaint.
  await page.evaluate(() => {
    startTour();
    const i = TOUR_STEPS.filter(s => document.querySelector(s.sec) || s.always)
      .findIndex(s => /current density/i.test(s.h));
    for (let k = 0; k < i; k++) tourGo(1);
  });
  await page.waitForTimeout(500);
  const CDR = await page.evaluate(() => {
    const f = document.querySelector(".tour-focus");
    const r = f ? f.getBoundingClientRect() : null;
    const out = {
      ringsChip: !!f && f.classList.contains("rate-pick"),
      clickable: !!f && !document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        .some(e => e.parentElement && e.parentElement.id === "tourVeil"),
    };
    endTour();
    return out;
  });
  check("the rate chip is ringed and remains clickable",
    CDR.ringsChip === true && CDR.clickable === true, JSON.stringify(CDR));

  // ── The tour signs off on the Calculate button ──
  const FIN = await page.evaluate(() => {
    const last = TOUR_STEPS[TOUR_STEPS.length - 1];
    startTour();
    let guard = 0, seen = [];
    while (guard++ < 40 && document.getElementById("tourPop").classList.contains("on")) {
      seen.push({ t: document.getElementById("tourTitle").textContent,
                  btn: document.getElementById("tourNext").textContent });
      tourGo(1);
    }
    const closed = !document.getElementById("tourPop").classList.contains("on");
    return {
      lastTitle: last.h, lastSec: last.sec,
      isFinalShown: seen.length ? seen[seen.length - 1].t : "",
      finalBtn: seen.length ? seen[seen.length - 1].btn : "",
      afterLibrary: seen.length > 1 && /library/i.test(seen[seen.length - 2].t),
      closesCleanly: closed && document.querySelectorAll(".tour-hi,.tour-focus").length === 0,
    };
  });
  check("the tour ends with a sign-off message",
    /balance the cell/i.test(FIN.lastTitle) && /balance the cell/i.test(FIN.isFinalShown), JSON.stringify(FIN));
  check("the sign-off comes after the library and points at Calculate",
    FIN.afterLibrary === true && FIN.lastSec === "#calcBtn", JSON.stringify(FIN));
  check("its button reads Done and the tour closes cleanly",
    FIN.finalBtn === "Done" && FIN.closesCleanly === true, JSON.stringify(FIN));

  // ── Startup cost: nothing heavy is paid for before the form is usable ──
  const PERF = await page.evaluate(async () => {
    const out = {
      fontsNonBlocking: [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter(l => /fonts\.googleapis/.test(l.href))
        .every(l => l.media === "print" || l.media === "all"),
      bootsOnDomReady: true,
    };
    // The deferred payloads must still arrive when asked for.
    await ensurePlotly();
    out.plotlyOnDemand = typeof Plotly !== "undefined";
    await ensureLibImages();
    let withImg = 0;
    ["ac","saltNa","saltLi","anode"].forEach(k => lib[k].forEach(m =>
      (m.refs||[]).forEach(r => { if (r.image && r.image.startsWith("data:")) withImg++; })));
    out.figuresOnDemand = withImg;
    return out;
  });
  check("the font stylesheet cannot block first paint", PERF.fontsNonBlocking === true);
  check("Plotly still loads when the Simulation tab needs it", PERF.plotlyOnDemand === true);
  check("reference figures still load when the library needs them", PERF.figuresOnDemand > 0, String(PERF.figuresOnDemand));

  // ── Rate pills grade each capacity against the cell target ──
  const RP = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const read = eqId => {
      const e = g(eqId), pill = e.querySelector(".rq");
      const row = e.closest(".rate-row"), n = row && row.querySelector(".rate-note");
      return { grade: pill ? pill.className.replace("rq", "").trim() : "none",
               shows: e.textContent, note: n ? n.textContent : "" };
    };
    g("cell-rate-1st").value = "0.1"; g("cell-rate-nth").value = "0.1"; onCellRateChange();
    // on target: 100 mA/g on 1000 mAh/g = C/10
    g("cat-ac-c1").value = "1000"; setRateValue("cat-ac", "c1", 100, "mA/g", "100 mA/g");
    // far too fast: 200 mA/g on 225 mAh/g ≈ C/1.1
    g("cat-ac-cN").value = "225"; setRateValue("cat-ac", "cN", 0.2, "A/g", "0.2 A/g");
    updateRateEquiv();
    return { onTarget: read("cat-ac-r1-eq"), tooFast: read("cat-ac-rN-eq") };
  });
  check("a capacity measured at the target rate reads green",
    RP.onTarget.grade === "ok" && RP.onTarget.note === "", JSON.stringify(RP.onTarget));
  check("a capacity measured far off target reads red",
    RP.tooFast.grade === "bad", JSON.stringify(RP.tooFast).slice(0, 120));
  check("the pill shows the C-rate and its equivalent time",
    /C\/10/.test(RP.onTarget.shows) && /10 h/.test(RP.onTarget.shows), RP.onTarget.shows);
  check("the mismatch is explained under the capacity it concerns, naming the target",
    /your target is/.test(RP.tooFast.note) && /C\/10/.test(RP.tooFast.note), RP.tooFast.note.slice(0, 120));

  // ── Edits apply themselves; no Recalculate click required ──
  const AR = await page.evaluate(async () => {
    const g = id => document.getElementById(id);
    // Own the scenario: anode pinned by loading, cathode solved — so a change
    // to either the loading or a cathode capacity moves the cathode mass.
    if (saltOn) tgSalt();
    g("cat-ac-st").value = "faradaic"; onStorageTypeChange("cat");
    g("cat-ac-c1").value = "150"; g("cat-ac-cN").value = "100";
    g("an-c1").value = "300"; g("an-cN").value = "200";
    mCatOverride = null; mAnOverride = null;
    sMM("cat", "d", document.querySelector("#cat-mmb .mmb"));
    g("cat-mass").value = "";
    sMM("an", "l", document.querySelector("#an-mmb .mmb:nth-child(2)"));
    g("an-ld").value = "1"; g("an-ar").value = "1"; g("an-mass").value = "";
    recalcNow();
    const before = g("r-mc").textContent.trim();
    const ld = g("an-ld");
    ld.value = String((parseFloat(ld.value) || 1) * 2);
    ld.dispatchEvent(new Event("input", { bubbles: true }));   // as typing would
    await new Promise(r => setTimeout(r, AUTO_CALC_MS + 400));
    return { before, after: g("r-mc").textContent.trim(),
             stale: g("calcBtn").classList.contains("dirty") };
  });
  check("an edit re-solves on its own, without pressing Recalculate",
    AR.before !== AR.after && AR.stale === false, JSON.stringify(AR));

  // ── The running build identifies itself ──
  const VER = await page.evaluate(() => ({
    badge: (document.getElementById("verBadge") || {}).textContent || "",
    footer: (document.getElementById("ftrVer") || {}).textContent || "",
    constant: typeof APP_VERSION !== "undefined" ? APP_VERSION : "",
    inMasthead: !!document.querySelector(".mast .ver-badge"),
  }));
  check("the masthead shows the build version", /^v\d+\.\d+$/.test(VER.badge) && VER.inMasthead === true, JSON.stringify(VER));
  check("badge and footer agree with the version constant",
    VER.badge === VER.constant && VER.footer.startsWith(VER.constant), JSON.stringify(VER));

  // ── The 1st/Nth toggle: never needs a Recalculate, under any circumstance ──
  const BT = await page.evaluate(async () => {
    const g = id => document.getElementById(id);
    const key = () => g("bar-key").textContent.trim();
    const mass = () => g("r-mc").textContent.trim();
    // Own the scenario: anode pinned by loading, cathode solved — so a change
    // to either the loading or a cathode capacity moves the cathode mass.
    if (saltOn) tgSalt();
    g("cat-ac-st").value = "faradaic"; onStorageTypeChange("cat");
    g("cat-ac-c1").value = "150"; g("cat-ac-cN").value = "100";
    g("an-c1").value = "300"; g("an-cN").value = "200";
    mCatOverride = null; mAnOverride = null;
    sMM("cat", "d", document.querySelector("#cat-mmb .mmb"));
    g("cat-mass").value = "";
    sMM("an", "l", document.querySelector("#an-mmb .mmb:nth-child(2)"));
    g("an-ld").value = "1"; g("an-ar").value = "1"; g("an-mass").value = "";
    recalcNow();

    const out = { inlineWired: [...g("bTog").querySelectorAll("button[data-p]")]
                                 .every(b => /setBarPhase/.test(b.getAttribute("onclick") || "")) };
    g("bTog").querySelector('button[data-p="1st"]').click();
    const a = key();
    g("bTog").querySelector('button[data-p="Nth"]').click();
    const b = key();
    out.switches = a !== b;
    out.marksActive = g("bTog").querySelector('button[data-p="Nth"]').classList.contains("act");
    out.neverStale = !g("calcBtn").classList.contains("dirty");
    // The case that bites: edit an input, then toggle before the debounce runs.
    const before = mass();
    const cn = g("cat-ac-cN");
    cn.value = String((parseFloat(cn.value) || 100) * 2);
    cn.dispatchEvent(new Event("input", { bubbles: true }));
    g("bTog").querySelector('button[data-p="1st"]').click();   // immediately
    out.appliedPendingEdit = mass() !== before;
    out.stillNotStale = !g("calcBtn").classList.contains("dirty");
    return out;
  });
  check("1st/Nth toggle is wired inline, independent of the JS wiring pass", BT.inlineWired === true);
  check("1st/Nth toggle switches the bars and marks the active button",
    BT.switches === true && BT.marksActive === true, JSON.stringify(BT));
  check("1st/Nth toggle applies a pending edit instead of showing stale numbers",
    BT.appliedPendingEdit === true, JSON.stringify(BT));
  check("1st/Nth toggle never leaves the results marked stale",
    BT.neverStale === true && BT.stillNotStale === true, JSON.stringify(BT));

  // ── Item B: every Results control is live, in every mode ──
  // Three scenarios per control: after a fresh solve, with an edit still
  // pending (before the debounce), and in ratio mode — the last is the one
  // that was silently broken, because the old repaint helper returned early.
  const LIVE = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const seed = (ratioMode) => {
      if (saltOn) tgSalt();
      g("cat-ac-st").value = "faradaic"; onStorageTypeChange("cat");
      g("cat-ac-c1").value = "150"; g("cat-ac-cN").value = "100";
      g("an-c1").value = "300"; g("an-cN").value = "200";
      mCatOverride = null; mAnOverride = null;
      sMM("cat", "d", document.querySelector("#cat-mmb .mmb"));
      g("cat-mass").value = "";
      if (ratioMode) {
        sMM("an", "d", document.querySelector("#an-mmb .mmb"));
        g("an-mass").value = ""; g("an-ld").value = "";
      } else {
        sMM("an", "l", document.querySelector("#an-mmb .mmb:nth-child(2)"));
        g("an-ld").value = "1"; g("an-ar").value = "1"; g("an-mass").value = "";
      }
      recalcNow();
    };
    const povSwitches = () => {
      setResultsTab("rates", [...document.querySelectorAll(".rtab-btn")][2]);
      const btns = g("cdTabBar").querySelectorAll(".norm-btn");
      const a = g("crate-table").innerHTML;
      btns[1].click();
      const b = g("crate-table").innerHTML;
      btns[0].click();
      return a !== b;
    };
    const out = { helperGone: typeof window.rerenderResults === "undefined" };

    seed(false);
    out.povFresh = povSwitches();
    out.modeSolved = window.lastMode;

    // pending edit: change a capacity, then use a control before the debounce
    seed(false);
    const cn = g("cat-ac-cN");
    cn.value = "50"; cn.dispatchEvent(new Event("input", { bubbles: true }));
    const before = g("r-mc").textContent.trim();
    povSwitches();
    out.povAppliesPendingEdit = g("r-mc").textContent.trim() !== before;

    seed(true);                                    // ratio mode
    out.modeRatio = window.lastMode;
    out.povRatio = povSwitches();

    // total-loading toggle, same three ways
    seed(false);
    const l0 = g("r-cld12").innerHTML;
    setShowTotalLoading(true);
    out.loadingFresh = g("r-cld12").innerHTML !== l0;
    setShowTotalLoading(false);
    seed(true);
    const l1 = g("r-cld12").innerHTML;
    setShowTotalLoading(true);
    out.loadingRatio = g("r-cld12").innerHTML !== l1;
    setShowTotalLoading(false);

    out.neverStale = !g("calcBtn").classList.contains("dirty");
    return out;
  });
  check("the stale-prone repaint helper is gone", LIVE.helperGone === true);
  check("POV tabs update after a solve", LIVE.povFresh === true, JSON.stringify(LIVE));
  check("POV tabs apply an edit that was still pending", LIVE.povAppliesPendingEdit === true, JSON.stringify(LIVE));
  check("POV tabs update in ratio mode (the reported bug)",
    LIVE.modeRatio === "ratio" && LIVE.povRatio === true, JSON.stringify(LIVE));
  check("total-loading toggle updates in both modes",
    LIVE.loadingFresh === true && LIVE.loadingRatio === true, JSON.stringify(LIVE));
  check("no Results control leaves the page marked stale", LIVE.neverStale === true, JSON.stringify(LIVE));

  // ── Item A: rate response ──
  const RR = await page.evaluate(async () => {
    const g = id => document.getElementById(id);   // eslint-disable-line
    // Two library materials with real rate ladders, anode pinned by loading.
    g("cat-ac-ps").value = "ac-lic"; applyPS("cat-ac");
    g("an-ps").value = "u_moregjf5"; applyPS("an");
    mCatOverride = null; mAnOverride = null;
    sMM("cat", "d", document.querySelector("#cat-mmb .mmb"));
    g("cat-mass").value = "";
    sMM("an", "l", document.querySelector("#an-mmb .mmb:nth-child(2)"));
    g("an-ld").value = "1"; g("an-ar").value = "1"; g("an-mass").value = "";
    setResultsTab("diag", [...document.querySelectorAll(".rtab-btn")][1]);
    if (typeof ensurePlotly === "function") await ensurePlotly();
    recalcNow();
    const d = window._rrData;
    const design = d.rows.find(x => x.isDesign);
    const known = d.rows.filter(x => x.state !== "unknown");
    const slow = known[0], fast = known[known.length - 1];
    const out = {
      rows: d.rows.length,
      stdLadder: d.rows.filter(x => !x.isMeasured).length,
      designPresent: !!design,
      designState: design ? design.state : "missing",
      warnsWhenDesignUncovered: !design || design.state === "measured" ||
        /design rate is|no rate data covers/.test(g("rrDesign").textContent),
      designBadged: !!document.querySelector(".rr-design-row .rr-badge"),
      capacityFalls: fast.pct < slow.pct,
      balanceDrifts: Math.abs(fast.np - d.target) > Math.abs(slow.np - d.target),
      gradesSpanColours: new Set(d.rows.map(r => r.status)).size >= 2,
      offDesignExplains: !!(fast.consequence && fast.consequence.length > 20),
      shiftReported: d.rows.some(r => r.shiftV != null && r.shiftV > 0.05),
      tableRows: document.querySelectorAll("#rrTable tbody tr").length,
      chartTraces: (g("rrChart").data || []).length,
      oldSectionsGone: !g("rGrid") && !g("wDiag"),
    };
    // x-unit pill relabels without re-solving
    const x0 = g("rrTable").querySelector("th").textContent;
    setRateXUnit("an");
    out.xUnitSwitches = g("rrTable").querySelector("th").textContent !== x0;
    setRateXUnit("C");
    // 1st/Nth cycle switch
    setRatePhase("1st");
    out.cycleSwitches = window._rrData.cycle === "1st";
    setRatePhase("Nth");
    // row click seeds the simulation
    rateRowToSim(d.rows.length - 1);
    out.seedsSim = !!(simRateSel["Nth"] && simRateSel["Nth"].I_uA > 0);
    out.notStale = !g("calcBtn").classList.contains("dirty");
    return out;
  });
  check("the table shows the standard ladder, not every measured point",
    RR.rows <= 8 && RR.stdLadder >= 7, JSON.stringify(RR));
  check("the design rate is present and badged",
    RR.designPresent === true && RR.designBadged === true, JSON.stringify(RR));
  check("it warns when the design rate is not backed by a measurement",
    RR.warnsWhenDesignUncovered === true, RR.designState);
  check("cycling faster costs capacity and drifts the balance",
    RR.capacityFalls === true && RR.balanceDrifts === true, JSON.stringify(RR));
  check("rows are graded, and an off-design rate explains the consequence",
    RR.gradesSpanColours === true && RR.offDesignExplains === true, JSON.stringify(RR));
  check("the potential shift of the part-swept electrode is reported", RR.shiftReported === true);
  check("chart and table are both rendered from the same data",
    RR.chartTraces === 2 && RR.tableRows === RR.rows, JSON.stringify(RR));
  check("the x-unit pill and cycle toggle both work",
    RR.xUnitSwitches === true && RR.cycleSwitches === true, JSON.stringify(RR));
  check("clicking a row seeds the simulation at that rate", RR.seedsSim === true);
  check("ratio table and potential windows are gone", RR.oldSectionsGone === true);
  check("rate-response controls never mark results stale", RR.notStale === true);

  // ── Extrapolation, and refusing to extrapolate ──
  const EX = await page.evaluate(async () => {
    const g = id => document.getElementById(id);
    const out = {};
    // A material with a real ladder: standard rates are derived from it.
    g("cat-ac-ps").value = "ac-lic"; applyPS("cat-ac");
    g("an-ps").value = "u_moregjf5"; applyPS("an");
    mCatOverride = null; mAnOverride = null;
    sMM("cat", "d", document.querySelector("#cat-mmb .mmb")); g("cat-mass").value = "";
    sMM("an", "l", document.querySelector("#an-mmb .mmb:nth-child(2)"));
    g("an-ld").value = "1"; g("an-ar").value = "1"; g("an-mass").value = "";
    g("cell-rate-nth").value = "1"; onCellRateChange();
    if (g("rrShowMeasured").checked) g("rrShowMeasured").click();
    if (g("rrAssumeFlat").checked) g("rrAssumeFlat").click();
    recalcNow();
    let d = window._rrData;
    out.stdOnly = d.rows.length === 7;
    out.rateLabels = d.rows.map(r => fCrate(r.rate)).join(" ");
    out.hasEstimates = d.rows.some(r => r.state === "extrapolated");
    out.hasMeasured = d.rows.some(r => r.state === "measured");
    // Opt-in: measured points appear as extra rows, flagged
    g("rrShowMeasured").click();
    out.withMeasured = window._rrData.rows.length > 7 &&
                       window._rrData.rows.some(r => r.isMeasured);
    g("rrShowMeasured").click();

    // No ladder at all → refuse to extrapolate, and say why
    catAcRates = []; anRates = [];
    g("cat-ac-c1").value = "150"; g("cat-ac-cN").value = "100";
    g("an-c1").value = "300"; g("an-cN").value = "200";
    recalcNow();
    d = window._rrData;
    out.allUnknown = d.rows.every(r => r.state === "unknown");
    out.explains = /not enough data to extrapolate/i.test(g("rrTable").textContent) &&
                   /no measured rate data/i.test(g("rrTable").textContent);
    out.noInventedNumbers = d.rows.every(r => r.Q === null && r.np === null);
    // The escape hatch the user asks for
    g("rrAssumeFlat").click();
    out.assumeBoxShown = g("rrAssumeBox").style.display !== "none";
    out.assumedFillsIn = window._rrData.rows.every(r => r.state === "assumed" && r.Q > 0);
    // A typed value overrides the auto edge value
    g("rrAssumeCat").value = "10"; onRrAssumeEdit();
    out.userValueUsed = Math.abs(window._rrData.rows[0].Qc - window._rrData.mCatAM * 10) < 1e-6;
    g("rrAssumeCat").value = ""; onRrAssumeEdit();
    g("rrAssumeFlat").click();
    return out;
  });
  check("the table shows exactly the standard rate ladder by default",
    EX.stdOnly === true && /C\/20 C\/10 C\/5 C\/2 1C 2C 5C/.test(EX.rateLabels), JSON.stringify(EX.rateLabels));
  check("capacities are extrapolated from the library, and measured points marked",
    EX.hasEstimates === true && EX.hasMeasured === true, JSON.stringify(EX));
  check("a checkbox adds the measured rate points", EX.withMeasured === true);
  check("with too few points it refuses to extrapolate rather than inventing numbers",
    EX.allUnknown === true && EX.noInventedNumbers === true, JSON.stringify(EX));
  check("it explains simply why it cannot extrapolate", EX.explains === true);
  check("the constant-capacity assumption fills the region in",
    EX.assumeBoxShown === true && EX.assumedFillsIn === true, JSON.stringify(EX));
  check("a capacity typed by the user overrides the automatic one", EX.userValueUsed === true);

  // ── Exports carry the same numbers AND the same caveats as the screen ──
  // A rate the tool refuses to estimate has no numbers at all; an export that
  // assumes they exist crashes, and one that prints estimates unlabelled lies.
  const XP = await page.evaluate(async () => {
    const g = id => document.getElementById(id);
    const out = {};
    const sel = { ratioTbl: 1 };
    const run = async () => {
      const D = gatherExportData();
      const r = { rows: D.ratioRows.length };
      try { r.txt = buildTXT(D, sel); } catch (e) { r.txt = "THREW:" + e.message; }
      try { r.html = await buildHTMLBody(D, sel, { kind: "doc" }); } catch (e) { r.html = "THREW:" + e.message; }
      return r;
    };
    // (a) the refusal state left by the previous block — no ladder on either side
    const A = await run();
    out.refusedTxtOk = typeof A.txt === "string" && !/^THREW/.test(A.txt);
    out.refusedHtmlOk = typeof A.html === "string" && !/^THREW/.test(A.html);
    out.refusalExplained = out.refusedTxtOk && /not enough data/i.test(A.txt) &&
                           /declines to estimate/i.test(A.txt);
    out.noNaN = out.refusedTxtOk && !/NaN|undefined|null/.test(A.txt);
    out.refusedRows = A.rows;

    // (b) a real ladder — every value must say where it came from
    g("cat-ac-ps").value = "ac-lic"; applyPS("cat-ac");
    g("an-ps").value = "u_moregjf5"; applyPS("an");
    g("cell-rate-nth").value = "1"; onCellRateChange();
    setBarPhase("Nth");
    recalcNow();
    const B = await run();
    out.laddered = typeof B.txt === "string" && !/^THREW/.test(B.txt);
    out.hasSourceCol = out.laddered && /Source/.test(B.txt);
    out.marksEstimates = out.laddered && /\best\./.test(B.txt) && /measured/.test(B.txt);
    out.footnoted = out.laddered && /extrapolated from the measured half-cell points/.test(B.txt);
    out.countsPoints = out.laddered && /Measured rate points on file: cathode \d+, anode \d+/.test(B.txt);
    out.htmlMarks = typeof B.html === "string" && !/^THREW/.test(B.html) &&
                    /<th[^>]*>Source<\/th>/.test(B.html);
    // columns stay aligned: every body line starts at the same offset as the header
    const seg = B.txt.slice(B.txt.indexOf("Cell rate"));
    const lines = seg.split("\n").filter(s => /^(▸ )?C[\/0-9]/.test(s));
    const at = s => s.indexOf("mA/g");
    out.aligned = lines.length > 3 && new Set(lines.map(s => at(s) >= 0 ? 1 : 0)).size === 1 &&
                  new Set(lines.map(s => s.length > 40)).size === 1;
    return out;
  });
  check("an export survives rates the tool refused to estimate",
    XP.refusedTxtOk === true && XP.refusedHtmlOk === true, JSON.stringify(XP));
  check("the export explains the refusal instead of printing empty numbers",
    XP.refusalExplained === true && XP.noNaN === true, JSON.stringify(XP));
  check("exported capacities say whether they are measured, estimated or assumed",
    XP.hasSourceCol === true && XP.marksEstimates === true && XP.htmlMarks === true, JSON.stringify(XP));
  check("the export footnotes its provenance and counts the measured points",
    XP.footnoted === true && XP.countsPoints === true, JSON.stringify(XP));
  check("the exported rate table stays column-aligned", XP.aligned === true, JSON.stringify(XP));

  // ══ Feedback fixes — AH, 11.08.2026 ══════════════════════════════════════
  // Each block below pins one behaviour the returned notes found missing or
  // wrong. They are grouped here rather than woven into the sections above so
  // the origin of each assertion stays traceable.

  // ── C-rate ceiling: 60C (a 1-minute cycle) must be enterable, and an entry
  //    outside the range must announce itself instead of silently reverting.
  const CR = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const out = {};
    g("cell-rate-nth").value = "60"; onCellRateChange();
    out.accepted60 = cellRateNth === 60;
    out.eq = g("cell-rate-nth-eq").textContent;
    out.mirrored = Math.abs(parseFloat(g("cell-rate-nth-div").value) - 1 / 60) < 1e-4;
    out.quietWhenValid = g("cell-rate-nth-err").style.display === "none";
    g("cell-rate-nth").value = "5000"; onCellRateChange();
    out.heldOnReject = cellRateNth === 60;               // state must not move
    out.announced = g("cell-rate-nth-err").style.display !== "none";
    out.marked = g("cell-rate-nth").classList.contains("bad");
    g("cell-rate-nth").value = "0.1"; onCellRateChange();
    out.recovered = g("cell-rate-nth-err").style.display === "none";
    return out;
  });
  check("60C is accepted and reads back as a 1-minute cycle",
    CR.accepted60 === true && /1\s*min/.test(CR.eq) && CR.mirrored === true, JSON.stringify(CR));
  check("an out-of-range C-rate is announced, not silently discarded",
    CR.heldOnReject === true && CR.announced === true && CR.marked === true &&
    CR.quietWhenValid === true && CR.recovered === true, JSON.stringify(CR));

  // ── Formation target: an always-open field that the solver actually honours
  //    when the salt gives it a lever, and that says what is missing when it
  //    does not. With a fixed salt content the pinned-anode branch must still
  //    report a second mass.
  const FT = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    const out = {};
    if (saltOn) tgSalt();
    g("np-target-1st").value = "1.15"; onNp1stChange();
    recalcNow();
    // No salt: nothing disables the field — but the note must name the salt as
    // the missing lever rather than leaving the user hunting for a knob.
    const fld = g("np-target-1st");
    out.openWithoutSalt = fld.disabled === false && getComputedStyle(fld).display !== "none";
    out.saltNamedAsLever = /sacrificial salt/i.test(g("stsNote").textContent) &&
                           g("stsNote").style.display !== "none";

    // Salt on and free to size → the solver hits BOTH targets at once.
    tgSalt();
    g("cat-ac-st").value = "faradaic"; onStorageTypeChange("cat");
    g("an-st").value = "faradaic"; onStorageTypeChange("an");
    g("cat-ac-c1").value = "70"; g("cat-ac-cN").value = "60";
    g("an-c1").value = "350"; g("an-cN").value = "250";
    g("cat-s-c1").value = "290"; g("cat-s-cN").value = "";
    g("cat-s-frac").value = "";
    g("cat-wAM").value = "90"; g("cat-wC").value = "5"; g("cat-wB").value = "5";
    g("an-wAM").value = "90"; g("an-wC").value = "5"; g("an-wB").value = "5";
    g("np-target").value = "1.00"; onNpTargetChange();
    mCatOverride = null; mAnOverride = null;
    sMM("an", "d", document.querySelector("#an-mmb .mmb:nth-child(1)"));
    g("an-mass").value = "2.152"; g("cat-mass").value = "";
    g("np-target-1st").value = "1.10"; onNp1stChange();
    recalcNow();
    const r = window.lastR;
    out.bothTargetsHit = Math.abs(r.r1 - 1.10) < 1e-3 && Math.abs(r.rN - 1.00) < 1e-3;
    out.saltSized = r.mS > 0;
    out.heroGraded = /\b(gd|ct|bd)\b/.test(g("r-r1pct").className);

    // Both defaults are 1.00, so the untouched tool balances every cycle alike.
    g("np-target-1st").value = "1.00"; onNp1stChange();
    recalcNow();
    out.defaultsAgree = Math.abs(window.lastR.r1 - 1.0) < 1e-3 &&
                        Math.abs(window.lastR.rN - 1.0) < 1e-3;

    // Fixed salt content + pinned anode → a second cathode mass for the 1st cycle.
    g("cat-s-frac").value = "30";
    recalcNow();
    out.mode = window.lastMode;
    out.dualCathode = window.lastR.dualCathode === true && window.lastR.mCat1st > 0;
    out.massesDiffer = Math.abs(window.lastR.mCat - window.lastR.mCat1st) > 1e-6;
    return out;
  });
  check("the 1st-cycle target stays open with no salt, and names the missing lever",
    FT.openWithoutSalt === true && FT.saltNamedAsLever === true, JSON.stringify(FT));
  check("with salt free to size, both cycle targets are hit at once (1st=1.10, Nth=1.00)",
    FT.bothTargetsHit === true && FT.saltSized === true, JSON.stringify(FT));
  check("the 1st-cycle result is graded against its own target",
    FT.heroGraded === true, JSON.stringify(FT));
  check("both targets default to 1.00, balancing every cycle alike",
    FT.defaultsAgree === true, JSON.stringify(FT));
  check("fixed salt content with a pinned anode reports both cathode masses",
    FT.mode === "cathode" && FT.dualCathode === true && FT.massesDiffer === true, JSON.stringify(FT));

  // ── The simple form is a shortcut through the same physics, not a second
  //    opinion: the full solver, with both targets at 1.00 and the salt free to
  //    size, must land on the split solveSimple() reports for the same numbers.
  const SX = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    if (!saltOn) tgSalt();
    g("cat-ac-st").value = "faradaic"; onStorageTypeChange("cat");
    g("an-st").value = "faradaic"; onStorageTypeChange("an");
    g("cat-ac-cN").value = "70";  g("cat-ac-c1").value = "80";     // rev, rev+irr
    g("an-cN").value = "250";     g("an-c1").value = "350";
    g("cat-s-c1").value = "300";  g("cat-s-cN").value = "";
    g("cat-s-frac").value = "";
    g("cat-wAM").value = "100"; g("cat-wC").value = "0"; g("cat-wB").value = "0";
    g("an-wAM").value = "100";  g("an-wC").value = "0"; g("an-wB").value = "0";
    g("np-target").value = "1.00"; onNpTargetChange();
    g("np-target-1st").value = "1.00"; onNp1stChange();
    mCatOverride = null; mAnOverride = null; compCatOverride = null; compAnOverride = null;
    sMM("an", "d", document.querySelector("#an-mmb .mmb:nth-child(1)"));
    g("an-mass").value = "10"; g("cat-mass").value = "";
    recalcNow();
    const r = window.lastR;
    return { full: r.mS / (r.mAC + r.mS),
             simple: solveSimple({ posC1: 80, posCN: 70, negC1: 350, negCN: 250,
                                   saltC1: 300, saltDetached: true }).fSalt };
  });
  check("the detached-salt split agrees with the full solver",
    near(SX.simple, SX.full, 1e-6), JSON.stringify(SX));

  // ── The status chip must say what the imbalance costs, and must not grade
  //    the safe direction as harshly as the plating one.
  const CN = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    g("cat-s-frac").value = ""; if (saltOn) tgSalt();
    g("np-target").value = "1.00"; onNpTargetChange();
    g("cat-mass").value = "5"; g("an-mass").value = "1"; recalcNow();
    const plating = { rN: window.lastR.rN, html: document.getElementById("stsNote").innerHTML,
                      risk: document.getElementById("stsNote").classList.contains("risk") };
    g("cat-mass").value = "1"; g("an-mass").value = "5"; recalcNow();
    const safe = { rN: window.lastR.rN, html: document.getElementById("stsNote").innerHTML,
                   risk: document.getElementById("stsNote").classList.contains("risk") };
    return { plating, safe };
  });
  check("cathode-overcapacitive is named as a plating risk",
    CN.plating.rN < 1 && /plating/i.test(CN.plating.html) && CN.plating.risk === true, JSON.stringify(CN.plating));
  check("anode-overcapacitive is explained as unused mass, not flagged as a hazard",
    CN.safe.rN > 1 && /unused|not a plating risk/i.test(CN.safe.html) && CN.safe.risk === false,
    JSON.stringify(CN.safe));

  // ── Mass ratio: the number papers quote, on both bases.
  const MR = await page.evaluate(() => {
    recalcNow();
    const r = window.lastR, inp = window.lastInp;
    const expTot = r.mCat / r.mAn;
    const expAM = (r.mAC + (r.mS || 0)) / (r.mAn * inp.an.wAM);
    const rd = t => parseFloat(String(t).replace(/[^\d.]/g, "").replace(/^1/, "")) || null;
    return { tot: document.getElementById("r-mrTot").textContent.trim(),
             am: document.getElementById("r-mrAM").textContent.trim(),
             expTot, expAM,
             totOk: Math.abs(rd(document.getElementById("r-mrTot").textContent) - expTot) < 0.02,
             amOk: Math.abs(rd(document.getElementById("r-mrAM").textContent) - expAM) < 0.02 };
  });
  check("both mass ratios are reported and match the solved masses",
    MR.totOk === true && MR.amOk === true, JSON.stringify(MR));

  // ── Simulation constraints can be switched off entirely (blank ≠ off).
  const SC = await page.evaluate(() => {
    const out = {};
    out.allLive = Object.values(_simReadConstraints()).every(c => Number.isFinite(c.V));
    toggleSimCons("catMax");
    out.offIsNaN = Number.isNaN(_simReadConstraints().catMax.V);
    out.inputDisabled = document.getElementById("simCons_catMax_v").disabled === true;
    toggleSimCons("catMax");
    simConsCellOnly();
    const c = _simReadConstraints();
    out.electrodesOff = [c.catMax, c.catMin, c.anoMax, c.anoMin].every(x => Number.isNaN(x.V));
    out.cellLive = Number.isFinite(c.cellMax.V) && Number.isFinite(c.cellMin.V);
    simConsCellOnly();
    out.restored = Number.isFinite(_simReadConstraints().catMax.V);
    return out;
  });
  check("a constraint can be switched off, distinct from being left blank",
    SC.allLive === true && SC.offIsNaN === true && SC.inputDisabled === true, JSON.stringify(SC));
  check('"cell cut-offs only" drops the four electrode bounds and restores them',
    SC.electrodesOff === true && SC.cellLive === true && SC.restored === true, JSON.stringify(SC));

  // ── Terminology is fixed at positive/negative: display-only, no switch.
  const TM = await page.evaluate(() => {
    const head = () => document.querySelector(".card-h.ch .ct").textContent.trim();
    const first = head();
    applyTerminology(); applyTerminology();   // re-running must not compound
    return { first, again: head(),
             noSwitch: document.getElementById("termTog") === null &&
                       typeof window.setTerminology === "undefined",
             idsIntact: !!(document.getElementById("cat-ac-c1") && document.getElementById("an-mass")),
             libSkipped: document.getElementById("lib").hasAttribute("data-noterm"),
             libTabs: document.querySelector('[data-term-lbl="cat"]').textContent.trim() + "/" +
                      document.querySelector('[data-term-lbl="an"]').textContent.trim(),
             bodyClean: !/\b[Cc]athode\b|\b[Aa]node\b/.test(document.querySelector("#singleMode").textContent) };
  });
  check("the electrodes read positive/negative, with no switch to put them back",
    /Positive/.test(TM.first) && TM.noSwitch === true && TM.idsIntact === true, JSON.stringify(TM));
  check("re-applying terminology is idempotent and skips the user-data library",
    TM.again === TM.first && TM.libSkipped === true && TM.libTabs === "Positive/Negative", JSON.stringify(TM));
  check("no cathode/anode wording survives in the rendered single-cell view",
    TM.bodyClean === true, JSON.stringify(TM));

  // ── Blank data sheet: an input template, not a results dump.
  const DS = await page.evaluate(() => {
    let cap = null;
    const orig = window._saveBlob;
    window._saveBlob = (content, mime, fname) => { cap = { content, mime, fname }; };
    try { exportDataSheet(); } finally { window._saveBlob = orig; }
    if (!cap) return { ok: false };
    return { ok: true, fname: cap.fname,
             statesBasis: /per gram of that component alone/.test(cap.content),
             namesCharge: /First CHARGE/.test(cap.content) && /First DISCHARGE/.test(cap.content),
             hasUnits: /mAh g⁻¹\(AM\)/.test(cap.content) && /mAh g⁻¹\(salt\)/.test(cap.content),
             hasRequired: /required/.test(cap.content) && /optional/.test(cap.content) };
  });
  check("a blank input data sheet can be exported before any calculation",
    DS.ok === true && /music-data-sheet-.*\.xls$/.test(DS.fname || ""), JSON.stringify(DS));
  check("the data sheet states the capacity conventions and normalisation bases",
    DS.statesBasis === true && DS.namesCharge === true && DS.hasUnits === true &&
    DS.hasRequired === true, JSON.stringify(DS));

  // ── Mechanical-stability advisory warns but never changes the solve.
  const ML = await page.evaluate(() => {
    const g = id => document.getElementById(id);
    g("an-ar").value = "1.131";
    g("an-ldmax").value = "0.5"; g("an-ldmax").dataset.userSet = "1";
    g("an-dens").value = "1.5";
    recalcNow();
    const before = { mCat: window.lastR.mCat, mAn: window.lastR.mAn };
    const box = g("an-mech");
    const warned = box.style.display !== "none" && /er|wn/.test(box.className);
    const thickness = /µm/.test(box.innerHTML);
    g("an-ldmax").value = ""; g("an-ldmax").dataset.userSet = "";
    recalcNow();
    const after = { mCat: window.lastR.mCat, mAn: window.lastR.mAn };
    return { warned, thickness,
             unchanged: before.mCat === after.mCat && before.mAn === after.mAn };
  });
  check("an over-limit coating is flagged, with a thickness estimate when density is known",
    ML.warned === true && ML.thickness === true, JSON.stringify(ML));
  check("the mechanical advisory never changes a computed mass",
    ML.unchanged === true, JSON.stringify(ML));

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
