"use strict";

/* =====================================================================
   Fitness Tracker — shared charts: nice ticks, bar + stacked bar charts,
   categorical palette, range-tab helpers.
   ===================================================================== */

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEKDAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function niceTicks(max) {
  if (max <= 0) return [0, 0, 0, 0];
  const rough = max / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1))));
  const n = rough / pow;
  let step;
  if (n < 1.5) step = 1;
  else if (n < 3) step = 2;
  else if (n < 7) step = 5;
  else step = 10;
  step *= pow;
  const top = Math.ceil(max / step) * step;
  return [0, top / 3, (top * 2) / 3, top];
}

function formatTick(t) {
  if (t >= 1000) return (t / 1000).toFixed(t % 1000 ? 1 : 0) + "k";
  return String(Math.round(t * 10) / 10);
}

/* -------- Categorical palette (stacked charts) -------- */
const PALETTE = [
  "#0f766e", "#7c3aed", "#dc2626", "#d97706", "#0891b2", "#4d7c0f",
  "#db2777", "#6d28d9", "#b45309", "#2563eb", "#16a34a", "#be123c",
  "#0e7490", "#a16207", "#9333ea", "#e11d48", "#0d9488", "#65a30d"
];
const palMap = {};
let palIdx = 0;
function palForKey(key) {
  if (!(key in palMap)) { palMap[key] = PALETTE[palIdx % PALETTE.length]; palIdx++; }
  return palMap[key];
}
function resetPalette() {
  for (const k in palMap) delete palMap[k];
  palIdx = 0;
}

/* -------- Range-tab helpers -------- */
function syncRangeTabs(boxId, current) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.querySelectorAll(".range-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.range === current));
}

/* Builds the range (or granularity) buttons into a container once.
   list/labels: parallel maps (e.g. RANGES/RANGE_LABEL or GRANS/GRAN_LABEL).
   get()/set(v): read/write the chart's state; onchange runs after a click.
   prefixLabel: optional small caption like "Range" / "Split by" (run charts). */
function setupRangeButtons(boxId, list, labels, get, set, onchange, prefixLabel) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const prefix = prefixLabel ? `<span class="tab-label">${prefixLabel}</span>` : "";
  box.innerHTML = prefix + list.map(r =>
    `<button class="range-btn${r === get() ? " active" : ""}" data-range="${r}">${labels[r]}</button>`
  ).join("");
  box.querySelectorAll(".range-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      set(btn.dataset.range);
      onchange();
    });
  });
}

/* -------- Bar chart (single color or per-bar color) -------- */
/* sorted: array of [key, value] pairs, already ordered for display. */
function renderBarChart(boxId, sumId, sorted, tipFn, labelFn, summary, colorFn) {
  const box = document.getElementById(boxId);
  const sum = document.getElementById(sumId);
  if (sorted.length === 0) {
    box.innerHTML = '<p class="no-data">No data in this range.</p>';
    sum.textContent = "";
    return;
  }
  const max = Math.max(...sorted.map(s => s[1]), 0);
  const ticks = niceTicks(max);
  const total = sorted.reduce((s, p) => s + p[1], 0);
  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  const yAxis = document.createElement("div");
  yAxis.className = "y-axis";
  yAxis.innerHTML = ticks.slice().reverse().map(t => `<span>${formatTick(t)}</span>`).join("");
  const bars = document.createElement("div");
  bars.className = "bars";
  sorted.forEach(([k, v], i) => {
    const pct = max > 0 ? (v / max) * 100 : 0;
    const w = document.createElement("div");
    w.className = "bar-wrap";
    const color = colorFn ? colorFn(k, i) : "var(--accent)";
    w.innerHTML = `<div class="bar" style="height:${Math.max(pct, v > 0 ? 2 : 0)}%;background:${color}"><span class="bar-tip">${tipFn(v)}</span></div>
      <div class="bar-label" title="${esc(labelFn(k))}">${esc(labelFn(k))}</div>`;
    bars.appendChild(w);
  });
  wrap.appendChild(yAxis);
  wrap.appendChild(bars);
  box.innerHTML = "";
  box.appendChild(wrap);
  sum.textContent = summary;
  return { total, count: sorted.length, max };
}

/* -------- Stacked bar chart -------- */
/* buckets: { bucketKey: { category: value } }; catOrder: descending category totals. */
function renderStackedChart(boxId, sumId, buckets, catOrder, labelFn, tipFn, summary) {
  const box = document.getElementById(boxId);
  const sum = document.getElementById(sumId);
  const keys = Object.keys(buckets).sort();
  if (keys.length === 0) {
    box.innerHTML = '<p class="no-data">No data in this range.</p>';
    sum.textContent = "";
    return;
  }
  const totals = {};
  let max = 0;
  for (const k of keys) {
    let t = 0;
    for (const c in buckets[k]) t += buckets[k][c];
    totals[k] = t;
    if (t > max) max = t;
  }
  const ticks = niceTicks(max);
  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  const yAxis = document.createElement("div");
  yAxis.className = "y-axis";
  yAxis.innerHTML = ticks.slice().reverse().map(t => `<span>${formatTick(t)}</span>`).join("");
  const bars = document.createElement("div");
  bars.className = "bars";
  for (const k of keys) {
    const t = totals[k];
    const pct = max > 0 ? (t / max) * 100 : 0;
    const w = document.createElement("div");
    w.className = "bar-wrap";
    const segs = catOrder
      .filter(c => (buckets[k][c] || 0) > 0)
      .map(c => `<div class="stack-seg" style="height:${(buckets[k][c] / max) * 100}%;background:${palForKey(c)}"><span class="bar-tip">${c}: ${tipFn(buckets[k][c])}</span></div>`)
      .join("");
    w.innerHTML = `<div class="bar stack" style="height:${Math.max(pct, t > 0 ? 2 : 0)}%">${segs}</div>
      <div class="bar-label" title="${esc(labelFn(k))}">${esc(labelFn(k))}</div>`;
    bars.appendChild(w);
  }
  wrap.appendChild(yAxis);
  wrap.appendChild(bars);
  box.innerHTML = "";
  box.appendChild(wrap);
  sum.textContent = summary;
}