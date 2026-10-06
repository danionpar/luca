/**
 * Inline stylesheet for the rendered dashboard. Colours are CSS custom
 * properties so light and dark swap in one place; dark mode is a *selected*
 * set of steps (validated against the dark surface), applied by the OS
 * setting or by the explicit theme toggle, which wins both ways.
 */
export const DASHBOARD_CSS = `
:root {
  color-scheme: light;
  --page: #f9f9f7; --surface: #fcfcfb;
  --ink: #0b0b0b; --ink-2: #52514e; --ink-3: #6b6a64;
  --grid: #e1e0d9; --axis: #c3c2b7; --ring: rgba(11,11,11,0.10);
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; --s5: #e87ba4; --s6: #008300; --s7: #4a3aa7;
  --other: #a9a8a1; --uncat-a: #c3c2b7; --uncat-b: #898781;
  --focus: #2a78d6;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19;
    --ink: #ffffff; --ink-2: #c3c2b7; --ink-3: #a3a29a;
    --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
    --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181; --s6: #008300; --s7: #9085e9;
    --other: #6b6a64; --uncat-a: #383835; --uncat-b: #5c5b56;
    --focus: #3987e5;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19;
  --ink: #ffffff; --ink-2: #c3c2b7; --ink-3: #a3a29a;
  --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181; --s6: #008300; --s7: #9085e9;
  --other: #6b6a64; --uncat-a: #383835; --uncat-b: #5c5b56;
  --focus: #3987e5;
}
* { box-sizing: border-box; }
html { background: var(--page); }
body {
  margin: 0; padding: 24px 16px 48px; background: var(--page); color: var(--ink);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
}
main { max-width: 1040px; margin: 0 auto; }
header.top { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: baseline; justify-content: space-between; margin-bottom: 16px; }
h1 { font-size: 20px; margin: 0; font-weight: 600; }
.meta { color: var(--ink-2); font-size: 12px; }
.filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
.filters label { display: flex; gap: 6px; align-items: center; color: var(--ink-2); font-size: 13px; }
select, button.btn {
  font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--axis);
  border-radius: 6px; padding: 5px 8px;
}
button.btn { cursor: pointer; }
button.btn:hover, select:hover { background: var(--grid); }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.spacer { flex: 1; }
.card { background: var(--surface); border: 1px solid var(--ring); border-radius: 10px; padding: 16px; min-width: 0; }
.kpis { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.kpi .label { color: var(--ink-2); font-size: 13px; }
.kpi .value { font-size: 28px; font-weight: 600; margin-top: 2px; }
.kpi.hero .value { font-size: 52px; line-height: 1.1; }
.kpi .sub { color: var(--ink-2); font-size: 12px; margin-top: 2px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.grid .wide { grid-column: 1 / -1; }
.card h2 { font-size: 15px; font-weight: 600; margin: 0; }
.card .sub { color: var(--ink-2); font-size: 12px; margin: 2px 0 10px; }
.card-head { display: flex; gap: 8px; justify-content: space-between; align-items: flex-start; }
.chart { width: 100%; min-width: 0; }
.chart svg { display: block; width: 100%; height: auto; overflow: visible; }
svg text { fill: var(--ink-2); font: 11px system-ui, -apple-system, "Segoe UI", sans-serif; }
svg .grid-line { stroke: var(--grid); stroke-width: 1; }
svg .axis-line { stroke: var(--axis); stroke-width: 1; }
svg .hit { fill: transparent; }
svg .hit:focus { outline: none; }
svg .hit:focus-visible, svg .hit:hover { fill: var(--grid); fill-opacity: 0.45; }
svg .cross { stroke: var(--axis); stroke-width: 1; pointer-events: none; }
svg .endlabel { fill: var(--ink); font-weight: 600; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0 0 8px; padding: 0; list-style: none; color: var(--ink-2); font-size: 12px; }
.legend li { display: flex; align-items: center; gap: 6px; }
.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; flex: none; }
.c1 { background: var(--s1); } .c2 { background: var(--s2); } .c3 { background: var(--s3); } .c4 { background: var(--s4); }
.c5 { background: var(--s5); } .c6 { background: var(--s6); } .c7 { background: var(--s7); }
.c-other { background: var(--other); }
.c-uncat { background: repeating-linear-gradient(45deg, var(--uncat-a) 0 3px, var(--uncat-b) 3px 6px); }
.bars { display: grid; grid-template-columns: minmax(80px, 38%) 1fr; row-gap: 6px; column-gap: 10px; align-items: center; }
.bars .lab { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.bars .track { position: relative; height: 22px; display: flex; align-items: center; outline: none; }
.bars .bar { height: 14px; width: calc((100% - 96px) * var(--p)); min-width: 1px; border-radius: 0 4px 4px 0; }
.bars .val { position: absolute; left: calc((100% - 96px) * var(--p) + 8px); color: var(--ink); font-size: 12px; white-space: nowrap; }
.bars .track:hover .bar, .bars .track:focus-visible .bar { filter: brightness(1.12); }
.bars .track:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.tablewrap { overflow-x: auto; max-height: 420px; overflow-y: auto; }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { padding: 5px 8px; text-align: right; border-bottom: 1px solid var(--grid); white-space: nowrap; font-variant-numeric: tabular-nums; }
th:first-child, td:first-child { text-align: left; }
th { color: var(--ink-2); font-weight: 600; position: sticky; top: 0; background: var(--surface); }
#tip {
  position: fixed; z-index: 10; pointer-events: none; display: none; min-width: 140px; max-width: 280px;
  background: var(--surface); color: var(--ink); border: 1px solid var(--axis); border-radius: 8px;
  padding: 8px 10px; font-size: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.18);
}
#tip .t-title { color: var(--ink-2); margin-bottom: 4px; }
#tip .t-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
#tip .t-key { display: flex; gap: 6px; align-items: center; color: var(--ink-2); min-width: 0; }
#tip .t-line { width: 10px; height: 3px; border-radius: 2px; flex: none; }
#tip .t-val { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.empty { color: var(--ink-2); padding: 24px 0; text-align: center; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 760px) {
  .kpis { grid-template-columns: 1fr 1fr; }
  .kpi.hero { grid-column: 1 / -1; }
  .kpi.hero .value { font-size: 44px; }
  .grid { grid-template-columns: 1fr; }
}
`;
