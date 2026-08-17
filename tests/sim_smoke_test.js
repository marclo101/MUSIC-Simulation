// Functional smoke test for the MUSIC galvanostatic sim engine.
// Extracts the sim functions from the HTML and runs them against a stubbed
// DOM, checking: (1) salt budget conservation across cycles, (2) oxidation-
// only activation, (3) IR-aware constraint stop (measured V_cell lands ON
// the limit), (4) both compute modes agree on shared inputs.
const fs = require('fs');
const html = fs.readFileSync('/home/user/MUSIC-Simulation/MUSIC_electrode_balance_V10.html', 'utf8');

// Pull a top-level declaration by name using a brace counter.
function extract(name, kind) {
  const startTok = kind === 'fn' ? `function ${name}(` : name;
  const i = html.indexOf(startTok);
  if (i < 0) throw new Error(`not found: ${name}`);
  let j = html.indexOf('{', i), depth = 0;
  if (kind !== 'fn') { // const/let object or simple statement — take to end of line or matching brace
    const eol = html.indexOf('\n', i);
    const brace = html.indexOf('{', i);
    if (brace < 0 || brace > eol) return html.slice(i, eol + 1);
    j = brace;
  }
  for (let k = j; k < html.length; k++) {
    if (html[k] === '{') depth++;
    else if (html[k] === '}') { depth--; if (depth === 0) {
      let end = k + 1;
      if (html[end] === ')') end++;      // IIFE-ish safety, not expected
      if (html[end] === ';') end++;
      return html.slice(i, end + 1);
    }}
  }
  throw new Error(`unbalanced braces: ${name}`);
}

const parts = [
  extract('const SIM_CONS_DEFS=', 'obj'),
  extract('let simConsDirty=', 'obj'),
  'let startDir="charge"; let simDirState="charge";',
  extract('_simConsIds', 'fn'),
  extract('_simConsVopDefault', 'fn'),
  extract('_simReadConstraints', 'fn'),
  extract('_simBuildPlateauState', 'fn'),
  extract('_simSaltResumeV', 'fn'),
  extract('_simReadSaltStages', 'fn'),
  // SOC engine v2 (M1) — canonical map builder + helpers.
  extract('_simVonSeg', 'fn'),
  extract('_simXatV_asc', 'fn'),
  extract('_simBuildElectrodeMap', 'fn'),
  extract('_simMapVatQ', 'fn'),
  extract('_simMapSliceFrom', 'fn'),
  extract('_simVatQinSegs', 'fn'),
  extract('_simVatQPrePost', 'fn'),
  extract('_simTruncSegs', 'fn'),
  extract('_simInterleaveSalt', 'fn'),
  extract('_simConstraintStop', 'fn'),
  extract('_simReadPlateauSpec', 'fn'),
  // Rate module (M3) — rate-dependent deliverable capacity (plan §1.5).
  extract('_simRateNorm', 'fn'),
  extract('_simAMloading', 'fn'),
  extract('_simRateLadder', 'fn'),
  extract('_simRateCapAt', 'fn'),
  extract('_simRateCapFactor', 'fn'),
  extract('_simRateRef', 'fn'),
  // SOC engine v2 (M2) — walker + compute modes.
  extract('_simAdvanceOneStroke', 'fn'),
  extract('_simGatherInputs', 'fn'),
  extract('simComputeSeries', 'fn'),
  extract('simComputeTimeSeries', 'fn'),
];

// ── Stub DOM / globals ──
// Scenario mirrors the user's screenshots: cathode AM₁ 50 µAh (1st) with a
// 150 µAh salt reservoir at V_redox = 3.65 V; anode 200 µAh (1st) / 100 µAh
// (Nth); big R_eq so IR matters; Cell V_min = 0 V.
const inputs = {
  'cat-ac-ocv': '3.0', 'an-ocv': '3.0',
  'simReq': '10000',           // 10 kΩ → 0.1 V IR at 10 µA
  'simCycleN': '4',
  'cat-Vop-hi': '4.2', 'cat-Vop-lo': '1.0',
  'an-Vop-hi': '2.5',  'an-Vop-lo': '-0.5', // unreachable → anode stops on its budget, not a constraint
  'cat-s-vredox': '3.3',
  // Cell V_min raised from 0 V to 0.60 V for the SOC engine (v2). Under the
  // SOC model the undersized anode pins the cathode at x=0 while the internal
  // V_cell is still ≈0.5 V, so a 0 V limit is never reached and the IR-aware
  // constraint math would go untested. 0.60 V sits inside the reachable band
  // on discharge for BOTH R_eq=10 kΩ (measured V_cell lands on 0.60) and
  // R_eq=0 (internal V_cell lands on 0.60), keeping that math covered.
  'simCons_cellMin_v': '0.60',
};
global.$ = id => (id in inputs)
  ? { value: inputs[id], classList: { contains: () => false } }
  : null;
global.N = id => parseFloat(inputs[id]);
global.saltOn = true;
// Per-constraint "switched off" state. Off is distinct from blank: blank falls
// back to the V_op default, off removes the bound entirely (the crossing search
// skips any non-finite bound). All six live by default.
global.simConsOff = { catMax: false, catMin: false, anoMax: false, anoMin: false,
                      cellMax: false, cellMin: false };
