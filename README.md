# MUSIC Electrode Balance

A single-page web tool for sizing and balancing the positive and negative electrodes of a Li/Na-ion full cell. Open the HTML in any modern browser — no install, no server needed.

## Files in this folder

| File | Purpose |
|------|---------|
| `MUSIC_electrode_balance_V10.html` | The application. Open it in a browser. |
| `materials-library.js` | The benchmark material library, loaded automatically when the HTML opens. |
| `materials-library-images.js` | Reference figures for the library citations. Loaded only when you open a citation that has one. |
| `plotly.min.js` | Plotting engine (Plotly.js v2.35.2). Loaded the first time you open the **Simulation** tab. |
| `plotly.LICENSE` | MIT license for the bundled Plotly.js. |

All files must sit in the **same folder**. If `plotly.min.js` is absent the app still runs, but the Simulation plot will not render; if `materials-library-images.js` is absent everything works except the reference figures.

Only the small library file is read at startup — the figures and the plotting engine are fetched the first time you actually open the library or the Simulation tab, so the page is usable almost immediately. An internet connection is used only for the web fonts, and that request cannot delay the page: the tool renders with system fonts and upgrades if and when the fonts arrive.

## Simple and Advanced

The masthead carries one switch, and it is the first thing to decide.

**Simple** is where the tool opens. It asks for four capacities — for each electrode, the **1st-cycle** value and the **Nth (reversible)** value it settles to, in that order, exactly as a half cell reports them — and answers with one number: how much of the positive electrode's active mass has to be sacrificial salt, drawn as a two-slice pie. No masses, no loadings, no rates, no voltage windows, because the answer is a *ratio* and every one of those cancels out of it.

Everything is per gram of the active material itself, with one deliberate exception: the **positive electrode's 1st-cycle capacity counts the whole active zone, AM + salt** — what a composite electrode actually weighs. That is what lets the salt content be *inferred* from four numbers rather than asked for:

> x = 1 − (C⁺<sub>1</sub>·C⁻<sub>N</sub>) / (C⁻<sub>1</sub>·C⁺<sub>N</sub>)          *(x = salt mass fraction of the active zone)*

**Detaching the salt.** A button beside the two electrodes opens a fifth box for the salt's own capacity — a theoretical figure, say, when you are designing rather than reproducing. The positive 1st-cycle value then counts **per gram of AM alone**, and the split is designed instead of inferred:

> m<sub>salt</sub> / m<sub>AM</sub> = (C⁺<sub>N</sub>·C⁻<sub>1</sub> / C⁻<sub>N</sub> − C⁺<sub>1</sub>) / C<sub>salt</sub>

whose numerator is the working ion the negative electrode loses at formation that the positive AM does not itself replace; where it is ≤ 0, no salt is needed and the tool says so. The unit beside the field changes with the mode, so which basis is being asked for is always on screen. This detached branch is the same physics the full solver applies with both N/P targets at 1.00 — the regression suite pins the two together, and also checks that one cell described both ways gives the same split.

With the salt detached, a positive electrode whose 1st-cycle and reversible capacities are *equal* draws a quiet prompt under the field: **"Consider actual operating window starting from OCV."** A full cell starts its first charge from the OCV, not from the bottom of the half-cell window, so those two numbers are rarely the same in practice.

The benchmark library stays open at the foot of the page, so the numbers can be read straight off it.

**Advanced** is the full tool described in the rest of this file — masses, loadings, compositions, rates, the simulation and the exports. **Single** and **Stack** are modes *within* it, not a top-level choice. The guided tour walks the advanced layout, so starting it switches there.

The choice is remembered between visits.

## What the program does

Given a positive-electrode active material, an optional sacrificial salt, and a negative-electrode material, it computes the electrode masses, mass loadings, electrode mass ratios, N/P (Q<sub>a</sub>/Q<sub>c</sub>) ratios, C/10 cell currents, and rate-dependent current densities required to balance the cell at a chosen target N/P. It supports faradaic, capacitive, and pseudocapacitive storage types, and exports the results as TXT, Word, Excel, or PDF.

