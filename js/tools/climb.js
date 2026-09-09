"use strict";

/* =====================================================================
   Climb tool — routes registry + dated climbs.
   Ported from the single-file climbing-route-tracker.
   Patterns to copy in run.js and calorie.js:
   - IIFE, const D = window.DB.climb (stable object identity; the shell
     normalizes in place via delete+assign).
   - All element IDs prefixed "cl-"; $("#id") = getElementById("cl-" + id);
     global inline handlers prefixed cl_.
   - registerTool(contract) drives the shell: empty/normalize/sample for
     data, setup/reset/render per lifecycle, summary/recent for Overview.
   ===================================================================== */

(function () {
  const root = document.getElementById("tool-climb");
  if (!root) return;
  const $ = id => document.getElementById("cl-" + id);
  const D = window.DB.climb;

  /* -------- Tool-local state -------- */
  let selectedDate = null;
  let timeRange = "month";
  let routeRange = "month";
  let profRange = "month";
  let histFrom = null;
  let histTo = null;
  const expandedRoutes = new Set();

  const RANGES = ["month", "year", "all"];
  const RANGE_LABEL = { month: "This month", year: "This year", all: "All time" };
  const PROFICIENCIES = ["top-rope", "lead", "mock lead", "trad"];
  const SETTINGS = ["gym", "outdoor"];
  const GRADE_SUGGESTIONS = ["5.4","5.5","5.6","5.7","5.8","5.9","5.10a","5.10b","5.10c","5.10d","5.11a","5.11b","5.11c","5.11d","5.12a","5.12b","5.12c","5.12d","5.13a","v1","v2","v3","v4","v5","v6","v7","E1 5b","E2 5c","E3 5c","E4 6a","E5 6a"];
  const STYLE_SUGGESTIONS = ["crack","face","slab","overhang","arete","chimney","dihedral","steep jugs","stemming","boulder","fingery","lieback","offwidth"];

  /* -------- Data helpers -------- */
  function newClimbId() {
    let n = 1;
    while (D.climbs.some(c => c.id === n)) n++;
    return n;
  }
  function routeSearchTerm(name) { return (name || "").toLowerCase().replace(/\s+/g, ""); }
  function findMatchingRoute(name) {
    const q = routeSearchTerm(name);
    for (const id in D.routes) {
      if (routeSearchTerm(D.routes[id].name) === q) return D.routes[id];
    }
    return null;
  }

  /* -------- Datalists -------- */
  function renderSuggestionLists() {
    fillList("cl-grade-list", GRADE_SUGGESTIONS);
    fillList("cl-style-list", STYLE_SUGGESTIONS);

    const locations = [], links = [], rnotes = [];
    for (const id in D.routes) {
      const r = D.routes[id];
      if (r.location) locations.push(r.location);
      if (r.link) links.push(r.link);
      if (r.notes) rnotes.push(r.notes);
    }
    fillList("cl-location-list", uniqueValues(locations));
    fillList("cl-link-list", uniqueValues(links));
    fillList("cl-rnotes-list", uniqueValues(rnotes));

    fillList("cl-notes-list", uniqueValues(D.climbs.map(c => c.notes)));
    fillList("cl-prof-list", uniqueValues([...PROFICIENCIES, ...D.climbs.map(c => c.proficiency)]));
    fillList("cl-setting-list", uniqueValues([...SETTINGS, ...D.climbs.map(c => c.setting)]));
    syncEditDatalists();
  }

  function syncEditDatalists() {
    fillList("cl-grade-list-edit", GRADE_SUGGESTIONS);
    fillList("cl-style-list-edit", STYLE_SUGGESTIONS);
    const locations = [], links = [], rnotes = [];
    for (const id in D.routes) {
      const r = D.routes[id];
      if (r.location) locations.push(r.location);
      if (r.link) links.push(r.link);
      if (r.notes) rnotes.push(r.notes);
    }
    fillList("cl-location-list-edit", uniqueValues(locations));
    fillList("cl-link-list-edit", uniqueValues(links));
    fillList("cl-rnotes-list-edit", uniqueValues(rnotes));
    fillList("cl-prof-list-edit", uniqueValues([...PROFICIENCIES, ...D.climbs.map(c => c.proficiency)]));
    fillList("cl-setting-list-edit", uniqueValues([...SETTINGS, ...D.climbs.map(c => c.setting)]));
    fillList("cl-notes-list-edit", uniqueValues(D.climbs.map(c => c.notes)));
  }

  function renderRouteList() {
    const dl = $("route-list");
    dl.innerHTML = Object.values(D.routes)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(r => `<option value="${esc(r.name)}"></option>`)
      .join("");

    const pick = $("pick-route");
    const current = pick.value;
    pick.innerHTML = '<option value="">— select a route —</option>' +
      Object.entries(D.routes)
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([id, r]) => `<option value="${esc(id)}" ${id === current ? "selected" : ""}>${esc(r.name)} (${esc(r.grade || "?")})</option>`)
        .join("");
  }

  /* -------- Home -------- */
  function renderHome() {
    $("total-climbs").textContent = D.climbs.length;
    const box = $("last-climbs");
    if (D.climbs.length === 0) {
      box.innerHTML = '<p class="no-data" style="padding:10px 0;">No climbs yet.</p>';
    } else {
      const last = D.climbs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
      box.innerHTML = climbsTable(last);
    }
  }

  function climbsTable(climbs) {
    return `<table>
      <thead><tr><th>Date</th><th>Route</th><th>Grade</th><th>Prof</th><th>Setting</th><th class="num">Effort</th><th class="num">Scary</th><th>Notes</th><th></th></tr></thead>
      <tbody>
        ${climbs.map(c => {
          const r = D.routes[c.routeId];
          return `<tr>
            <td class="num">${fmtDate(c.date)}</td>
            <td>${r ? esc(r.name) : "<em>missing route</em>"}</td>
            <td>${r && r.grade ? `<span class="pill">${esc(r.grade)}</span>` : "<span class='mutednote'>—</span>"}</td>
            <td>${esc(c.proficiency || "")}</td>
            <td>${c.setting === "outdoor" ? `<span class="pill out">outdoor</span>` : "gym"}</td>
            <td class="num">${c.effort ?? "—"}</td>
            <td class="num">${c.scary ?? "—"}</td>
            <td>${esc(c.notes || "")}</td>
            <td><div class="row-actions">
              <button class="btn small" onclick="cl_editClimb(${c.id})">Edit</button>
              <button class="btn small danger" onclick="cl_delClimb(${c.id})">Del</button>
            </div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
  }

  window.cl_delClimb = function (id) {
    if (!confirm("Delete this climb?")) return;
    D.climbs = D.climbs.filter(c => c.id !== id);
    refreshAll();
  };

  window.cl_editClimb = function (id) {
    const c = D.climbs.find(x => x.id === id);
    if (!c) return;
    const r = D.routes[c.routeId];
    populateClimbModal(c, r);
    $("edit-climb-modal")._climbId = id;
    $("edit-climb-modal").classList.remove("hidden");
  };

  function populateClimbModal(c, r) {
    const routeSelect = $("ec-route");
    routeSelect.innerHTML = Object.entries(D.routes)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([rid, route]) => `<option value="${rid}"${rid === c.routeId ? " selected" : ""}>${esc(route.name)}</option>`)
      .join("");
    $("ec-date").value = c.date;
    $("ec-grade").value = r ? (r.grade || "") : "";
    $("ec-prof").value = c.proficiency || "";
    $("ec-setting").value = c.setting || "gym";
    $("ec-effort").value = c.effort ?? "";
    $("ec-scary").value = c.scary ?? "";
    $("ec-notes").value = c.notes || "";
  }

  function closeClimbModals() {
    $("edit-climb-modal").classList.add("hidden");
    $("edit-route-modal").classList.add("hidden");
  }

  /* -------- History -------- */
  function dataDateBounds() {
    if (D.climbs.length === 0) return { min: todayISO(), max: todayISO() };
    let min = D.climbs[0].date, max = D.climbs[0].date;
    for (const c of D.climbs) {
      if (c.date < min) min = c.date;
      if (c.date > max) max = c.date;
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
    const dates = [...new Set(D.climbs.map(c => c.date))]
      .filter(d => (!histFrom || d >= histFrom) && (!histTo || d <= histTo))
      .sort().reverse();

    const filtered = D.climbs.filter(c =>
      (!histFrom || c.date >= histFrom) && (!histTo || c.date <= histTo));

    const sum = $("hist-summary");
    if (histFrom && histTo && filtered.length > 0) {
      sum.textContent = `${fmtDate(histFrom)} → ${fmtDate(histTo)} · ${filtered.length} climb${filtered.length===1?"":"s"}`;
    } else {
      sum.textContent = "";
    }

    if (dates.length === 0) {
      container.innerHTML = '<p class="no-data">No climbs in this date range.</p>';
      return;
    }
    let html = "";
    for (const date of dates) {
      const entries = D.climbs.filter(c => c.date === date);
      const open = selectedDate === date;
      html += `<div class="day-group">
        <div class="day-head" onclick="cl_toggleDay('${date}')">
          <span class="day-date">${fmtDate(date)}</span>
          <span class="day-total">${entries.length} climb${entries.length===1?"":"s"}</span>
        </div>
        <div class="day-actions">
          <button class="btn small" onclick="event.stopPropagation();cl_addClimbTo('${date}')">+ Add climb</button>
        </div>
        <div class="day-entries${open ? "" : " hidden"}">
          ${climbsTable(entries)}
        </div>
      </div>`;
    }
    container.innerHTML = html;
  }

  window.cl_toggleDay = function (date) {
    selectedDate = selectedDate === date ? null : date;
    renderHistory();
  };

  window.cl_addClimbTo = function (date) {
    $("add-date").value = date;
    root.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    root.querySelector('.tab[data-view="home"]').classList.add("active");
    root.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    $("view-home").classList.remove("hidden");
    $("add-name").focus();
    selectedDate = date;
  };

  /* -------- Routes registry -------- */
  function renderRoutesList() {
    const ids = Object.keys(D.routes).sort((a, b) => D.routes[a].name.localeCompare(D.routes[b].name));
    const box = $("routes-table");
    if (ids.length === 0) {
      box.innerHTML = '<p class="no-data">No routes yet. Add them from the Home tab.</p>';
      return;
    }
    const climbsByRoute = {};
    for (const c of D.climbs) (climbsByRoute[c.routeId] = climbsByRoute[c.routeId] || []).push(c);
    const html = `<table>
      <thead><tr><th>Route</th><th>Grade</th><th>Style</th><th class="num">Pitches</th><th>Location</th><th>Link</th><th class="num">Climbed</th><th></th></tr></thead>
      <tbody>
        ${ids.map(id => {
          const r = D.routes[id];
          const climbs = (climbsByRoute[id] || []).slice().sort((a, b) => b.date.localeCompare(a.date));
          const count = climbs.length;
          const open = expandedRoutes.has(id);
          return `<tr class="route-row${open ? " open" : ""}">
            <td>
              <span class="route-toggle" onclick="cl_toggleRoute('${id}')" title="${open ? "Collapse" : "Expand to see past climb notes"}">
                <span class="chev">${open ? "▾" : "▸"}</span> ${esc(r.name)}
              </span>
              ${r.notes ? `<div class="mutednote">${esc(r.notes)}</div>` : ""}
            </td>
            <td>${r.grade ? `<span class="pill">${esc(r.grade)}</span>` : ""}</td>
            <td>${esc(r.style || "")}</td>
            <td class="num">${r.pitches || "—"}</td>
            <td>${esc(r.location || "")}</td>
            <td>${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">link</a>` : ""}</td>
            <td class="num">${count}</td>
            <td><div class="row-actions">
              <button class="btn small" onclick="cl_editRoute('${id}')">Edit</button>
              <button class="btn small danger" onclick="cl_delRoute('${id}')">Delete</button>
            </div></td>
          </tr>
          ${open ? `<tr class="route-detail"><td colspan="8">
            ${climbs.length === 0
              ? '<div class="mutednote">No climbs logged for this route.</div>'
              : routeClimbNotes(climbs)}
          </td></tr>` : ""}`;
        }).join("")}
      </tbody>
    </table>`;
    box.innerHTML = html;
  }

  function routeClimbNotes(climbs) {
    const rows = climbs.map(c => {
      const notes = c.notes ? `“${esc(c.notes)}”` : '<span class="mutednote">— no notes —</span>';
      return `<div class="climb-note">
        <span class="climb-note-date">${esc(c.date)}</span>
        <span class="climb-note-meta">${esc(c.proficiency || "")} · ${esc(c.setting || "")} · effort ${esc(String(c.effort))} · scary ${esc(String(c.scary))}</span>
        <span class="climb-note-text">${notes}</span>
      </div>`;
    }).join("");
    return `<div class="climb-notes">${rows}</div>`;
  }

  window.cl_toggleRoute = function (id) {
    if (expandedRoutes.has(id)) expandedRoutes.delete(id);
    else expandedRoutes.add(id);
    renderRoutesList();
  };

  window.cl_editRoute = function (id) {
    const r = D.routes[id];
    if (!r) return;
    $("er-name").value = r.name;
    $("er-grade").value = r.grade || "";
    $("er-pitches").value = r.pitches ?? "";
    $("er-style").value = r.style || "";
    $("er-location").value = r.location || "";
    $("er-link").value = r.link || "";
    $("er-notes").value = r.notes || "";
    $("edit-route-modal")._routeId = id;
    $("edit-route-modal").classList.remove("hidden");
  };

  window.cl_delRoute = function (id) {
    const used = D.climbs.some(c => c.routeId === id);
    const msg = used
      ? "This route has climbs. Delete the route AND those climbs?"
      : "Delete this route?";
    if (!confirm(msg)) return;
    D.climbs = D.climbs.filter(c => c.routeId !== id);
    delete D.routes[id];
    refreshAll();
  };

  /* -------- Charts -------- */
  function bucketByTime(range) {
    const today = todayISO();
    const map = {};
    const push = (key, c) => { (map[key] = map[key] || []).push(c); };
    for (const c of D.climbs) {
      if (range === "month") {
        if (c.date.slice(0, 7) === today.slice(0, 7)) push(c.date, c);
      } else if (range === "year") {
        if (c.date.slice(0, 4) === today.slice(0, 4)) push(c.date.slice(0, 7), c);
      } else {
        push(c.date.slice(0, 7), c);
      }
    }
    return map;
  }

  function renderCharts() {
    const src = bucketByTime(timeRange);
    const grades = {};
    let n = 0;
    for (const k in src) {
      for (const c of src[k]) {
        const r = D.routes[c.routeId];
        const grade = (r && r.grade) ? r.grade : "(no grade)";
        grades[grade] = (grades[grade] || 0) + 1;
        n++;
      }
    }
    const sorted = Object.entries(grades).sort((a, b) => b[1] - a[1]);
    renderBarChart("cl-time-chart", "cl-time-summary", sorted,
      v => `${v} climb${v===1?"":"s"}`,
      g => `Grade ${g}`,
      `${RANGE_LABEL[timeRange]}: ${n} climb${n===1?"":"s"} across ${sorted.length} grade${sorted.length===1?"":"s"}`);

    const rsrc = bucketByTime(routeRange);
    if (Object.keys(rsrc).length === 0) {
      renderBarChart("cl-route-chart", "cl-route-summary", [],
        v => "", k => k, "");
    } else {
      const counts = {};
      for (const k in rsrc) {
        for (const c of rsrc[k]) {
          const r = D.routes[c.routeId];
          const name = r ? r.name : "(unknown)";
          counts[name] = (counts[name] || 0) + 1;
        }
      }
      const rSorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
      renderBarChart("cl-route-chart", "cl-route-summary", rSorted,
        v => `${v} time${v===1?"":"s"}`,
        k => k,
        `${Object.keys(counts).length} different routes climbed`);
    }

    const psrc = bucketByTime(profRange);
    const profCounts = {};
    let pn = 0;
    for (const k in psrc) {
      for (const c of psrc[k]) {
        const p = (c.proficiency || "").trim() || "(unspecified)";
        profCounts[p] = (profCounts[p] || 0) + 1;
        pn++;
      }
    }
    const pSorted = Object.entries(profCounts).sort((a, b) => b[1] - a[1]);
    renderBarChart("cl-prof-chart", "cl-prof-summary", pSorted,
      v => `${v} climb${v===1?"":"s"}`,
      p => p,
      `${RANGE_LABEL[profRange]}: ${pn} climb${pn===1?"":"s"} across ${pSorted.length} proficiency type${pSorted.length===1?"":"s"}`);
  }

  /* -------- Add form -------- */
  function addClimbFromForm() {
    const name = $("add-name").value.trim();
    if (!name) return;
    const grade = $("add-grade").value.trim();
    const pitchesVal = $("add-pitches").value;
    const pitches = pitchesVal ? parseFloat(pitchesVal) : null;
    const style = $("add-style").value.trim();
    const location = $("add-location").value.trim();
    const link = $("add-link").value.trim();
    const rnotes = $("add-rnotes").value.trim();
    const date = $("add-date").value || todayISO();
    const proficiency = $("add-prof").value;
    const setting = $("add-setting").value;
    const effort = clamp10($("add-effort").value);
    const scary = clamp10($("add-scary").value);
    const notes = $("add-notes").value.trim();

    const match = findMatchingRoute(name);
    let routeId;
    if (match) {
      routeId = Object.keys(D.routes).find(k => D.routes[k] === match);
      match.grade = grade;
      match.pitches = pitches;
      match.style = style;
      match.location = location;
      match.link = link;
      match.notes = rnotes;
    } else {
      routeId = nextId("r", D.routes);
      D.routes[routeId] = { name, grade, pitches, style, location, link, notes: rnotes };
    }

    D.climbs.push({
      id: newClimbId(),
      date: date,
      routeId: routeId,
      proficiency,
      setting,
      effort,
      scary,
      notes
    });

    $("add-name").value = "";
    $("add-grade").value = "";
    $("add-pitches").value = "";
    $("add-style").value = "";
    $("add-location").value = "";
    $("add-link").value = "";
    $("add-rnotes").value = "";
    $("add-date").value = "";
    $("add-notes").value = "";
    refreshAll();
  }

  /* -------- Sample data -------- */
  function buildSample() {
    const today = todayISO();
    const routeDefs = [
      { name: "Snake Dike", grade: "5.7 PG13", pitches: 6, style: "Face", loc: "Yosemite NP, CA", link: "https://www.mountainproject.com/route/105964187", notes: "Runout but easy moves; big approach." },
      { name: "The Nose", grade: "5.14a", pitches: 31, style: "Big wall", loc: "El Cap, Yosemite", link: "https://www.mountainproject.com/route/105894571", notes: "" },
      { name: "Cobra Crack", grade: "5.14b", pitches: 1, style: "Crack", loc: "Squamish, BC", link: "", notes: "Legendary finger crack." },
      { name: "Rodeo Free California", grade: "5.13d", pitches: 1, style: "Crack", loc: "The Needles, CA", link: "", notes: "" },
      { name: "Astro Monkey", grade: "5.13b", pitches: 1, style: "Crack", loc: "JTree, CA", link: "", notes: "" },
      { name: "V3 crimps", grade: "v3", pitches: 1, style: "Bouldering", loc: "Local gym", link: "", notes: "" },
      { name: "V4 overhang", grade: "v4", pitches: 1, style: "Bouldering", loc: "Local gym", link: "", notes: "" },
      { name: "Gym 5.10d", grade: "5.10d", pitches: 1, style: "Slab", loc: "Local gym", link: "", notes: "" },
      { name: "Hard Slab", grade: "5.12a", pitches: 2, style: "Slab", loc: "Red Rocks, NV", link: "", notes: "" },
      { name: "Trad Corner", grade: "5.9", pitches: 3, style: "Corner", loc: "City of Rocks, ID", link: "", notes: "" }
    ];

    const db = { routes: {}, climbs: [] };
    routeDefs.forEach((r, i) => {
      db.routes["r" + (i + 1)] = { name: r.name, grade: r.grade, pitches: r.pitches, style: r.style, location: r.loc, link: r.link, notes: r.notes };
    });

    let seed = 7;
    function rnd() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    let id = 0;

    for (let ago = 80; ago >= 1; ago--) {
      const d = new Date();
      d.setDate(d.getDate() - ago);
      const iso = toISO(d);
      const dow = d.getDay();
      const weekend = (dow === 0 || dow === 6);
      const sessions = rnd() < 0.55 ? 1 : 0;
      for (let s = 0; s < sessions; s++) {
        const r = pick(Object.keys(db.routes).slice(0, 8));
        db.climbs.push({
          id: ++id,
          date: iso,
          routeId: r,
          proficiency: pick(["top-rope", "lead", "mock lead", "lead"]),
          setting: weekend && rnd() < 0.3 ? "outdoor" : "gym",
          effort: 3 + Math.floor(rnd() * 6),
          scary: weekend ? 2 + Math.floor(rnd() * 7) : 2 + Math.floor(rnd() * 4),
          notes: rnd() < 0.4 ? pick(["went clean", "crux felt hard", "felt great", "a bit pumped"]) : ""
        });
      }
    }

    db.climbs.push({
      id: ++id, date: today, routeId: "r6", proficiency: "top-rope", setting: "gym",
      effort: 5, scary: 3, notes: "warmup and a few reps"
    });
    db.climbs.push({
      id: ++id, date: today, routeId: "r7", proficiency: "lead", setting: "gym",
      effort: 7, scary: 5, notes: "good, focused"
    });

    return db;
  }

  /* -------- registerTool contract -------- */
  window.climbTool = {
    id: "climb",
    label: "Climb",
    emoji: "🧗",
    rootId: "tool-climb",
    empty() { return { routes: {}, climbs: [] }; },
    normalize(raw) {
      const db = { routes: {}, climbs: [] };
      if (!raw.routes || typeof raw.routes !== "object") throw new Error("climb data missing 'routes' object");
      for (const id in raw.routes) {
        const r = raw.routes[id];
        db.routes[id] = {
          name: String(r.name ?? "unnamed"),
          grade: String(r.grade ?? ""),
          pitches: r.pitches != null ? parseFloat(r.pitches) : null,
          style: String(r.style ?? ""),
          location: String(r.location ?? ""),
          link: String(r.link ?? ""),
          notes: String(r.notes ?? "")
        };
      }
      if (!Array.isArray(raw.climbs)) throw new Error("climb data missing 'climbs' array");
      let maxId = 0;
      for (const c of raw.climbs) {
        const id = parseInt(c.id, 10);
        if (id > maxId) maxId = id;
      }
      for (const c of raw.climbs) {
        const id = parseInt(c.id, 10) || (++maxId);
        db.climbs.push({
          id: id,
          date: String(c.date || todayISO()),
          routeId: String(c.routeId ?? ""),
          proficiency: String(c.proficiency ?? "top-rope"),
          setting: String(c.setting ?? "gym"),
          effort: c.effort != null ? parseInt(c.effort, 10) : null,
          scary: c.scary != null ? parseInt(c.scary, 10) : null,
          notes: String(c.notes ?? "")
        });
      }
      db.climbs.sort((a, b) => (b.date).localeCompare(a.date));
      return db;
    },
    sample() { return buildSample(); },
    setup() {
      initToolTabs(root, "cl-");

      $("add-form").addEventListener("submit", e => { e.preventDefault(); addClimbFromForm(); });

      $("pick-route").addEventListener("change", e => {
        const id = e.target.value;
        if (!id) return;
        const r = D.routes[id];
        if (!r) return;
        $("add-name").value = r.name;
        $("add-grade").value = r.grade || "";
        $("add-pitches").value = r.pitches || "";
        $("add-style").value = r.style || "";
        $("add-location").value = r.location || "";
        $("add-link").value = r.link || "";
        $("add-rnotes").value = r.notes || "";
        $("add-name").focus();
        e.target.value = "";
      });

      $("ec-save").addEventListener("click", () => {
        const c = D.climbs.find(x => x.id === $("edit-climb-modal")._climbId);
        if (!c) { closeClimbModals(); return; }
        const routeId = $("ec-route").value;
        const grade = $("ec-grade").value.trim();
        const route = D.routes[routeId];
        if (route) route.grade = grade;

        c.date = $("ec-date").value || c.date;
        c.routeId = routeId;
        c.proficiency = $("ec-prof").value.trim();
        c.setting = $("ec-setting").value.trim() || "gym";
        c.effort = clamp10($("ec-effort").value);
        c.scary = clamp10($("ec-scary").value);
        c.notes = $("ec-notes").value.trim();

        closeClimbModals();
        refreshAll();
      });
      $("ec-cancel").addEventListener("click", closeClimbModals);
      $("er-cancel").addEventListener("click", closeClimbModals);
      root.querySelectorAll(".modal-backdrop").forEach(bd => {
        bd.addEventListener("click", e => { if (e.target === bd) closeClimbModals(); });
      });

      $("er-save").addEventListener("click", () => {
        const r = D.routes[$("edit-route-modal")._routeId];
        if (!r) { closeClimbModals(); return; }
        const name = $("er-name").value.trim();
        if (!name) return;
        r.name = name;
        r.grade = $("er-grade").value.trim();
        const p = parseFloat($("er-pitches").value);
        r.pitches = isFinite(p) ? p : null;
        r.style = $("er-style").value.trim();
        r.location = $("er-location").value.trim();
        r.link = $("er-link").value.trim();
        r.notes = $("er-notes").value.trim();
        closeClimbModals();
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

      setupRangeButtons("cl-time-range", RANGES, RANGE_LABEL,
        () => timeRange, v => { timeRange = v; }, renderCharts);
      setupRangeButtons("cl-route-range", RANGES, RANGE_LABEL,
        () => routeRange, v => { routeRange = v; }, renderCharts);
      setupRangeButtons("cl-prof-range", RANGES, RANGE_LABEL,
        () => profRange, v => { profRange = v; }, renderCharts);
    },
    reset() {
      selectedDate = null;
      expandedRoutes.clear();
      timeRange = "month";
      routeRange = "month";
      profRange = "month";
      $("hist-from").value = "";
      $("hist-to").value = "";
      resetHistoryRange();
    },
    render() {
      renderSuggestionLists();
      renderRouteList();
      renderHome();
      renderHistory();
      renderRoutesList();
      renderCharts();
    },
    summary() {
      const routeCount = Object.keys(D.routes).length;
      const last = D.climbs.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
      const lastR = last && D.routes[last.routeId];
      return [
        { label: "climbs", value: D.climbs.length },
        { label: "routes", value: routeCount },
        { label: "last climb", value: lastR ? `${lastR.name || "?"} · ${lastR.grade || "?"} · ${fmtDate(last.date)}` : "—" }
      ];
    },
    recent(limit) {
      return D.climbs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit).map(c => {
        const r = D.routes[c.routeId];
        const grade = r && r.grade ? ` ${r.grade}` : "";
        return {
          date: c.date,
          text: `${r ? r.name + grade : "climb"} — ${c.proficiency || ""}${c.notes ? ` · “${c.notes}”` : ""}`
        };
      });
    }
  };

  registerTool(window.climbTool);
})();