global.simRateSel = { '1st': { I_uA: 10 }, 'Nth': { I_uA: 10 } };
global.document = { querySelectorAll: () => [] };
// Anode (100 µAh) is smaller than cathode 1st-cycle total (50 AM + 150 salt),
// so the formation charge stops mid-plateau (undercapacitive-anode limiting).
// NB (SOC engine v2): salt drains during the formation transient and the cell
// then settles into a limit cycle — it does NOT keep spreading salt over later
// cycles the way the v1 V-drift model did (that was an artifact of re-sweeping
// the full ΔV each stroke). The salt reservoir is still a single global pool,
// conserved and oxidation-only; that is what the salt checks below assert.
global.window = {
  lastInp: {
    cat: { ac: { st: 'capacitive', c1: 50, cN: 100 }, salt: { c1: 150, cN: 0 },
           Vth: [4.2, 2.0], Vop: [4.2, 1.0] },
    an:  { st: 'capacitive', c1: 100, cN: 100, wAM: 1,
           Vth: [2.5, 0.05], Vop: [2.5, 0.05] },
  },
  lastR: {
    sane: true, mCat: 2, mAn: 1, mAC: 1, mS: 1, kc: 1,
    Qc1: 200,   // = mAC*c1 + mS*salt.c1 = 50 + 150
    Qa1: 100, QaN: 100, c10: 10,
  },
};

eval(parts.join('\n'));

let fails = 0;
const check = (label, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  [' + detail + ']' : ''));
  if (!cond) fails++;
};

// ── Test 1: time mode runs, salt conserves its budget across cycles ──
const ts = simComputeTimeSeries();
check('time mode ok', ts.ok === true, ts.msg || '');
if (ts.ok) {
  const saltTotal = 150;
  const remaining = ts.plateaus.reduce((s, p) => s + p.Q_remaining, 0);
  // Sum plateau charge actually drawn across all strokes.
  let consumed = 0, onDischarge = 0;
  for (const s of ts.strokes) {
    for (const seg of (s.catSegs || [])) {
      if (seg.kind !== 'plateau') continue;
      consumed += seg.Q_end - seg.Q_start;
      if (s.dir === 'discharge') onDischarge += seg.Q_end - seg.Q_start;
    }
  }
  check('salt: consumed + remaining == budget',
        Math.abs(consumed + remaining - saltTotal) < 1e-6,
        `consumed=${consumed.toFixed(3)} remaining=${remaining.toFixed(3)}`);
  // SOC engine v2: salt oxidizes during the formation transient, then the cell
  // settles into a limit cycle — it does NOT keep spreading salt over later
  // cycles (that was a v1 V-drift artifact of re-sweeping the full ΔV each
  // stroke). Assert the reservoir behaves as ONE global pool: it activates on
  // the formation charge and is partially drained yet never refilled
  // (0 < remaining < budget), which a per-cycle reset would violate.
  const chargeStrokesWithSalt = ts.strokes.filter(s => s.dir === 'charge' &&
      (s.catSegs || []).some(g => g.kind === 'plateau' && g.counts === false)).length;
  check('salt: oxidizes on the formation charge (global pool activates)',
        chargeStrokesWithSalt >= 1, `chargeStrokesWithSalt=${chargeStrokesWithSalt}`);
  check('salt: global pool drained but not refilled (0 < remaining < budget)',
        remaining > 1e-9 && remaining < saltTotal - 1e-9,
        `remaining=${remaining.toFixed(3)}`);
  check('salt: never activates on discharge (oxidation only)', onDischarge === 0);
  check('salt: never over-consumed', consumed <= saltTotal + 1e-9,
        `consumed=${consumed.toFixed(3)}`);

  // ── Test 2: IR-aware constraint — measured V_cell stops ON the limit ──
  // Find any stroke that ended on cellMin and verify measured V_cell there.
  const cellMinLim = (ts.constraints.cellMin && ts.constraints.cellMin.V) || 0;
  let cellMinChecked = false;
  for (const s of ts.strokes) {
    if (s.consHit !== 'cellMin' || s.frozen) continue;
    const catEnd = s.catSegs[s.catSegs.length - 1];
    const an = s.anSegs && s.anSegs[0];
    if (!catEnd || !an) continue;
    const Qend = catEnd.Q_end;
    const vAn = an.V_start + an.slope * Math.min(Qend, an.Q_end);
    const measured = (catEnd.V_end - vAn) + 2 * (s.irHalf || 0);
    check(`IR constraint: measured V_cell at stop == ${cellMinLim} V (stroke k=${s.k})`,
          Math.abs(measured - cellMinLim) < 1e-6, `measured=${measured.toFixed(6)} V`);
    cellMinChecked = true;
  }
  check('IR constraint: at least one stroke ended on Cell V_min', cellMinChecked);

  // ── Test 3: no stroke ever exceeds physical bounds by more than IR-free ε ──
  for (const s of ts.strokes) {
    for (const seg of (s.catSegs || [])) {
      if (!(seg.Q_end >= seg.Q_start - 1e-9)) {
        check('segment Q monotonic', false, `k=${s.k}`); break;
      }
    }
  }
  check('segments Q monotonic (all strokes)', true);
}

