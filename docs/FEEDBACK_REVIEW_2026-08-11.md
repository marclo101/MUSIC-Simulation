# Review of user feedback — "Notes on MUSIC balancing Tool", 11.08.2026 (AH)

Every point below was traced into `MUSIC_electrode_balance_V10.html` before a verdict was
written. Line numbers are from the current `main`. Verdicts are one of:

- **BUG** — the code does something other than what it claims.
- **GAP** — the code is correct but silent where it should speak.
- **FEATURE** — new capability, not a defect.
- **DOC** — wording only; behaviour is already right.

---

## Headline: two of the reporter's items are the same root cause

The C-rate ceiling (item 4) is not just an input annoyance — it silently invalidated the
reporter's own validation experiment (item 13). They intended 60C, the tool locked to 6C,
and the simulation therefore ran at **one tenth** of the current the real cell saw
(screenshot: `Nth cycle: 6C (Cell parameters) → I = 767 µA`). The tool then predicted
15 mAh/g<sub>cell</sub> against a measured 5 mAh/g<sub>cell</sub>, and the reporter recorded
that as "not fully accurate … from theory to praxis". A large part of that 3× gap is the
rate bug, not model error. **Fix item 4 first, then ask them to re-run the comparison
before we treat the discrepancy as physics.**

---

## 1. "Specify charge capacity (to be safe)" — CLARITY | SCIENTIFIC ACCURACY

**Verdict: DOC.**

The maths is unambiguous — `Qc1 = mAC·Cc1 + mS·Cs1` and `Qa1 = mAn·wA·Ca1`
(`solve()`, line 6530 ff.) — but the labels never say *which* half-cell stroke the number
comes from. `C₁ₛₜ` on the cathode is described as "the charge delivered on the very first
half-cycle" (line 823) while `C₁ₛₜ` on the anode is "capacity on initial
sodiation/lithiation" (line 915). Those are two different sign conventions stated in prose,
and a user with a half-cell dataset in front of them has to reverse-engineer the intent.

**Proposed action**

- Add an explicit charge/discharge word to both `C₁ₛₜ` field labels and their tooltips:
  - cathode `C₁ₛₜ` → *"first **charge** (de-sodiation/de-lithiation) capacity of the AM,
    measured in a half cell"*
  - anode `C₁ₛₜ` → *"first **discharge** (sodiation/lithiation) capacity, i.e. including
    the irreversible SEI loss"*
- Same treatment for `Cₙₜₕ` ("reversible capacity, the **discharge** of a settled cycle").
- Add a one-line convention note at the top of the AM cards: *all capacities are half-cell
  values vs. the metal, normalised per gram of that component alone.*

**Effort:** small — text only, no logic.

---

## 2. "Target N/P ratio covers the 'different 1st cycle' option" — USER FRIENDLINESS

**Verdict: GAP (layout/grouping).**

Not a z-index collision — `.cellp-fld` is a plain flex column (line 79), so nothing
physically overlaps. The problem is grouping: the `Different 1st cycle` toggle (line 762)
and its input (line 763) are children of the **Target N/P ratio** field block, under that
field's label. Visually the toggle reads as a modifier of the Nth-cycle target rather than
as a second, independent target. That is exactly the confusion item 3 then reports.

**Proposed action**

- Promote the formation target out of the Target-N/P field into its own labelled block, and
  replace the on/off button with a three-state segmented control that names all the options:

  | Option | Behaviour |
  |---|---|
  | **Same as Nth** (default) | `t1 = t` — current toggle-off behaviour |
  | **Custom** | `t1` from the input — current toggle-on behaviour |
  | **Unconstrained** | do not target the 1st cycle at all (see item 3) |

- The block should be visibly disabled, with a reason, when no sacrificial salt is on
  (item 3).

**Effort:** small–medium — markup + `toggleNp1st()` becomes a 3-way setter (line 2567).

---

## 3. "'Different 1st cycle' — is there a recommendation? … it doesn't change anything in the calculation" — USER FRIENDLINESS | SCIENTIFIC ACCURACY

