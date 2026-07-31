# MUSIC Electrode Balance

A single-page web tool for sizing and balancing the cathode and anode of a Li/Na-ion full cell. Open the HTML in any modern browser — no install, no server needed.

## Files in this folder

| File | Purpose |
|------|---------|
| `MUSIC_electrode_balance_V10.html` | The application. Open it in a browser. |
| `materials-library.js` | The benchmark material library, loaded automatically when the HTML opens. |
| `materials-library-images.js` | Reference figures for the library citations. Loaded only when you open the library. |
| `plotly.min.js` | Plotting engine (Plotly.js v2.35.2). Loaded the first time you open the **Simulation** tab. |
| `plotly.LICENSE` | MIT license for the bundled Plotly.js. |

All files must sit in the **same folder**. If `plotly.min.js` is absent the app still runs, but the Simulation plot will not render; if `materials-library-images.js` is absent everything works except the reference figures.

Only the small library file is read at startup — the figures and the plotting engine are fetched the first time you actually open the library or the Simulation tab, so the page is usable almost immediately. An internet connection is used only for the web fonts, and that request cannot delay the page: the tool renders with system fonts and upgrades if and when the fonts arrive.

## What the program does

Given a cathode active material, an optional sacrificial salt, and an anode, it computes the electrode masses, mass loadings, N/P (Q<sub>a</sub>/Q<sub>c</sub>) ratios, C/10 cell currents, and rate-dependent current densities required to balance the cell at a chosen target N/P. It supports faradaic, capacitive, and pseudocapacitive storage types, and exports the results as TXT, Word, Excel, or PDF.

**Start with Cell parameters.** The tool opens on a full-width *Cell parameters* card: the target N/P ratio (Q<sub>a</sub>/Q<sub>c</sub>) the solver must hit, and the C-rates you intend to cycle at for the formation (1st) and reversible (Nth) cycles. Capacities are rate-dependent, so a cell balanced at one rate is not balanced at another — these rates also set the currents the simulation applies and highlight the matching rows in the Rates tab.

By default the target N/P applies to every cycle. Enabling **Different 1st cycle** exposes a separate formation-cycle target: the sacrificial salt is then sized so the **1st cycle** lands on its own N/P while the electrode masses hold the **reversible (Nth) cycle** at the main target.

**Already-prepared electrodes.** If your cathode is mixed to a fixed recipe, enter the **Known salt content (% of electrode mass)** in the sacrificial-additive panel. The AM / salt / carbon / binder split is then held fixed, and — with the cathode mass pinned — the tool sizes the **anode mass** to balance it. Because a fixed cathode leaves the anode mass as the only knob, it reports **two masses**: one balancing the reversible (Nth) cycle and one balancing the formation (1st) cycle. Leave the field blank to have the solver choose the salt amount as before.

**First time here?** The app offers a guided tour every time it loads — dismiss it with one click, or replay it any time from the **Tutorial** button in the header. The tour lights up one section at a time, leaving it fully usable so you can try each input as it is explained, and it ends at the material library.

### Rate response

The **Diagnostics** tab ends with a chart and table showing what happens if the cell is cycled away from the rate it was designed for. Capacity at each rate is **extrapolated from the material's measured half-cell points**: the library's (rate, capacity) pairs are fitted against log(current), interpolated between points and extended up to a decade beyond them. The table reports a fixed ladder — C/20, C/10, C/5, C/2, 1C, 2C, 5C — plus your design rate, with each value marked *measured*, *est.* or *assumed*. A checkbox adds the measured points themselves as extra rows.

Where the data cannot support an estimate — a single measured rate, no rate data at all, or a rate far beyond the ladder — the tool **says so instead of inventing a number**. A second checkbox, *assume capacity is constant outside the measured range*, fills those regions in: by default each end holds its own nearest measured value, and you can type a capacity per electrode to override it.

For every rate the table gives the cell C-rate and each electrode's mass-normalized current, both electrode capacities, the deliverable capacity as a percentage of the design point, the drifting N/P, the potential shift of the part-swept electrode, and which electrode is limiting — colour-graded on the same green/amber/red scale used elsewhere. Clicking a row simulates the cell at that rate.

### The Simulation tab

The **Simulation** tab draws the galvanostatic charge–discharge (GCD) curves — V<sub>cat</sub>, V<sub>an</sub> and V<sub>cell</sub> vs capacity or time — of the balanced cell. Each electrode is a state-of-charge position on a canonical piecewise-linear Q–V map built from the balance results and the material inputs:

- **Capacitive (EDLC) and pseudocapacitive** electrodes are linear V–Q ramps across their V<sub>th</sub> window.
- **Faradaic** electrodes are plateau staircases: a per-electrode **V<sub>plateau</sub> / % share** editor (single or multi-stage) pins the electrode at its redox potential(s) for that share of the capacity, with the remainder drawn as sloping ramps. These plateaus are reversible and appear in every cycle.
- The **sacrificial salt** adds one-shot oxidation-only plateaus at V<sub>redox</sub> from a global reservoir (m<sub>S</sub>·C<sub>s,1</sub>) that is consumed across cycles and never refilled.
- The very first stroke is the **formation** half-cycle: anchored at the as-assembled OCV and sized by C<sub>1st</sub>; every later stroke uses C<sub>Nth</sub>, with the irreversible loss carried across the switch.
- **Deliverable capacity is rate-dependent**: when the material's library entry has a multi-rate ladder, the simulated capacity is scaled by φ = c(i<sub>app</sub>)/c(i<sub>ref</sub>), interpolated in log current, where i<sub>app</sub> comes from the currents picked in the Rates tab and the solved electrode masses.
- Both electrodes pass the same charge; a stroke ends when either electrode exhausts its capacity or one of six always-on stop constraints (Cathode/Anode/Cell × V<sub>max</sub>/V<sub>min</sub>, defaulting to the V<sub>op</sub> windows) is crossed — including the IR drop from the R<sub>eq</sub> input on the cell voltage.

Not modeled (no data for them in the library): reaction kinetics (Butler–Volmer), diffusion limitation, hysteresis beyond ohmic IR, and temperature effects.

## How it works

1. On load, the HTML executes `materials-library.js`, which assigns the library to `window.MUSIC_LIBRARY`.
2. The app reads `window.MUSIC_LIBRARY` and uses it to populate the cathode/anode/salt presets and the **Benchmark material library** panel at the bottom of the page.
3. If `materials-library.js` is missing or malformed, the app falls back to (a) a copy stored in the browser's `localStorage`, and (b) a small set of hard-coded defaults bundled inside the HTML.
4. Picking a preset auto-fills the V<sub>th</sub> window, OCV, storage type, and rate-paired C₁/C<sub>N</sub> capacities. Because capacity is rate-dependent, the tool selects the **measurement taken closest to your design C-rate** — the reversible capacity from the row nearest the operating rate, the first-cycle capacity from the row nearest the formation rate — and re-selects automatically if you change either rate later. A capacity you type by hand is never overwritten. All other inputs (composition, target N/P, masses or loadings) are entered manually.
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
