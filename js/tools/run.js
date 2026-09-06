"use strict";

/* =====================================================================
   Run tool — runs registry + shoes registry + dated run entries.
   Ported from the single-file run-tracker.
   Shares the climb.js structure: IIFE, const D = window.DB.run
   (stable object identity; the shell normalizes in place), all element
   IDs prefixed "rn-", global inline handlers prefixed rn_, and the
   registerTool(contract) lifecycle (empty/normalize/sample/setup/
   reset/render/summary/recent).
   ===================================================================== */

(function () {
  const root = document.getElementById("tool-run");
  if (!root) return;
  const $ = id => document.getElementById("rn-" + id);
  const D = window.DB.run;

  /* -------- Tool-local state -------- */
  let unit = "metric";
  let mileRange = "30d";
  let mileGran = "week";
  let shoeRange = "30d";
  let shoeGran = "week";
  let typeRange = "30d";
  let typeGran = "day";
  let surfRange = "30d";
  let surfGran = "day";
  let effortRange = "30d";
  let effortGran = "day";
  let histFrom = null;
  let histTo = null;
  let selectedDate = null;
  const expandedRuns = new Set();
  const expandedShoes = new Set();

  const RANGES = ["week", "7d", "30d", "year", "all"];
  const RANGE_LABEL = { week: "This week", "7d": "Last 7 days", "30d": "Last 30 days", year: "This year", all: "All time" };
  const GRANS = ["day", "week", "month"];
  const GRAN_LABEL = { day: "By day", week: "By week", month: "By month" };
  const M_PER_KM = 1000;
  const M_PER_MI = 1609.344;
  const SURFACE_SUGGESTIONS = ["trail", "track", "pavement", "dirt", "grass", "treadmill"];
  const TYPE_SUGGESTIONS = ["easy run", "tempo", "intervals", "long run", "recovery", "race", "hill repeats", "fartlek"];

  /* -------- Units -------- */
  function applyUnit(u) {
    unit = u;
    renderUnitToggle();
    localStorage.setItem("fit-run-unit", u);
  }
  function renderUnitToggle() {
    $("unit-label").textContent = unit === "metric" ? "km" : "mi";
  }
  function distLabel() { return unit === "metric" ? "km" : "mi"; }
  function elevLabel() { return unit === "metric" ? "m" : "ft"; }
  function mToNum(m) { return m / (unit === "metric" ? 1000 : M_PER_MI); }
  function numToM(v) { return v * (unit === "metric" ? 1000 : M_PER_MI); }
  function eleMToNum(m) { return unit === "metric" ? m : m * 3.28084; }
  function numToEleM(v) { return unit === "metric" ? v : v / 3.28084; }
  function fmtDist(m, dec) {
    const n = mToNum(m);
    const d = (dec != null) ? dec : (n < 10 ? 2 : 1);
    return n.toFixed(d);
  }
  function fmtPace(secPerM) {
    const perUnit = secPerM * (unit === "metric" ? 1000 : M_PER_MI);
    return formatSecAsPace(perUnit);
  }
  function formatSecAsPace(sec) {
    if (!isFinite(sec) || sec <= 0) return "—";
    const m = Math.floor(sec / 60);
    const s = Math.round(sec - m * 60);
    return m + ":" + String(s).padStart(2, "0");
  }
  function fmtHours(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    if (h > 0) return h + "h " + m + "m";
    return m + "m";
  }

  /* -------- Data helpers -------- */
  function newEntryId() {
    let n = 1;
    while (D.entries.some(e => e.id === n)) n++;
    return n;
  }
  function searchTerm(name) { return (name || "").toLowerCase().replace(/\s+/g, ""); }
  function findMatchingRun(name) {
    const q = searchTerm(name);
    for (const id in D.runs) {
      if (searchTerm(D.runs[id].name) === q) return D.runs[id];
    }
    return null;
  }
  function findMatchingShoe(name) {
    const q = searchTerm(name);
    for (const id in D.shoes) {
      if (searchTerm(D.shoes[id].name) === q) return D.shoes[id];
    }
    return null;
  }
  function shoeById(id) { return D.shoes[id] || null; }
  function shoeIdForName(name) {
    const s = findMatchingShoe(name);
    if (s) return Object.keys(D.shoes).find(k => D.shoes[k] === s);
    const id = nextId("s", D.shoes);
    D.shoes[id] = { name: (name || "").trim(), brand: "" };
    return id;
  }

  /* -------- Datalists -------- */
  function renderSuggestionLists() {
    const locs = [], surfs = [], types = [], notes = [], brands = [];
    for (const id in D.runs) {
      const r = D.runs[id];
      if (r.location) locs.push(r.location);
      if (r.surface) surfs.push(r.surface);
      if (r.workoutType) types.push(r.workoutType);
    }
    for (const e of D.entries) {
      if (e.notes) notes.push(e.notes);
    }
    for (const id in D.shoes) {
      if (D.shoes[id].brand) brands.push(D.shoes[id].brand);
    }
    fillList("rn-location-list", uniqueValues(locs));
    fillList("rn-surface-list", uniqueValues([...SURFACE_SUGGESTIONS, ...surfs]));
    fillList("rn-type-list", uniqueValues([...TYPE_SUGGESTIONS, ...types]));
    fillList("rn-notes-list", uniqueValues(notes));
    fillList("rn-brand-list", uniqueValues(brands));
    fillList("rn-shoes-list", uniqueValues(Object.values(D.shoes).map(s => s.name)));
    syncEditDatalists();
  }

  function syncEditDatalists() {
    const locs = [], surfs = [], types = [], shoes = [];
    for (const id in D.runs) {
      const r = D.runs[id];
      if (r.location) locs.push(r.location);
      if (r.surface) surfs.push(r.surface);
      if (r.workoutType) types.push(r.workoutType);
    }
    for (const id in D.shoes) shoes.push(D.shoes[id].name);
    fillList("rn-location-list-edit", uniqueValues(locs));
    fillList("rn-surface-list-edit", uniqueValues([...SURFACE_SUGGESTIONS, ...surfs]));
    fillList("rn-type-list-edit", uniqueValues([...TYPE_SUGGESTIONS, ...types]));
    fillList("rn-shoes-list-edit", uniqueValues(shoes));
  }

  function renderRunList() {
    const dl = $("run-list");
    dl.innerHTML = Object.values(D.runs)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(r => `<option value="${esc(r.name)}"></option>`)
      .join("");

    const pick = $("pick-run");
    const current = pick.value;
    pick.innerHTML = '<option value="">— select a run —</option>' +
      Object.entries(D.runs)
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([id, r]) => `<option value="${esc(id)}" ${id === current ? "selected" : ""}>${esc(r.name)}</option>`)
        .join("");
  }

  /* -------- Home -------- */
  function entryPace(e) {
    if (e.distanceM > 0 && e.durationS > 0) return e.durationS / e.distanceM;
    return null;
  }
  function formulaPace() {
    let totalM = 0, totalS = 0;
    for (const e of D.entries) { totalM += e.distanceM || 0; totalS += e.durationS || 0; }
    return totalM > 0 ? { m: totalM, s: totalS, pace: totalS / totalM } : null;
  }

  function renderHome() {
    $("total-runs").textContent = D.entries.length;
    let totalM = 0, totalS = 0, totalElev = 0;
    for (const e of D.entries) { totalM += e.distanceM || 0; totalS += e.durationS || 0; totalElev += e.elevGainM || 0; }
    $("stat-distance").textContent = fmtDist(totalM, 2) + " " + distLabel();
    $("stat-elev").textContent = Math.round(eleMToNum(totalElev)) + " " + elevLabel();
    $("stat-time").textContent = fmtHours(totalS);
    const ap = formulaPace();
    $("stat-avgpace").textContent = ap ? fmtPace(ap.pace) + " /" + distLabel() : "—";

    const box = $("recent-runs");
    if (D.entries.length === 0) {
      box.innerHTML = '<p class="no-data" style="padding:10px 0;">No runs yet.</p>';
    } else {
      const last = D.entries.slice().sort((a, b) => (b.datetime || "").localeCompare(a.datetime || "")).slice(0, 10);
      box.innerHTML = runsTable(last);
    }
  }

  function runsTable(entries) {
    return `<table>
      <thead><tr><th>Date</th><th>Name</th><th class="num">Dist</th><th class="num">Time</th><th class="num">Pace</th><th class="num">Elev</th><th>Surface</th><th>Shoes</th><th>Type</th><th class="num">Effort</th><th>Notes</th><th></th></tr></thead>
      <tbody>
        ${entries.map(e => runsRow(e)).join("")}
      </tbody>
    </table>`;
  }

  function runsRow(e) {
    const r = D.runs[e.runId];
    const pace = entryPace(e);
    return `<tr>
      <td>${fmtDate(e.datetime)}${e.datetime && e.datetime.length > 10 ? "<span class='mutednote'> " + esc(e.datetime.slice(11, 16)) + "</span>" : ""}</td>
      <td>${esc(r ? r.name : "—")}</td>
      <td class="num">${fmtDist(e.distanceM || 0, 2)} ${distLabel()}</td>
      <td class="num">${fmtHours(e.durationS || 0)}</td>
      <td class="num">${pace ? fmtPace(pace) + " /" + distLabel() : "—"}</td>
      <td class="num">${e.elevGainM ? "+" + Math.round(eleMToNum(e.elevGainM)) : "—"} ${e.elevGainM ? elevLabel() : ""}</td>
      <td>${esc(r ? (r.surface || "") : "")}</td>
      <td>${shoeById(r ? r.shoesId : "") ? esc(shoeById(r.shoesId).name) : ""}</td>
      <td>${esc(r ? (r.workoutType || "") : "")}</td>
      <td class="num">${e.effort ?? "—"}</td>
      <td>${esc(e.notes || "")}</td>
      <td><div class="row-actions">
        <button class="btn small" onclick="rn_editEntry(${e.id})">Edit</button>
        <button class="btn small danger" onclick="rn_delEntry(${e.id})">Del</button>
      </div></td>
    </tr>`;
  }

  window.rn_delEntry = function (id) {
    if (!confirm("Delete this run?")) return;
    D.entries = D.entries.filter(e => e.id !== id);
    refreshAll();
  };

  window.rn_editEntry = function (id) {
    const entry = D.entries.find(e => e.id === id);
    if (!entry) return;

    const runSelect = $("ee-run");
    runSelect.innerHTML = Object.entries(D.runs)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([rid, r]) => `<option value="${rid}"${rid === entry.runId ? " selected" : ""}>${esc(r.name)}</option>`)
      .join("");

    $("ee-datetime").value = entry.datetime || "";
    $("ee-distance").value = entry.distanceM ? mToNum(entry.distanceM).toFixed(2) : "";
    const dur = entry.durationS || 0;
    $("ee-dur-h").value = dur ? Math.floor(dur / 3600) : "";
    $("ee-dur-m").value = dur ? Math.floor((dur % 3600) / 60) : "";
    $("ee-dur-s").value = dur ? Math.round(dur % 60) : "";
    $("ee-elev").value = entry.elevGainM ? eleMToNum(entry.elevGainM).toFixed(0) : "";
    $("ee-effort").value = entry.effort ?? "";
    $("ee-notes").value = entry.notes || "";

    $("edit-entry-modal")._entryId = id;
    $("edit-entry-modal").classList.remove("hidden");
  };

  /* -------- Add form -------- */
  function addRunFromForm() {
    const name = $("add-name").value.trim();
    if (!name) return;
    const distNum = parseFloat($("add-distance").value);
    const distanceM = distNum > 0 ? numToM(distNum) : 0;
    const dh = parseInt($("add-dur-h").value || "0", 10);
    const dm = parseInt($("add-dur-m").value || "0", 10);
    const ds = parseInt($("add-dur-s").value || "0", 10);
    const durationS = (isFinite(dh) && dh >= 0 ? dh * 3600 : 0) + (isFinite(dm) && dm >= 0 ? dm * 60 : 0) + (isFinite(ds) && ds >= 0 ? ds : 0);
    const elevNum = parseFloat($("add-elev").value);
    const elevGainM = elevNum > 0 ? numToEleM(elevNum) : 0;
    const datetime = $("add-datetime").value || new Date().toISOString().slice(0, 16);
    const location = $("add-location").value.trim();
    const surface = $("add-surface").value.trim().toLowerCase();
    const shoeName = $("add-shoes").value.trim();
    const workoutType = $("add-type").value.trim();
    const effort = clamp10($("add-effort").value);
    const notes = $("add-notes").value.trim();

    let shoesId = "";
    if (shoeName) shoesId = shoeIdForName(shoeName);

    const match = findMatchingRun(name);
    let runId;
    if (match) {
      runId = Object.keys(D.runs).find(k => D.runs[k] === match);
      match.location = location;
      match.surface = surface;
      match.distanceM = distanceM || match.distanceM;
      match.durationS = durationS || match.durationS;
      match.elevGainM = elevGainM || match.elevGainM;
      match.shoesId = shoesId || match.shoesId;
      match.workoutType = workoutType || match.workoutType;
    } else {
      runId = nextId("r", D.runs);
      D.runs[runId] = { name, distanceM, durationS, location, surface, shoesId, elevGainM, elevLossM: 0, workoutType };
    }

    D.entries.push({
      id: newEntryId(),
      datetime: datetime,
      runId: runId,
      distanceM: distanceM,
      durationS: durationS,
      elevGainM: elevGainM,
      effort: effort,
      notes: notes
    });

    ["add-name", "add-distance", "add-dur-h", "add-dur-m", "add-dur-s", "add-elev", "add-datetime", "add-location", "add-surface", "add-shoes", "add-type", "add-notes"].forEach(id => $(id).value = "");
    refreshAll();
  }

  /* -------- Trends / charts -------- */
  function dataDateBounds() {
    let min = null, max = null;
    for (const e of D.entries) {
      const d = (e.datetime || "").slice(0, 10);
      if (!d) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    return { min: min || todayISO(), max: max || todayISO() };
  }

  function rangeBounds(range) {
    const tISO = todayISO();
    if (range === "week") {
      return { from: mondayOf(tISO), to: tISO };
    } else if (range === "7d") {
      const d = new Date(); d.setDate(d.getDate() - 6);
      return { from: toISO(d), to: tISO };
    } else if (range === "30d") {
      const d = new Date(); d.setDate(d.getDate() - 29);
      return { from: toISO(d), to: tISO };
    } else if (range === "year") {
      return { from: tISO.slice(0, 4) + "-01-01", to: tISO };
    } else {
      const b = dataDateBounds();
      return { from: b.min, to: b.max };
    }
  }

  function weekKey(iso) {
    const d = parseDate(iso);
    const back = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - back);
    return toISO(d);
  }

  function bucketByTime(range, data, key) {
    const bounds = rangeBounds(range);
    const map = {};
    const push = (k, c) => { (map[k] = map[k] || []).push(c); };
    for (const e of data) {
      const d = (e.datetime || "").slice(0, 10);
      if (!d) continue;
      if (d < bounds.from || d > bounds.to) continue;
      let k;
      if (key === "week") k = weekKey(d);
      else if (key === "month") k = d.slice(0, 7);
      else k = d;
      push(k, e);
    }
    return map;
  }

  function renderCharts() {
    renderMileageOverTime();
    renderShoeChart();
    renderCategoryChart("type", e => D.runs[e.runId] ? D.runs[e.runId].workoutType || "—" : "—");
    renderCategoryChart("surf", e => D.runs[e.runId] ? D.runs[e.runId].surface || "—" : "—");
    renderCategoryChart("effort", e => e.effort != null ? String(e.effort) : "—");
  }

  function renderMileageOverTime() {
    const map = bucketByTime(mileRange, D.entries, mileGran);
    const pairs = [];
    for (const k in map) {
      const tot = map[k].reduce((s, e) => s + (e.distanceM || 0), 0);
      pairs.push([k, mToNum(tot)]);
    }
    pairs.sort((a, b) => a[0].localeCompare(b[0]));
    const unitL = distLabel();
    const labelFn = mileGran === "week" ? (k => "w/o " + k.slice(5)) : (mileGran === "month" ? (k => MONTH_NAMES[parseInt(k.slice(5, 7), 10) - 1]) : (k => k.slice(5)));
    resetPalette();
    renderBarChart("rn-mile-chart", "rn-mile-summary", pairs,
      v => v.toFixed(2) + " " + unitL, labelFn,
      `${RANGE_LABEL[mileRange]} · ${GRAN_LABEL[mileGran]}: ${pairs.reduce((s, p) => s + p[1], 0).toFixed(2)} ${unitL}`,
      (k, i) => PALETTE[i % PALETTE.length]);
    syncRangeTabs("rn-mile-range", mileRange);
    syncRangeTabs("rn-mile-gran", mileGran);
  }

  function renderShoeChart() {
    const source = bucketByTime(shoeRange, D.entries, shoeGran);
    const buckets = {};
    const shoeTotals = {};
    let totalNum = 0;
    for (const k in source) {
      for (const e of source[k]) {
        const r = D.runs[e.runId];
        let shoeName = "(no shoes)";
        if (r && r.shoesId && D.shoes[r.shoesId]) {
          shoeName = D.shoes[r.shoesId].name;
        } else if (r && r.shoesId) {
          shoeName = "(unknown shoe)";
        }
        const v = mToNum(e.distanceM || 0);
        totalNum += v;
        buckets[k] = buckets[k] || {};
        buckets[k][shoeName] = (buckets[k][shoeName] || 0) + v;
        shoeTotals[shoeName] = (shoeTotals[shoeName] || 0) + v;
      }
    }
    const shoeOrder = Object.keys(shoeTotals).sort((a, b) => shoeTotals[b] - shoeTotals[a]);
    const unitL = distLabel();
    const labelFn = shoeGran === "week" ? (k => "w/o " + k.slice(5)) : (shoeGran === "month" ? (k => MONTH_NAMES[parseInt(k.slice(5, 7), 10) - 1]) : (k => k.slice(5)));
    resetPalette();
    renderStackedChart("rn-shoe-chart", "rn-shoe-chart-summary", buckets, shoeOrder, labelFn,
      v => v.toFixed(2) + " " + unitL,
      `${RANGE_LABEL[shoeRange]} · ${GRAN_LABEL[shoeGran]}: ${shoeOrder.length} pair${shoeOrder.length === 1 ? "" : "s"} · ${totalNum.toFixed(2)} ${unitL}`);
    syncRangeTabs("rn-shoe-chart-range", shoeRange);
    syncRangeTabs("rn-shoe-chart-gran", shoeGran);
  }

  function renderCategoryChart(which, valFn) {
    const ids = {
      type: ["rn-type-range", "rn-type-gran", "rn-type-summary", "rn-type-chart", typeRange, typeGran],
      surf: ["rn-surf-range", "rn-surf-gran", "rn-surf-summary", "rn-surf-chart", surfRange, surfGran],
      effort: ["rn-effort-range", "rn-effort-gran", "rn-effort-summary", "rn-effort-chart", effortRange, effortGran]
    };
    const [rangeId, granId, sumId, boxId, range, gran] = ids[which];
    const source = bucketByTime(range, D.entries, gran);
    const buckets = {};
    const catTotals = {};
    let n = 0;
    for (const k in source) {
      for (const e of source[k]) {
        const v = valFn(e);
        n++;
        buckets[k] = buckets[k] || {};
        buckets[k][v] = (buckets[k][v] || 0) + 1;
        catTotals[v] = (catTotals[v] || 0) + 1;
      }
    }
    const catOrder = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
    const label = which === "effort" ? "effort" : which;
    const labelFn = gran === "week" ? (k => "w/o " + k.slice(5)) : (gran === "month" ? (k => MONTH_NAMES[parseInt(k.slice(5, 7), 10) - 1]) : (k => k.slice(5)));
    resetPalette();
    renderStackedChart(boxId, sumId, buckets, catOrder, labelFn,
      (v) => v + " run" + (v === 1 ? "" : "s"),
      `${RANGE_LABEL[range]} · ${GRAN_LABEL[gran]}: ${n} run${n === 1 ? "" : "s"} across ${catOrder.length} ${label} value${catOrder.length === 1 ? "" : "s"}`);
    syncRangeTabs(rangeId, range);
    syncRangeTabs(granId, gran);
  }

  /* -------- History -------- */
  function resetHistoryRange() {
    const { min, max } = dataDateBounds();
    histFrom = min;
    histTo = max;
    $("hist-from").value = min;
    $("hist-to").value = max;
  }

  function renderHistory() {
    const container = $("history-list");
    const filtered = D.entries.filter(e => {
      const d = (e.datetime || "").slice(0, 10);
      return (!histFrom || d >= histFrom) && (!histTo || d <= histTo);
    }).sort((a, b) => (b.datetime || "").localeCompare(a.datetime || ""));

    const dates = [...new Set(filtered.map(e => (e.datetime || "").slice(0, 10)))]
      .filter(Boolean).sort().reverse();

    const sum = $("hist-summary");
    if (histFrom && histTo && filtered.length > 0) {
      const totM = filtered.reduce((s, e) => s + (e.distanceM || 0), 0);
      const totS = filtered.reduce((s, e) => s + (e.durationS || 0), 0);
      sum.textContent = `${fmtDate(histFrom)} → ${fmtDate(histTo)} · ${filtered.length} run${filtered.length === 1 ? "" : "s"} · ${fmtDist(totM, 1)} ${distLabel()} · ${fmtHours(totS)}`;
    } else {
      sum.textContent = "";
    }

    if (dates.length === 0) {
      container.innerHTML = '<p class="no-data">No runs in this date range.</p>';
      return;
    }
    let html = "";
    for (const date of dates) {
      const entries = filtered.filter(e => (e.datetime || "").slice(0, 10) === date);
      const open = selectedDate === date;
      html += `<div class="day-group">
        <div class="day-head" onclick="rn_toggleDay('${date}')">
          <span class="day-date">${fmtDate(date)}</span>
          <span class="day-total">${entries.length} run${entries.length === 1 ? "" : "s"}</span>
        </div>
        <div class="day-actions">
          <button class="btn small" onclick="event.stopPropagation();rn_addEntryTo('${date}')">+ Add run</button>
        </div>
        <div class="day-entries${open ? "" : " hidden"}">
          ${runsTable(entries)}
        </div>
      </div>`;
    }
    container.innerHTML = html;
  }

  window.rn_toggleDay = function (date) {
    selectedDate = selectedDate === date ? null : date;
    renderHistory();
  };

  window.rn_addEntryTo = function (date) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    $("add-datetime").value = date + "T" + hh + ":" + mm;
    root.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    root.querySelector('.tab[data-view="home"]').classList.add("active");
    root.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    $("view-home").classList.remove("hidden");
    $("add-name").focus();
    selectedDate = date;
  };

  /* -------- Runs registry -------- */
  function formulaPaceFor(entries) {
    let tm = 0, ts = 0;
    for (const e of entries) { tm += e.distanceM || 0; ts += e.durationS || 0; }
    return tm > 0 ? ts / tm : null;
  }

  function renderRunsList() {
    const ids = Object.keys(D.runs).sort((a, b) => D.runs[a].name.localeCompare(D.runs[b].name));
    const box = $("runs-table");
    if (ids.length === 0) {
      box.innerHTML = '<p class="no-data">No runs yet. Add them from the Home tab.</p>';
      return;
    }
    const byRun = {};
    for (const e of D.entries) (byRun[e.runId] = byRun[e.runId] || []).push(e);
    const html = `<table>
      <thead><tr><th>Run</th><th>Distance</th><th class="num">Pace</th><th>Location</th><th>Surface</th><th>Shoes</th><th>Type</th><th class="num">Done</th><th></th></tr></thead>
      <tbody>
        ${ids.map(id => {
          const r = D.runs[id];
          const entries = (byRun[id] || []).slice().sort((a, b) => (b.datetime || "").localeCompare(a.datetime || ""));
          const open = expandedRuns.has(id);
          const pace = entries.length ? formulaPaceFor(entries) : null;
          return `<tr class="reg-row${open ? " open" : ""}">
            <td><span class="reg-toggle" onclick="rn_toggleRun('${id}')"><span class="chev">${open ? "▾" : "▸"}</span> ${esc(r.name)}</span></td>
            <td>${r.distanceM ? fmtDist(r.distanceM, 1) + " " + distLabel() : "—"}</td>
            <td class="num">${pace ? fmtPace(pace) : "—"}</td>
            <td>${esc(r.location || "")}</td>
            <td>${esc(r.surface || "")}</td>
            <td>${shoeById(r.shoesId) ? esc(shoeById(r.shoesId).name) : ""}</td>
            <td>${esc(r.workoutType || "")}</td>
            <td class="num">${entries.length}</td>
            <td><div class="row-actions">
              <button class="btn small" onclick="rn_editRun('${id}')">Edit</button>
              <button class="btn small danger" onclick="rn_delRun('${id}')">Delete</button>
            </div></td>
          </tr>
          ${open ? `<tr class="reg-detail"><td colspan="9">
            ${entries.length === 0
              ? '<div class="mutednote">No runs logged for this run yet.</div>'
              : `<div class="reg-notes">${entries.map(e => {
                  const pace = entryPace(e);
                  const p = `${fmtDate(e.datetime)}<span class="reg-note-meta">${e.elevGainM ? " +" + Math.round(eleMToNum(e.elevGainM)) + " " + elevLabel() : ""}${pace ? " · " + fmtPace(pace) + " /" + distLabel() : ""} · effort ${esc(String(e.effort ?? "—"))}</span>`;
                  return `<div class="reg-note"><span class="reg-note-date">${p}</span>${e.notes ? `<span class="reg-note-text">“${esc(e.notes)}”</span>` : ""}</div>`;
                }).join("")}</div>`}
          </td></tr>` : ""}`;
        }).join("")}
      </tbody>
    </table>`;
    box.innerHTML = html;
  }

  window.rn_toggleRun = function (id) {
    if (expandedRuns.has(id)) expandedRuns.delete(id);
    else expandedRuns.add(id);
    renderRunsList();
  };

  window.rn_editRun = function (id) {
    const r = D.runs[id];
    if (!r) return;

    $("er-name").value = r.name;
    $("er-location").value = r.location || "";
    $("er-surface").value = r.surface || "";
    $("er-type").value = r.workoutType || "";
    $("er-distance").value = r.distanceM ? mToNum(r.distanceM).toFixed(2) : "";
    const dur = r.durationS || 0;
    $("er-dur-h").value = dur ? Math.floor(dur / 3600) : "";
    $("er-dur-m").value = dur ? Math.floor((dur % 3600) / 60) : "";
    $("er-dur-s").value = dur ? Math.round(dur % 60) : "";
    $("er-elev").value = r.elevGainM ? eleMToNum(r.elevGainM).toFixed(0) : "";
    $("er-shoes").value = (shoeById(r.shoesId) ? shoeById(r.shoesId).name : "") || "";

    $("edit-run-modal")._runId = id;
    $("edit-run-modal").classList.remove("hidden");
  };

  window.rn_delRun = function (id) {
    const used = D.entries.some(e => e.runId === id);
    const msg = used ? "Delete this run AND its logged entries?" : "Delete this run?";
    if (!confirm(msg)) return;
    D.entries = D.entries.filter(e => e.runId !== id);
    delete D.runs[id];
    refreshAll();
  };

  /* -------- Shoes -------- */
  function shoeTotalM(id) {
    let tot = 0;
    for (const e of D.entries) {
      const r = D.runs[e.runId];
      if (r && r.shoesId === id) tot += e.distanceM || 0;
    }
    return tot;
  }

  function renderShoesList() {
    const box = $("shoes-table");
    const ids = Object.keys(D.shoes).sort((a, b) => D.shoes[a].name.localeCompare(D.shoes[b].name));
    if (ids.length === 0) {
      box.innerHTML = '<p class="no-data">No shoes yet. Add them above.</p>';
      return;
    }
    const html = `<table>
      <thead><tr><th>Shoes</th><th>Brand</th><th class="num">Mileage</th><th class="num">Runs</th><th></th></tr></thead>
      <tbody>
        ${ids.map(id => {
          const s = D.shoes[id];
          const totM = shoeTotalM(id);
          const runs = D.entries.filter(e => { const r = D.runs[e.runId]; return r && r.shoesId === id; });
          const open = expandedShoes.has(id);
          return `<tr class="reg-row${open ? " open" : ""}">
            <td><span class="reg-toggle" onclick="rn_toggleShoe('${id}')"><span class="chev">${open ? "▾" : "▸"}</span> ${esc(s.name)}</span></td>
            <td>${esc(s.brand || "")}</td>
            <td class="num">${fmtDist(totM, 1)} ${distLabel()}</td>
            <td class="num">${runs.length}</td>
            <td><div class="row-actions">
              <button class="btn small" onclick="rn_editShoe('${id}')">Edit</button>
              <button class="btn small danger" onclick="rn_delShoe('${id}')">Delete</button>
            </div></td>
          </tr>
          ${open ? `<tr class="reg-detail"><td colspan="5">
            ${runs.length === 0
              ? `<div class="mutednote">No runs logged in these shoes yet.</div>`
              : `<div class="reg-notes">${runs.slice().sort((a, b) => (b.datetime || "").localeCompare(a.datetime || "")).map(e => {
                  const r = D.runs[e.runId];
                  const pace = entryPace(e);
                  return `<div class="reg-note">
                    <span class="reg-note-date">${fmtDate(e.datetime)}</span>
                    <span class="reg-note-meta">${fmtDist(e.distanceM || 0, 1)} ${distLabel()}${pace ? " · " + fmtPace(pace) + " /" + distLabel() : ""} · ${esc(r ? r.name : "—")}</span>
                  </div>`;
                }).join("")}</div>`}
          </td></tr>` : ""}`;
        }).join("")}
      </tbody>
    </table>`;
    box.innerHTML = html;
  }

  window.rn_toggleShoe = function (id) {
    if (expandedShoes.has(id)) expandedShoes.delete(id);
    else expandedShoes.add(id);
    renderShoesList();
  };

  window.rn_editShoe = function (id) {
    const s = D.shoes[id];
    if (!s) return;
    const name = prompt("Shoe name:", s.name);
    if (name === null) return;
    const brand = prompt("Brand:", s.brand || "");
    if (brand === null) return;
    s.name = name;
    s.brand = brand;
    refreshAll();
  };

  window.rn_delShoe = function (id) {
    const used = D.entries.some(e => { const r = D.runs[e.runId]; return r && r.shoesId === id; });
    if (!confirm(used ? "Shoes are attached to runs. Delete anyway? (runs keep miles but lose the shoe link)" : "Delete these shoes?")) return;
    for (const rid in D.runs) { if (D.runs[rid].shoesId === id) D.runs[rid].shoesId = ""; }
    delete D.shoes[id];
    refreshAll();
  };

  /* -------- Modals -------- */
  function closeModals() {
    $("edit-entry-modal").classList.add("hidden");
    $("edit-run-modal").classList.add("hidden");
  }

  /* -------- Sample data -------- */
  function buildSample() {
    const db = { shoes: {}, runs: {}, entries: [] };
    db.shoes = {
      s1: { name: "Pegasus 39", brand: "Nike" },
      s2: { name: "Saucony Endorphin", brand: "Saucony" },
      s3: { name: "Trail Stinson", brand: "Salomon" }
    };
    db.runs = {
      r1: { name: "Lake Loop", distanceM: 5000, durationS: 1530, location: "City Park", surface: "trail", shoesId: "s1", elevGainM: 35, elevLossM: 35, workoutType: "easy run" },
      r2: { name: "Track intervals", distanceM: 6400, durationS: 2100, location: "High School Track", surface: "track", shoesId: "s2", elevGainM: 0, elevLossM: 0, workoutType: "intervals" },
      r3: { name: "Tempo Thursday", distanceM: 8000, durationS: 2400, location: "Riverfront", surface: "pavement", shoesId: "s1", elevGainM: 15, elevLossM: 15, workoutType: "tempo" },
      r4: { name: "Mountain 10k", distanceM: 10000, durationS: 3600, location: "Blue Ridge", surface: "trail", shoesId: "s3", elevGainM: 320, elevLossM: 320, workoutType: "long run" },
      r5: { name: "Easy lunch run", distanceM: 4000, durationS: 1500, location: "Riverfront", surface: "pavement", shoesId: "s2", elevGainM: 5, elevLossM: 5, workoutType: "recovery" }
    };
    let id = 0;
    const runIds = Object.keys(db.runs);
    let seed = 11;
    function rnd() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    for (let ago = 180; ago >= 1; ago--) {
      const d = new Date();
      d.setDate(d.getDate() - ago);
      const dow = d.getDay();
      if (dow === 2 || dow === 4 || dow === 6) {
        const runId = pick(runIds);
        const run = db.runs[runId];
        const dt = toISO(d) + "T" + String(6 + Math.floor(rnd() * 3)).padStart(2, "0") + ":" + String(Math.floor(rnd() * 60)).padStart(2, "0");
        const mult = 0.9 + rnd() * 0.2;
        db.entries.push({
          id: ++id, datetime: dt, runId: runId,
          distanceM: Math.round(run.distanceM * mult),
          durationS: Math.round(run.durationS * (0.95 + rnd() * 0.25)),
          elevGainM: run.elevGainM, effort: 4 + Math.floor(rnd() * 5),
          notes: rnd() < 0.4 ? pick(["felt strong", "easy", "a bit tired", "good form"]) : ""
        });
      }
    }
    return db;
  }

  /* -------- registerTool contract -------- */
  window.runTool = {
    id: "run",
    label: "Run",
    emoji: "🏃",
    rootId: "tool-run",
    empty() { return { shoes: {}, runs: {}, entries: [] }; },
    normalize(raw) {
      if (typeof raw !== "object" || raw === null) throw new Error("run data not a JSON object");
      const db = { shoes: {}, runs: {}, entries: [] };
      if (!raw.runs || typeof raw.runs !== "object") throw new Error("run data missing 'runs' object");
      for (const id in raw.runs) {
        const r = raw.runs[id];
        db.runs[id] = {
          name: String(r.name ?? "unnamed"),
          distanceM: Number(r.distanceM || 0),
          durationS: Number(r.durationS || 0),
          location: String(r.location ?? ""),
          surface: String(r.surface ?? ""),
          shoesId: String(r.shoesId ?? ""),
          elevGainM: Number(r.elevGainM || 0),
          elevLossM: Number(r.elevLossM || 0),
          workoutType: String(r.workoutType ?? "")
        };
      }
      const shoesRaw = (raw.shoes && typeof raw.shoes === "object") ? raw.shoes : {};
      for (const id in shoesRaw) {
        db.shoes[id] = {
          name: String(shoesRaw[id].name ?? ""),
          brand: String(shoesRaw[id].brand ?? "")
        };
      }
      let entriesRaw = raw.entries;
      if (!Array.isArray(entriesRaw)) entriesRaw = [];
      let maxId = 0;
      for (const e of entriesRaw) { const pid = parseInt(e.id, 10); if (pid > maxId) maxId = pid; }
      for (const e of entriesRaw) {
        const pid = parseInt(e.id, 10) || (++maxId);
        db.entries.push({
          id: pid,
          datetime: String(e.datetime || ""),
          runId: String(e.runId || ""),
          distanceM: Number(e.distanceM || 0),
          durationS: Number(e.durationS || 0),
          elevGainM: Number(e.elevGainM || 0),
          elevLossM: Number(e.elevLossM || 0),
          effort: e.effort == null ? null : Number(e.effort),
          notes: String(e.notes ?? "")
        });
      }
      db.entries.sort((a, b) => (b.datetime || "").localeCompare(a.datetime || ""));
      return db;
    },
    sample() { return buildSample(); },
    setup() {
      const stored = localStorage.getItem("fit-run-unit");
      unit = stored === "imperial" ? "imperial" : "metric";
      renderUnitToggle();

      initToolTabs(root, "rn-");

      $("add-form").addEventListener("submit", e => { e.preventDefault(); addRunFromForm(); });

      $("pick-run").addEventListener("change", e => {
        const id = e.target.value;
        if (!id) return;
        const r = D.runs[id];
        if (!r) return;
        $("add-name").value = r.name;
        $("add-distance").value = r.distanceM ? mToNum(r.distanceM).toFixed(2) : "";
        const dS = r.durationS || 0;
        $("add-dur-h").value = dS ? Math.floor(dS / 3600) : "";
        $("add-dur-m").value = dS ? Math.floor((dS % 3600) / 60) : "";
        $("add-dur-s").value = dS ? Math.round(dS % 60) : "";
        $("add-elev").value = r.elevGainM != null ? eleMToNum(r.elevGainM).toFixed(0) : "";
        $("add-location").value = r.location || "";
        $("add-surface").value = r.surface || "";
        $("add-shoes").value = (shoeById(r.shoesId) ? shoeById(r.shoesId).name : "") || "";
        $("add-type").value = r.workoutType || "";
        $("add-name").focus();
        e.target.value = "";
      });

      $("ee-save").addEventListener("click", () => {
        const entry = D.entries.find(e => e.id === $("edit-entry-modal")._entryId);
        if (!entry) { closeModals(); return; }
        entry.runId = $("ee-run").value;
        entry.datetime = $("ee-datetime").value || entry.datetime;
        const d = parseFloat($("ee-distance").value);
        entry.distanceM = d > 0 ? numToM(d) : 0;
        const eh = parseInt($("ee-dur-h").value || "0", 10);
        const em = parseInt($("ee-dur-m").value || "0", 10);
        const es = parseInt($("ee-dur-s").value || "0", 10);
        entry.durationS = (isFinite(eh) && eh >= 0 ? eh * 3600 : 0) + (isFinite(em) && em >= 0 ? em * 60 : 0) + (isFinite(es) && es >= 0 ? es : 0);
        const el = parseFloat($("ee-elev").value);
        entry.elevGainM = el > 0 ? numToEleM(el) : 0;
        entry.effort = clamp10($("ee-effort").value);
        entry.notes = $("ee-notes").value.trim();
        closeModals();
        refreshAll();
      });
      $("ee-cancel").addEventListener("click", closeModals);
      $("er-cancel").addEventListener("click", closeModals);
      root.querySelectorAll(".modal-backdrop").forEach(bd => {
        bd.addEventListener("click", e => { if (e.target === bd) closeModals(); });
      });

      $("er-save").addEventListener("click", () => {
        const r = D.runs[$("edit-run-modal")._runId];
        if (!r) { closeModals(); return; }
        const name = $("er-name").value.trim();
        if (!name) return;
        r.name = name;
        r.location = $("er-location").value.trim();
        r.surface = $("er-surface").value.trim().toLowerCase();
        r.workoutType = $("er-type").value.trim();
        const d = parseFloat($("er-distance").value);
        const newDistM = d > 0 ? numToM(d) : 0;
        const ehr = parseInt($("er-dur-h").value || "0", 10);
        const emr = parseInt($("er-dur-m").value || "0", 10);
        const esr = parseInt($("er-dur-s").value || "0", 10);
        const newDurS = (isFinite(ehr) && ehr >= 0 ? ehr * 3600 : 0) + (isFinite(emr) && emr >= 0 ? emr * 60 : 0) + (isFinite(esr) && esr >= 0 ? esr : 0);
        const el = parseFloat($("er-elev").value);
        const newElevM = el > 0 ? numToEleM(el) : 0;
        const shoeName = $("er-shoes").value.trim();
        let newShoesId = r.shoesId;
        if (shoeName) newShoesId = shoeIdForName(shoeName);
        else newShoesId = "";

        const runId = $("edit-run-modal")._runId;
        const distChanged = newDistM !== r.distanceM;
        const durChanged = newDurS !== r.durationS;
        const elevChanged = newElevM !== r.elevGainM;
        const shoeChanged = newShoesId !== r.shoesId;

        r.distanceM = newDistM;
        r.durationS = newDurS;
        r.elevGainM = newElevM;
        r.shoesId = newShoesId;

        if (distChanged || durChanged || elevChanged || shoeChanged) {
          for (const e of D.entries) {
            if (e.runId === runId) {
              if (distChanged) e.distanceM = newDistM;
              if (durChanged) e.durationS = newDurS;
              if (elevChanged) e.elevGainM = newElevM;
            }
          }
        }
        closeModals();
        refreshAll();
      });

      $("hist-apply").addEventListener("click", () => {
        histFrom = $("hist-from").value || null;
        histTo = $("hist-to").value || null;
        renderHistory();
      });

      const histCtx = {
        bounds: dataDateBounds,
        set(from, to) {
          histFrom = from; histTo = to;
          $("hist-from").value = from;
          $("hist-to").value = to;
        },
        render: renderHistory
      };
      root.querySelectorAll(".hist-preset").forEach(btn =>
        btn.addEventListener("click", () => applyHistoryPreset(btn.dataset.preset, histCtx)));

      setupRangeButtons("rn-mile-range", RANGES, RANGE_LABEL, () => mileRange, v => { mileRange = v; }, renderCharts, "Range");
      setupRangeButtons("rn-mile-gran", GRANS, GRAN_LABEL, () => mileGran, v => { mileGran = v; }, renderCharts, "Split by");
      setupRangeButtons("rn-shoe-chart-range", RANGES, RANGE_LABEL, () => shoeRange, v => { shoeRange = v; }, renderCharts, "Range");
      setupRangeButtons("rn-shoe-chart-gran", GRANS, GRAN_LABEL, () => shoeGran, v => { shoeGran = v; }, renderCharts, "Split by");
      setupRangeButtons("rn-type-range", RANGES, RANGE_LABEL, () => typeRange, v => { typeRange = v; }, renderCharts, "Range");
      setupRangeButtons("rn-type-gran", GRANS, GRAN_LABEL, () => typeGran, v => { typeGran = v; }, renderCharts, "Split by");
      setupRangeButtons("rn-surf-range", RANGES, RANGE_LABEL, () => surfRange, v => { surfRange = v; }, renderCharts, "Range");
      setupRangeButtons("rn-surf-gran", GRANS, GRAN_LABEL, () => surfGran, v => { surfGran = v; }, renderCharts, "Split by");
      setupRangeButtons("rn-effort-range", RANGES, RANGE_LABEL, () => effortRange, v => { effortRange = v; }, renderCharts, "Range");
      setupRangeButtons("rn-effort-gran", GRANS, GRAN_LABEL, () => effortGran, v => { effortGran = v; }, renderCharts, "Split by");

      $("shoe-add-btn").addEventListener("click", () => {
        const name = $("shoe-name").value.trim();
        if (!name) return;
        const id = nextId("s", D.shoes);
        D.shoes[id] = { name, brand: $("shoe-brand").value.trim() };
        $("shoe-name").value = "";
        $("shoe-brand").value = "";
        refreshAll();
      });

      $("unit-toggle").addEventListener("click", () => {
        applyUnit(unit === "metric" ? "imperial" : "metric");
        renderTool();
      });
    },
    reset() {
      selectedDate = null;
      expandedRuns.clear();
      expandedShoes.clear();
      mileRange = "30d";
      mileGran = "week";
      shoeRange = "30d";
      shoeGran = "week";
      typeRange = "30d";
      typeGran = "day";
      surfRange = "30d";
      surfGran = "day";
      effortRange = "30d";
      effortGran = "day";
      histFrom = null;
      histTo = null;
      $("hist-from").value = "";
      $("hist-to").value = "";
      resetHistoryRange();
    },
    render() { renderTool(); },
    summary() {
      let totalM = 0;
      for (const e of D.entries) totalM += e.distanceM || 0;
      const last = D.entries.slice().sort((a, b) => (b.datetime || "").localeCompare(a.datetime || ""))[0];
      const lr = last && D.runs[last.runId];
      return [
        { label: "runs", value: D.entries.length },
        { label: "distance", value: fmtDist(totalM, 1) + " " + distLabel() },
        { label: "shoes", value: Object.keys(D.shoes).length },
        { label: "last run", value: lr ? `${lr.name} · ${fmtDate(last.datetime)}` : "—" }
      ];
    },
    recent(limit) {
      return D.entries.slice().sort((a, b) => (b.datetime || "").localeCompare(a.datetime || "")).slice(0, limit).map(e => {
        const r = D.runs[e.runId];
        return {
          date: (e.datetime || "").slice(0, 10),
          text: `${r ? r.name : "run"} — ${fmtDist(e.distanceM || 0, 1)} ${distLabel()}${e.notes ? ` · “${e.notes}”` : ""}`
        };
      });
    }
  };

  function renderTool() {
    renderUnitToggle();
    renderSuggestionLists();
    renderRunList();
    renderHome();
    renderHistory();
    renderRunsList();
    renderShoesList();
    renderCharts();
  }

  registerTool(window.runTool);
})();