**Verdict: BUG (silent no-op), and the reporter's proposed default is the right one.**

They are correct on all three counts, and the code says why.

`np1stTargetVal()` (line 2457) has exactly one consumer: `t1` inside `solve()` (line 6549).
`t1` is then read in only **three** of the eight solver branches — all of them in the
salt-sized-by-solver block (line 6578 ff.) plus `dualAn1st` (line 6568). Concretely:

| Situation | Is `t1` used? |
|---|---|
| No sacrificial salt (`!saltOn`, line 6551) | **No** — never referenced |
| Salt on, solver picks the amount | Yes |
| Known salt % + **cathode** pinned (`mode==="anode"`, line 6563) | Yes, as the second reported anode mass |
| **Known salt % + anode pinned** (`mode==="cathode"`, line 6570) | **No** |

The reporter's session was the last row — screenshot 1 shows `CATHODE CALCULATED` with a
fixed 30% salt content and only the HC mass pinned. In that branch the cathode mass is
solved purely from `t`; `t1` is dropped on the floor. So the field genuinely did nothing,
and the tool never said so. The resulting `N/P · 1st cycle = 148.0%` was an *output* they
had no control over, presented with a colour scale implying they had missed a target.

Their instinct — *"why not leave it open in a way that matches the difference given from the
half-cell capacities in the first cycle and matches the target N/P at nth cycle"* — is the
physically sensible default, and it is **not** currently available. With the toggle off the
solver does not leave the 1st cycle free; it forces `t1 = t`, i.e. it actively spends salt to
drag formation onto the Nth-cycle target.

**Proposed action**

1. **Add the "Unconstrained" mode** from item 2 and make it the recommended setting: size
   the salt from the measured ICE gap (`mS = mAn·wA·(Ca1 − CaN)/Cs1`), let `r₁` land where
   the chemistry puts it, and hold `rN = t`. Display the resulting `N/P · 1st` as a plain
   readout with no target colouring.
2. **Never accept a `t1` the solver cannot honour.** In the two branches that ignore it,
   disable the input and print the reason inline — *"salt content is fixed, so the formation
   ratio is a result, not a target"* / *"no sacrificial salt: nothing can move the 1st-cycle
   ratio"*.
3. **Close the reported asymmetry.** With a fixed salt %, cathode-pinned mode returns two
   anode masses (`mAn` for Nth, `dualAn1st` for 1st, line 6568). Anode-pinned mode should
   mirror that and return a dual cathode mass, instead of quietly reporting one.
4. Add a short "which should I pick?" note to the help text — *unconstrained* for
   characterising a real cell, *custom* only when deliberately over/under-lithiating at
   formation.

**Effort:** medium — one new solver branch, two guards, UI from item 2. **Highest-value
item in the list**, because it is the one that produced a wrong-looking number in their run.

---

## 4. "I can't enter 60C … it says 6C equals 10 min" — BUG

**Verdict: BUG. Confirmed and fully explained.**

`onCellRateChange()` (line 2542) validates with:

```js
return (Number.isFinite(v)&&v>0&&v<=20)?v:cur;  // out of range — keep the old value
```

Typing `60` fires `oninput` twice. At `6` the value is accepted (`cellRateNth = 6`); at `60`
it exceeds 20, so the handler **silently keeps 6** while the field still shows `60`. The
read-out then says "= 6C · 10 min per charge or discharge" — which is exactly what they saw
and exactly what they reported. The same 20C ceiling comes in via `max="20"` on the two
inputs (lines 768, 780) and `min="0.05"` on the two divisor inputs (lines 771, 783),
enforced again in `onCellRateDiv()` (line 2537).

The failure mode is worse than the ceiling itself: the input is rejected *without feedback*,
and the displayed field disagrees with the state used for the simulation.

**Proposed action**