// ── Test 4: capacity mode agrees with time mode on shared physics ──
const cs = simComputeSeries();
check('capacity mode ok', cs.ok === true, cs.msg || '');
if (cs.ok && ts.ok) {
  // Stroke k=8 in time mode should match capacity mode's cycle-4 discharge
  // (startDir=charge → discharge is the even stroke of the cycle).
  simDirState = 'discharge';
  const cs8 = simComputeSeries();
  const t8 = ts.strokes.find(s => s.k === 8);
  if (t8 && cs8.ok) {
    check('modes agree on stroke k=8 Qmin',
          Math.abs(cs8.Qmin - (t8.catSegs.length ? t8.catSegs[t8.catSegs.length-1].Q_end : 0)) < 1e-6,
          `cap=${cs8.Qmin.toFixed(4)}`);
  }
}

// ── Test 5: with R_eq = 0 the cell stops exactly at internal V_cell = limit ──
// (no IR offset ⇒ the raw internal V_cell, not just the measured terminal V,
// lands on the cell constraint).
inputs['simReq'] = '0';
const ts0 = simComputeTimeSeries();
check('R_eq=0 runs ok', ts0.ok === true, ts0.msg || '');
if (ts0.ok) {
  const lim0 = (ts0.constraints.cellMin && ts0.constraints.cellMin.V) || 0;
  let ok = true, seen = false;
  for (const s of ts0.strokes) {
    if (s.consHit !== 'cellMin' || s.frozen) continue;
    seen = true;
    const catEnd = s.catSegs[s.catSegs.length - 1];
    const an = s.anSegs[0];
    const vAn = an.V_start + an.slope * Math.min(catEnd.Q_end, an.Q_end);
    if (Math.abs((catEnd.V_end - vAn) - lim0) > 1e-6) ok = false;
  }
  check('R_eq=0: internal V_cell at cellMin stop == limit (regression guard)', seen && ok);
}

/* ════════ SOC engine v2 faradaic scenarios (plan M6 / PI test spec) ════════ */

// Swap every stub for a fresh scenario. cfg: {inputs, lastInp, lastR, saltOn,
// rateSel, catAcRates, anRates, onIds (classList 'on' ids), msRows (selector →
// [{v,p}] fake multi-stage rows)}.
function setScenario(cfg){
  global.$ = id => (id in cfg.inputs)
    ? { value: String(cfg.inputs[id]),
        classList: { contains: c => (cfg.onIds || []).includes(id) } }
    : null;
  global.N = id => parseFloat(cfg.inputs[id]);
  global.saltOn = !!cfg.saltOn;
  global.simRateSel = cfg.rateSel || { '1st': { I_uA: 10 }, 'Nth': { I_uA: 10 } };
  global.catAcRates = cfg.catAcRates;
  global.anRates = cfg.anRates;
  global.document = { querySelectorAll: sel => {
    const rows = (cfg.msRows || {})[sel];
    if (!rows) return [];
    return rows.map(r => ({ querySelector: q =>
      q === '.ms-v' ? { value: String(r.v) } :
      q === '.ms-p' ? { value: String(r.p) } : null }));
  } };
  global.window = { lastInp: cfg.lastInp, lastR: cfg.lastR };
}

// LFP-like faradaic cathode (plateau 3.45 V / 90%, window 2.5–4.2, OCV 3.0,
// C1 55 / CN 50) vs EDLC anode (60/60, window 2.5–0.05, OCV at window top).
// Hand-derived map numbers: fr=0.1, S=1.7 ⇒ x0=0.0294118, g=0.9705882,
// Q_tot,1=56.6667, formation plateau 51.0; mapN plateau 45.0.
const lfp = {
  inputs: { 'cat-ac-ocv':'3.0', 'an-ocv':'2.5', 'simCycleN':'2',
            'cat-ac-st':'faradaic', 'an-st':'capacitive',
            'cat-fp-v':'3.45', 'cat-fp-p':'90' },
  lastInp: {
    cat:{ ac:{ st:'faradaic', c1:55, cN:50 }, salt:{ c1:0, cN:0 },
          Vth:[4.2,2.5], Vop:[4.2,2.5] },
    an: { st:'capacitive', c1:60, cN:60, wAM:1, Vth:[2.5,0.05], Vop:[2.5,0.05] } },
  lastR: { sane:true, mCat:1, mAn:1, mAC:1, mS:0, kc:1,
           Qc1:55, Qa1:60, QaN:60, c10:5 },
};

