"use strict";

/* =====================================================================
   Fitness Tracker — shell UI wiring: theme toggle, menu, tool switcher,
   per-tool sub tabs, history presets, load screen / PWA.
   ===================================================================== */

/* ---------------------- Theme ---------------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const dark = theme === "dark";
  document.getElementById("theme-emoji").textContent = dark ? "☀️" : "🌙";
  document.getElementById("theme-label").textContent = dark ? " Light" : " Dark";
}
(function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored || (prefersDark ? "dark" : "light"));
})();
document.getElementById("theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

/* ---------------------- Shared history preset ---------------------- */
/* ctx = { bounds(), set(from, to), render() } — provided by each tool. */
function applyHistoryPreset(preset, ctx) {
  const today = todayISO();
  let from, to;
  if (preset === "week") {
    from = mondayOf(today); to = today;
  } else if (preset === "month") {
    from = firstOfMonthISO(); to = today;
  } else if (preset === "lastmonth") {
    const d = new Date();
    from = toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    to = toISO(new Date(d.getFullYear(), d.getMonth(), 0));
  } else if (preset === "year") {
    from = today.slice(0, 4) + "-01-01"; to = today;
  } else {
    const b = ctx.bounds(); from = b.min; to = b.max;
  }
  ctx.set(from, to);
  ctx.render();
}

/* ---------------------- Per-tool sub tabs ---------------------- */
/* Wires the .tab buttons inside a tool section. prefix maps a view
   name to its element id (e.g. prefix "cl-" + "view-home"). */
function initToolTabs(root, prefix) {
  root.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      root.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      root.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
      document.getElementById(prefix + "view-" + tab.dataset.view).classList.remove("hidden");
    });
  });
}

/* ---------------------- Tool switcher ---------------------- */
function buildToolSwitcher(toolbarId) {
  const bar = document.getElementById(toolbarId);
  if (!bar) return;
  for (const tool of TOOLS) {
    const b = document.createElement("button");
    b.className = "tool-btn";
    b.dataset.tool = tool.id;
    b.textContent = tool.emoji + " " + tool.label;
    b.addEventListener("click", () => showTool(tool.id));
    bar.appendChild(b);
  }
}

function showTool(id) {
  document.querySelectorAll(".tool").forEach(s => {
    s.classList.toggle("hidden", s.id !== "tool-" + id);
  });
  document.querySelectorAll(".tool-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tool === id);
  });
  if (id === "overview" && typeof window.renderOverview === "function") window.renderOverview();
}

/* ---------------------- Topbar menu ---------------------- */
const menuBtn = document.getElementById("menu-btn");
const menu = document.getElementById("menu");
if (menuBtn && menu) {
  menuBtn.addEventListener("click", e => { e.stopPropagation(); menu.classList.toggle("open"); });
  document.addEventListener("click", () => menu.classList.remove("open"));
  menu.querySelectorAll(".menu-item").forEach(it => it.addEventListener("click", () => menu.classList.remove("open")));
}
const openItem = document.getElementById("open-item");
if (openItem) openItem.addEventListener("click", () => {
  const fi = document.getElementById("file-input");
  if (fi) fi.click();
});
const sampleItem = document.getElementById("sample-item");
if (sampleItem) sampleItem.addEventListener("click", () => loadAndStart(buildAllSample(), DEFAULT_FILE));

/* ---------------------- Open a data file ---------------------- */
const fileInput = document.getElementById("file-input");
if (fileInput) {
  fileInput.addEventListener("change", e => {
    const f = e.target.files[0];
    if (f) readFile(f);
    e.target.value = "";
  });
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      loadAndStart(JSON.parse(reader.result), file.name);
    } catch (err) {
      alert("Invalid JSON: " + err.message);
    }
  };
  reader.onerror = () => alert("Could not read file.");
  reader.readAsText(file);
}

document.getElementById("save-btn").addEventListener("click", download);
document.getElementById("new-file-btn").addEventListener("click", () => {
  if (!confirm("Start a new empty file? Unsaved changes are lost.")) return;
  newEmptyFile();
});

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js");
}