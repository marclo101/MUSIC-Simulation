# Plan — Simplify the Rate-response view

**Status:** planning document only. No code in this change — implementation is handled by another model.
**Baseline:** branch head at v12.2 (`a6eb025`). Anchors are given as function/id names, not line numbers.
**Version:** ship as **v13.0** (visible redesign of the Diagnostics tab).
**Scope:** presentation only. `buildRateResponse()`, `_rrCapAt()`, the state machinery
(measured / extrapolated / assumed / unknown), thresholds, and **all export renderers stay
exactly as they are**. A printed report is an archive and stays dense; the screen is a glance
and gets simple. This plan changes `renderRateResponse()`, `renderRateChart()`, the section
markup inside `#rateResp`, and the related CSS/copy — nothing upstream of them.

---

## 1 · Diagnosis — why it reads as crowded

Verified against the current markup (`#rateResp`, index ~L1054) and renderers:

1. **The same refusal sentence is printed once per row.** With no usable ladder, all seven
   rows repeat *"Not enough data to extrapolate — cathode: no measured rate data… anode: only
   one measured rate…"*, italic, truncated mid-word, each ending in a red call-to-action.
   A table of seven identical sentences looks broken, not honest.
2. **Eight columns force a horizontal scrollbar** (`rate | Qc | Qa | Deliverable | Qa/Qc |
   vs target | Potential shift | Limiting`) even on a wide desktop. A scrolled table hides
   exactly the columns that were supposed to matter.
3. **Five stacked preamble rows before any data:** a two-line lede (which repeats the `?` help
   text), a row of four chips + an amber warning chip, the chart block, two checkboxes
   (+ the assume inputs), and a three-pill unit selector. The content starts below the fold
   of the section.
4. **The chart encodes ~10 things on 2 y-axes:** an N/P trace (blue) whose markers are
   status-coloured, a capacity trace (green), a dotted target line, two threshold bands,
   a design-rate line, an annotation, and opacity for provenance. Dual axes are the single
   biggest comprehension killer here.
5. **The colour language contradicts the rest of the app.** Directly above, the capacity-balance
   bars establish green = cathode, blue = anode. In the chart, green = "deliverable capacity"
   and blue = "N/P". The same two hues, different meanings, one screen apart — this is the
   "is it the colors?" the user is sensing.
6. **Six competing accents in one section:** green chips, a green cycle chip, a filled-green
   DESIGN badge, the amber warning chip, an active green pill, red hint links, plus the
   green/amber/red row grading. When everything is highlighted, nothing is.

## 2 · Principles for the redesign

- **One message:** *balanced at one rate; every other rate costs capacity — this much.*
  Outcome first; mechanism and raw numbers on demand.
- **One meaning per colour.** Green/amber/red = health, nothing else. Cathode-green and
  anode-blue (the exact bar-chart hues) = electrode identity, nothing else. Provenance
  (measured / est. / assumed) = solidity — dots, dashes, opacity — never a colour.
- **Say each thing once.** A reason, a caveat, or a label appears in exactly one place.
- **Three visible columns.** Everything else lives in an expandable row detail.
- **One y-axis.** If a quantity needs a second axis, it doesn't go on this chart.

## 3 · New layout (top → bottom)

```
Rate response — the balance only holds at the design rate        [Nth | 1st]  (?)
Sized at C/10 (10 h) to deliver 315 µAh at N/P 1.00. At any other rate one
electrode runs out early — here is what each rate costs.
⚠ your design rate is an estimate, not a measurement          ← only when true

┌─ chart (≈55%) ────────────────────┐ ┌─ table (≈45%) ──────────────────────┐
│ µAh                    Cathode ─  │ │ Rate ▾        Capacity kept  Balance │
│      ●──●──●─╌╌╌       Anode  ─   │ │ C/20 · 20 h   ▓▓▓▓▓ 100%ᵉˢᵗ  ● on…  │
│   ●──●──●──●──●─╌╌     ┆designed  │ │ ▸C/10 DESIGN  ▓▓▓▓▓ 100%     ● on…  │
│   (delivered = lower line)        │ │ 1C · 1 h      ▓▓▓▓ 80%ᵉˢᵗ    ● drift│
│ ▬▬▬▬▬▬▬▬▬▬▬ status strip          │ │ 2C · 30 min   ▓▓▓ 64%        ● anode│
└───────────────────────────────────┘ │   └ expanded: Qc·Qa·N/P·ΔV·[Simulate]│
                                      └──────────────────────────────────────┘
☐ List the measured points as table rows  ·  ☐ Assume capacity is constant
   outside the measured range  [cathode __] [anode __] mAh/g
● = measured point · dashed = estimate · measured on file: cathode 7, anode 9
```