// ── Test 6: faradaic staircase — formation anchor, plateau geometry ──
setScenario(lfp);
const tsF = simComputeTimeSeries();
check('faradaic: time mode ok', tsF.ok === true, tsF.msg || '');
if (tsF.ok) {
  const s1 = tsF.strokes[0], s2 = tsF.strokes[1], s3 = tsF.strokes[2];
  const plats = s => (s.catSegs || []).filter(x => x.kind === 'plateau');
  check('faradaic: formation starts at OCV (first seg V_start = 3.0)',
        s1.catSegs.length && Math.abs(s1.catSegs[0].V_start - 3.0) < 1e-9,
        `V_start=${s1.catSegs[0]?.V_start}`);
  const p1 = plats(s1);
  check('faradaic: formation plateau at 3.45 V, counts:true, len 51.0',
        p1.length === 1 && p1[0].counts === true &&
        Math.abs(p1[0].V_start - 3.45) < 1e-9 &&
        Math.abs((p1[0].Q_end - p1[0].Q_start) - 51.0) < 1e-6,
        p1.length ? `V=${p1[0].V_start} len=${(p1[0].Q_end-p1[0].Q_start).toFixed(4)}` : 'none');
  check('faradaic: formation cathode-limited at C1 = 55',
        Math.abs((s1.catSegs[s1.catSegs.length-1].Q_end) - 55) < 1e-6);
  const p2 = plats(s2);
  check('faradaic: plateau REAPPEARS on discharge (reversible), len 45.0 on mapN',
        p2.length === 1 && p2[0].counts === true &&
        Math.abs(p2[0].V_start - 3.45) < 1e-9 &&
        Math.abs((p2[0].Q_end - p2[0].Q_start) - 45.0) < 1e-6,
        p2.length ? `len=${(p2[0].Q_end-p2[0].Q_start).toFixed(4)}` : 'none');
  check('faradaic: stroke 2 starts from mapN top (V_c_in = 4.2, full formation carry x=1)',
        Math.abs(s2.V_c_in - 4.2) < 1e-9, `V_c_in=${s2.V_c_in}`);
  const p3 = plats(s3);
  check('faradaic: plateau appears again on cycle-2 charge (no reservoir depletion)',
        p3.length === 1 && Math.abs((p3[0].Q_end - p3[0].Q_start) - 45.0) < 1e-6);
  check('faradaic: charge conservation in limit cycle (Q(s2) == Q(s3) == 50)',
        Math.abs(s2.catSegs[s2.catSegs.length-1].Q_end - 50) < 1e-6 &&
        Math.abs(s3.catSegs[s3.catSegs.length-1].Q_end - 50) < 1e-6);
  // SOC pinning: no cathode segment voltage ever leaves [V_th_lo, V_th_hi]
  // (formation span includes only the in-window OCV here).
  let inWin = true;
  for (const s of tsF.strokes) for (const seg of (s.catSegs || []))
    if (seg.V_start < 2.5 - 1e-9 || seg.V_start > 4.2 + 1e-9 ||
        seg.V_end   < 2.5 - 1e-9 || seg.V_end   > 4.2 + 1e-9) inWin = false;
  check('faradaic: cathode V never leaves its V_th window (SOC pinning)', inWin);
}

// ── Test 7: formation g-rule + fractional-SOC carry under a catMax truncation ──
// catMax = 3.40 V stops the formation ramp before the plateau. Hand-derived:
// formation slope below the plateau = 0.3 V/µAh ⇒ ΔQ = 0.4/0.3 = 1.33333,
// x_t = (x0·56.6667 + 1.33333)/56.6667 = 0.0529412; on mapN that lands at
// V = 2.5 + 0.95·(x_t·50/2.79412) = 3.4000.
setScenario({ ...lfp, inputs: { ...lfp.inputs, 'simCons_catMax_v': '3.40' } });
{
  const g7 = _simGatherInputs();
  check('g-rule: gather ok', g7.ok === true, g7.msg || '');
  if (g7.ok) {
    check('g-rule: formation map Q_tot = C1/g = 56.6667',
          Math.abs(g7.ctx.map1_c.Q_tot - 56.6666667) < 1e-4, `Q_tot=${g7.ctx.map1_c.Q_tot.toFixed(5)}`);
    check('g-rule: x0 = OCV position = 0.0294118',
          Math.abs(g7.ctx.map1_c.x0 - 0.0294118) < 1e-6, `x0=${g7.ctx.map1_c.x0.toFixed(7)}`);
    const s1 = _simAdvanceOneStroke(1, g7.ctx.map1_c.x0, g7.ctx.map1_a.x0, g7.ctx);
    check('g-rule: formation stopped by catMax at 3.40 V',
          s1.consHit === 'catMax' && Math.abs(s1.V_c_end - 3.40) < 1e-9,
          `consHit=${s1.consHit} V=${s1.V_c_end}`);
    check('carry: truncated formation SOC x_t = 0.0529412',
          Math.abs(s1.x_c_end - 0.0529412) < 1e-6, `x_t=${s1.x_c_end.toFixed(7)}`);
    const s2 = _simAdvanceOneStroke(2, s1.x_c_end, s1.x_a_end, g7.ctx);
    check('carry: stroke 2 reads the SAME fractional x on mapN (V_c_in = 3.4000)',
          Math.abs(s2.V_c_in - 3.4000) < 1e-3, `V_c_in=${s2.V_c_in.toFixed(5)}`);
  }
}

