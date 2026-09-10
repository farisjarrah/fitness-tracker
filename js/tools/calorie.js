"use strict";

/* =====================================================================
   Calorie tool — foods registry + dated eating entries.
   Ported from the single-file calorie-tracker.
   Patterns to match climb.js:
   - IIFE, const D = window.DB.calorie (stable object identity; the shell
     normalizes in place via delete+assign).
   - All element IDs prefixed "cal-"; $("#id") = getElementById("cal-" + id);
     global inline handlers prefixed cal_.
   - registerTool(contract) drives the shell: empty/normalize/sample for
     data, setup/reset/render per lifecycle, summary/recent for Overview.
   ===================================================================== */

(function () {
  const root = document.getElementById("tool-calorie");
  if (!root) return;
  const $ = id => document.getElementById("cal-" + id);
  const D = window.DB.calorie;

  /* -------- Tool-local state -------- */
  let selectedDate = null;
  let calRange = "today";
  let foodRange = "all";
  let macroRange = "today";
  let histFrom = null;
  let histTo = null;

  const RANGES = ["today", "week", "month", "year", "all"];
  const RANGE_LABEL = { today: "Today", week: "This week", month: "This month", year: "This year", all: "All time" };

  /* -------- Data helpers -------- */
  function nowHM() {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function newEntryId() {
    let n = 1;
    while (D.entries.some(e => e.id === n)) n++;
    return n;
  }
  function totalForEntry(entry) {
    const food = D.foods[entry.foodId];
    if (!food) return 0;
    return (food.calories || 0) * (entry.qty || 1);
  }
  function calorieTotal(entries) {
    return entries.reduce((sum, e) => sum + totalForEntry(e), 0);
  }
  function foodSearchTerm(name) { return (name || "").toLowerCase().replace(/\s+/g, ""); }
  function findMatchingFood(name) {
    const q = foodSearchTerm(name);
    for (const id in D.foods) {
      if (foodSearchTerm(D.foods[id].name) === q) return D.foods[id];
    }
    return null;
  }
  function sundayOf(iso) {
    const d = parseDate(iso);
    const fwd = d.getDay() === 0 ? 0 : 7 - d.getDay();
    d.setDate(d.getDate() + fwd);
    return toISO(d);
  }

  /* -------- Cheat days -------- */
  function cheatDays() {
    D.cheatDays = D.cheatDays || [];
    return D.cheatDays;
  }
  function isCheatDay(date) {
    return cheatDays().indexOf(date) !== -1;
  }
  function toggleCheatDay(date) {
    const arr = cheatDays();
    const i = arr.indexOf(date);
    if (i === -1) arr.push(date);
    else arr.splice(i, 1);
    refreshAll();
  }
  window.cal_toggleCheat = function (date) { toggleCheatDay(date); };

  /* -------- Shared summary helpers (also read by the Health overview) -------- */
  function todayCalories() {
    const t = todayISO();
    return D.entries.filter(e => e.date === t).reduce((s, e) => s + totalForEntry(e), 0);
  }
  function avgDailyCalories() {
    const today = todayISO();
    const daily = {};
    for (const e of D.entries) daily[e.date] = (daily[e.date] || 0) + totalForEntry(e);
    delete daily[today];
    for (const d of cheatDays()) delete daily[d];
    const vals = Object.values(daily);
    return vals.length ? Math.round(vals.reduce((s, n) => s + n, 0) / vals.length) : 0;
  }
  window.calorieTodayTotal = todayCalories;
  window.calorieAvgDaily = avgDailyCalories;

  /* -------- Chart bucketing -------- */
  /* Every bucket => { label: entries[] }. Keyed for aggregation. */
  function bucketEntries(range) {
    const today = todayISO();
    const map = {};
    const push = (key, e) => { (map[key] = map[key] || []).push(e); };
    for (const e of D.entries) {
      if (range === "today") {
        if (e.date === today) push(String(parseInt(e.time || "0", 10) || 0).padStart(2, "0") + ":00", e);
      } else if (range === "week") {
        if (e.date >= mondayOf(today) && e.date <= sundayOf(today)) push(e.date, e);
      } else if (range === "month") {
        if (e.date.slice(0, 7) === today.slice(0, 7)) push(e.date, e);
      } else if (range === "year") {
        if (e.date.slice(0, 4) === today.slice(0, 4)) push(e.date, e);
      } else { // all
        push(e.date.slice(0, 7), e);
      }
    }
    return map;
  }

  /* -------- Datalists / food select -------- */
  function renderFoodList() {
    const names = Object.values(D.foods)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(f => f.name);
    fillList("cal-food-list", names);
    fillList("cal-food-list-edit", names);

    const pick = $("pick-food");
    const current = pick.value;
    pick.innerHTML = '<option value="">— select a food —</option>' +
      Object.entries(D.foods)
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([id, f]) => `<option value="${esc(id)}" ${id === current ? "selected" : ""}>${esc(f.name)}</option>`)
        .join("");
  }

  /* -------- Home -------- */
  function renderToday() {
    const date = todayISO();
    $("today-date").textContent = "Date: " + fmtDate(date);
    const entries = D.entries.filter(e => e.date === date);
    $("today-cal").textContent = calorieTotal(entries);
    $("today-cheat").checked = isCheatDay(date);
    const box = $("today-entries");
    if (entries.length === 0) {
      box.innerHTML = '<p class="no-data" style="padding:10px 0;">No entries yet today.</p>';
    } else {
      box.innerHTML = tableHTML(entries, true);
    }
  }

  /* -------- Shared entries table -------- */
  function tableHTML(entries, showDate) {
    const rows = entries.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const rowHTML = rows.map(e => {
      const f = D.foods[e.foodId];
      return `<tr>
      <td>${esc(e.time || "")}</td>
      <td>${f ? esc(f.name) : "<em>missing food</em>"}</td>
      <td class="num">${esc(e.qty)}</td>
      <td class="num">${totalForEntry(e)}</td>
      <td><div class="row-actions">
        <button class="btn small" onclick="cal_editEntry(${e.id})">Edit</button>
        <button class="btn small danger" onclick="cal_delEntry(${e.id})">Del</button>
      </div></td>
    </tr>`;
    }).join("");
    if (showDate) {
      return `<table>
      <thead><tr><th>Time</th><th>Food</th><th class="num">Servings</th><th class="num">Cal</th><th></th></tr></thead>
      <tbody>${rowHTML}</tbody>
    </table>`;
    }
    return `<table><tbody>${rowHTML}</tbody></table>`;
  }

  /* -------- History -------- */
  function dataDateBounds() {
    if (D.entries.length === 0) return { min: todayISO(), max: todayISO() };
    let min = D.entries[0].date, max = D.entries[0].date;
    for (const e of D.entries) {
      if (e.date < min) min = e.date;
      if (e.date > max) max = e.date;
    }
    return { min, max };
  }
  function resetHistoryRange() {
    const { min, max } = dataDateBounds();
    histFrom = min;
    histTo = max;
    $("hist-from").value = min;
    $("hist-to").value = max;
  }
  function renderHistory() {
    const container = $("history-list");
    const dates = [...new Set(D.entries.map(e => e.date))]
      .filter(d => (!histFrom || d >= histFrom) && (!histTo || d <= histTo))
      .sort().reverse();

    const filteredEntries = D.entries.filter(e =>
      (!histFrom || e.date >= histFrom) && (!histTo || e.date <= histTo));

    const sum = $("hist-summary");
    if (histFrom && histTo && filteredEntries.length > 0) {
      const total = calorieTotal(filteredEntries);
      sum.textContent = `${fmtDate(histFrom)} → ${fmtDate(histTo)} · ${filteredEntries.length} entries · ${total} calories`;
    } else {
      sum.textContent = "";
    }

    if (dates.length === 0) {
      container.innerHTML = '<p class="no-data">No entries in this date range.</p>';
      return;
    }
    let html = "";
    for (const date of dates) {
      const entries = D.entries.filter(e => e.date === date);
      const total = calorieTotal(entries);
      const open = selectedDate === date;
      html += `<div class="day-group">
      <div class="day-head" onclick="cal_toggleDay('${date}')">
        <span class="day-date">${fmtDate(date)}</span>
        <span class="day-total">${total} cal · ${entries.length} entr${entries.length === 1 ? "y" : "ies"}${isCheatDay(date) ? " · <span class='cheat-badge'>cheat day</span>" : ""}</span>
      </div>
      <div class="day-actions">
        <button class="btn small" onclick="event.stopPropagation();cal_addEntryTo('${date}')">+ Add entry</button>
        <button class="btn small ${isCheatDay(date) ? 'danger' : ''}" onclick="event.stopPropagation();cal_toggleCheat('${date}')">${isCheatDay(date) ? "♯ Unmark cheat day" : "♯ Cheat day"}</button>
      </div>
      <div class="day-entries${open ? "" : " hidden"}">
        ${tableHTML(entries, true)}
      </div>
    </div>`;
    }
    container.innerHTML = html;
  }

  window.cal_toggleDay = function (date) {
    selectedDate = selectedDate === date ? null : date;
    renderHistory();
  };

  window.cal_addEntryTo = function (date) {
    $("ae-date").value = date;
    $("ae-name").value = "";
    $("ae-cal").value = "";
    $("ae-qty").value = "1";
    $("ae-time").value = "";
    $("add-entry-modal").classList.remove("hidden");
    $("ae-name").focus();
    selectedDate = date;
  };

  /* -------- Foods registry -------- */
  function renderFoods() {
    const box = $("foods-table");
    const ids = Object.keys(D.foods).sort((a, b) => D.foods[a].name.localeCompare(D.foods[b].name));
    if (ids.length === 0) {
      box.innerHTML = '<p class="no-data">No foods yet. Add them from the Today tab.</p>';
      return;
    }
    const html = `<table>
    <thead><tr><th>Food</th><th class="num">Calories</th><th>Macros</th><th class="num">Times used</th><th></th></tr></thead>
    <tbody>
      ${ids.map(id => {
        const f = D.foods[id];
        const used = D.entries.filter(e => e.foodId === id).length;
        const macroText = Object.keys(f.macros || {}).length
          ? Object.entries(f.macros).map(([k, v]) => `${k}: ${v}`).join(", ")
          : "—";
        return `<tr>
        <td>${esc(f.name)}</td>
        <td class="num">${f.calories}</td>
        <td>${esc(macroText)}</td>
        <td class="num">${used}</td>
        <td><div class="row-actions">
          <button class="btn small" onclick="cal_editFood('${id}')">Edit</button>
          <button class="btn small danger" onclick="cal_delFood('${id}')">Delete</button>
        </div></td>
      </tr>`;
      }).join("")}
    </tbody>
  </table>`;
    box.innerHTML = html;
  }

  window.cal_editFood = function (id) {
    const f = D.foods[id];
    if (!f) return;
    const m = f.macros || {};
    $("ef-name").value = f.name;
    $("ef-cal").value = f.calories;
    $("ef-protein").value = m.protein || "";
    $("ef-carbs").value = m.carbs || "";
    $("ef-fat").value = m.fat || "";
    $("edit-food-modal")._foodId = id;
    $("edit-food-modal").classList.remove("hidden");
  };

  window.cal_delFood = function (id) {
    const used = D.entries.some(e => e.foodId === id);
    const msg = used
      ? "This food is used by entries. Delete the food AND those entries?"
      : "Delete this food?";
    if (!confirm(msg)) return;
    D.entries = D.entries.filter(e => e.foodId !== id);
    delete D.foods[id];
    refreshAll();
  };

  /* -------- Entries table actions -------- */
  window.cal_delEntry = function (id) {
    if (!confirm("Delete this entry?")) return;
    D.entries = D.entries.filter(e => e.id !== id);
    refreshAll();
  };

  window.cal_editEntry = function (id) {
    const entry = D.entries.find(e => e.id === id);
    if (!entry) return;
    const food = D.foods[entry.foodId];
    const m = food ? (food.macros || {}) : {};
    $("ee-name").value = food ? food.name : "";
    $("ee-cal").value = food ? (food.calories || "") : "";
    $("ee-qty").value = entry.qty !== undefined ? entry.qty : 1;
    $("ee-time").value = entry.time || "";
    $("ee-protein").value = m.protein || "";
    $("ee-carbs").value = m.carbs || "";
    $("ee-fat").value = m.fat || "";
    $("edit-entry-modal")._entryId = id;
    $("edit-entry-modal").classList.remove("hidden");
  };

  /* -------- Modals -------- */
  function closeCalModals() {
    $("edit-entry-modal").classList.add("hidden");
    $("edit-food-modal").classList.add("hidden");
    $("add-entry-modal").classList.add("hidden");
  }

  /* -------- Charts -------- */
  /* Fixed, continuous time grid for a range so the x-axis always spans the
     whole period (hourly today, daily this week/month/year, monthly all-time)
     instead of only the days that happen to have entries. */
  function chartGrid(range) {
    const today = todayISO();
    const cells = [];
    const add = (key, label) => cells.push({ key, label });
    let days = 1;
    if (range === "today") {
      for (let h = 0; h < 24; h++) {
        add(String(h).padStart(2, "0") + ":00", (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? " AM" : " PM"));
      }
    } else if (range === "week") {
      const mon = parseDate(mondayOf(today));
      for (let i = 0; i < 7; i++) {
        const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
        add(toISO(d), WEEKDAY_NAMES[d.getDay()] + " " + (d.getMonth() + 1) + "/" + d.getDate());
      }
      days = 7;
    } else if (range === "month") {
      const y = parseInt(today.slice(0, 4), 10), m = parseInt(today.slice(5, 7), 10);
      const n = new Date(y, m, 0).getDate();
      for (let d = 1; d <= n; d++) {
        add(String(y).padStart(4, "0") + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"), String(d));
      }
      days = n;
    } else if (range === "year") {
      const y = parseInt(today.slice(0, 4), 10);
      const m = parseInt(today.slice(5, 7), 10);
      const end = parseInt(today.slice(8, 10), 10);
      for (let d = new Date(y, 0, 1); d <= new Date(y, m - 1, end); d.setDate(d.getDate() + 1)) {
        add(toISO(d), (d.getMonth() + 1) + "/" + d.getDate());
      }
      const last = new Date(y, m - 1, end);
      days = Math.round((last - new Date(y, 0, 1)) / 86400000) + 1;
    } else { // all — monthly from first entry month through the current month
      let minMonth = null;
      for (const e of D.entries) {
        const k = (e.date || "").slice(0, 7);
        if (k && (!minMonth || k < minMonth)) minMonth = k;
      }
      const start = new Date(parseInt((minMonth || today).slice(0, 4), 10), parseInt((minMonth || today).slice(5, 7), 10) - 1, 1);
      const now = new Date();
      for (let cur = start; cur <= now; cur.setMonth(cur.getMonth() + 1)) {
        add(toISO(cur).slice(0, 7), MONTH_NAMES[cur.getMonth()] + " " + String(cur.getFullYear()).slice(2));
      }
      days = Math.max(1, Math.round((now - start) / 86400000) + 1);
    }
    return { cells, days };
  }

  /* Builds a cumulative series over the fixed time grid. */
  function cumulativeSeries(range, valFn) {
    const buckets = bucketEntries(range);
    const grid = chartGrid(range);
    const cells = grid.cells;
    const points = [];
    let cum = 0;
    for (let i = 0; i < cells.length; i++) {
      for (const e of (buckets[cells[i].key] || [])) cum += valFn(e);
      points.push([i, cum]);
    }
    return { points, labels: cells.map(c => c.label), count: cells.length, days: grid.days };
  }

  /* Adds a dotted target line (flat at the projected total) if target set. */
  function targetSeries(target, count, days) {
    if (!target || !(target > 0)) return null;
    const t = target * Math.max(1, days);
    return [{ label: "target", color: "var(--danger)", dashed: true, points: [[0, t], [Math.max(0, count - 1), t]] }];
  }

  function macroTotal(entries, key) {
    let t = 0;
    for (const e of entries) {
      const f = D.foods[e.foodId];
      if (f && f.macros) t += (f.macros[key] || 0) * (e.qty || 1);
    }
    return t;
  }

  function renderLineCal(range, rangeBoxId, boxId, sumId, valFn, target, label) {
    const { points, labels, count, days } = cumulativeSeries(range, valFn);
    const xFormat = i => labels[i];
    const unit = label === "Calories" ? " cal" : " g";
    const series = [{ label, color: "var(--accent)", points }];
    const ts = targetSeries(target, count, days);
    if (ts) series.push(...ts);
    let summary = "";
    if (count > 0) {
      const final = points.length ? points[points.length - 1][1] : 0;
      summary = `${RANGE_LABEL[range]} · ${label} cumulative: ${Math.round(final)}${unit}${ts ? " · target " + target + (range === "today" ? "" : "/day") : ""}`;
    }
    renderLineChart(boxId, sumId, series, {
      xFormat,
      yFormat: v => Math.round(v).toLocaleString(),
      summary
    });
    syncRangeTabs(rangeBoxId, range);
  }

  function renderCalChart(range) {
    const t = (window.DB.health && window.DB.health.targets) ? (window.DB.health.targets.calories || null) : null;
    renderLineCal(range, "cal-cal-range", "cal-cal-chart", "cal-cal-summary", e => totalForEntry(e), t, "Calories");
  }

  function renderMacroChart(range) {
    const meta = [
      { key: "protein", label: "Protein", color: "#2563eb" },
      { key: "carbs", label: "Carbs", color: "#d97706" },
      { key: "fat", label: "Fat", color: "#dc2626" }
    ];
    const grid = chartGrid(range);
    const labels = grid.cells.map(c => c.label);
    const days = grid.days;
    const t = (window.DB.health && window.DB.health.targets) ? window.DB.health.targets : {};
    const series = [];
    const totals = {};
    for (const m of meta) {
      const cs = cumulativeSeries(range, e => macroTotal([e], m.key));
      const count = cs.count;
      totals[m.key] = cs.points.length ? cs.points[cs.points.length - 1][1] : 0;
      series.push({ label: m.label, color: m.color, points: cs.points });
      const tgt = t[m.key] ? t[m.key] : null;
      if (tgt && (tgt > 0)) {
        const tVal = tgt * Math.max(1, days);
        series.push({
          label: "target " + m.label, color: m.color, dashed: true,
          points: [[0, tVal], [Math.max(0, count - 1), tVal]]
        });
      }
    }
    let summary = "";
    if (labels.length > 0) {
      const parts = meta.map(m => `${m.label} ${Math.round(totals[m.key])}g`).join(" · ");
      summary = `${RANGE_LABEL[range]} · ${parts}`;
    }
    renderLineChart("cal-macro-chart", "cal-macro-summary", series, {
      xFormat: i => (labels[i] || ""),
      yFormat: v => Math.round(v) + " g",
      summary
    });
    syncRangeTabs("cal-macro-range", range);
  }

  function renderFoodChart(range) {
    const buckets = bucketEntries(range);
    if (Object.keys(buckets).length === 0) {
      renderBarChart("cal-food-chart", "cal-food-summary", [], v => "", k => k, "");
      syncRangeTabs("cal-food-range", range);
      return;
    }
    // aggregate per-food counts across the whole range
    const counts = {};
    for (const k in buckets) {
      for (const e of buckets[k]) {
        const f = D.foods[e.foodId];
        const name = f ? f.name : "(unknown)";
        counts[name] = (counts[name] || 0) + 1;
      }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    renderBarChart("cal-food-chart", "cal-food-summary", sorted,
      v => `${v} time${v === 1 ? "" : "s"}`,
      k => k,
      `${Object.keys(counts).length} foods · ${total} total times eaten`);
    syncRangeTabs("cal-food-range", range);
  }

  function renderCharts() {
    renderCalChart(calRange);
    renderMacroChart(macroRange);
    renderFoodChart(foodRange);
  }

  /* -------- Add form -------- */
  function addEntryFromForm() {
    const name = $("add-name").value.trim();
    const cal = parseFloat($("add-cal").value) || 0;
    const protein = parseFloat($("add-protein").value) || 0;
    const carbs = parseFloat($("add-carbs").value) || 0;
    const fat = parseFloat($("add-fat").value) || 0;
    const qty = parseFloat($("add-qty").value) || 1;
    let time = $("add-time").value;
    if (!time) time = nowHM();

    if (!name) return;

    const match = findMatchingFood(name);
    let foodId;
    if (match) {
      foodId = Object.keys(D.foods).find(k => D.foods[k] === match);
    } else {
      const macros = {};
      if (protein) macros.protein = protein;
      if (carbs) macros.carbs = carbs;
      if (fat) macros.fat = fat;
      foodId = nextId("f", D.foods);
      D.foods[foodId] = { name: name, calories: cal, macros: macros };
    }

    D.entries.push({
      id: newEntryId(),
      date: $("add-date").value || todayISO(),
      time: time,
      foodId: foodId,
      qty: qty
    });

    $("add-name").value = "";
    $("add-cal").value = "";
    $("add-protein").value = "";
    $("add-carbs").value = "";
    $("add-fat").value = "";
    $("add-qty").value = "1";
    $("add-time").value = "";
    $("add-date").value = "";
    refreshAll();
  }

  /* -------- Sample data -------- */
  function buildSample() {
    const today = todayISO();
    const foodDefs = [
      { n: "banana", c: 105, p: 1.3, ca: 27, f: 0.4 },
      { n: "apple", c: 95, p: 0.5, ca: 25, f: 0.3 },
      { n: "eggs (2)", c: 140, p: 12, ca: 1, f: 10 },
      { n: "oatmeal", c: 150, p: 5, ca: 27, f: 3 },
      { n: "greek yogurt", c: 100, p: 17, ca: 6, f: 0.7 },
      { n: "chicken breast", c: 165, p: 31, ca: 0, f: 3.6 },
      { n: "rice", c: 205, p: 4, ca: 45, f: 0.4 },
      { n: "broccoli", c: 55, p: 3.7, ca: 11, f: 0.6 },
      { n: "peanut butter", c: 190, p: 7, ca: 7, f: 16 },
      { n: "trail mix", c: 140, p: 4, ca: 14, f: 8 },
      { n: "salmon", c: 208, p: 20, ca: 0, f: 13 },
      { n: "sweet potato", c: 112, p: 2, ca: 26, f: 0.1 },
      { n: "avocado", c: 240, p: 3, ca: 12, f: 22 },
      { n: "tacos (2)", c: 320, p: 15, ca: 30, f: 15 },
      { n: "pizza slice", c: 285, p: 12, ca: 36, f: 10 },
      { n: "burger", c: 540, p: 25, ca: 40, f: 30 },
      { n: "pasta", c: 350, p: 12, ca: 60, f: 6 },
      { n: "coffee + cream", c: 60, p: 1, ca: 5, f: 4 }
    ];

    const db = { foods: {}, entries: [] };
    foodDefs.forEach((f, i) => {
      const macros = {};
      if (f.p) macros.protein = f.p;
      if (f.ca) macros.carbs = f.ca;
      if (f.f) macros.fat = f.f;
      db.foods["f" + (i + 1)] = { name: f.n, calories: f.c, macros: macros };
    });

    // deterministic PRNG so the sample render is stable / reproducible
    let seed = 42;
    function rnd() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const pick = arr => arr[Math.floor(rnd() * arr.length)];

    const breakfast = ["f1", "f4", "f3", "f5", "f8", "f18"];
    const lunch = ["f6", "f7", "f11", "f13", "f15"];
    const dinner = ["f6", "f7", "f14", "f16", "f17", "f11", "f13"];
    const snack = ["f1", "f2", "f5", "f9", "f10", "f8"];

    let id = 0;

    // past ~90 days (about 3 months), excluding today
    for (let ago = 90; ago >= 1; ago--) {
      const d = new Date();
      d.setDate(d.getDate() - ago);
      const iso = toISO(d);
      const dow = d.getDay();
      const weekend = (dow === 0 || dow === 6);
      const out = weekend && rnd() < 0.6; // some weekend dinners eaten out

      const add = (foodId, hh, mm, qty) => {
        db.entries.push({ id: ++id, date: iso, time: String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0"), foodId: foodId, qty: qty });
      };

      add(pick(breakfast), 7, 0 + Math.floor(rnd() * 3) * 15, 1);
      if (rnd() < 0.5) add(pick(snack), 9, 30 + Math.floor(rnd() * 2) * 15, 1);

      if (out) {
        add(pick(dinner), 19, 0, 1);
        add("f16", 19, 15, 1); // burger on nights out
        add("f15", 19, 25, 1); // pizza slice too
      } else {
        add(pick(lunch), 12, 0 + Math.floor(rnd() * 2) * 15, 1);
        if (rnd() < 0.4) add(pick(snack), 15, 30 + Math.floor(rnd() * 2) * 15, 1);
        add(pick(dinner), 18, 30 + Math.floor(rnd() * 2) * 15, 1);
      }
    }

    // today — realistic meals spread across the day
    const todayEntries = [
      { foodId: "f3", time: "07:50", qty: 1 },
      { foodId: "f1", time: "08:10", qty: 1 },
      { foodId: "f8", time: "10:30", qty: 1 },
      { foodId: "f6", time: "12:15", qty: 1 },
      { foodId: "f5", time: "12:30", qty: 1 },
      { foodId: "f2", time: "15:00", qty: 1 },
      { foodId: "f11", time: "18:45", qty: 1 },
      { foodId: "f12", time: "19:00", qty: 1 },
      { foodId: "f10", time: "20:30", qty: 1 }
    ];
    for (const t of todayEntries) db.entries.push({ id: ++id, date: today, time: t.time, foodId: t.foodId, qty: t.qty });

    db.entries.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    return db;
  }

  /* -------- registerTool contract -------- */
  window.calorieTool = {
    id: "calorie",
    label: "Calorie",
    emoji: "🍎",
    rootId: "tool-calorie",
    empty() { return { foods: {}, entries: [], cheatDays: [] }; },
    normalize(raw) {
      if (typeof raw !== "object" || raw === null) throw new Error("calorie data must be a JSON object");
      const db = { foods: {}, entries: [], cheatDays: [] };
      if (!raw.foods || typeof raw.foods !== "object") throw new Error("calorie data missing 'foods' object");
      for (const id in raw.foods) {
        const f = raw.foods[id];
        db.foods[id] = {
          name: String(f.name ?? "unnamed"),
          calories: parseFloat(f.calories) || 0,
          macros: (f.macros && typeof f.macros === "object") ? f.macros : {}
        };
      }
      if (Array.isArray(raw.cheatDays)) db.cheatDays = raw.cheatDays.map(d => String(d).slice(0, 10));
      if (!Array.isArray(raw.entries)) throw new Error("calorie data missing 'entries' array");
      let maxId = 0;
      for (const e of raw.entries) {
        const id = parseInt(e.id, 10);
        if (id > maxId) maxId = id;
      }
      for (const e of raw.entries) {
        const id = parseInt(e.id, 10) || (++maxId);
        db.entries.push({
          id: id,
          date: String(e.date || todayISO()),
          time: String(e.time || ""),
          foodId: String(e.foodId ?? ""),
          qty: parseFloat(e.qty) || 1
        });
      }
      db.entries.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      return db;
    },
    sample() { return buildSample(); },
    setup() {
      $("add-form").addEventListener("submit", e => { e.preventDefault(); addEntryFromForm(); });

      $("pick-food").addEventListener("change", e => {
        const id = e.target.value;
        if (!id) return;
        const f = D.foods[id];
        if (!f) return;
        $("add-name").value = f.name;
        $("add-cal").value = f.calories;
        const m = f.macros || {};
        $("add-protein").value = m.protein || "";
        $("add-carbs").value = m.carbs || "";
        $("add-fat").value = m.fat || "";
        $("add-name").focus();
        e.target.value = "";
      });

      $("ee-save").addEventListener("click", () => {
        const entry = D.entries.find(e => e.id === $("edit-entry-modal")._entryId);
        if (!entry) { closeCalModals(); return; }
        const newName = $("ee-name").value.trim();
        const newCal = parseFloat($("ee-cal").value);
        const protein = parseFloat($("ee-protein").value) || 0;
        const carbs = parseFloat($("ee-carbs").value) || 0;
        const fat = parseFloat($("ee-fat").value) || 0;

        let foodId = entry.foodId;
        const f = D.foods[foodId];
        if (f) {
          f.name = newName;
          f.calories = newCal || 0;
          f.macros = {};
          if (protein) f.macros.protein = protein;
          if (carbs) f.macros.carbs = carbs;
          if (fat) f.macros.fat = fat;
        } else {
          const match = findMatchingFood(newName);
          if (match) {
            foodId = Object.keys(D.foods).find(k => D.foods[k] === match);
          } else {
            const macros = {};
            if (protein) macros.protein = protein;
            if (carbs) macros.carbs = carbs;
            if (fat) macros.fat = fat;
            foodId = nextId("f", D.foods);
            D.foods[foodId] = { name: newName, calories: newCal || 0, macros: macros };
          }
          entry.foodId = foodId;
        }
        entry.qty = parseFloat($("ee-qty").value) || 1;
        entry.time = $("ee-time").value || "";
        closeCalModals();
        refreshAll();
      });
      $("ee-cancel").addEventListener("click", closeCalModals);
      $("ef-cancel").addEventListener("click", closeCalModals);
      $("ae-cancel").addEventListener("click", closeCalModals);
      root.querySelectorAll(".modal-backdrop").forEach(bd => {
        bd.addEventListener("click", e => { if (e.target === bd) closeCalModals(); });
      });

      $("ef-save").addEventListener("click", () => {
        const f = D.foods[$("edit-food-modal")._foodId];
        if (!f) { closeCalModals(); return; }
        const name = $("ef-name").value.trim();
        if (!name) return;
        const protein = parseFloat($("ef-protein").value) || 0;
        const carbs = parseFloat($("ef-carbs").value) || 0;
        const fat = parseFloat($("ef-fat").value) || 0;
        f.name = name;
        f.calories = parseFloat($("ef-cal").value) || 0;
        f.macros = {};
        if (protein) f.macros.protein = protein;
        if (carbs) f.macros.carbs = carbs;
        if (fat) f.macros.fat = fat;
        closeCalModals();
        refreshAll();
      });

      $("ae-save").addEventListener("click", () => {
        const name = $("ae-name").value.trim();
        if (!name) return;
        const cal = parseFloat($("ae-cal").value) || 0;
        const qty = parseFloat($("ae-qty").value) || 1;
        let time = $("ae-time").value;
        const date = $("ae-date").value || todayISO();

        const match = findMatchingFood(name);
        let foodId;
        if (match) {
          foodId = Object.keys(D.foods).find(k => D.foods[k] === match);
        } else {
          foodId = nextId("f", D.foods);
          D.foods[foodId] = { name: name, calories: cal, macros: {} };
        }

        D.entries.push({
          id: newEntryId(),
          date: date,
          time: time || "",
          foodId: foodId,
          qty: qty
        });
        selectedDate = date;
        closeCalModals();
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

      setupRangeButtons("cal-cal-range", RANGES, RANGE_LABEL,
        () => calRange, v => { calRange = v; }, renderCharts);
      setupRangeButtons("cal-macro-range", RANGES, RANGE_LABEL,
        () => macroRange, v => { macroRange = v; }, renderCharts);
      setupRangeButtons("cal-food-range", RANGES, RANGE_LABEL,
        () => foodRange, v => { foodRange = v; }, renderCharts);

      if ($("today-cheat")) {
        $("today-cheat").addEventListener("change", () => {
          const arr = cheatDays();
          const d = todayISO();
          const i = arr.indexOf(d);
          if ($("today-cheat").checked) { if (i === -1) arr.push(d); }
          else { if (i !== -1) arr.splice(i, 1); }
          refreshAll();
        });
      }

      initToolTabs(root, "cal-");
    },
    reset() {
      selectedDate = null;
      calRange = "today";
      foodRange = "all";
      macroRange = "today";
      $("hist-from").value = "";
      $("hist-to").value = "";
      resetHistoryRange();
    },
    render() {
      renderFoodList();
      renderToday();
      renderHistory();
      renderFoods();
      renderCharts();
    },
    summary() {
      const today = todayISO();
      const todayEntries = D.entries.filter(e => e.date === today);
      const foodCount = Object.keys(D.foods).length;
      const todayTotal = todayCalories();
      return [
        { label: "today", value: `${todayEntries.length} entry${todayEntries.length === 1 ? "" : "s"}` },
        { label: "foods tracked", value: String(foodCount) },
        { label: "today so far", value: todayTotal > 0 ? todayTotal.toLocaleString() + " cal" : "—" }
      ];
    },
    recent(limit) {
      return D.entries.slice()
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
        .slice(0, limit)
        .map(e => {
          const f = D.foods[e.foodId];
          const name = f ? f.name : "unknown food";
          return {
            date: e.date,
            text: `${name} — ${e.qty}× · ${totalForEntry(e)} cal${e.date === todayISO() ? " · today" : ""}`
          };
        });
    }
  };

  registerTool(window.calorieTool);
})();