- **≥1100 px:** chart and table side by side (CSS grid `55% / 45%` on a new wrapper
  `#rrBody`). Below that: stacked, chart first. This alone removes half the perceived bulk —
  today both are full-width and stacked.
- The section header keeps the existing `h4` + `?` help + the `#rrTog` Nth/1st toggle,
  unchanged.

## 4 · Header zone — from five rows to two lines

1. **Lede** (`.rr-lede`) — replace the two-line paragraph with the **design sentence**, merging
   the four chips into prose (the chips row `#rrDesign` as a chip strip is deleted):

   > Sized at **C/10** (10 h) to deliver **315 µAh** at N/P **1.00**. At any other rate one
   > electrode runs out early — here is what each rate costs.

   - Data: `d.designRate` (+`fRateTime`), `d.Q_design`, `d.target` — same sources the chips use.
   - Ratio mode: "…to deliver **100 %** (masses normalised to 1 cm²) at N/P **1.00**."
   - The current lede's pedagogy moves nowhere — it already exists verbatim in the `?` help.
   - The "formation (1st) cycle" chip is deleted outright: the `[Nth | 1st]` toggle two
     centimetres away already says which cycle is shown.
2. **Warning line** — the design-rate warning keeps its amber chip style but becomes a single
   line under the lede, only when `design.state !== "measured"`. Same three wordings as today.
3. Everything else that lived above the content moves **below the table** (§7) or into the
   table header (§6).

## 5 · The chart — two lines, one axis

Replace both traces, both bands, the target line, and the second axis. New spec:

- **x:** cell C-rate, log scale, ticks labelled with `fCrate` (C/20, C/10, … 5C — never 0.05).
- **y:** capacity in **µAh** (ratio mode: **% of design**). One axis. The N/P axis is deleted —
  balance is carried by the status strip and the table.
- **Trace "Cathode"** — line in the bar-chart cathode green (`#1A8A6E`); on the 1st cycle with
  salt on, label it **"Cathode + salt"** (the builder already includes the salt term).
- **Trace "Anode"** — line in the bar-chart anode blue (`#2D7AB6`).
- **Provenance by solidity, per segment:** solid line through the measured span; **dashed**
  where the value is extrapolated or assumed. (Plotly can't dash per-segment in one trace —
  implement each electrode as two same-coloured traces, solid + dashed, `showlegend:false`
  on the extension. Visually it is one line.)
- **Measured points are always dots** (`●`, marker size ~7) on the lines — the evidence is
  permanently visible; the `rrShowMeasured` checkbox becomes table-only (§7).
- **Delivered capacity = the lower envelope:** a neutral fill (`rgba(15,27,45,.05)`,
  `fill:"tozeroy"`, no line, no hover, no legend) under `min(Qc,Qa)`, with one small in-plot
  annotation, bottom-left: *"the cell delivers the lower line"*. No separate "deliverable"
  trace — that was the third line nobody could attribute.
- **Design marker:** keep the vertical dashed line + "designed here" annotation. Add a ring
  marker where each electrode line crosses it.
- **Status strip:** a slim bar (~6 px) along the bottom edge of the plot area (shapes,
  `yref:"paper"`, y 0–0.03): one green/amber/red segment per rate interval (boundaries at
  log-midpoints between grid rates), colours from `row.status`. This single element replaces
  the two bands, the red shading, and the entire N/P axis.
- **Hover:** `hovermode:"x unified"` — one card per rate: `C/2 · 2 h` / `Cathode 167 µAh ·
  Anode 140 µAh` / `delivers 140 µAh (93 %) — anode-limited, drifting` / one-line consequence
  when status ≠ ok / `est.` tag when not measured. Delete the current 8-line tooltip.
