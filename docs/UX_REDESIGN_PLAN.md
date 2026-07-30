# UX Redesign Plan — MUSIC Electrode Balance

**Status:** Planning document. No code in this change — implementation happens in follow-up work.
**Scope source:** User feedback ("not an easy, linear use; confusing for first-time users") plus an itemized change list from the maintainer.
**Codebase state this plan targets:** `main` at `7d1af00` (post PR #36) — `MUSIC_electrode_balance_V10.html` at 8139 lines, manual-recalc mode active, `DEV_DEFAULTS_ON = false`, 17-check smoke suite in `tests/smoke.js`.

Line numbers below refer to that revision. They will drift as edits land — treat them as anchors, not gospel; each item also names the functions/ids involved so they can be re-found with grep.

---

## Contents

- [Item 0 — Restore the lost "known/prepared cathode" feature](#item-0)
- [Item 1 — No auto-filled materials on load; default "Custom"](#item-1)
- [Item 2 — Remove the "ID · Identity" sections](#item-2)
- [Item 3 — New "Cell Parameters" zone (N/P + operating C-rates)](#item-3)
- [Item 4 — Results-side controls must not require Recalculate](#item-4)
- [Item 5 — N/P selection redesign + remove discharge start](#item-5)
- [Item 6 — First-run Tutorial (full copy included)](#item-6)
- [Item 7 — Mass section empty by default](#item-7)
- [Item 8 — General user-friendliness pass](#item-8)
- [Execution order](#execution-order)
- [Test plan](#test-plan)
- [Couplings & risks](#couplings--risks)
- [Out of scope](#out-of-scope)

---

<a name="item-0"></a>
## Item 0 — Restore the lost "known/prepared cathode" feature ⚠️

**Why this is here:** commit `b2ca58e` ("Known/prepared cathode: fixed salt %, size anode for both cycles") was pushed to `claude/gracious-edison-y7aat7` *after* PR #28 had already been merged. The branch was then deleted, so the commit never reached `main` and is not recoverable from this clone. The feature was explicitly requested by the maintainer ("I have electrodes (cathode) already prepared… I want to know which anode mass to use") and verified working before it was lost. It also underpins the redesign's core workflow (prepared electrodes), so restore it first.

**Full re-implementation spec** (from the verified original):

1. **Input** — in the Sacrificial-additive panel (`#salt-flds`), after the Material row: a row labeled **"Known salt content"** with sub-label *prepared electrode*, input `id="cat-s-frac"` (`number`, step 0.1, min 0, max 100, placeholder **"auto"**, unit "% of electrode"). Help text: for an already-prepared cathode with a known recipe, enter the salt as % of total electrode mass; the AM/salt/C/B split is then FIXED (not solved) and the tool sizes the ANODE to balance the cathode, reporting one mass per cycle target. Blank = solver computes the salt (current behavior).
2. **Read path** — `readInpRaw()` salt object gains `frac: has("cat-s-frac") ? pct("cat-s-frac") : null` (and `frac:null` in the salt-off branch).
3. **Solver** — in `solve()` (L6386+), before the existing salt-on branches, add an `else if (inp.cat.salt.frac != null)` branch:
   - `saltFrac = clamp(frac, 0, wAM_total)`; `amOnly = wAM_total − saltFrac`.
   - **anode mode** (cathode pinned): `mAC = mCat·amOnly`, `mS = mCat·saltFrac`; `QcN = mAC·CcN·kc + mS·CsN·kc`, `Qc1 = mAC·Cc1 + mS·Cs1`; primary `mAn = t·QcN/(wA·CaN)` (balances Nth) and secondary `mAn1st = t1·Qc1/(wA·Ca1)` (balances 1st). Return both: `mAn1st`, `dualAnode:true`.
   - **cathode mode** (anode pinned): `mCat = (mAn·wA·CaN) / (t·(amOnly·CcN·kc + saltFrac·CsN·kc))`, split by the fixed fractions.
   - **analysis** (both pinned): split cathode by fixed fractions, report ratios.
4. **Display** — hero anode cell shows both masses when `r.dualAnode`: the primary with tag *"balances Nᵗʰ"*, the secondary below with *"balances 1ˢᵗ"*; mode label becomes **"Anode sized · known cathode"**. (In the redesign this pairs with Item 3's targets.)
5. **Regression check** (was verified numerically): cathode 10 mg, composition 80/10/10, `cat-s-frac`=10, faradaic Cc1=CcN=100, salt Cs1=300/CsN=0, anode 90/5/5, Ca1=CaN=200, target N/P=1.00 → `mAC=7.0`, `mS=1.0`, `mAn(Nth)=3.889 mg`, `mAn(1st)=5.556 mg`.

**Acceptance:** entering a salt % pins the split and produces the two anode masses; clearing the field restores auto-solve; the smoke check above passes.

---

<a name="item-1"></a>
## Item 1 — No auto-filled materials on load; default "Custom"

**Current state:** already 90% done. `DEV_DEFAULTS_ON = false` (L7460) means production loads an empty form; preset `<select>`s already default to `<option value="">Custom</option>` (`fillSel`, L6164 reset). Two leftovers:

1. **Delete the dev-defaults block entirely** — `applyDevDefaults()` (L7464–7512), the flag (L7460), the call at L7449, and its comment block. The user asked for removal, not a flag.
   - **Test dependency:** `tests/smoke.js` L44–45 seeds via `applyDevDefaults(true)`. Replace with an explicit fixture: add a page-side helper `function seedTestScenario()` in the test file itself via `page.evaluate` (set each field's `.value`, call `sMM`, `setRateValue`, then `recalcNow()`), or move the scenario into `tests/fixtures.js` injected with `page.addScriptTag`. The app file must not ship test scaffolding.
2. **Kill the load-time "Cleared" toast** — page boot runs `silentResetAll()` → `resetAll()` → `toast("Cleared")` (L6187), so every fresh visitor sees a "Cleared" toast for no reason. Give `resetAll(opts)` a `{silent:true}` path (no toast, no confirm) used by the load listener, keeping toast+confirm for the header button.

**Acceptance:** fresh load shows empty capacities/masses/OCV, presets on "Custom", no toast, no results panel, guide hint "Start by selecting a cathode active material".

---

<a name="item-2"></a>
## Item 2 — Remove the "ID · Identity" sections

**Current state:** first collapsible section of each card — `data-step="cat-id"` (L625–626, field `cat-label`) and `data-step="an-id"` (L719–720, field `an-label`). Confirmed cosmetic: not in `readInpRaw`; sole read is the export payload (L7675/7690); presets overwrite them (L6089/6108).

**Change list:**
1. Delete both section blocks (L625–626, L719–720).
2. `applyPS`: drop the `$("cat-label").value=m.name` / `$("an-label").value=m.name` writes (L6089/6108).
3. `gatherExportData`: drop `label:` fields (L7675/7690); the TXT/HTML builders' fallback chain `label || name || "(unlabelled)"` (L7845–7846, 7951–7953) simplifies to `name || "(unlabelled)"` — the material name (`cat-ac-name`/`an-name`) remains the identity everywhere.
4. `OPT_STEPS` (L7327): remove `"cat-id"`, `"an-id"`.
5. Delete `applyDevDefaults`' label writes (moot after Item 1).
6. Section numbering: with ID gone the cathode card reads Composition → Active material (badge "1") → Sacrificial additive (badge "2") → Mass (badge "m"); renumber per Item 8's flow (Composition becomes part of the linear order).

**Acceptance:** no Identity section on either card; exports still build with the material name; guide/progress unaffected.

---

<a name="item-3"></a>
## Item 3 — New "Cell Parameters" zone (N/P + operating C-rates)

**The centerpiece.** A full-width card **above** the two electrode cards (`.egrid`, L622) — the *first* thing a user fills.

### 3.1 Layout

New `<div class="card cell-params">` spanning both grid columns (place before `.egrid`; on mobile it stacks first). Header: badge "0", title **"Cell Parameters"**, section-level `?` help icon. Contents, one row of three field groups (wrapping on narrow screens):

| Field | id | Default | Notes |
|---|---|---|---|
| Target N/P ratio (Qₐ/Q꜀) | `np-target` (moved) | 1.00 | Plus the existing reset ↻, **Different 1st cycle** toggle (`np1stTg`) and `np-target-1st` — all moved here from the L776–790 row |
| C-rate · 1st cycle | `cell-rate-1st` (new) | C/10 | numeric + fixed "C" unit; represents the formation-cycle rate |
| C-rate · reversible (Nth) | `cell-rate-nth` (new) | C/10 | the design operating rate |

The old `.np-row` (L776–790) is dissolved: N/P pieces move up; **Start in cell is deleted** (Item 5); the rate-sync block (`#syncRateChk`, L793–796) and `#calcBtn` (L798) stay below the electrode cards.

### 3.2 Section help copy (the "?" the user requested)

> **Why start here?** To design and balance a full cell you must aim for a specific operating point. **Target N/P** is the anode-to-cathode capacity ratio (Qₐ/Q꜀) the solver will hit — 1.00 means exactly matched; values above 1.00 oversize the anode as a safety margin against Li/Na plating. **The C-rates set how fast you intend to cycle.** Electrode capacities depend on rate — a material that stores 120 mAh/g at C/10 may hold far less at 1C — so a cell balanced at one rate is *not* balanced at another. Pick the rate you will actually use: the 1st-cycle (formation) rate is usually gentle (C/10 or slower); the reversible rate is your everyday operating rate. Every capacity you enter (or pick from the library) should correspond to these rates — the tool will warn you when a library value was measured at a very different rate.

Field-level `data-help` for each of the three inputs (shorter versions of the above; N/P help text reuses the existing L778 copy).

### 3.3 Semantics — what the C-rates drive

Convention: **cell C-rate is defined against the reversible cell capacity** `Q_cell = min(QaN, QcN)` (same basis as the existing `r.c10 = Qmin/10`, L6414). So `I_Nth = rateNth × Q_cell` µA and `I_1st = rate1st × Q_cell` µA.

1. **Simulation currents.** Today: `I1_uA = simRateSel["1st"]?.I_uA || simRateSel["Nth"]?.I_uA || r.c10 || 0` (L3795–3796) — i.e., manual row-picks from the Rates tab, falling back to C/10. New chain: **manual row-pick (kept as expert override) → Cell-Parameters rate → C/10**. `updateSimStatus` (L2670) states the source: "I₁st = 42 µA (from Cell Parameters, C/10)" vs "(from Rates-tab selection)".
2. **Rates tab.** In the C-rates table (`renderCD`, `cdTab==="crate"`), highlight the row(s) matching the chosen rates (reuse the existing `.hi` styling that currently pins 1C) and auto-tag them as the sim assignment when no manual pick exists.
3. **Library rate pairing.** When a preset material is applied (`applyPS`) the rate-paired capacity nearest the requested cell rate should be chosen instead of blindly `rates[0]` (L6084): convert each library row via `rateToCRate` and pick the row minimizing |log(row C-rate / target C-rate)|; fall back to `rates[0]` when nothing converts. The existing mismatch warning (`checkRateMismatch`, `#rateMismatchWarn` L795) extends to compare against the Cell-Parameters rates.
4. **Exports.** Add `cellRates:{first,nth}` to `gatherExportData().targets` (L7757) and render in TXT (L7883) and HTML (L8010) target blocks.

### 3.4 State & wiring

New globals `cellRate1st = 0.1`, `cellRateNth = 0.1` beside `npTarget` (L1244). Handlers mirror `onNpTargetChange` (clamp to (0, 20]; keep previous on invalid input; edits clear `ratioOverride` and mark stale via `recalc()`). Reset in `resetAll` (L6180 block). These are **solver-adjacent display inputs**: they don't change masses, so a rate edit re-renders rates/sim live (render-only path, Item 4) *without* raising the stale banner — only N/P edits do that.

**Acceptance:** zone renders above both cards; defaults N/P=1.00, C/10, C/10; the sim's current readout reflects the entered rates with no Rates-tab interaction; help bubble carries the copy above.

---

<a name="item-4"></a>
## Item 4 — Results-side controls must not require Recalculate (bug)

**Diagnosis (confirmed):** the manual-recalc split (L6426–6446) turned `recalc()` into a stale-marker; only `recalcNow()` re-solves. Sim-tab controls were correctly routed to `renderSimPlot()` directly, but three **display-only** controls in the Balance/Diag/Rates tabs still call `recalc()` and therefore just show the amber "stale" banner:

| Control | Where | Bug |
|---|---|---|
| Bar 1st/Nth toggle `#bTog` | L7314 | chart doesn't switch — the user's exact report |
| C-rate POV tabs `setCDTab` | L2600 | table doesn't repaint |
| Total-loading toggle `setShowTotalLoading` | L2164–2175 | labels update, numbers don't — labels/values disagree |
| Hero ratio Apply/Cancel | L2427/L2413 | editor never closes; Apply appears dead (see Item 5) |

**Fix design:** introduce one render-only entry point, e.g. `rerenderResults()`, that redraws from the cached solution (`window.lastR`, `window.lastInp`, `window.lastMode`) **without re-solving and without touching `calcDirty`**: internally call the pure renderers (`drawBar`, `renderCD`, the loading-detail writer, `updSts` if needed). Reroute the three controls to it. Guard: if `window.lastR` is undefined, do nothing (results hidden anyway).

Rules going forward (document in a code comment near `recalc`):
- **Model inputs** (materials, masses, composition, N/P, salt) → `recalc()` (stale-marker). Unchanged.
- **View controls** (anything that only chooses *how* to display the existing solution) → render-only path. Never through `recalc()`.

Also: `renderEmpty` (L6591) must clear the stale UI (`_calcStaleUI(false)`) so users don't see "stale" and "Input cathode C₁st" at once.

**Acceptance:** after one Calculate, toggling 1st/Nth, switching POV tabs, and flipping total-loading all repaint instantly with no banner; smoke test asserts the bar SVG content changes on toggle without `recalcNow()`.

---

<a name="item-5"></a>
## Item 5 — N/P selection redesign + remove discharge start (bug)

### 5.1 Why the current N/P interaction is confusing

Three overlapping mechanisms fight each other:
1. The `np-target` field (+ Different-1st toggle) — the *declared* target the solver hits.
2. The click-to-edit hero percentages (`r-r1pct`/`r-rNpct`, L849 → `onRatioEditClick` L2389) — a hidden second targeting system (`ratioOverride`) with **20+ distinct warning/error messages** (inventory: survey L6266–6372), which under manual-recalc is *visibly broken*: Apply/Cancel call `recalc()` (stale-only), so the inline editor never closes and nothing seems to happen.
3. The override is sticky and invisible: it silently re-applies on every solve (L6478) and is cleared only from six scattered sites; there is no on-screen indication that an override is active, and the diagnostics ratio table computes deviations vs **1.00** (L7740) while the hero computes them vs **npTarget** — two different "how far off am I" answers on one screen.

### 5.2 Redesign

1. **Single source of truth:** the Cell Parameters N/P inputs (Item 3). The solver keeps using them exactly as now (`solve()` L6388/6393 — the math is already correct and symmetric).
2. **Hero ratios become read-only displays** with their deviation chips. Delete `onRatioEditClick`, `applyRatioEdit`, `cancelRatioEdit`, `ratioOverride`, `applyRatioOverride` (L6266–6372), `fitSaltSplitFor1st`/`fitMassAndSplit`/`fitMassNoSalt` *if* no other caller remains (grep first — `fitMassAndSplit` is only called from the override path today), the `.editable-ratio`/`.r-editing`/`.ratio-edit-hint` CSS, and `#r-edit-msg`. This removes ~200 lines and the entire message zoo. What-if exploration is covered by simply editing the target and pressing Recalculate — one mechanism, one mental model.
   - The pie-center mass overrides (`pmo-*`) and composition editing stay — they are input-side, not result-side.
3. **Unify deviation basis:** everywhere a % deviation is shown (hero `rC(over)`, `updSts`, rGrid ratio table, exports), compute vs the *target* (`r.target`/`r.target1`). Update the rGrid column header "Excess vs 1.00" (L906 help + L7740) to "vs target".
4. **Remove discharge start.** Consumers enumerated (survey §2): delete the `#startDirTg` UI (L784–788) and `setStartDir` (L3040–3052); replace `let startDir="charge"` with a constant, or inline `"charge"` at the five read sites: `deriveCapC1` L1766 (keep only the charge-first spans: cathode `vopHi−ocv`, anode `ocv−vopLo`), sim ctx L3840, `_simBuildElectrodeMap` L3221, `_simAdvanceOneStroke` L3493, plot mapping L3920–3923. The **sim display** Charge/Discharge toggle (`setSimDir`, `#simDirTg`) is a different control (view-only) and **stays**. Update smoke check #7 ("C1 follows start dir") → replaced by "C1 uses charge-first span" fixed expectation (27.3).

**Acceptance:** one place to set N/P; hero shows results only; no dead buttons; deviations consistent across hero/diagnostics/exports; no start-direction control anywhere; simulation always begins with the charge (formation) stroke.

---

<a name="item-6"></a>
## Item 6 — First-run Tutorial

### 6.1 Mechanics

- **Trigger:** on `load`, after boot completes, if `localStorage["music.tutorialSeen"]` is unset → show a centered modal: title **"Welcome to the MUSIC Electrode Balance tool"**, body *"Would you like a 2-minute guided tour? It walks through each input in order and explains why it matters."*, buttons **"Start the tour"** / **"Skip"** (Skip and ✕ both set the flag; nothing else happens). Selecting Start also sets the flag (the tour is re-runnable — see below).
- **Re-entry:** a **"Tutorial"** button in the masthead (next to Reset, L~600 area) restarts the tour any time.
- **Engine** (new, self-contained ~150 lines; no library): an ordered array `TOUR_STEPS = [{target, title, body, placement}]`. For each step: scroll target into view (`scrollIntoView({block:"center"})`), expand its section if collapsed (`.sec.cld` → remove `cld`), apply a highlight class, and position a tooltip card near it with title, body, step counter ("3 / 14"), **Back / Next / End tour** buttons. Keyboard: →/Enter next, ←' back, Esc ends.
- **Highlight style:** class `.tour-hi` on the target — 2px solid accent outline + `box-shadow: 0 0 0 6px rgba(28,184,139,.25)` + a **clear blink**: `animation: tourPulse 1.1s ease-in-out infinite` alternating outline color between `var(--music2)` and transparent-ish. Everything else dims via a fixed overlay (`rgba(15,27,45,.45)`) with a cut-out around the target (either `box-shadow: 0 0 0 9999px` trick on the target or four overlay rects). Respect `prefers-reduced-motion: reduce` → no blink, static outline.
- **Interaction policy:** the page stays inert during the tour (overlay swallows clicks except on the tooltip); the tour is *demonstrative*, not *enforcing* — users are not asked to type during it. (Simplest robust v1; a "try it live" mode can come later.)
- **Coexistence with the guided-flow STEPS system:** the tour is a one-shot overlay; the progress bar + step hints (L7318–7424) remain the *persistent* guide afterward. The tour's final step points at that progress bar so users know where guidance continues.

### 6.2 The steps and full copy (write these verbatim)

Targets assume Items 1–5 are done (Cell Parameters exists; ID sections gone; no start-dir).

1. **Target: Cell Parameters card** — **"Start with the cell you want"**
   *"Before picking materials, decide what the finished cell should do. Set your target N/P ratio — the anode-to-cathode capacity ratio. 1.00 means perfectly matched; slightly above 1.00 gives the anode a safety margin. Then set your C-rates: capacities depend on how fast you cycle, so the balance is only valid at the rate you design for."*
2. **Target: N/P input** — **"Target N/P ratio"**
   *"This is the number the solver will hit. N/P = Qₐ/Q꜀, compared at the reversible (Nth) cycle. If your first cycle should be balanced differently — common when a sacrificial salt compensates the anode's formation loss — enable 'Different 1st cycle' and give the formation cycle its own target."*
3. **Target: C-rate inputs** — **"Operating rates"**
   *"The 1st-cycle rate is for formation — usually gentle, C/10 or slower. The reversible rate is your everyday operating rate. These drive the currents shown in the Rates tab and used by the Simulation, and the tool warns you if a library capacity was measured at a very different rate."*
4. **Target: cathode preset select (`cat-ac-ps`)** — **"Choose the cathode active material"**
   *"Pick a benchmarked material from the library — it auto-fills capacities, voltage windows and the OCV — or leave 'Custom' and type your own values. Everything a preset fills can still be edited afterwards."*
5. **Target: cathode C₁/Cₙ rate-rows** — **"Two capacities, each with its rate"**
   *"C₁st is the first-cycle (formation) capacity; Cₙth is the reversible capacity you'll get every cycle after. Each value is paired with the rate it was measured at — click the rate chip to pick a different library measurement. The difference between C₁st and Cₙth is the irreversible loss the balance must absorb."*
6. **Target: cathode More-details section (storage type / OCV / V windows)** — **"Storage type, OCV and voltage windows"**
   *"The storage type controls how capacity scales with the voltage window: capacitive and pseudocapacitive materials scale linearly with V_op/V_th; faradaic ones don't. The OCV (as-assembled potential) anchors the first charge — for capacitive materials with no measured C₁st, the tool derives it from the OCV automatically."*
7. **Target: salt section header** — **"Sacrificial additive (optional)"**
   *"A sacrificial salt releases extra ions on the very first charge, compensating the anode's formation loss without adding dead cathode mass every cycle. Leave it off if you don't use one. If your cathode is already mixed with a known salt percentage, enter it as 'Known salt content' and the tool will treat your recipe as fixed."*
8. **Target: anode preset select (`an-ps`)** — **"Now the anode"**
   *"Same idea as the cathode: pick from the library or enter custom values. The anode's first-cycle loss (its C₁st vs Cₙth gap) is usually what the salt — or extra anode mass — has to pay for."*
9. **Target: cathode Mass section** — **"Enter the mass you know"**
   *"Enter a mass for the electrode you already have — directly in mg, or as a loading in mg/cm². The tool computes the other electrode's mass to hit your target N/P. Fill in only one side: entering both switches to a check-my-cell analysis mode, and entering neither compares materials per cm²."*
10. **Target: `#calcBtn`** — **"Calculate"**
    *"Press Calculate to solve the balance. After the first run, changed inputs mark the results as stale — press Recalculate to refresh them. Display toggles in the results never need it."*
11. **Target: hero strip (masses + ratios + status chip)** — **"Your answer"**
    *"The headline result: both electrode masses and the achieved N/P at the 1st and Nth cycle, colored by how close they are to your target. The status chip summarizes the verdict — green means balanced within tolerance."*
12. **Target: Diagnostics tab button** — **"Diagnose the balance"**
    *"Diagnostics shows where the capacity goes: side-by-side Qₐ/Q꜀ bars (switch 1st/Nth), the capacity-ratio table across rates, and each electrode's potential window versus its reference."*
13. **Target: Simulation tab button** — **"Simulate the cell"**
    *"The Simulation tab draws the galvanostatic voltage curves — each electrode and the full cell, cycle by cycle, including IR drop, salt plateaus and your voltage constraints. Use it to see why a limit is hit, not just that it is."*
14. **Target: progress bar / step hint (`#stepHint`)** — **"You're set"**
    *"This progress bar keeps guiding you: it always points at the next required input. Re-run this tour any time with the Tutorial button up top. Export your results as TXT, Word, Excel or PDF from the Export button when you're done."*

### 6.3 Implementation notes

- Store copy in a `const TOUR_STEPS` array next to the engine; keep bodies plain text (no HTML needed except `<em>`).
- Each step's `target` is a selector; steps whose target is missing (e.g. salt hidden) are **skipped automatically** — the engine filters `document.querySelector(step.target)` at start.
- The results-area steps (11–13) require results to exist; during the tour, if `window.lastR` is undefined, steps 11–14 fall back to targeting the (hidden) panel's tab bar with the overlay note *"(Results appear here after Calculate)"* — simplest: keep the same copy, target `#calcBtn`'s vicinity, and don't force a solve.
- QA: tour must work at 360px width (tooltip clamps to viewport, like `.help-bubble` does), and Esc always exits cleanly (remove overlay, un-dim, restore collapsed state of sections it expanded).

---

<a name="item-7"></a>
## Item 7 — Mass section empty by default

**Current state:** `cat-mass`/`cat-ld`/`an-mass`/`an-ld` already ship empty (placeholders "mg", "mg/cm² (AM)"). The stragglers are **area/diameter**: `cat-ar`/`an-ar` = "1.13", `cat-dia`/`an-dia` = "12" both in markup (L713/770) and reseeded by `resetAll` (L6163).

**Change:** ship and reset them **empty** with placeholders `placeholder="cm² (e.g. 1.13)"` / `placeholder="mm (e.g. 12)"`. Where area is required but missing, the dependent outputs already degrade (`fLd` returns "—" without area); add a gentle inline hint in Loading mode when `an-ld`/`cat-ld` has a value but area is empty: *"Enter the electrode area (or diameter) to use loading mode."* Audit `getEM` (L1859) so an empty area in loading mode yields mass `null`/absent — not `0` — and `detectMode` therefore doesn't count that side as pinned.

**Acceptance:** fresh load and post-Reset show every field in both Mass sections empty; loading mode without area shows the hint instead of silently computing nothing.

---

<a name="item-8"></a>
## Item 8 — General user-friendliness pass

Bounded list (each independently shippable):

1. **Linear numbered flow.** Renumber section badges to one sequence: Cell Parameters "0" (or "1"), then per card: Composition, Active material, (Salt — cathode only), Mass. Progress bar (`#progFill`) and `STEPS` (L7318) extended so the *order matches the visual order top-to-bottom*: cell-params (always `s-done`, has defaults) → cat-am → an-am → salt (conditional) → mass (optional but *suggested*: add an `OPT_STEPS`-style suggest state on Mass when materials are done — today's hint text already says "enter a mass to solve").
2. **Tab order fix.** Tab bar DOM order is balance/diag/rates/sim (L811–814) — make button order = pane order = **Balance → Diagnostics → Rates → Simulation** (progressive depth).
3. **Calculate affordance.** `#calcBtn` stays the single accent CTA. After Item 4 the stale system only concerns true model inputs; keep the amber pulse + banner. Add the banner text *"Display toggles (tabs, 1st/Nth, units) never need recalculation."* once, small, under the stale banner.
4. **Empty-state clarity.** `renderEmpty` messages (L1477–1489 `chk()`) become instructional: "Input cathode C_Nth" → *"Enter the cathode's reversible capacity (Cₙth) — or pick a preset"*. Also clear stale UI in `renderEmpty` (Item 4).
5. **Terminology sweep.** One glossary, used everywhere: *formation (1st) cycle*, *reversible (Nth) cycle*, *target N/P (Qₐ/Q꜀)*, *operating rate*. Remove "AM-zone" from user-facing help (keep in code comments); expand "GCPL"-style jargon in sim help.
6. **Salt suggest state** (`s-suggest`, L7369) is good UX — keep, and mention it in tutorial step 7's body if desired.
7. **Collapse policy.** Keep collapse-all on load (L7436) *except* the active step's section (the guide already un-collapses the active one on change, L7383 — make that fire on first load too, so the user lands with exactly one section open: the cathode AM).
8. **Masthead**: add the **Tutorial** button (Item 6); keep Reset; version/stamp stays.
9. **Mobile check**: `.cell-params` wraps; tour tooltip clamps; nothing new introduces horizontal scroll at 360px.

---

<a name="execution-order"></a>
## Execution order (suggested commits)

Each step leaves the app working and the smoke suite green.

1. **Restore known-cathode feature** (Item 0) + its smoke check.
2. **Render-only path for display controls** (Item 4) — smallest fix for the loudest bug; add smoke check (bar toggle changes SVG without recalc).
3. **Remove ID sections** (Item 2) — trivial, isolated.
4. **Delete dev defaults & fix load toast** (Item 1) — includes migrating test seeding to a fixture; expect the largest `tests/smoke.js` diff here.
5. **Remove discharge start** (Item 5.4) — isolated; update smoke check #7.
6. **Cell Parameters zone** (Item 3) — move N/P pieces, add rates, wire sim-current chain + exports.
7. **N/P consolidation** (Item 5.1–5.3) — delete the ratio-override system; unify deviation basis.
8. **Mass/area empty defaults** (Item 7).
9. **General pass** (Item 8) — tab order, copy, numbering, collapse policy.
10. **Tutorial** (Item 6) — last, so it targets the final layout; add masthead button.

---

<a name="test-plan"></a>
## Test plan

- **Migrate seeding first** (with Item 1): a `seedTestScenario()` fixture replacing `applyDevDefaults(true)`.
- New checks: known-cathode dual masses (numbers in Item 0.5); bar 1st/Nth toggle repaints without `recalcNow` (compare `#bar-chart` innerHTML); POV tab repaints; total-loading numbers change with labels; Cell-Parameters rate → sim current readout (e.g. rate 0.5C on a known Q_cell → `I` text contains the expected µA); C₁ derivation fixed-expectation (charge-first only); N/P target drives hero deviation basis; tutorial modal appears when `localStorage` empty and never again after Skip (set/clear in the test); ID fields absent (`$("cat-label")===null`); empty areas on load.
- Update/remove: check #7 (start-dir); any check touching `applyDevDefaults`.
- Keep `tests/sim_smoke_test.js` untouched (separate suite).

---

<a name="couplings--risks"></a>
## Couplings & risks

| Risk | Mitigation |
|---|---|
| Deleting the ratio-override system orphans `fitMassAndSplit`/`fitSaltSplitFor1st`/`fitMassNoSalt` | Grep for callers before deleting; if the known-cathode restoration or future features want them, keep the functions and delete only the UI path |
| `recalc` is monkey-patched at L7427 (`updateGuide` append) | The new render-only path must NOT be routed through the patched `recalc`; call renderers directly |
| Removing `startDir` while `sim_smoke_test.js` may reference it | Grep both test files for `startDir`/`setStartDir` before deleting |
| Cell-Parameters rates vs manual `pickSimRate` precedence | Manual pick wins; status line must always say which source is active, else users won't understand the current shown |
| The stack mode has its own `stk-np-target` (L1028, never synced) | Leave stack mode alone in this pass; note the duplication in a comment |
| Export builders read DOM label ids being deleted (`cat-label`) | Item 2 change list covers every read site — verify export builds in smoke after removal |
| Tour overlays vs `resPanel` hidden | Steps auto-skip missing/hidden targets (Item 6.3) |

---

<a name="out-of-scope"></a>
## Out of scope (explicitly)

- Stack mode UX (own N/P field, own flow) — untouched this round.
- The simulation engine's physics and its round-1–4 features — display integration only.
- Library editor modal redesign.
- Persisting user inputs across sessions (only the tutorial-seen flag is added to localStorage).