// ── Test 8: salt + AM plateau interleaving on the cathode ──
// AM plateau 3.45 V / 50% + sacrificial salt at 3.65 V (100 µAh reservoir).
// Expected charge-stroke order by ascending V: ramp · AM plateau (counts:true)
// · ramp · salt plateau (counts:false) · ramp.
setScenario({
  inputs: { 'cat-ac-ocv':'3.0', 'an-ocv':'2.5', 'simCycleN':'2',
            'cat-ac-st':'faradaic', 'an-st':'capacitive',
            'cat-fp-v':'3.45', 'cat-fp-p':'50', 'cat-s-vredox':'3.65' },
  lastInp: {
    cat:{ ac:{ st:'faradaic', c1:55, cN:50 }, salt:{ c1:100, cN:0 },
          Vth:[4.2,2.5], Vop:[4.2,2.5] },
    an: { st:'capacitive', c1:300, cN:300, wAM:1, Vth:[2.5,0.05], Vop:[2.5,0.05] } },
  lastR: { sane:true, mCat:2, mAn:1, mAC:1, mS:1, kc:1,
           Qc1:155, Qa1:300, QaN:300, c10:5 },
  saltOn: true,
});
const tsS = simComputeTimeSeries();
check('salt+AM: time mode ok', tsS.ok === true, tsS.msg || '');
if (tsS.ok) {
  const s1 = tsS.strokes[0];
  const kinds = (s1.catSegs || []).map(x => x.kind + ':' + (x.counts === false ? 'salt' : 'am'));
  const plats = (s1.catSegs || []).filter(x => x.kind === 'plateau');
  check('salt+AM: both plateaus present on formation charge, AM below salt',
        plats.length === 2 &&
        Math.abs(plats[0].V_start - 3.45) < 1e-9 && plats[0].counts === true &&
        Math.abs(plats[1].V_start - 3.65) < 1e-9 && plats[1].counts === false,
        kinds.join(' · '));
  check('salt+AM: salt reservoir decremented, AM plateau reservoir-free',
        tsS.plateaus.length === 1 && tsS.plateaus[0].Q_remaining < 100 - 1e-9,
        `remaining=${tsS.plateaus[0]?.Q_remaining}`);
  const s2 = tsS.strokes[1];
  const p2 = (s2.catSegs || []).filter(x => x.kind === 'plateau');
  check('salt+AM: discharge keeps the reversible AM plateau, drops the salt',
        p2.length === 1 && p2[0].counts === true && Math.abs(p2[0].V_start - 3.45) < 1e-9,
        p2.map(x => x.V_start).join(','));
}

// ── Test 9: discharge-first on a fresh cell (x pinned at 0) freezes stroke 1 ──
setScenario(lfp);
{
  const g9 = _simGatherInputs();
  if (g9.ok) {
    const ctx9 = { ...g9.ctx, startDir: 'discharge',
                   Vocv_c: 2.5, Vocv_a: 2.5 };  // as-assembled: both at window edge
    ctx9.map1_c = _simBuildElectrodeMap('cat', '1st', ctx9);
    ctx9.map1_a = _simBuildElectrodeMap('an', '1st', ctx9);
    ctx9.mapN_c = g9.ctx.mapN_c; ctx9.mapN_a = g9.ctx.mapN_a;
    const s1 = _simAdvanceOneStroke(1, ctx9.map1_c.x0, ctx9.map1_a.x0, ctx9);
    check('fresh-cell discharge-first: stroke 1 cannot advance (Qmin = 0)',
          s1.Qmin <= 1e-9, `Qmin=${s1.Qmin}`);
    check('fresh-cell discharge-first: degenerate-g map warning surfaced',
          Array.isArray(ctx9._mapWarn) && ctx9._mapWarn.length >= 1,
          (ctx9._mapWarn || []).join(' | '));
  }
}

// ── Test 10: rate module — unit normalization, log-interp, φ integration ──
check('rate: mA/g passthrough', _simRateNorm(100, 'mA/g') === 100);
check('rate: A/g → mA/g', _simRateNorm(0.5, 'A/g') === 500);
check('rate: C-rate anchored by capacity', _simRateNorm(2, 'C', 150) === 300);
check('rate: C-rate w/o capacity dropped', _simRateNorm(2, 'C', null) === null);
check('rate: mA/cm² with loading', Math.abs(_simRateNorm(2, 'mA/cm²', null, 0.01) - 200) < 1e-9);
check('rate: mA/cm² w/o loading dropped', _simRateNorm(2, 'mA/cm²', null, null) === null);
check('rate: unknown unit dropped', _simRateNorm(5, 'zorb') === null);
check('rate: non-positive rate dropped', _simRateNorm(-1, 'mA/g') === null);
{
  const lad = [{ i: 10, c: 100 }, { i: 1000, c: 60 }];
  const mid = _simRateCapAt(lad, 100);
  check('rate: log10-linear midpoint (i=100 → c=80)',
        Math.abs(mid.c - 80) < 1e-9 && mid.clamped === false, `c=${mid.c}`);
  check('rate: clamped below ladder', _simRateCapAt(lad, 5).c === 100 && _simRateCapAt(lad, 5).clamped === true);
  check('rate: clamped above ladder', _simRateCapAt(lad, 5000).c === 60 && _simRateCapAt(lad, 5000).clamped === true);
  const f = _simRateCapFactor(lad, 100, 10);
  check('rate: φ = c(i_app)/c(i_ref) = 0.8', Math.abs(f.phi - 0.8) < 1e-9 && f.usable === true, `phi=${f.phi}`);
  check('rate: <2 rows ⇒ φ=1 fallback', _simRateCapFactor([{ i: 10, c: 100 }], 100, 10).usable === false);
  const fb = _simRateCapFactor([{ i: 1, c: 100 }, { i: 100, c: 1 }], 100, 1);
  check('rate: φ band-clamped to 0.05', Math.abs(fb.phi - 0.05) < 1e-12 && fb.clamped === true, `phi=${fb.phi}`);
}
// Integration: cN ladder 100→60 mAh/g over 10→1000 mA/g, input capacity
// measured at 10 mA/g, sim current 100 µA on 1 mg AM ⇒ i_app 100 mA/g ⇒
// φ_cN = 80/100 = 0.8 ⇒ mapN Q_tot = 50·0.8 = 40. Formation ladder has no c1
// values ⇒ φ_c1 = 1 ⇒ map1 unscaled.
setScenario({ ...lfp,
  inputs: { ...lfp.inputs, 'cat-ac-rN': '10', 'cat-ac-rN-ru': 'mA/g' },
  rateSel: { '1st': { I_uA: 10 }, 'Nth': { I_uA: 100 } },
  catAcRates: [ { rv: 10, ru: 'mA/g', c1: null, cN: 100 },
                { rv: 1000, ru: 'mA/g', c1: null, cN: 60 } ],
});
{
  const gR = _simGatherInputs();
  check('rate: gather ok with ladder', gR.ok === true, gR.msg || '');
  if (gR.ok) {
    check('rate: φ_cN = 0.8 exposed in rateInfo',
          Math.abs(gR.rateInfo.cat.cN.phi - 0.8) < 1e-9 && gR.rateInfo.cat.cN.usable === true,
          `phi=${gR.rateInfo.cat.cN.phi}`);
    check('rate: mapN_c budget scaled to 40 µAh',
          Math.abs(gR.ctx.mapN_c.Q_tot - 40) < 1e-9, `Q_tot=${gR.ctx.mapN_c.Q_tot}`);
    check('rate: formation map unscaled (no usable c1 ladder)',
          Math.abs(gR.ctx.map1_c.Q_tot - 56.6666667) < 1e-4 && gR.rateInfo.cat.c1.usable === false);
    check('rate: salt-free budgets — Q_salt untouched by φ', gR.Q_salt_1st === 0);
  }
}