- **Direct labels, no legend box:** annotate "Cathode" / "Anode" at the right end of each line
  in its own colour.
- Keep: lazy `ensurePlotly`, `Plotly.react` update path, trimmed modebar, resize handling.
- **Row-hover sync** (`rateRowHover`) becomes a vertical guide line (a shape at that rate)
  instead of restyled markers; chart-hover → row highlight stays as is.

## 6 · The table — three columns + an expander

Header (`#rrTable`):

| Rate ▾ | Capacity kept | Balance |
|---|---|---|

1. **Rate ▾** — `C/2 · 2 h` (rate + time, as today). The **column header is the unit
   switcher**: clicking it opens a small menu — cell C-rate / i cathode (mA/g) / i anode (A/g)
   — replacing the three-pill `#rr-xunit` row (`setRateXUnit` survives; the pill row is
   deleted). Reuse the sim's `ax-pill` menu pattern (`openSimUnitMenu`).
   - The design row keeps a badge, restyled: **outline, not filled green** (`▸ design`),
     plus bold rate text. Opt-in measured rows keep a muted `measured` badge.
2. **Capacity kept** — `92 %` bold, with an **inline data bar** (CSS gradient background,
   0–100 % of the cell width) so the column scans like a chart; the µAh value in small muted
   text after it (`140 µAh`); the provenance tag (`est.` / `assumed`) as today's small
   `.rr-tag`, right after the percentage. Ratio mode: identical, just no µAh.
3. **Balance** — one plain-language cell replacing four columns (`Qa/Qc`, `vs target`,
   `Potential shift`, `Limiting`): a status dot + words, colour-blind-safe because the words
   carry the meaning:
   - ok → `● on target`
   - warn → `● drifting — anode ahead` (the limiting side)
   - bad → `● lost — anode-limited`
   - balanced → `● balanced`

**Row expansion replaces row-click-to-simulate.** Clicking a row toggles an inline detail row
(`<tr class="rr-detail">`, full-width cell) containing everything the deleted columns held:

- `Q꜀ 167 µAh · Qₐ 140 µAh · N/P 0.839 (target 1.00, −16 %)`
- `cathode 35.0 mA/g · anode 0.090 A/g · cell 63 µA`
- the potential-shift / unswept line when present (`cathode potential shifts ≈ 0.12 V` /
  `18 % of the cathode never swept`)
- the consequence sentence when status ≠ ok (same strings as today)
- provenance in words: `both values measured` / `cathode estimated, anode measured` / …
- a **`Simulate at this rate →`** button calling `rateRowToSim(i)` — the seeding behaviour
  is unchanged, it just moves behind an explicit label instead of a whole-row click nobody
  could discover. Delete the per-row `title` tooltip (the detail row supersedes it).

One row expanded at a time is fine (accordion); keep it simple. Hover sync stays on the row.

## 7 · Refusal states — say it once

Three cases, decided now:

