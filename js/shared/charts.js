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

/* -------- Line chart (SVG) -------- */
/* series: [{ label, points: [[x, y], ...], color, dashed? }]
   opts: { xFormat (key->label), yFormat (value->string), summary,
           endLabel (shown at last point), targetValue (for dotted marker) }
   Converts numeric x/y into a path scaled to the container. X values are
   treated as ascending numeric indices (caller maps real dates to indices). */
function renderLineChart(boxId, sumId, series, opts) {
  const box = document.getElementById(boxId);
  const sum = document.getElementById(sumId);
  const o = opts || {};
  if (series.length === 0 || series.every(s => !s.points || s.points.length === 0)) {
    box.innerHTML = '<p class="no-data">No data in this range.</p>';
    sum.textContent = "";
    return;
  }
  const xFormat = o.xFormat || (k => String(k));
  const yFormat = o.yFormat || (v => formatTick(v));

  let maxX = 0, maxY = 0;
  for (const s of series) {
    for (const p of (s.points || [])) {
      if (!Array.isArray(p) || p.length < 2) continue;
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    if (o.targetValue && o.targetValue > maxY) maxY = o.targetValue;
  }
  maxY = niceTicks(maxY)[3] || maxY;
  const ticks = niceTicks(maxY);
  // Left padding sized to the widest y-label so labels don't clip.
  const yLabel = yFormat(ticks[3]);
  const padX = Math.max(30, yLabel.length * 7 + 12);
  const padTop = 16, padBottom = 30;
  const padRight = Math.max(30, Math.ceil(((xFormat(maxX) || "").length * 6) / 2) + 8);
  const W = 640, H = 220;
  const iw = W - padX - padRight, ih = H - padTop - padBottom;
  const toX = x => padX + (maxX <= 1 ? 0 : (x / maxX) * iw);
  const toY = y => padTop + ih - (maxY > 0 ? (y / maxY) * ih : 0);

  let yTicks = "";
  for (const t of ticks) {
    yTicks += `<text x="${padX - 6}" y="${toY(t) + 4}" text-anchor="end" class="lc-tick">${yFormat(t)}</text>`;
  }

  let xTicks = "";
  const n = maxX + 1;
  const step = Math.max(1, Math.ceil(n / 6));
  for (let i = 0; i <= maxX; i += step) {
    xTicks += `<text x="${toX(i)}" y="${H - 8}" text-anchor="middle" class="lc-tick">${xFormat(i)}</text>`;
  }
  if (maxX % step !== 0) {
    xTicks += `<text x="${toX(maxX)}" y="${H - 8}" text-anchor="middle" class="lc-tick">${xFormat(maxX)}</text>`;
  }

  let polylines = "";
  for (const s of series) {
    if (!s.points || s.points.length === 0) continue;
    const good = s.points.filter(p => Array.isArray(p) && p.length >= 2);
    const pts = good.map(p => `${toX(p[0]).toFixed(1)},${toY(p[1]).toFixed(1)}`).join(" ");
    const dash = s.dashed ? ' stroke-dasharray="6 4"' : "";
    polylines += `<polyline class="lc-line" fill="none" stroke="${s.color || "var(--accent)"}" stroke-width="2.5" points="${pts}"${dash}>`;
    polylines += `<title>${esc(s.label)}</title></polyline>`;
    const last = good[good.length - 1];
    if (last && !s.dashed) {
      polylines += `<circle class="lc-dot" cx="${toX(last[0])}" cy="${toY(last[1])}" r="4" fill="${s.color || "var(--accent)"}"><title>${esc(s.label)}: ${yFormat(last[1])}</title></circle>`;
    }
    for (const p of good) {
      if (p[1] == null) continue;
      polylines += `<circle class="lc-point" cx="${toX(p[0])}" cy="${toY(p[1])}" r="6" fill="transparent"><title>${esc(s.label)} ${xFormat(p[0])}: ${yFormat(p[1])}</title></circle>`;
    }
  }

  const legend = series
    .filter(s => !s.dashed && s.points && s.points.length)
    .map(s =>
      `<span class="lc-legend-item">
        <i class="lc-legend-swatch" style="background:${s.color || "var(--accent)"}"></i>
        <span class="lc-legend-label">${esc(s.label)}</span>
      </span>`)
    .join("");

  box.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="line-chart-svg" role="img" aria-label="line chart">
      <line x1="${padX}" y1="${padTop}" x2="${padX}" y2="${padTop + ih}" stroke="var(--grid)"/>
      <line x1="${padX}" y1="${padTop + ih}" x2="${padX + iw}" y2="${padTop + ih}" stroke="var(--grid)"/>
      ${yTicks}
      ${xTicks}
      ${polylines}
    </svg>
    ${legend ? `<div class="line-chart-legend">${legend}</div>` : ""}
    ${o.endLabel ? `<div class="line-chart-meta">${o.endLabel}</div>` : ""}`;
  if (sum) sum.textContent = o.summary || "";
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