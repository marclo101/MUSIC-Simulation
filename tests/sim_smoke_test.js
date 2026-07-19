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
  extract('_simReadSaltStages', 'fn'),
  // SOC engine v2 (M1) — canonical map builder + helpers.
  extract('_simVonSeg', 'fn'),
  extract('_simXatV_asc', 'fn'),
  extract('_simBuildElectrodeMap', 'fn'),
  extract('_simMapVatQ', 'fn'),
  extract('_simMapSliceFrom', 'fn'),
  extract('_simVatQinSegs', 'fn'),
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

process.exit(fails ? 1 : 0);