- **All rows unknown** (this screenshot): render **no table and no chart frame**. In their
  place, one empty-state card (`#rrEmpty`):

  > **Capacity at other rates can't be estimated yet.**
  > The cathode has no measured rate data; the anode has one point — a trend needs at least
  > two. Add more rates to the library entry, or assume a constant capacity below.
  > ☐ Assume capacity is constant outside the measured range — cathode [__] anode [__] mAh/g

  The reason line is built from the per-electrode reasons **deduplicated** (each distinct
  reason once, not seven times). The assume checkbox + inputs render *inside* the card in
  this state (they are the card's call to action); the below-table options row hides.
  The chart's separate placeholder line ("No rate in this range can be estimated…") is
  deleted — one card serves both.
- **Some rows unknown:** those rows show em-dashes in *Capacity kept* / *Balance* and a small
  muted `not estimable*` note; **one** shared footnote under the table lists each distinct
  reason once (`* below C/5 — cathode: more than a decade beyond the measured range`).
  No per-row sentences, no per-row red links.
- **None unknown:** no refusal text anywhere.

## 8 · Options + footnote row (below the table)

- `☐ List the measured points as table rows` — renamed (`rrShowMeasured`); now affects the
  **table only**, since the chart always shows measured dots. Same builder flag.
- `☐ Assume capacity is constant outside the measured range` (`rrAssumeFlat`) with the two
  inputs (`rrAssumeCat` / `rrAssumeAn`) inline when ticked — unchanged behaviour, moved from
  above the chart to below the table (except in the all-unknown state, §7).
- **Footnote** (`#rrNote`), one small line: `● marks a measured point · dashed / est. =
  estimated · measured on file: cathode 7, anode 9` (+ the dual-anode note when applicable).
  The current four-sentence footnote is trimmed to this; the interpolation math lives in the
  `?` help.

## 9 · Colour + typography rules (the "is it the colors?" answer)

- Allowed in this section, exhaustively: cathode green `#1A8A6E`, anode blue `#2D7AB6`
  (chart lines only); status green/amber/red (status dots, status strip, inline-bar tint);
  amber (design-rate warning line); ink/muted greys for everything else.
- Deleted accents: green info chips, green cycle chip, filled-green design badge, green
  active pill, red hint links inside rows.
- Refusal/explanatory text: normal UI font, small, muted — **no italics, no mono** for prose.
  Mono stays for numbers only.

## 10 · What leaves the default view, and where it went

| Removed from first glance | Now lives in |
|---|---|
| Qc, Qa columns | chart lines + row detail |
| Qa/Qc, vs-target columns | Balance words + row detail (exact numbers) |
| Potential-shift column | row detail + consequence line |
| i cathode / i anode columns & pill row | Rate ▾ header menu + row detail |
| 4 info chips | the one-line design sentence |
| cycle chip | the existing Nth/1st toggle |
| N/P axis, bands, deliverable trace | status strip + lower-envelope fill |
| 7× refusal sentences | one card / one footnote |
| two-line lede | `?` help (already there verbatim) |

## 11 · Edge cases

- **Ratio mode:** y-axis and Capacity kept in % (no µAh anywhere); design sentence per §4.
  Everything else identical — the builder already normalises.
- **1st cycle + salt:** cathode line/labels read "Cathode + salt"; builder unchanged.
- **Dual-anode (known cathode):** keep the existing one-line note, moved into the footnote.
- **Design rate off the standard ladder:** its row sorts into place as today (`isDesign`).
- **Tour:** the Diagnostics step copy gains one sentence: *"Green and blue are your two
  electrodes — the cell delivers whichever line is lower."* Anchor unchanged (`#rateResp`).
- **Exports:** untouched by design (v12.2 already carries Source column + footnotes). State
  this in the commit message so nobody "helpfully" syncs them to three columns.

## 12 · Test impact (`tests/smoke.js`)

Update (same spirit, new selectors/assertions):

- *"chart and table are both rendered from the same data"* — trace count changes; assert
  instead: exactly **one** y-axis (`layout.yaxis2 === undefined`), and every line trace's
  colour ∈ {cathode green, anode blue}.
- *"it explains simply why it cannot extrapolate"* — assert `#rrEmpty` exists and the reason
  text appears **exactly once** in the section (`(sectionText.match(/no measured rate data/g)||[]).length === 1`).
- *"clicking a row seeds the simulation at that rate"* — becomes: click row → detail row
  visible; click its `Simulate` button → `simRateSel` seeded.
- *"the x-unit pill and cycle toggle both work"* — pill → header menu; same assertion on the
  header text changing.
- *"rows are graded…"* — status now read from the Balance cell's class/word.
- *"the potential shift … is reported"* — assert inside an expanded detail row.
- *"a checkbox adds the measured rate points"* — unchanged (table rows).

New checks:

- No horizontal overflow: `#rrTable` parent `scrollWidth <= clientWidth` at 1100 px viewport.
- Header zone before the chart/table contains ≤ 2 text lines + optional warning.
- The refusal sentence never appears more than once in `#rateResp`'s text.
- Design badge is not filled green (class assertion, not pixel test).
- All-unknown state: `#rrTable` absent/empty, `#rrEmpty` present, assume checkbox present
  inside it and functional.

Suite hygiene as established: each block seeds its own scenario; run twice consecutively.

## 13 · Ship order

1. Table rewrite (3 columns + expander + refusal states + options move) — the bulk.
2. Chart rewrite (two lines, strip, fill, unified hover).
3. Header zone + copy + colour cleanup + tour sentence.
4. Test updates + new checks; `APP_VERSION = "v13.0"`.