// ── Test 11: multi-stage plateau spec via the editor rows ──
setScenario({ ...lfp,
  // 'an-fp-ms-sw' must exist as an input key for the $ stub to return an
  // element; its 'on' state comes from onIds.
  inputs: { ...lfp.inputs, 'an-st': 'faradaic', 'an-fp-ms-sw': '' },
  onIds: ['an-fp-ms-sw'],
  msRows: { '#an-fp-ms-rows .ms-row': [ { v: 0.2, p: 30 }, { v: 0.12, p: 30 }, { v: 0.09, p: 30 } ] },
  lastInp: { ...lfp.lastInp,
    an: { st: 'faradaic', c1: 60, cN: 60, wAM: 1, Vth: [1.5, 0.05], Vop: [1.5, 0.05] } },
});
{
  const spec = _simReadPlateauSpec('an');
  check('multi-stage: 3 stages read from editor rows', spec.length === 3, JSON.stringify(spec));
  const gM = _simGatherInputs();
  check('multi-stage: gather ok', gM.ok === true, gM.msg || '');
  if (gM.ok) {
    // Anode map: V falls with q, so plateaus appear in DESCENDING V order.
    const plats = gM.ctx.mapN_a.segs.filter(s => s.kind === 'plateau');
    check('multi-stage: anode mapN has 3 plateaus in descending V',
          plats.length === 3 &&
          plats[0].V0 > plats[1].V0 && plats[1].V0 > plats[2].V0,
          plats.map(p => p.V0).join(' > '));
    check('multi-stage: each plateau holds 30% of Q_tot (18 µAh)',
          plats.every(p => Math.abs((p.q1 - p.q0) - 18) < 1e-9),
          plats.map(p => (p.q1 - p.q0).toFixed(3)).join(','));
    // Reversibility guard: AM plateaus are NOT one-shot — the anode's
    // staircase must appear on the reverse (discharge) stroke too.
    const s1 = _simAdvanceOneStroke(1, gM.ctx.map1_c.x0, gM.ctx.map1_a.x0, gM.ctx);
    const s2 = _simAdvanceOneStroke(2, s1.x_c_end, s1.x_a_end, gM.ctx);
    check('multi-stage: anode plateaus REAPPEAR on the discharge stroke (reversible)',
          (s2.anSegs || []).filter(x => x.kind === 'plateau').length >= 1,
          `k2 anode plateaus=${(s2.anSegs || []).filter(x => x.kind === 'plateau').length}`);
  }
}

