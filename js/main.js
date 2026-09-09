"use strict";

/* =====================================================================
   Fitness Tracker — shell: boot, load/save flow, merged-file model,
   render orchestration, Overview dashboard, autosave resume.
   ===================================================================== */

/* -------- State transitions -------- */
function emptyAll() {
  const out = {};
  for (const tool of TOOLS) out[tool.id] = tool.empty();
  return out;
}

function buildEmptyAll() { return emptyAll(); }

function buildAllSample() {
  const out = {};
  for (const tool of TOOLS) out[tool.id] = tool.sample();
  return out;
}

/* Applies normalized per-tool data in place so the tool IIFEs' captured
   `const D = window.DB[tool.id]` references stay valid. */
function applyToolData(tool, data) {
  const cur = window.DB[tool.id];
  for (const k in cur) delete cur[k];
  Object.assign(cur, data);
}

/* Returns a small summary of a tool's data for debug logging. */
function dbgCounts(id, d) {
  const c = {};
  if (d.runs) c.runs = Object.keys(d.runs).length;
  if (d.shoes) c.shoes = Object.keys(d.shoes).length;
  if (d.entries && typeof d.entries.length === "number") c.entries = d.entries.length;
  if (d.routes) c.routes = Object.keys(d.routes).length;
  if (d.climbs && typeof d.climbs.length === "number") c.climbs = d.climbs.length;
  if (d.foods) c.foods = Object.keys(d.foods).length;
  if (d.cheatDays && typeof d.cheatDays.length === "number") c.cheatDays = d.cheatDays.length;
  if (d.weight && typeof d.weight.length === "number") c.weight = d.weight.length;
  if (d.heightCm != null) c.height = d.heightCm;
  return c;
}

/* Accepts a merged fitness file ({ calorie, run, climb }) OR a legacy
   single-tool file (routes/climbs, runs/entries, foods/entries). */
function normalizeFile(raw) {
  if (!raw || typeof raw !== "object") throw new Error("not a JSON object");
  const isMerged = TOOLS.some(t => raw[t.id] && typeof raw[t.id] === "object" && typeof raw[t.id] !== "function");
  dbg("normalizeFile: merged =", isMerged, "· top-level keys =", Object.keys(raw));
  const out = {};
  for (const tool of TOOLS) {
    if (isMerged) {
      if (raw[tool.id] != null) {
        try {
          out[tool.id] = tool.normalize(raw[tool.id]);
        } catch (err) {
          console.error("[fit] " + tool.id + ".normalize() failed:", err);
          out[tool.id] = tool.empty();
        }
      } else {
        out[tool.id] = tool.empty();
      }
    } else {
      try {
        out[tool.id] = tool.normalize(raw);
      } catch (err) {
        console.error("[fit] " + tool.id + ".normalize() failed:", err);
        out[tool.id] = tool.empty();
      }
    }
    dbg("  normalize →", tool.id, dbgCounts(tool.id, out[tool.id]));
  }
  return out;
}

function loadAndStart(data, name) {
  let norm;
  try {
    norm = normalizeFile(data);
  } catch (err) {
    alert("Could not read that file: " + err.message);
    return;
  }
  filename = name || DEFAULT_FILE;
  for (const tool of TOOLS) applyToolData(tool, norm[tool.id]);
  dbg("loadAndStart:", filename, "·", TOOLS.map(t => t.id + "=" + JSON.stringify(dbgCounts(t.id, norm[t.id]))).join(" "));

  document.getElementById("file-name").textContent = "(" + filename + ")";
  document.getElementById("app").classList.remove("hidden");
  for (const tool of TOOLS) {
    try { tool.reset(); } catch (err) { console.error("[fit] " + tool.id + ".reset() failed:", err); }
  }
  refreshAll();
  dbg("loadAndStart: done");
}

function newEmptyFile() {
  dbg("newEmptyFile");
  for (const tool of TOOLS) applyToolData(tool, tool.empty());
  filename = DEFAULT_FILE;
  document.getElementById("file-name").textContent = "(new file)";
  document.getElementById("app").classList.remove("hidden");
  for (const tool of TOOLS) {
    try { tool.reset(); } catch (err) { console.error("[fit] " + tool.id + ".reset() failed:", err); }
  }
  refreshAll();
}

/* -------- Render orchestration -------- */
function refreshAll() {
  for (const tool of TOOLS) {
    try {
      tool.render();
    } catch (err) {
      console.error("[fit] " + tool.id + ".render() threw — tool not shown:", err);
    }
  }
  try { renderOverview(); } catch (err) { console.error("[fit] renderOverview() threw:", err); }
  backupDB();
}

/* -------- Overview dashboard -------- */
function renderOverview() {
  const statsBox = document.getElementById("ov-stats");
  const recentBox = document.getElementById("ov-recent");

  statsBox.innerHTML = TOOLS.map(tool => {
    const lines = (tool.summary() || []).map(x =>
      `<div class="ov-stat-line"><span class="ov-val">${esc(String(x.value))}</span>${esc(x.label)}</div>`).join("");
    return `<div class="ov-stat">
      <div class="ov-stat-header">${tool.emoji} ${esc(tool.label)}</div>
      <div class="ov-stat-lines">${lines}</div>
      <button class="btn small" onclick="showTool('${tool.id}')">Open</button>
    </div>`;
  }).join("");

  const all = [];
  for (const tool of TOOLS) {
    for (const r of tool.recent(5)) {
      all.push({ date: r.date, emoji: tool.emoji, text: r.text });
    }
  }
  all.sort((a, b) => b.date.localeCompare(a.date));
  const recent = all.slice(0, 20);

  if (recent.length === 0) {
    recentBox.innerHTML = '<p class="no-data">No activity yet — add entries in any tool.</p>';
    return;
  }

  let html = '<div class="ov-recent-list">';
  let lastDate = null;
  for (const r of recent) {
    if (r.date && r.date !== lastDate) {
      html += `<div class="ov-recent-day">${fmtDate(r.date)}</div>`;
      lastDate = r.date;
    }
    html += `<div class="ov-recent-row">
      <span class="ov-emoji">${r.emoji}</span>
      <span class="ov-recent-text">${esc(r.text)}</span>
    </div>`;
  }
  html += '</div>';
  recentBox.innerHTML = html;
}

/* -------- Boot -------- */
function autoStart() {
  const bk = readBackup();
  if (bk && bk.data && typeof bk.data === "object") {
    dbg("autoStart: resuming backup", bk.filename || DEFAULT_FILE, "· savedAt", bk.savedAt ? new Date(bk.savedAt).toISOString() : "?");
    try {
      loadAndStart(bk.data, bk.filename || DEFAULT_FILE);
      return;
    } catch (err) {
      console.error("[fit] autoStart: backup failed to load — starting empty:", err);
      try { localStorage.removeItem(BACKUP_KEY); } catch (e) {}
    }
  } else {
    dbg("autoStart: no usable backup — starting empty file");
  }
  newEmptyFile();
}

(function boot() {
  buildToolSwitcher("toolbar");
  for (const tool of TOOLS) tool.setup();
  autoStart();
})();