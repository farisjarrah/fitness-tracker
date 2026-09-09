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

/* Accepts a merged fitness file ({ calorie, run, climb }) OR a legacy
   single-tool file (routes/climbs, runs/entries, foods/entries). */
function normalizeFile(raw) {
  if (!raw || typeof raw !== "object") throw new Error("not a JSON object");
  const isMerged = TOOLS.some(t => raw[t.id] && typeof raw[t.id] === "object" && typeof raw[t.id] !== "function");
  const out = {};
  for (const tool of TOOLS) {
    if (isMerged) {
      if (raw[tool.id] != null) {
        try {
          out[tool.id] = tool.normalize(raw[tool.id]);
        } catch (err) {
          out[tool.id] = tool.empty();
        }
      } else {
        out[tool.id] = tool.empty();
      }
    } else {
      try {
        out[tool.id] = tool.normalize(raw);
      } catch (err) {
        out[tool.id] = tool.empty();
      }
    }
  }
  return out;
}

function loadAndStart(data, name) {
  let norm;
  try {
    norm = normalizeFile(data);
  } catch (err) {
    document.getElementById("load-err").textContent = "Could not read that file: " + err.message;
    return;
  }
  filename = name || DEFAULT_FILE;
  for (const tool of TOOLS) applyToolData(tool, norm[tool.id]);

  document.getElementById("file-name").textContent = "(" + filename + ")";
  document.getElementById("load-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  for (const tool of TOOLS) tool.reset();
  refreshAll();
}

function newEmptyFile() {
  for (const tool of TOOLS) applyToolData(tool, tool.empty());
  filename = DEFAULT_FILE;
  document.getElementById("file-name").textContent = "(new file)";
  for (const tool of TOOLS) tool.reset();
  refreshAll();
}

/* -------- Render orchestration -------- */
function refreshAll() {
  for (const tool of TOOLS) tool.render();
  renderOverview();
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
    try {
      loadAndStart(bk.data, bk.filename || DEFAULT_FILE);
      return;
    } catch (err) { /* fall through to load screen */ }
  }
}

(function boot() {
  buildToolSwitcher("toolbar");
  for (const tool of TOOLS) tool.setup();
  if (!readBackup()) {
    document.getElementById("load-screen").classList.remove("hidden");
    return;
  }
  autoStart();
})();