// ── Test 12: potential-RANGE stages — AM band + croconate-like salt band ──
// (a) AM band: cathode faradaic stage 3.3→3.6 V / 50% ⇒ the mapN carries a
// capacity-carrying sloped band (kind ramp, band:true) of 25 µAh spanning
// exactly 3.3–3.6 V. (b) Salt band 3.6→3.7 V: the emitted salt segment sweeps
// the band, carries the parallel AM share, and a partially consumed reservoir
// resumes at the interpolated voltage on the next charge.
setScenario({ ...lfp,
  inputs: { ...lfp.inputs, 'cat-fp-v': '3.3', 'cat-fp-p': '50', 'cat-fp-v2': '3.6',
            'cat-s-vredox': '3.6', 'cat-s-vredox2': '3.7' },
  lastInp: { ...lfp.lastInp,
    cat: { ac: { st:'faradaic', c1:55, cN:50 }, salt: { c1:100, cN:0 },
           Vth: [4.2,2.5], Vop: [4.2,2.5] },
    an:  { st:'capacitive', c1:80, cN:80, wAM:1, Vth:[2.5,0.05], Vop:[2.5,0.05] } },
  lastR: { sane:true, mCat:2, mAn:1, mAC:1, mS:1, kc:1,
           Qc1:155, Qa1:80, QaN:80, c10:5 },
  saltOn: true,
});
{
  const spec12 = _simReadPlateauSpec('cat');
  check('range: spec carries V2 (3.3→3.6 band)',
        spec12.length === 1 && Math.abs(spec12[0].V - 3.3) < 1e-9 &&
        Math.abs(spec12[0].V2 - 3.6) < 1e-9, JSON.stringify(spec12));
  const g12 = _simGatherInputs();
  check('range: gather ok', g12.ok === true, g12.msg || '');
  if (g12.ok) {
    const band = g12.ctx.mapN_c.segs.find(s => s.band === true);
    check('range: mapN has a sloped band 3.3→3.6 V of 25 µAh (kind ramp)',
          !!band && band.kind === 'ramp' &&
          Math.abs(band.V0 - 3.3) < 1e-9 && Math.abs(band.V1 - 3.6) < 1e-9 &&
          Math.abs((band.q1 - band.q0) - 25) < 1e-6,
          band ? `V ${band.V0}→${band.V1} len=${(band.q1-band.q0).toFixed(3)}` : 'none');
    // Salt band state: Vlo=3.6, Vhi=3.7, budget 100; fresh stage resumes at 3.6.
    check('range: salt stage carries band edges (3.6→3.7)',
          g12.plateaus.length === 1 && Math.abs(g12.plateaus[0].V - 3.6) < 1e-9 &&
          Math.abs(g12.plateaus[0].Vhi - 3.7) < 1e-9,
          JSON.stringify(g12.plateaus.map(p => ({V:p.V, Vhi:p.Vhi}))));
    check('range: fresh salt stage resumes at its low edge',
          Math.abs(_simSaltResumeV(g12.plateaus[0]) - 3.6) < 1e-12);
    // Walk stroke 1: anode (80) limits before the cathode's 155 total, so the
    // salt band is entered but NOT finished — the reservoir must resume at an
    // interpolated V in (3.6, 3.7) on the next charge stroke.
    const s1 = _simAdvanceOneStroke(1, g12.ctx.map1_c.x0, g12.ctx.map1_a.x0, g12.ctx);
    const saltSeg = (s1.catSegsFull || []).find(x => x.counts === false);
    check('range: emitted salt segment sweeps upward from 3.6 (sloped, salt+AM split)',
          !!saltSeg && Math.abs(saltSeg.V_start - 3.6) < 1e-9 &&
          saltSeg.V_end > saltSeg.V_start + 1e-9 &&
          Number.isFinite(saltSeg.saltQ) && saltSeg.saltQ > 0,
          saltSeg ? `V ${saltSeg.V_start.toFixed(3)}→${saltSeg.V_end.toFixed(3)} saltQ=${saltSeg.saltQ.toFixed(2)} amQ=${(saltSeg.amQ||0).toFixed(2)}` : 'none');
    const p12 = g12.plateaus[0];
    check('range: partially consumed reservoir (0 < remaining < 100)',
          p12.Q_remaining > 1e-9 && p12.Q_remaining < 100 - 1e-9,
          `remaining=${p12.Q_remaining.toFixed(3)}`);
    const vRes = _simSaltResumeV(p12);
    check('range: resume V interpolated inside the band',
          vRes > 3.6 + 1e-9 && vRes < 3.7 - 1e-9, `vRes=${vRes.toFixed(4)}`);
  }
}

// ── Test 13: plateau bands touching / exceeding the window edges ──
// (a) An anode band running down TO the window edge (1.0→0.05 V with
// V_th_lo = 0.05, the reported case) must be ACCEPTED and span exactly to the
// edge. (b) A cathode band exceeding the top edge is CLAMPED with a warning.
setScenario({ ...lfp,
  inputs: { ...lfp.inputs, 'an-st': 'faradaic',
            'an-fp-v': '1.0', 'an-fp-p': '90', 'an-fp-v2': '0.05',
            'cat-fp-v': '4.0', 'cat-fp-p': '50', 'cat-fp-v2': '4.4' },
  lastInp: { ...lfp.lastInp,
    an: { st: 'faradaic', c1: 60, cN: 60, wAM: 1, Vth: [2.0, 0.05], Vop: [2.0, 0.05] } },
});
{
  const g13 = _simGatherInputs();
  check('edge band: gather ok', g13.ok === true, g13.msg || '');
  if (g13.ok) {
    const anBand = g13.ctx.mapN_a.segs.find(s => s.band === true);
    check('edge band: anode 1.0→0.05 V accepted down to the window edge',
          !!anBand && Math.abs(Math.min(anBand.V0, anBand.V1) - 0.05) < 1e-9 &&
          Math.abs(Math.max(anBand.V0, anBand.V1) - 1.0) < 1e-9 &&
          Math.abs((anBand.q1 - anBand.q0) - 54) < 1e-6,
          anBand ? `V ${anBand.V1}→${anBand.V0} len=${(anBand.q1-anBand.q0).toFixed(2)}` : 'DROPPED');
    const catBand = g13.ctx.mapN_c.segs.find(s => s.band === true);
    check('over band: cathode 4.0→4.4 V clamped to the 4.2 V window top',
          !!catBand && Math.abs(Math.max(catBand.V0, catBand.V1) - 4.2) < 1e-9 &&
          Math.abs((catBand.q1 - catBand.q0) - 25) < 1e-6,
          catBand ? `V ${catBand.V0}→${catBand.V1}` : 'DROPPED');
    check('over band: clamp warning surfaced',
          Array.isArray(g13.ctx._mapWarn) && g13.ctx._mapWarn.some(w => /clamped/.test(w)),
          (g13.ctx._mapWarn || []).join(' | '));
    const ts13 = simComputeTimeSeries();
    check('edge band: full time series still runs', ts13.ok === true, ts13.msg || '');
  }
}

