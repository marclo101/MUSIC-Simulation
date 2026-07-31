# Plan — Rate-response redesign + always-live Results panel

**Status:** Planning document. No code in this change — implementation is handled by another model.
**Baseline:** `main` at v11.1 (`APP_VERSION="v11.1"`). Line numbers below were verified against that revision; they will drift — every item also names functions/ids so they can be re-found with grep.
**Version:** ship as **v12.0** (bump `APP_VERSION`; this is a visible redesign of the Diagnostics tab).

Two work items:

1. **[Item A](#item-a)** — Replace the "Capacity ratio at all rates" table + "Potential windows" section with a **Rate response** section: a chart *and* an interactive table that show, unmistakably, that the cell is balanced at ONE design rate, and what cycling at any other rate costs in capacity, balance, potential shift, and cyclability.
2. **[Item B](#item-b)** — Make **every** control inside the Results panel update instantly, with the root cause fixed (not patched per-control): the repaint path silently no-ops in ratio mode and can draw stale numbers after edits.

Item B is smaller and unblocks Item A's interactivity — implement it first.

---

<a name="item-b"></a>
## Item B — Every Results control updates automatically

### B.1 The two root causes (verified)

1. **`rerenderResults()` no-ops in ratio mode.** Its first line is
   `if(!r||!inp||window.lastMode==="ratio") return;`
   The user's failing screenshot IS ratio mode (banner "Mass loading ratio · reference: 1 cm²", shown whenever no mass is pinned). So `setCDTab` (L2695) and `setShowTotalLoading` (L2351), both routed to `rerenderResults()`, flip their button chrome and then repaint **nothing**. This is exactly the reported "Cathode POV / Anode POV not updating".
2. **Repaint-from-cache shows stale numbers.** `rerenderResults()` redraws `window.lastR` — correct only if nothing was edited since the last solve. This is the same failure the 1st/Nth toggle had until v11.1 replaced its repaint with a full re-solve.

### B.2 The rule (one pattern, no exceptions)

> **Anything clickable inside `#resPanel` resolves to `recalcNow()` and is wired inline on the element.**

- `recalcNow()` handles every mode (including ratio → `renderRatio`), applies any pending debounced edit, and cannot be stale. It measures in single-digit milliseconds here — there is no performance reason to keep a separate repaint path.
- Inline `onclick` (the `setBarPhase` precedent, v11.1) removes the dependency on `wire()` having attached listeners.
- **Delete `rerenderResults()` entirely** once no caller remains. It is the foot-gun; keeping it invites the next regression.
- Free-typing inputs inside Results (pie-legend composition %, pie-centre mass override) keep the 350 ms debounce (`recalc()`), but their **commit** events (`change`, `blur`, Enter) call `recalcNow()` directly so the value lands at once.

### B.3 Control-by-control change list

| Control | ids / fn (grep anchor) | Today | Change to |
|---|---|---|---|
| 1st/Nth bars toggle | `setBarPhase` | inline → `recalcNow` (v11.1) | ✔ already the pattern — leave |
| **POV tabs** C-rates / Cathode POV / Anode POV | `setCDTab` L2695, buttons `onclick="setCDTab(...)"` | `rerenderResults()` → **broken in ratio mode, stale after edits** | body ends in `recalcNow()`; keep inline onclick |
| **AM/total loading toggle** | `setShowTotalLoading` L2351, checkbox `show-total-ld` | `rerenderResults()` | body ends in `recalcNow()` |
| Results tab switcher | `setResultsTab` L2696 | class flips (+ `ensurePlotly` for sim) | + `if(calcDirty) recalcNow()` so switching tabs also lands pending edits; keep `ensurePlotly()` for sim **and add it for `diag`** (Item A's chart needs Plotly) |
| Sim rate-row picks | `pickSimRate` L2722, rows in `crate-table` | updates sel + sim if visible | + `if(calcDirty) recalcNow()` first |
| Sim assign radios / clear | `setSimAssignMode`, `clearSimRateSel` | status text only | same guard |
| Sim controls (cycle, R_eq, smoothing, constraints, axis pills, dir) | `onSimCtrlChange`, `stepSimCycle`, `onSimConsEdit`, `pickSimUnit`, `setSimDir` | `renderSimPlot()` direct | keep direct, but `renderSimPlot()` entry gains `if(calcDirty){recalcNow();return;}` (recalcNow re-renders the sim when the tab is active) — one guard covers all of them |
| Pie-legend % editors | `.pv-input`, `setCompOverride` | debounced `recalc()` | keep debounce; add `change`/Enter → `recalcNow()` |
| Pie-centre mass override | `.pmo-input`, `setMassOverride` | debounced | same |
| Reset buttons (comp/mass/clear-all) | `resetCompOverride`, `resetMassOverride`, `clearAllMasses`, `clearMassInput` | mixed `recalc()` | end in `recalcNow()` — a reset is an explicit act, never "pending" |
| Export button | `openExportDialog` | reads lastR | + `if(calcDirty) recalcNow()` before `gatherExportData` so exports can never snapshot stale numbers |
| **New (Item A)** rate-response unit pill, row hover/click | see A.4 | — | hover = CSS/JS highlight only (no recompute); click/pill → `recalcNow()` |

### B.4 Acceptance criteria (each becomes a smoke check)

For **each** control above, three scenarios must pass with no Recalculate click and `calcBtn` never left `.dirty`:
1. after a fresh solve — display changes appropriately;
2. **50 ms after editing an input** (before the debounce fires) — the pending edit is applied by the control itself;
3. **in ratio mode** (no masses pinned) — the display still updates (this is the case that was broken).

Suite hygiene learned in v11.1: these checks must **set up their own scenario** (masses, capacities, mode) rather than inherit whatever the previous block left; controls that now re-solve will re-read live state.

---

<a name="item-a"></a>
## Item A — The "Rate response" section

### A.1 What it replaces, and the message it must carry

Remove from the Diagnostics tab:
- the **"Capacity ratio Qa/Qc — at all rates"** table (`buildRT` L6949, host `#rGrid` L1010, markup box around it);
- the whole **"Potential windows"** section (markup `#wDiag` L1015 + explanatory prose block; functions `drawPW` L7054 and `dW` L7060; export checklist entry `pwinChart` L8001, TXT/HTML export blocks L8296/L8430; `gatherExportData` rasterization entry). Grep `wDiag|pwinChart|drawPW` for the full sweep, including the tour/help `data-help` that mentions potential windows in the Diagnostics step copy.

In their place, one full-width section titled **"Rate response — the balance only holds at the design rate"**, directly under the capacity bars. Lead-in copy (render as the section's standfirst, not a tooltip):

> *Your electrode masses were sized for the design rate below. Each electrode loses capacity at a different pace as the current rises, so at any other rate the ratio Qₐ/Q꜀ drifts away from the target: one electrode runs out early, the other's potential shifts to compensate, and either capacity or cycle life pays for it.*

The section has **two synced views: the chart and the interactive table.** Both draw from one shared data builder (A.2), so they can never disagree.

### A.2 Data model — `buildRateResponse()` (new, pure function)

Inputs: `window.lastR`, `window.lastInp`, the electrode rate ladders (`catAcRates`, `anRates`), the design rates (`cellRate1st`, `cellRateNth`), target N/P (`npTarget`/`np1stTargetVal()`).

1. **Grid of cell rates.** Union of: a standard ladder (C/20, C/10, C/5, C/2, 1C, 2C, 5C), the design rate(s), and the cell rate implied by every library rate row of either electrode (row current ÷ that electrode's solved AM mass → I_cell → C-rate). Sorted, deduplicated (log-space tolerance ~2 %).
2. **Per rate r:** `I_cell = r × Q_cell_design` (µA); `i_cat = I/m_cat_AM` (mA/g); `i_an = I/m_an_AM` (A/g). This is the user's "cell C-rate AND electrode-normalized current" — every row carries all three, and the chart's x-axis can display any of them.
3. **Capacity at rate.** `Qc(r) = m_AC × Cc(i_cat)`, `Qa(r) = m_anAM × Ca(i_an)`, where `C(i)` interpolates the material's ladder **in log-current** — reuse the simulation's existing φ machinery (`rateInfo`, grep `φ = c(i_app)/c(i_ref)` comment near the sim ctx build) rather than re-deriving it. Outside the measured ladder: clamp to the end value and set `extrapolated:true` on that side (rendered muted, tooltip "outside measured range"). A material with a single rate point contributes a flat line (and the section says so — see A.6).
   - Salt: contributes to Qc1 only, at its own `i_salt = I/m_S`; below its measured range treat as full, flag beyond.
4. **Derived per rate:** deliverable `Q(r)=min(Qa,Qc)`; `pctOfDesign = Q(r)/Q(design)`; `np(r)=Qa/Qc`; deviation vs target; `limiting` electrode; **status** by the same thresholds as the capacity pills (green |log(np/target)| ≤ log 1.25, amber ≤ log 2.5, red beyond) so colours mean the same thing everywhere.
5. **Potential shift (the "cyclability compromised" number).** When `np(r) ≠ target`, the non-limiting electrode only sweeps a fraction `f = Q(r)/Q_own(r)` of its own capacity. For **capacitive/pseudocapacitive** electrodes V is linear in Q, so its end-of-charge potential shifts by `ΔV = (1−f) × V_op window` — report that in volts, signed toward the electrode it stresses. For **faradaic** electrodes report the unused fraction `(1−f)` as "% of plateau unreached / overdriven" (no volts pretence). Attach a one-line consequence to the status: red + anode-limited ⇒ *"anode driven past its window on charge — plating/fade risk"*; red + cathode-limited ⇒ *"cathode over-oxidation risk; capacity limited by cathode"*. These strings are the pedagogy; keep them short and identical between table tooltip and chart hover.
6. **Both cycles.** Build for Nth (primary) and 1st (formation) — the section gets the same 1st/Nth toggle style as the capacity bars (and per Item B it re-solves on switch).

### A.3 The chart

- **Plotly** (already bundled+lazy; `ensurePlotly()` on Diagnostics open per Item B; until it arrives show the table plus a slim "chart loads on first open…" placeholder — never block).
- **X:** cell C-rate, log scale. A **unit pill** (reuse the sim's `ax-pill` pattern, grep `openSimUnitMenu`) switches the x labels between `C-rate`, `i cathode (mA/g)`, `i anode (A/g)` — same points, relabelled.
- **Y left:** deliverable cell capacity — µAh, with a second tick row in % of design (or a pill toggle µAh ↔ %; % is the default in ratio mode, see A.6).
- **Y right:** N/P ratio. Horizontal **target line** with a green band (±25 %) and amber band (to ±2.5×) behind it, matching the pill thresholds.
- **Design-rate marker:** vertical dashed line at the design rate labelled **"designed here"**, with a dot where each trace crosses it. If the 1st-cycle toggle is active, the marker sits at the formation rate.
- **Traces:** ① N/P vs rate (right axis, markers at real library points, line through interpolation; extrapolated stretches dotted+muted); ② deliverable capacity vs rate (left axis); ③ faint `Qc(r)` and `Qa(r)` lines toggleable from the legend.
- **Hover:** one unified template per rate: all three currents, Qc, Qa, Q_cell (+%), N/P + status word, limiting electrode, potential-shift line from A.2.5.
- **Risk shading:** the x-region where status is red tinted `--erB` at low opacity, labelled once ("off-design: balance lost").
- Modebar trimmed as in the sim plot; responsive via the existing `ResizeObserver` pattern (grep `simInstallResizeWatcher` for precedent).

### A.4 The interactive table

Columns (header shows the active cycle):
`Rate (C) | i cathode (mA/g) | i anode (A/g) | Q cathode | Q anode | Deliverable (µAh · %) | N/P | vs target | ΔV shift | Limiting`

- **Status colouring** on the N/P and vs-target cells with the standard green/amber/red chips; the **design-rate row** carries a `▸ design rate` badge and stronger background; extrapolated values render muted with the tooltip from A.2.3.
- **Hover sync:** row hover highlights the matching chart marker (Plotly `Fx.hover` or a drawn ring); chart hover highlights the row. Pure view sync — no recompute (Item B exemption, explicitly).
- **Click = "simulate at this rate":** clicking a row calls the existing `pickSimRate` bridge (L2722) with that rate's cell current for the active cycle slot, marks the row `.sel-…` (existing classes), and shows an inline affordance "→ open Simulation". Per Item B, the click path runs `recalcNow()` first.
- The header block also restates the design point: *"Designed for **C/10** (10 h) · deliverable **X µAh** · N/P **1.00**"* — pulled live from the same builder.

### A.5 Where the old pieces go

- `buildRT` (L6949) is **deleted**, replaced by `buildRateResponse()` + `renderRateResponse()` (table) + `renderRateChart()` (plot). `#rGrid` markup box becomes the new section's host (`#rateResp`, containing `#rateRespChart`, `#rateRespTable`, the pill, and the 1st/Nth toggle).
- Exports: checklist entry `ratioTbl` (L7999) renamed/re-pointed to the new table (same columns; TXT block at L8278 and HTML block at L8408 rebuilt from `buildRateResponse()` rows). `pwinChart` entry (L8001) and its TXT/HTML/rasterize branches (L8296, L8430) **removed**. Optionally add the chart itself to chart-capable exports via `Plotly.toImage` — mark as stretch, not required.
- Tour: the Diagnostics step copy (grep `Diagnose the balance`) is rewritten to describe the rate-response view: *"…and the Rate response chart shows what happens if you cycle away from the rate you designed for — the drifting N/P, the capacity you lose, and the electrode that starts taking the strain."* The step's `at:` anchor moves to `#rateResp` once it exists.
- `drawPW`/`dW` and the `wDiag` prose block deleted; `data-help` on the Diagnostics header updated to drop the potential-window sentence.

### A.6 Edge cases (decide now, not during coding)

- **Ratio mode** (no mass pinned): absolute µAh don't exist; the builder runs on the normalized 1 mg-anode solution already used by `renderRatio` — capacity column shows **% of design only**, currents still computable from the normalized masses. Everything else identical. (This works because Item B makes the section render through `recalcNow`, which handles ratio mode.)
- **Single-rate materials:** ladder has one point → flat capacity line, N/P constant; render an inline note *"⟂ this material has one measured rate — add its rate ladder in the library to see real rate response"* linking the library. Do **not** hide the section.
- **Salt on:** 1st-cycle view includes the salt term in Qc1 exactly as `drawBar` does (grep `qS=saltOn`); Nth view unaffected.
- **Known-cathode dual-anode mode:** use the primary (Nth-balancing) anode mass; note in the header when `r.dualAnode`.
- **Very fast/slow grid points** beyond both ladders: drop rows where *both* electrodes are extrapolated more than 4× past their ladder ends — noise, not information.

### A.7 Acceptance criteria

1. Diagnostics shows bars → Rate response (chart + table); no ratio table, no potential windows anywhere (UI, exports, help, tour).
2. Chart: log-x, unit pill relabels x between C-rate / i_cat / i_an; design-rate marker labelled; N/P trace crosses the target line inside the green band at the design rate for a balanced solve.
3. Table row at the design rate shows 100 % deliverable, N/P = target (green, `design rate` badge); a rate ≥2.5× off shows red with a ΔV/consequence line.
4. Row click seeds the simulation current (assert via `simRateSel`); hover sync visible.
5. Works in ratio mode (percent capacities), with salt on (1st cycle), and with a single-rate material (flat + note).
6. All of Item B's three-scenario checks pass for the new controls; suite green ×3 consecutive runs; `APP_VERSION` = v12.0 and the badge shows it.

### Suggested commit order

1. Item B rewiring + `rerenderResults` deletion + its checks (smallest, fixes the reported bug).
2. `buildRateResponse()` + table (chart-free) replacing `#rGrid`, + exports re-point, + potential-windows removal.
3. Chart + hover/click sync + unit pill.
4. Tour copy + version bump to v12.0.