1. Raise the ceiling to **1000C** (`max="1000"` on the multiplier fields, `min="0.001"` on
   the divisor fields, and the matching bounds at lines 2537 and 2547). 20C is arbitrary and
   excludes ordinary AC/hybrid-device testing; 60C = 1 min is a routine operating point.
   `fRateTime()` (line 2472) already formats sub-minute durations in seconds, so the
   read-out needs no change.
2. **Never silently revert.** On an out-of-range or unparseable entry, mark the field
   invalid and show the reason, instead of keeping the previous value behind a field that
   displays something else.
3. Re-check the Rates & Diagnostics ladder (C/20 … 5C) once the ceiling moves — the design
   rate is appended to that ladder, so a 60C design point should appear there and be
   flagged as beyond the measured range rather than extrapolated blindly.

**Effort:** small for (1) and (2); small–medium for (3).

---

## 5. "Should I enter C₁ₛₜ for the AM as the capacity *without* sacrificial salt?" — CLARITY

**Verdict: DOC. Their assumption is correct.**

`Qc1 = mAC·Cc1 + mS·Cs1` (line 6530 ff.) — the AM and the salt contribute through separate
masses and separate specific capacities. So:

- Cathode AM `C₁ₛₜ`: mAh per gram of **AM alone**, salt-free.
- Salt `C₁ₛₜ`: mAh per gram of **salt alone** (their 290 mAh/g for Na₂C₄O₄ is entered as-is).
- `Known salt content` is a percentage of the **total electrode mass**, bounded by the
  AM-zone `wAM` (`saltFrac = min(frac, wC)`, line 6559).

**Proposed action**

- Suffix the unit chips so the basis is visible without opening a tooltip:
  `mAh/g` → `mAh g⁻¹(AM)` on AM fields, `mAh g⁻¹(salt)` on salt fields.
- One line under the sacrificial-additive panel: *"AM and salt capacities are independent —
  enter each per gram of that component. Do not fold the salt into the AM capacity."*

**Effort:** small — text only.

---

## 6. "Rename anode/cathode → positive/negative electrode" — SCIENTIFIC ACCURACY

**Verdict: Valid, and the tool is already inconsistent with itself.**

The reporter is right on the electrochemistry: in a secondary cell the roles swap between
charge and discharge, so "anode/cathode" is only well-defined per stroke. The tool's own
headline metric is **N/P** — negative/positive — while every label around it says
anode/cathode. The card headers already carry `positive` / `negative` as sub-labels
(line ~790), so the intent is present but not carried through.

Scope: 256 lines mention "cathode", 235 mention "anode", but these are overwhelmingly
user-visible strings and comments. The DOM ids (`cat-ac-c1`, `an-mass`, …) and the export
keys are internal, and `tests/smoke.js` / `tests/sim_smoke_test.js` drive the page by **id**,
not by label — so a display-only rename does not break the test suite.

**Proposed action**

- Add a terminology switch in the header: **Positive / Negative** (default) ↔
  **Cathode / Anode**, persisted in `localStorage`. Keep every id, variable name and export
  key unchanged.