**Start with Cell parameters.** The tool opens on a full-width *Cell parameters* card: the target N/P ratio (Q<sub>a</sub>/Q<sub>c</sub>) the solver must hit, and the C-rates you intend to cycle at for the formation (1st) and reversible (Nth) cycles. Capacities are rate-dependent, so a cell balanced at one rate is not balanced at another — these rates also set the currents the simulation applies and highlight the matching rows in the Rates tab. Rates run from C/1000 to 1000C, entered either as a multiplier or as a divisor; a value outside that range is refused with a message rather than silently ignored.

**Two targets, one per cycle.** *Target N/P · N<sup>th</sup> cycle* and *Target N/P · 1<sup>st</sup> cycle* sit side by side, both plain always-open fields and both **1.00** unless you change them — so out of the box the solver balances formation and the reversible cycle alike, and the two only diverge because you typed a difference. Both are **capacity** ratios (Q<sub>a</sub>/Q<sub>c</sub>), not mass ratios; the labels say so, since that is the number papers most often confuse.

Only the sacrificial salt can move the 1st-cycle ratio independently of the N<sup>th</sup> — it is the one input that adds first-cycle capacity without adding reversible capacity. With a salt the solver hits both targets at once, sizing the salt for formation and the active-material mass for the reversible cycle. Without one, the first cycle follows from the capacities you entered: the 1st-cycle target then measures that distance rather than closing it, and the note under the status chip says as much.

**Already-prepared electrodes.** If your cathode is mixed to a fixed recipe, enter the **Known salt content (% of electrode mass)** in the sacrificial-additive panel. The AM / salt / carbon / binder split is then held fixed, and the tool sizes whichever electrode you did *not* pin. A fixed recipe leaves that one mass as the only knob, and a single mass can satisfy only one cycle — so the tool reports **two masses** on the solved side: one balancing the reversible (Nth) cycle and one balancing the formation (1st) cycle. This holds in both directions: pin the cathode and you get two anode masses, pin the anode and you get two cathode masses. Leave the field blank to have the solver choose the salt amount as before.

### Reading the result

The status chip names the direction of any imbalance; the line under it says what that direction **costs**, because the two directions are not equally serious:

- **Anode overcapacitive** (r > target) — the negative electrode is never fully charged. The surplus capacity is unused mass and costs energy density. It is a fixed offset, not a drift: it does not compound over cycles, and there is no plating risk.
- **Cathode overcapacitive** (r < target) — more working ion arrives than the negative electrode can absorb, so it plates as metal. This is a hazard, and on the N<sup>th</sup> cycle it *does* compound: plated metal leaves the inventory every cycle.

Results also report the **electrode mass ratio** on both bases — total film (what you weigh, and what most papers quote) and AM₁ alone (salt excluded). The two are usually different numbers, which is why a bare "1:1.6" in a paper is so often hard to reproduce.

**Naming.** Because anode and cathode swap roles between charge and discharge, those names are only well-defined for a single stroke. The tool therefore labels the electrodes **positive / negative** throughout — consistent with the N/P ratio it has always reported — and there is no switch back. This is a display layer only: element ids, solver keys, the saved library and the export payloads are untouched.

**Mechanical stability.** Each electrode takes an optional **Max areal loading** (mg/cm²) — the limit your AM/binder pair will hold on the foil — and an optional coating density, which turns the loading into an estimated thickness. Exceeding the limit raises a warning. It is purely advisory: it never constrains the solver or alters a computed mass. Library entries may carry `maxLoading` and `density` fields to seed it; entries without them simply leave the check off.

**Planning an experiment.** **⤓ Blank data sheet** (next to *Export results*) downloads a table of every input the tool consumes — field, symbol, unit, normalisation basis, required or optional, and how it is measured — so you can collect the data away from the tool. Anything already entered is carried across, and the sheet states the capacity conventions in full.

**First time here?** The app offers a guided tour every time it loads — dismiss it with one click, or replay it any time from the **Tutorial** button in the header. The tour lights up one section at a time, leaving it fully usable so you can try each input as it is explained, and it ends at the material library.

### Capacity conventions

Every specific capacity the tool asks for is a **half-cell value, per gram of that component alone**:

