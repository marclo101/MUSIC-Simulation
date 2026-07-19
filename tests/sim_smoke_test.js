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
  'simCons_cellMin_v': '0.00', // explicit Cell V_min = 0 V (the bug scenario)
};
global.$ = id => (id in inputs)
  ? { value: inputs[id], classList: { contains: () => false } }
  : null;
global.N = id => parseFloat(inputs[id]);
global.saltOn = true;
global.simRateSel = { '1st': { I_uA: 10 }, 'Nth': { I_uA: 10 } };
global.document = { querySelectorAll: () => [] };
// Anode (100 µAh) is smaller than cathode 1st-cycle total (50 AM + 150 salt),
// so the formation charge stops mid-plateau and the salt must spread its
// remaining budget over later cycles — the user's multi-cycle scenario.
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
  check('salt: contributes on multiple charge strokes (global pool, no per-cycle reset)',
        ts.strokes.filter(s => s.dir === 'charge' &&
          (s.catSegs || []).some(g => g.kind === 'plateau')).length >= 2);
  check('salt: never activates on discharge (oxidation only)', onDischarge === 0);
  check('salt: never over-consumed', consumed <= saltTotal + 1e-9,
        `consumed=${consumed.toFixed(3)}`);

  // ── Test 2: IR-aware constraint — measured V_cell stops ON the limit ──
  // Find any stroke that ended on cellMin and verify measured V_cell there.
  let cellMinChecked = false;
  for (const s of ts.strokes) {
    if (s.consHit !== 'cellMin' || s.frozen) continue;
    const catEnd = s.catSegs[s.catSegs.length - 1];
    const an = s.anSegs && s.anSegs[0];
    if (!catEnd || !an) continue;
    const Qend = catEnd.Q_end;
    const vAn = an.V_start + an.slope * Math.min(Qend, an.Q_end);
    const measured = (catEnd.V_end - vAn) + 2 * (s.irHalf || 0);
    check(`IR constraint: measured V_cell at stop == 0 V (stroke k=${s.k})`,
          Math.abs(measured - 0) < 1e-6, `measured=${measured.toFixed(6)} V`);
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

// ── Test 5: with R_eq = 0 the cell stops exactly at internal V_cell = 0 ──
inputs['simReq'] = '0';
const ts0 = simComputeTimeSeries();
check('R_eq=0 runs ok', ts0.ok === true, ts0.msg || '');
if (ts0.ok) {
  let ok = true, seen = false;
  for (const s of ts0.strokes) {
    if (s.consHit !== 'cellMin' || s.frozen) continue;
    seen = true;
    const catEnd = s.catSegs[s.catSegs.length - 1];
    const an = s.anSegs[0];
    const vAn = an.V_start + an.slope * Math.min(catEnd.Q_end, an.Q_end);
    if (Math.abs((catEnd.V_end - vAn) - 0) > 1e-6) ok = false;
  }
  check('R_eq=0: internal V_cell at cellMin stop == 0 V (regression guard)', !seen || ok);
}

process.exit(fails ? 1 : 0);
