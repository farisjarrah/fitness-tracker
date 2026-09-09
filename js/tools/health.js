"use strict";

/* =====================================================================
   Health tool — optional body settings (height, weight log, daily
   targets) read by the other tools:
   - calorie tool: targets.calories/protein/carbs/fat render as dashed
     target lines on the calorie & macro line charts.
   - run tool:     targets.weeklyMileageM renders as the weekly target
     slope on the mileage-over-time line chart.
   Weight is stored in kg, height in cm, water in ml, mileage in meters;
   display units are user preferences kept in localStorage (fit-*-unit),
   matching the run tool's fit-run-unit pattern. Everything is optional:
   empty() and normalize() never force values, so old merged data files
   load untouched (the shell maps a missing "health" key to empty()).
   ===================================================================== */

(function () {
  const root = document.getElementById("tool-health");
  if (!root) return;
  const $ = id => document.getElementById("ht-" + id);
  const D = window.DB.health;

  /* -------- Display-unit preferences (localStorage, UI-only) -------- */
  const getPref = (k, dflt) => { try { return localStorage.getItem(k) || dflt; } catch (e) { return dflt; } };
  const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const heightUnit = () => getPref("fit-height-unit", "cm");
  const weightUnit = () => getPref("fit-weight-unit", "kg");
  const waterUnit = () => getPref("fit-water-unit", "ml");
  const mileageUnit = () => getPref("fit-mileage-unit", "km");

  const cmToH = cm => heightUnit() === "cm" ? cm : cm / 2.54;
  const hToCm = v => heightUnit() === "cm" ? v : v * 2.54;
  const kgToW = kg => weightUnit() === "kg" ? kg : kg * 2.20462;
  const wToKg = v => weightUnit() === "kg" ? v : v / 2.20462;
  const mlToWat = ml => waterUnit() === "ml" ? ml : ml / 1000;
  const watToMl = v => waterUnit() === "ml" ? v : v * 1000;
  const mToMil = m => mileageUnit() === "km" ? m / 1000 : m / 1609.344;
  const milToM = v => mileageUnit() === "km" ? v * 1000 : v * 1609.344;

  function targets() {
    if (!D.targets) D.targets = emptyTargets();
    return D.targets;
  }
  function emptyTargets() {
    return { calories: null, protein: null, carbs: null, fat: null, waterMl: null, weeklyMileageM: null, weeklyClimbs: { bouldering: null, topRope: null, lead: null } };
  }
  const MOOD_LABEL = { 1: "terrible", 2: "awful", 3: "bad", 4: "meh", 5: "OK", 6: "decent", 7: "good", 8: "great", 9: "excellent", 10: "fantastic" };
  const moodColor = m => m <= 3 ? "#dc2626" : (m >= 8 ? "#16a34a" : "#d97706");
  const moodBadge = m => `<span class="mood-badge" style="background:${moodColor(m)}">${m}</span>${MOOD_LABEL[m] ? " " + MOOD_LABEL[m] : ""}`;
  function numOrNull(v) {
    const n = parseFloat(v);
    return isFinite(n) && n > 0 ? n : null;
  }

  /* -------- Settings form (populated only when data changes) -------- */
  function settingsSignature() {
    return JSON.stringify([D.heightCm, D.targets]);
  }
  let lastSettingsSig = "";
  function renderSettingsInputs() {
    $("height").value = D.heightCm ? Number(cmToH(D.heightCm).toFixed(1)) : "";
    $("height-unit").value = heightUnit();
    const t = targets();
    $("calories").value = t.calories == null ? "" : t.calories;
    $("protein").value = t.protein == null ? "" : t.protein;
    $("carbs").value = t.carbs == null ? "" : t.carbs;
    $("fat").value = t.fat == null ? "" : t.fat;
    $("water").value = t.waterMl == null ? "" : Number(mlToWat(t.waterMl).toFixed(1));
    $("water-unit").value = waterUnit();
    $("mileage").value = t.weeklyMileageM == null ? "" : Number(mToMil(t.weeklyMileageM).toFixed(1));
    $("mileage-unit").value = mileageUnit();
    const wc = t.weeklyClimbs || {};
    $("cl-boulder").value = wc.bouldering == null ? "" : wc.bouldering;
    $("cl-toprope").value = wc.topRope == null ? "" : wc.topRope;
    $("cl-lead").value = wc.lead == null ? "" : wc.lead;
  }

  function saveSettings() {
    try {
      const h = numOrNull($("height").value);
      D.heightCm = h != null ? Math.round(hToCm(h)) : null;
      const t = targets();
      t.calories = numOrNull($("calories").value);
      t.protein = numOrNull($("protein").value);
      t.carbs = numOrNull($("carbs").value);
      t.fat = numOrNull($("fat").value);
      const wv = numOrNull($("water").value);
      t.waterMl = wv != null ? Math.round(watToMl(wv)) : null;
      const mv = numOrNull($("mileage").value);
      t.weeklyMileageM = mv != null ? Math.round(milToM(mv)) : null;
      const wc = t.weeklyClimbs || (t.weeklyClimbs = {});
      wc.bouldering = $("cl-boulder").value === "" ? null : parseInt($("cl-boulder").value, 10);
      wc.topRope = $("cl-toprope").value === "" ? null : parseInt($("cl-toprope").value, 10);
      wc.lead = $("cl-lead").value === "" ? null : parseInt($("cl-lead").value, 10);
      if (isNaN(wc.bouldering)) wc.bouldering = null;
      if (isNaN(wc.topRope)) wc.topRope = null;
      if (isNaN(wc.lead)) wc.lead = null;
      refreshAll();
      flashSaved(true);
    } catch (err) {
      console.error("[fit] saveSettings() threw:", err);
      flashSaved(false);
    }
  }
  function flashSaved(ok) {
    const btn = $("settings-form").querySelector("button[type=submit]");
    const old = btn.textContent;
    btn.textContent = ok ? "Saved ✓" : "Save failed";
    btn.classList.add(ok ? "btn-ok" : "btn-err");
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = old;
      btn.classList.remove("btn-ok", "btn-err");
      btn.disabled = false;
    }, 1600);
  }

  function wireUnitSwitch(selId, prefKey, inputId) {
    $(selId).addEventListener("change", () => {
      const oldUnit = getPref(prefKey, "");
      const newUnit = $(selId).value;
      const cur = parseFloat($(inputId).value);
      let inBase = null;
      if (isFinite(cur)) {
        if (prefKey === "fit-height-unit") inBase = oldUnit === "cm" ? cur : cur * 2.54;
        else if (prefKey === "fit-water-unit") inBase = oldUnit === "ml" ? cur : cur * 1000;
        else if (prefKey === "fit-mileage-unit") inBase = oldUnit === "km" ? cur * 1000 : cur * 1609.344;
      }
      setPref(prefKey, newUnit);
      if (inBase != null) {
        let shown;
        if (prefKey === "fit-height-unit") shown = newUnit === "cm" ? inBase : inBase / 2.54;
        else if (prefKey === "fit-water-unit") shown = newUnit === "ml" ? inBase : inBase / 1000;
        else if (prefKey === "fit-mileage-unit") shown = newUnit === "km" ? inBase / 1000 : inBase / 1609.344;
        $(inputId).value = Number(shown.toFixed(1));
      }
    });
  }
  function sortedWeight() {
    return D.weight.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "") || a.id - b.id);
  }
  function sortedMood() {
    return D.mood.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "") || a.id - b.id);
  }
  function addWeight() {
    const date = $("w-date").value || todayISO();
    const time = $("w-time").value || "";
    const v = numOrNull($("w-value").value);
    if (v == null) return;
    const unit = $("w-unit").value === "lb" ? "lb" : "kg";
    let maxId = 0;
    for (const w of D.weight) if (w.id > maxId) maxId = w.id;
    D.weight.push({ id: ++maxId, date, time, kg: Math.round((unit === "lb" ? v / 2.20462 : v) * 10) / 10 });
    $("w-value").value = "";
    refreshAll();
  }
  function addMood() {
    const date = $("m-date").value || todayISO();
    const time = $("m-time").value || "";
    const mood = parseInt($("m-value").value, 10);
    if (!(mood >= 1 && mood <= 10)) return;
    const note = $("m-note").value.trim();
    let maxId = 0;
    for (const m of D.mood) if (m.id > maxId) maxId = m.id;
    D.mood.push({ id: ++maxId, date, time, mood: Math.round(mood), note });
    $("m-note").value = "";
    refreshAll();
  }
  function delWeight(id) {
    const i = D.weight.findIndex(w => w.id === id);
    if (i !== -1) D.weight.splice(i, 1);
    refreshAll();
  }
  function delMood(id) {
    const i = D.mood.findIndex(m => m.id === id);
    if (i !== -1) D.mood.splice(i, 1);
    refreshAll();
  }
  window.ht_delWeight = delWeight;
  window.ht_delMood = delMood;

  function weightDisplay(kg, dec) {
    return Number(kgToW(kg).toFixed(dec == null ? 1 : dec)) + " " + weightUnit();
  }

  /* -------- render -------- */
  function bmiValue(kg) {
    if (!D.heightCm) return null;
    const m = D.heightCm / 100;
    return kg / (m * m);
  }
  const bmiCategory = bmi => bmi < 18.5 ? "underweight" : bmi < 25 ? "normal" : bmi < 30 ? "overweight" : "obese";

  function renderHealthStats() {
    const box = $("stats");
    const log = sortedWeight();
    const latest = log.length ? log[log.length - 1] : null;
    const parts = [];
    if (latest) parts.push(`latest <b>${weightDisplay(latest.kg)}</b>`);
    if (D.heightCm) {
      parts.push(`${cmToH(D.heightCm).toFixed(1)} ${heightUnit()} tall`);
      if (latest) {
        const bmi = bmiValue(latest.kg);
        if (bmi) parts.push(`BMI <b>${bmi.toFixed(1)}</b> (${bmiCategory(bmi)})`);
      }
    }
    const moods = sortedMood();
    if (moods.length) {
      const last = moods[moods.length - 1];
      parts.push(`mood ${moodBadge(last.mood)}${last.note ? " · " + esc(last.note) : ""}`);
    }
    box.innerHTML = parts.length
      ? `<div class="ht-stats-row">${parts.map(p => `<span class="ht-stat">${p}</span>`).join("")}</div>`
      : '<p class="no-data">No health data yet.</p>';
  }

  function renderWeightChart() {
    const dateBox = $("w-chart");
    const sum = $("w-summary");
    const log = sortedWeight();
    if (log.length === 0) {
      dateBox.innerHTML = '<p class="no-data">No weigh-ins yet.</p>';
      sum.textContent = "";
      return;
    }
    const start = log[0].date, end = log[log.length - 1].date;
    const series = [{
      label: "weight (" + weightUnit() + ")",
      color: "var(--accent)",
      points: log.map((w, i) => [i, Number(kgToW(w.kg).toFixed(1))])
    }];
    const last = log[log.length - 1];
    const prev = log.length > 1 ? log[log.length - 2].kg - last.kg : 0;
    const wUnit = weightUnit();
    let sumTxt = log.length + " weigh-ins · " + fmtDate(start) + " → " + fmtDate(end) +
      " · latest " + Number(kgToW(last.kg).toFixed(1)) + " " + wUnit +
      (log.length > 1 ? (prev >= 0 ? " · Δ +" : " · Δ −") + Math.abs(kgToW(prev)).toFixed(1) + " " + wUnit : "");
    const bmi = bmiValue(last.kg);
    if (bmi) sumTxt += " · BMI " + bmi.toFixed(1);

    const weightW = weightUnit();
    // Tight y-window around the data so small weigh-in changes are visible.
    const kgs = log.map(w => kgToW(w.kg));
    const lo = Math.min(...kgs), hi = Math.max(...kgs);
    const yPad = Math.max(1, Number(((hi - lo) * 0.5).toFixed(1)));
    renderLineChart("ht-w-chart", "ht-w-summary", series, {
      xFormat: i => (log[i] ? log[i].date.slice(5).replace("-", "/") + (log[i].time ? " " + log[i].time.slice(0, 5) : "") : ""),
      yFormat: v => Number(v).toFixed(1) + " " + weightW,
      summary: sumTxt,
      yBase: Number((lo - yPad).toFixed(1)),
      yMax: Number((hi + yPad).toFixed(1))
    });
  }

  function renderWeightLog() {
    const box = $("w-log");
    const log = sortedWeight();
    if (log.length === 0) {
      box.innerHTML = '<p class="no-data">No weigh-ins logged yet.</p>';
      return;
    }
    const rows = [];
    for (let i = log.length - 1; i >= 0; i--) {
      const w = log[i];
      const prevKg = i > 0 ? log[i - 1].kg : null;
      const dKg = prevKg == null ? null : w.kg - prevKg;
      const dTxt = dKg == null ? ""
        : (dKg >= 0 ? "+" : "−") + Math.abs(Number(kgToW(dKg).toFixed(1))) + " " + weightUnit();
      rows.push(`<tr>
        <td>${fmtDate(w.date)}</td>
        <td>${w.time ? w.time.slice(0, 5) : "—"}</td>
        <td class="num">${weightDisplay(w.kg)}</td>
        <td class="num ht-delta">${dTxt || "—"}</td>
        <td class="num"><button class="btn small danger" onclick="ht_delWeight(${w.id})">Delete</button></td>
      </tr>`);
    }
    box.innerHTML = `<table>
      <thead><tr><th>Date</th><th>Time</th><th class="num">Weight</th><th class="num">Δ</th><th></th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>`;
  }

  function renderMoodLog() {
    const box = $("m-log");
    const log = sortedMood();
    if (log.length === 0) {
      box.innerHTML = '<p class="no-data">No moods logged yet.</p>';
      return;
    }
    const rows = [];
    for (let i = log.length - 1; i >= 0; i--) {
      const m = log[i];
      rows.push(`<tr>
        <td>${fmtDate(m.date)}</td>
        <td>${m.time ? m.time.slice(0, 5) : "—"}</td>
        <td>${moodBadge(m.mood)}</td>
        <td>${m.note ? esc(m.note) : ""}</td>
        <td class="num"><button class="btn small danger" onclick="ht_delMood(${m.id})">Delete</button></td>
      </tr>`);
    }
    box.innerHTML = `<table>
      <thead><tr><th>Date</th><th>Time</th><th>Mood</th><th>Note</th><th></th></tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>`;
  }

  /* -------- registerTool contract -------- */
  window.healthTool = {
    id: "health",
    label: "Health",
    emoji: "⚕️",
    rootId: "tool-health",
    empty() { return { heightCm: null, weight: [], mood: [], targets: emptyTargets() }; },
    normalize(raw) {
      const db = { heightCm: null, weight: [], mood: [], targets: emptyTargets() };
      if (typeof raw !== "object" || raw === null) return db;
      const h = Number(raw.heightCm);
      db.heightCm = isFinite(h) && h > 0 ? Math.round(h) : null;
      if (Array.isArray(raw.weight)) {
        let maxId = 0;
        for (const w of raw.weight) {
          const pid = parseInt(w.id, 10);
          if (pid > maxId) maxId = pid;
        }
        for (const w of raw.weight) {
          const kg = Number(w.kg);
          if (!isFinite(kg) || kg <= 0) continue;
          db.weight.push({
            id: parseInt(w.id, 10) || (++maxId),
            date: String(w.date || todayISO()),
            time: String(w.time || ""),
            kg: Math.round(kg * 10) / 10
          });
        }
        db.weight.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      }
      if (Array.isArray(raw.mood)) {
        let maxId = 0;
        for (const m of raw.mood) {
          const pid = parseInt(m.id, 10);
          if (pid > maxId) maxId = pid;
        }
        for (const m of raw.mood) {
          const val = parseInt(m.mood, 10);
          if (!(val >= 1 && val <= 10)) continue;
          db.mood.push({
            id: parseInt(m.id, 10) || (++maxId),
            date: String(m.date || todayISO()),
            time: String(m.time || ""),
            mood: val,
            note: String(m.note || "")
          });
        }
        db.mood.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      }
      if (raw.targets && typeof raw.targets === "object") {
        const t = raw.targets;
        const n = v => { const x = Number(v); return isFinite(x) && x > 0 ? Math.round(x) : null; };
        db.targets.calories = n(t.calories);
        db.targets.protein = n(t.protein);
        db.targets.carbs = n(t.carbs);
        db.targets.fat = n(t.fat);
        db.targets.waterMl = n(t.waterMl);
        db.targets.weeklyMileageM = n(t.weeklyMileageM);
        if (t.weeklyClimbs && typeof t.weeklyClimbs === "object") {
          db.targets.weeklyClimbs.bouldering = n(t.weeklyClimbs.bouldering);
          db.targets.weeklyClimbs.topRope = n(t.weeklyClimbs.topRope);
          db.targets.weeklyClimbs.lead = n(t.weeklyClimbs.lead);
        }
      }
      return db;
    },
    sample() {
      const db = this.empty();
      db.heightCm = 175;
      db.targets = {
        calories: 2400, protein: 150, carbs: 220, fat: 75, waterMl: 2500,
        weeklyMileageM: 40000, weeklyClimbs: { bouldering: 2, topRope: 1, lead: 1 }
      };
      let id = 0;
      for (let ago = 120; ago >= 0; ago -= 21) {
        const d = new Date();
        d.setDate(d.getDate() - ago);
        const base = 80 + ago * 0.04;
        db.weight.push({
          id: ++id,
          date: toISO(d),
          time: (ago % 42 === 0 ? "18:30" : "07:30"),
          kg: Math.round((base + (ago % 3) * 0.3) * 10) / 10
        });
      }
      let mid = 0;
      for (let ago = 119; ago >= 0; ago -= 10) {
        const d = new Date();
        d.setDate(d.getDate() - ago);
        db.mood.push({
          id: ++mid,
          date: toISO(d),
          time: (ago % 20 === 0 ? "20:00" : "08:00"),
          mood: 5 + ((ago % 5) - 2),
          note: ""
        });
      }
      return db;
    },
    setup() {
      initToolTabs(root, "ht-");

      $("settings-form").addEventListener("submit", e => { e.preventDefault(); saveSettings(); });
      $("add-weight").addEventListener("submit", e => { e.preventDefault(); addWeight(); });
      $("add-mood").addEventListener("submit", e => { e.preventDefault(); addMood(); });
      $("w-date").value = todayISO();
      $("m-date").value = todayISO();
      const now = new Date();
      const nowHH = () => String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      $("w-time").value = nowHH();

      wireUnitSwitch("height-unit", "fit-height-unit", "height");
      wireUnitSwitch("water-unit", "fit-water-unit", "water");
      wireUnitSwitch("mileage-unit", "fit-mileage-unit", "mileage");
    },
    reset() {
      $("w-value").value = "";
      $("w-date").value = todayISO();
      $("m-date").value = todayISO();
      $("m-note").value = "";
      const now = new Date();
      const nowHH = () => String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      $("w-time").value = nowHH();
      $("m-time").value = nowHH();
    },
    render() {
      if (settingsSignature() !== lastSettingsSig) {
        renderSettingsInputs();
        lastSettingsSig = settingsSignature();
      }
      renderHealthStats();
      renderWeightChart();
      renderWeightLog();
      renderMoodLog();
    },
    summary() {
      const log = sortedWeight();
      const latest = log.length ? log[log.length - 1] : null;
      const t = targets();
      const moods = sortedMood();
      const lastMood = moods.length ? moods[moods.length - 1].mood : null;
      const out = [];
      if (D.heightCm) out.push({ label: "height", value: `${cmToH(D.heightCm).toFixed(1)} ${heightUnit()}` });
      if (latest) {
        out.push({ label: "current weight", value: weightDisplay(latest.kg) });
        const bmi = bmiValue(latest.kg);
        if (bmi) out.push({ label: "BMI", value: bmi.toFixed(1) });
      }
      if (lastMood) out.push({ label: "mood", value: lastMood + "/10" });
      if (t.calories) out.push({ label: "calorie target", value: t.calories + " kcal/day" });
      return out;
    },
    recent(limit) {
      const items = [];
      for (const w of sortedWeight().slice(-limit)) items.push({ date: w.date, text: `weighed ${weightDisplay(w.kg)}` });
      for (const m of sortedMood().slice(-limit)) items.push({ date: m.date, text: `mood ${m.mood}/10${m.note ? " — " + m.note : ""}` });
      items.sort((a, b) => b.date.localeCompare(a.date));
      return items.slice(0, limit);
    }
  };

  registerTool(window.healthTool);
})();