| Field | Basis | Which stroke |
|---|---|---|
| Cathode AM `C₁ₛₜ` | mAh g⁻¹ of active material — salt excluded | first **charge** (de-sodiation / de-lithiation) |
| Cathode AM `Cₙₜₕ` | mAh g⁻¹ of active material | **discharge** of a settled cycle |
| Salt `C₁ₛₜ` | mAh g⁻¹ **of salt** | first oxidation (irreversible) |
| Anode `C₁ₛₜ` | mAh g⁻¹ of active material | first **discharge** (sodiation / lithiation — includes the SEI loss) |
| Anode `Cₙₜₕ` | mAh g⁻¹ of active material | **discharge** of a settled cycle |

The active-material capacity and the salt capacity are added separately (`Qc1 = m_AM·C₁ + m_salt·C_s1`), so never fold the salt into the AM figure. Record the rate alongside every capacity — capacity is rate-dependent, which is the whole reason the design rate is asked for up front.

One exception is worth knowing: the Simulation tab's capacity axis can be normalised **per total cell mass**, which counts *both* whole electrode films including carbon and binder. That number is not comparable with a half-cell mAh/g figure. The axis pill spells out the active basis, and per-cathode-AM and per-anode-AM options are available alongside it.

### Rate response

The **Diagnostics** tab ends with a chart and table showing what happens if the cell is cycled away from the rate it was designed for. Capacity at each rate is **extrapolated from the material's measured half-cell points**: the library's (rate, capacity) pairs are fitted against log(current), interpolated between points and extended up to a decade beyond them. The table reports a fixed ladder — C/20, C/10, C/5, C/2, 1C, 2C, 5C — plus your design rate, with each value marked *measured*, *est.* or *assumed*. A checkbox adds the measured points themselves as extra rows.

Where the data cannot support an estimate — a single measured rate, no rate data at all, or a rate far beyond the ladder — the tool **says so instead of inventing a number**. A second checkbox, *assume capacity is constant outside the measured range*, fills those regions in: by default each end holds its own nearest measured value, and you can type a capacity per electrode to override it.

For every rate the table gives the cell C-rate and each electrode's mass-normalized current, both electrode capacities, the deliverable capacity as a percentage of the design point, the drifting N/P, the potential shift of the part-swept electrode, and which electrode is limiting — colour-graded on the same green/amber/red scale used elsewhere. Clicking a row simulates the cell at that rate.

Every export carries the table with the same caveats as the screen: a **Source** column marking each value *measured* / *est.* / *assumed*, the reason printed under any rate that could not be estimated, the design-rate warning if your design point is not measurement-backed, and a count of the measured rate points behind it all.

### The Simulation tab

The **Simulation** tab draws the galvanostatic charge–discharge (GCD) curves — V<sub>cat</sub>, V<sub>an</sub> and V<sub>cell</sub> vs capacity or time — of the balanced cell. Each electrode is a state-of-charge position on a canonical piecewise-linear Q–V map built from the balance results and the material inputs:

- **Capacitive (EDLC) and pseudocapacitive** electrodes are linear V–Q ramps across their V<sub>th</sub> window.
- **Faradaic** electrodes are plateau staircases: a per-electrode **V<sub>plateau</sub> / % share** editor (single or multi-stage) pins the electrode at its redox potential(s) for that share of the capacity, with the remainder drawn as sloping ramps. These plateaus are reversible and appear in every cycle.
- The **sacrificial salt** adds one-shot oxidation-only plateaus at V<sub>redox</sub> from a global reservoir (m<sub>S</sub>·C<sub>s,1</sub>) that is consumed across cycles and never refilled.
- The very first stroke is the **formation** half-cycle: anchored at the as-assembled OCV and sized by C<sub>1st</sub>; every later stroke uses C<sub>Nth</sub>, with the irreversible loss carried across the switch.
- **Deliverable capacity is rate-dependent**: when the material's library entry has a multi-rate ladder, the simulated capacity is scaled by φ = c(i<sub>app</sub>)/c(i<sub>ref</sub>), interpolated in log current, where i<sub>app</sub> comes from the currents picked in the Rates tab and the solved electrode masses.
- Both electrodes pass the same charge; a stroke ends when either electrode exhausts its capacity or one of six stop constraints (Cathode/Anode/Cell × V<sub>max</sub>/V<sub>min</sub>, defaulting to the V<sub>op</sub> windows) is crossed — including the IR drop from the R<sub>eq</sub> input on the cell voltage.
- **Any constraint can be switched off entirely**, which is not the same as leaving it blank: blank falls back to the V<sub>op</sub> default, off removes the bound. **Cell cut-offs only** switches the four electrode bounds off in one click, reproducing a real two-electrode cell where nothing controls the individual electrode potentials and they go wherever the balance sends them.
- Under the plot, a **headroom report** names what ended the last stroke and how much of each electrode's own V<sub>op</sub> window was left unswept. A stroke that ends on a *cell* bound while an electrode still has headroom to its own limit is the signature of the electrode potentials walking away from their design window; the report flags the first stroke where that appears and says whether the gap is widening (a progressive drift) or holding steady (a fixed offset).