// ── Test 14: V(t) sampling carries the ANODE staircase in every cycle ──
// The v1 time-series sampled only cathode segment corners, so a faradaic
// anode against a single-ramp EDLC cathode rendered as a straight line from
// cycle 2 on. Sampling now unions both electrodes' breakpoints: the anode's
// plateau voltages must appear among the samples of a cycle-2 stroke.
setScenario({ ...lfp,
  inputs: { ...lfp.inputs, 'an-st': 'faradaic', 'an-fp-ms-sw': '', 'simCycleN': '2' },
  onIds: ['an-fp-ms-sw'],
  msRows: { '#an-fp-ms-rows .ms-row': [ { v: 0.2, p: 30 }, { v: 0.12, p: 30 }, { v: 0.09, p: 30 } ] },
  lastInp: { ...lfp.lastInp,
    cat: { ac: { st: 'capacitive', c1: 55, cN: 50 }, salt: { c1: 0, cN: 0 },
           Vth: [4.2, 2.5], Vop: [4.2, 2.5] },
    an: { st: 'faradaic', c1: 60, cN: 60, wAM: 1, Vth: [1.5, 0.05], Vop: [1.5, 0.05] } },
});
{
  const ts14 = simComputeTimeSeries();
  check('V(t) staircase: time mode ok', ts14.ok === true, ts14.msg || '');
  if (ts14.ok && ts14.strokes.length >= 3) {
    const s3 = ts14.strokes[2];               // cycle-2 charge stroke
    const idx = [];
    for (let i = 0; i < ts14.ts.length; i++)
      if (ts14.ts[i] > s3.t_start + 1e-9 && ts14.ts[i] <= s3.t_end + 1e-9) idx.push(i);
    const vaSet = new Set(idx.map(i => +ts14.va[i].toFixed(4)));
    const hasPlat = [0.2, 0.12, 0.09].filter(v => vaSet.has(+v.toFixed(4))).length;
    check('V(t) staircase: cycle-2 stroke samples include the anode plateau voltages',
          idx.length >= 5 && hasPlat >= 3,
          `samples=${idx.length} plateauVs=${hasPlat} [${[...vaSet].join(',')}]`);
  }
}

// ── Test 15: zero-capacity window remainder renders as a terminal vertical ──
// Anode with a 100% plateau at 1.0 V (window 2.0–0.05): the ramp back to the
// window top carries no capacity, so the discharge stroke must END with a
// zero-length vertical segment up to 2.0 V (previously dropped by truncation,
// hiding the "straight line up").
// (Anode sized well below the cathode's post-formation discharge budget so
// the discharge stroke is genuinely anode-limited and reaches q=0.)
setScenario({ ...lfp,
  inputs: { ...lfp.inputs, 'an-st': 'faradaic', 'an-fp-v': '1.0', 'an-fp-p': '100' },
  lastInp: { ...lfp.lastInp,
    an: { st: 'faradaic', c1: 10, cN: 10, wAM: 1, Vth: [2.0, 0.05], Vop: [2.0, 0.05] } },
  lastR: { ...lfp.lastR, Qa1: 10, QaN: 10 },
});
{
  const ts15 = simComputeTimeSeries();
  check('terminal vertical: time mode ok', ts15.ok === true, ts15.msg || '');
  if (ts15.ok && ts15.strokes.length >= 2) {
    const s2 = ts15.strokes[1];               // discharge — anode-limited (40 < 50)
    const segs = s2.anSegs || [];
    const last = segs[segs.length - 1];
    check('terminal vertical: discharge ends with a zero-length step up to the window top (2.0 V)',
          !!last && (last.Q_end - last.Q_start) <= 1e-12 &&
          Math.abs(last.V_end - 2.0) < 1e-9,
          last ? `len=${(last.Q_end-last.Q_start).toExponential(1)} V ${last.V_start}→${last.V_end}` : 'none');
    // And the V(t) samples actually reach 2.0 V within that stroke's window.
    let reach = -Infinity;
    for (let i = 0; i < ts15.ts.length; i++)
      if (ts15.ts[i] >= s2.t_start - 1e-9 && ts15.ts[i] <= s2.t_end + 1e-9)
        reach = Math.max(reach, ts15.va[i]);
    check('terminal vertical: V(t) anode samples reach the window top',
          Math.abs(reach - 2.0) < 1e-9, `reach=${reach}`);
  }
}

process.exit(fails ? 1 : 0);
