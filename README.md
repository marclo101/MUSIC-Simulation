# MUSIC Electrode Balance

A single-page web tool for sizing and balancing the cathode and anode of a Li/Na-ion full cell. Open the HTML in any modern browser — no install, no server needed.

## Files in this folder

| File | Purpose |
|------|---------|
| `MUSIC_electrode_balance_V10.html` | The application. Open it in a browser. |
| `materials-library.js` | The benchmark material library, loaded automatically when the HTML opens. |

Both files must sit in the **same folder**. The HTML loads the library via `<script src="materials-library.js">`.

## What the program does

Given a cathode active material, an optional sacrificial salt, and an anode, it computes the electrode masses, mass loadings, N/P (Q<sub>a</sub>/Q<sub>c</sub>) ratios, C/10 cell currents, and rate-dependent current densities required to balance the cell at a chosen target N/P. It supports faradaic, capacitive, and pseudocapacitive storage types, and exports the results as TXT, Word, Excel, or PDF.

## How it works

1. On load, the HTML executes `materials-library.js`, which assigns the library to `window.MUSIC_LIBRARY`.
2. The app reads `window.MUSIC_LIBRARY` and uses it to populate the cathode/anode/salt presets and the **Benchmark material library** panel at the bottom of the page.
3. If `materials-library.js` is missing or malformed, the app falls back to (a) a copy stored in the browser's `localStorage`, and (b) a small set of hard-coded defaults bundled inside the HTML.
4. Picking a preset auto-fills the V<sub>th</sub> window, OCV, storage type, and rate-paired C₁/C<sub>N</sub> capacities. All other inputs (composition, target N/P, masses or loadings) are entered manually.

## Saving a new library

To add, edit, or remove materials and persist the changes:

1. In the **Benchmark material library** panel, use **Add**, **✎ Edit**, **⎘ Dup**, or **✕ Del** to modify the library in memory.
2. Click **💾 Save file**. The browser downloads a fresh `materials-library.js`.
3. Move it into the same folder as `MUSIC_electrode_balance_V10.html`, replacing the existing file. (Most browsers save to your Downloads folder by default.)
4. Reopen the HTML — the new library loads automatically.

To share a library without overwriting the default file, use **Export JSON** / **Import** instead. **Reset** discards all customisations and restores the bundled defaults.

### File format

`materials-library.js` is a single JavaScript statement:

```js
window.MUSIC_LIBRARY = { "ac": [...], "saltNa": [...], "saltLi": [...], "anode": [...] };
```

The four top-level arrays hold cathode active materials, Na sacrificial salts, Li sacrificial salts, and anodes respectively. Each entry carries an `id`, `name`, `sys` (`"Li"` or `"Na"`), `ocv`, `ocvRef`, optional `note`, and a `rates[]` array with the rate-paired capacity, V-window, storage type, and citation. The file is plain JSON wrapped in one assignment, so it can be edited by hand if needed.