Not modeled (no data for them in the library): reaction kinetics (Butler–Volmer), diffusion limitation, hysteresis beyond ohmic IR, and temperature effects.

## How it works

1. On load, the HTML executes `materials-library.js`, which assigns the library to `window.MUSIC_LIBRARY`.
2. The app reads `window.MUSIC_LIBRARY` and uses it to populate the cathode/anode/salt presets and the **Benchmark material library** panel at the bottom of the page.
3. If `materials-library.js` is missing or malformed, the app falls back to (a) a copy stored in the browser's `localStorage`, and (b) a small set of hard-coded defaults bundled inside the HTML.
4. Picking a preset auto-fills the V<sub>th</sub> window, OCV, storage type, and rate-paired C₁/C<sub>N</sub> capacities (plus `maxLoading` / `density` if the entry carries them). Because capacity is rate-dependent, the tool selects the **measurement taken closest to your design C-rate** — the reversible capacity from the row nearest the operating rate, the first-cycle capacity from the row nearest the formation rate — and re-selects automatically if you change either rate later. A capacity you type by hand is never overwritten. All other inputs (composition, target N/P, masses or loadings) are entered manually.
   - This is why a library entry is most useful with **every rate you measured**, one row per rate, rather than a single number.
5. For **capacitive and pseudocapacitive** electrodes, if the library has no measured 1st-cycle value, C₁ is derived from the as-assembled OCV: since a capacitor's capacity scales with voltage span, C₁ = C<sub>rev</sub> · (V<sub>op,hi</sub> − OCV)/(V<sub>th,hi</sub> − V<sub>th,lo</sub>) for the cathode (mirrored for the anode), using the reversible capacity at the slowest available rate. Formation is always a charge (a cell is assembled discharged), so the cathode sweeps OCV→V<sub>op,hi</sub> and the anode OCV→V<sub>op,lo</sub>. Editing the OCV or the windows re-derives it automatically; typing a C₁ by hand locks it. Faradaic materials keep their library C₁.

## Saving a new library

To add, edit, or remove materials and persist the changes:

1. In the **Benchmark material library** panel, use **Add**, **✎ Edit**, **⎘ Dup**, or **✕ Del** to modify the library in memory.
2. Click **💾 Save file**. The browser downloads a fresh `materials-library.js` — plus `materials-library-images.js` if any of your citations carry a figure.
3. Move them into the same folder as `MUSIC_electrode_balance_V10.html`, replacing the existing files. (Most browsers save to your Downloads folder by default.)
4. Reopen the HTML — the new library loads automatically.

To share a library without overwriting the default file, use **Export JSON** / **Import** instead. **Reset** discards all customisations and restores the bundled defaults.

### File format

`materials-library.js` is a single JavaScript statement:

```js
window.MUSIC_LIBRARY = { "ac": [...], "saltNa": [...], "saltLi": [...], "anode": [...] };
```

The four top-level arrays hold cathode active materials, Na sacrificial salts, Li sacrificial salts, and anodes respectively. Each entry carries an `id`, `name`, `sys` (`"Li"` or `"Na"`), `ocv`, `ocvRef`, optional `note`, and a `rates[]` array with the rate-paired capacity, V-window, storage type, and citation. The file is plain JSON wrapped in one assignment, so it can be edited by hand if needed.

## Development

The application is plain HTML/CSS/JS with no build step — just open the HTML file. An **optional** headless regression test (Playwright) drives the real page in Chromium and asserts the solver, both 1st-cycle features, and a broad health check (Plotly load, simulation, export, library):

```bash
npm install
npx playwright install chromium   # one-time browser download
npm test
```

The test runner and `node_modules/` are development-only; the tool itself still needs no install or server.