- Where a stroke direction is unambiguous (the Simulation tab's formation half-cycle), the
  anode/cathode wording may stay — that is the one place it is strictly correct.
- Keep `N/P` as the ratio name; it becomes self-consistent once the electrodes are named
  N and P.

**Effort:** medium — mechanical, but touches many strings; worth doing in one pass with a
single `TERMS` lookup rather than by hand.

---

## 7. "I'm missing a mass N/P ratio (often indicated in papers)" — SCIENTIFIC ACCURACY

**Verdict: GAP. Strongly supported by their own data.**

There is no mass-ratio output anywhere in the results panel; the closest is the
`Mass loading ratio · 1 cm²` solver *mode*, which is a different thing. Yet the reporter's
comparison figure is captioned **"mass balancing 'HC 1:1.6 AC'"** — the mass ratio is the
number they actually used to match tool against experiment, and they had to divide it out by
hand. From screenshot 1: 3.551 mg / 2.152 mg = **1.650**, i.e. their 1:1.6, which is why they
wrote "exact same mass balancing".

**Proposed action**

Add two cells to the results hero/detail grid:

- **m(P) : m(N), total film** — total electrode masses as weighed (`r.mCat / r.mAn`). This
  is the paper convention and the one that reproduces their 1:1.6.
- **m(AM,P) : m(AM,N)** — active-material only (`r.mAC·… / r.mAn·wA`), which for their case
  is 1.10 and is *not* the same number. Showing both prevents exactly the ambiguity that
  makes published ratios hard to reproduce.

Render as `1 : X` normalised on the negative electrode, and include both in every export.

**Effort:** small — two derived values, no solver change.

---

## 8. "Is there a limit for mechanical stability of electrode casts? Can I add one manually?" — SCIENTIFIC ACCURACY

**Verdict: FEATURE. Nothing of the kind exists.**

`updateLdHints()` (line 2371) only warns about a missing area. The solver will happily
return a 40 mg/cm² loading that no binder system will hold on a foil, and nothing on screen
says so.

**Proposed action**

- Add an optional **Max areal loading** input per electrode (mg/cm², blank = off, remembered
  in `localStorage`). When the solved loading exceeds it, raise the existing green/amber/red
  advisory — *advisory only, never a solver constraint*: the user asked to be told, not to be
  blocked.
- Optionally accept an electrode **density** (g/cm³) and report the implied coating
  thickness, which is the quantity that actually governs cracking and delamination.
- Ship sensible starting values in the material library as a per-entry optional field
  (`maxLoading`), since the limit is a property of the AM/binder pair, exactly as they note.
  Library entries without it simply leave the check off.

**Effort:** medium — new inputs, one advisory rule, one optional library field (backwards
compatible: absent key = feature off).

---

## 9. "Export the HTML as a table asking me for this specific data, so I can document it outside the tool" — USER FRIENDLINESS

**Verdict: FEATURE. Good idea, cheap to build.**

All four exporters (`doExport()`, line 8957) serialise *results*. There is no way to get a
blank input sheet, so a user planning an experiment has to keep the tool open to remember
what to measure.

**Proposed action**

- Add **⤓ Blank data sheet** beside the existing *Export results* button, producing an
  Excel/Word table of every input the tool consumes: field, symbol, unit, normalisation
  basis, required vs. optional, and a short "how it's measured" note. This doubles as the
  answer to items 1 and 5 — the sheet states the conventions in the place the user is
  actually collecting data.
- Offer it pre-filled with the current session as a second option, so a partially
  configured design can be taken to the bench and completed.
- **Phase 2 (only if wanted):** make the sheet re-importable, so a filled-in file
  round-trips back into the tool. That is a much bigger job than the export and should not
  block phase 1.

**Effort:** small–medium for the blank/pre-filled export; large for re-import.

---

## 10. "What does the mismatched 1st cycle mean at the end? Isn't that going to lead to a drift that destroys all future capacity?" — SCIENTIFIC ACCURACY

**Verdict: GAP — and the honest answer is reassuring, which makes the silence worse.**

The pill in screenshot 1 reads `ANODE OVERCAPACITIVE (1ST CYCLE)` with `N/P · 1st = 148%`.
The text comes from `lab()` at line 6861 and states *what* the sign is, never *what it
costs*. In their case:

- `r₁ = Qa1/Qc1 = 1.48` means the negative electrode can absorb ~48% more charge at
  formation than the positive electrode plus salt can supply.
- Consequence: the negative electrode is **never fully sodiated** during formation. Part of
  its capacity is dead weight, and the cell's energy density suffers. It is **not** a
  runaway.
- It is a **one-off offset, not a drift**: the unused capacity is a fixed reserve, it does
  not accumulate cycle over cycle. It is also the *safe* side of the mismatch — the
  dangerous direction is cathode-overcapacitive at formation, where the negative electrode
  saturates and the working ion plates.
- Their `N/P · Nth = 100%` confirms the steady-state balance is on target; the 148% is
  purely a formation-stroke artefact of the fixed 30% salt content (item 3).

**Proposed action**

- Extend the status pill with a consequence clause and direction-aware severity, e.g.
  *"Anode overcapacitive at formation (148%) — the negative electrode is only partly
  sodiated on the first cycle; excess anode mass is unused. Not a plating risk and it does
  not compound over cycles."* and, for the opposite sign, an explicit plating warning.
- Colour the two directions differently. Today both sides of the target are amber/red by
  magnitude alone (`worst >= severe`, line ~6858), which tells a user that the safe
  direction and the hazardous one are equally bad.
- When the 1st-cycle ratio is an uncontrollable output (item 3), drop the target colouring
  entirely and label it *result*.

**Effort:** small — messaging in one function, plus the item-3 guard.

---

## 11. "I tried to delete the individual potential limits to check the simulation against my measured profiles — not possible" — SCIENTIFIC ACCURACY

**Verdict: GAP. The request is well-founded and the code is already 90% ready for it.**

`_simReadConstraints()` (line 3195) does this:

```js
if(el && el.value!=="") V=parseFloat(el.value);
if(!Number.isFinite(V)) V=_simConsVopDefault(key);   // ← blank falls back, never off
```

Clearing a field restores the `V_op` default rather than disabling the bound, so there is no
way to ask "what do the electrodes do if only the *cell* cut-offs stop the stroke?" — which
is precisely the experiment they were trying to reproduce. Their screenshot 3 shows a real
cell whose counter-electrode potential swings 0 → 2.5 V, far outside any nominal `V_op`
window, because in a real two-electrode test only the cell voltage is controlled.

The good news: `_simConstraintStop()` (line 3580) already skips any bound whose value is not
finite (`if(!c||!Number.isFinite(c.V)) continue;`, twice). Disabling a constraint therefore
needs a state change, not new solver logic.

**Proposed action**

1. Give each of the six constraints an explicit **off** state — an ∞/off chip on the field,
   or a modifier key — and have `_simReadConstraints()` return `{V: NaN}` for it. The
   crossing search already ignores NaN bounds. Keep blank = "track `V_op`" so nothing
   changes for existing users.
2. Add a one-click preset **"Cell cut-offs only"** that switches the four electrode bounds
   off and leaves `Cell V_max` / `V_min` live. That is the two-electrode experiment, and it
   is what they asked for.
3. Their second ask — *"indicate the start of a drift when the individual electrode
   potentials aren't reached because of the cell voltage limits"* — is the genuinely valuable
   half. Report, per stroke: which constraint terminated it, and the **unreached headroom**
   on each electrode (`V_op` limit minus the potential actually attained). A stroke that
   consistently ends on `Cell V_max` while the positive electrode never reaches its own
   `V_max` is the signature of the electrode potentials walking away from their design
   window — flag the first stroke where that appears and how fast the headroom grows.

**Effort:** (1) small, (2) small, (3) medium — new per-stroke diagnostic, but it reuses the
`{Q, key}` the constraint search already returns.

---

## 12. "Normalisation on 'g' here still g<sub>AM</sub>, right?" — CLARITY

**Verdict: DOC. Yes — with one exception they should know about.**

- Library rates and specific capacities: per gram of **that component** — AM for AM rows,
  salt for salt rows (item 5).
- The Rates & current densities table: `i_cathode` uses `r.mAC` (AM mass) and there is a
  separate `i_salt` column, so both are per gram of their own component.
- **The exception:** the Simulation x-axis in their screenshot 4 reads
  `mA·h g⁻¹ cell` — normalised on the **total mass of both electrode films**, not on AM.
  Comparing that number against a per-g<sub>AM</sub> measurement is an apples-to-oranges
  error of roughly 1/(w<sub>AM,c</sub> + w<sub>AM,a</sub>). It is labelled correctly, but the
  unit chip is small and sits next to a per-gram-AM world everywhere else.

**Proposed action**

- Spell the basis out in the axis unit selector (`g⁻¹ cell (both films, AM+C+B)`) and add
  a per-g<sub>AM</sub> option so the simulated curve can be compared directly against
  half-cell data.
- Apply the `mAh g⁻¹(AM)` / `mAh g⁻¹(salt)` suffixes from item 5 globally so the one
  cell-normalised axis stands out as the exception it is.

**Effort:** small.

---

## 13. Their validation run — AC · Na₂C₄O₄ ‖ HC, 1 M NaDFOB in GVL

**Verdict: the agreement is better than they think, and the disagreement is partly our bug.**

What went right — worth telling them:

- **Mass balance reproduced exactly.** The tool returned 3.551 mg / 2.152 mg = **1.650**
  against the 1:1.6 they had actually built and cycled. That is the tool's primary job and
  it passed on a real, independently measured cell.
- 81% capacity retention over 120 cycles at 200 mA g⁻¹ is a reasonable empirical
  confirmation that the balance was sound.

What went wrong:

- **The simulation ran at 6C, not 60C** (item 4). Screenshot 2 confirms it:
  `Nth cycle: 6C → I = 767 µA`. A 10× current error runs the wrong way for their comparison
  — a lower rate means the model keeps *more* capacity — so it inflates the predicted
  15 mAh/g<sub>cell</sub> against their measured 5. The rate-scaling factor
  φ = c(i<sub>app</sub>)/c(i<sub>ref</sub>) never got to do its job.
- **Possible normalisation mismatch** (item 12): 15 mAh/g<sub>cell</sub> is per gram of both
  electrode films. If their 5 mAh/g is per gram of AC, the two numbers are not comparable at
  all before the rate question is even raised.
- Several inputs were self-declared estimates (HC 350 mAh/g first cycle "not confirmed by
  data"; AC 70 mAh/g at 0.01 A g⁻¹ "estimated, not measured that slow"). The tool marks
  library values *measured / est. / assumed* in the Rates tab but does not propagate that
  provenance into the Simulation tab, where the number that gets compared to experiment is
  produced.

**Proposed action**

1. Ship the item-4 fix, then ask them to re-run at a true 60C and re-compare. Treat the
   residual gap as the real model error; do not tune anything until then.
2. Confirm the normalisation basis of their measured 5 mAh/g before drawing any conclusion.
3. Propagate the *measured / est. / assumed* provenance flags into the Simulation tab, so a
   curve resting on three estimated inputs is visibly not a prediction.
4. Whatever the residual gap turns out to be, the tool's stated exclusions still apply —
   Butler–Volmer kinetics, diffusion limitation, non-ohmic hysteresis, temperature. At 60C
   those are precisely the terms that dominate. Worth saying so in the Simulation tab rather
   than only in the README.

---

## Suggested order of work

| # | Item | Verdict | Effort | Why here |
|---|---|---|---|---|
| 1 | C-rate ceiling + silent revert (4) | BUG | S | Corrupts results without telling anyone; blocks their re-test |
| 2 | 1st-cycle target no-op + guards (3) | BUG | M | Produced a wrong-looking number in a real session |
| 3 | Status-pill consequences (10) | GAP | S | Turns an alarming label into a correct, reassuring one |
| 4 | Mass ratio output (7) | GAP | S | The number they actually compare against papers |
| 5 | Constraint off-state + "cell cut-offs only" (11) | GAP | S | Unlocks the validation workflow they attempted |
| 6 | Capacity-convention wording (1, 5, 12) | DOC | S | Cheap; removes three separate questions at once |
| 7 | Formation-target UI regrouping (2) | GAP | S–M | Ships with #2 |
| 8 | Drift / unreached-headroom diagnostic (11.3) | GAP | M | Highest scientific value of the new work |
| 9 | Blank data sheet export (9) | FEATURE | S–M | Standalone, no dependencies |
| 10 | Positive/negative terminology switch (6) | FEATURE | M | Broad but mechanical; batch it |
| 11 | Mechanical-stability loading limit (8) | FEATURE | M | Needs library schema agreement first |
