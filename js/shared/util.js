"use strict";

/* =====================================================================
   Fitness Tracker — shared core: state, dates, escaping, file IO,
   autosave backup, datalist helpers.
   Loaded before the tool scripts (they rely on window.DB existing).
   ===================================================================== */

/* -------- Global state (live combined DB; keep object identity stable) -------- */
window.DB = { calorie: {}, run: {}, climb: {} };
let filename = "fitness-data.json";

const THEME_KEY = "fit-theme";
const BACKUP_KEY = "fit-data-backup";
const DEFAULT_FILE = "fitness-data.json";

/* -------- Dates -------- */
function todayISO() { return toISO(new Date()); }

function toISO(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return iso.slice(0, 10);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function mondayOf(iso) {
  const d = parseDate(iso);
  const back = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - back);
  return toISO(d);
}

function firstOfMonthISO(d) {
  const dt = d || new Date();
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-01";
}

/* -------- Misc helpers -------- */
function nextId(prefix, obj) {
  let n = 1;
  while (obj[prefix + n]) n++;
  return prefix + n;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function clamp10(v) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return null;
  return Math.max(1, Math.min(10, n));
}

function uniqueValues(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const s = (v || "").trim();
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

function fillList(id, values) {
  document.getElementById(id).innerHTML =
    values.map(v => `<option value="${esc(v)}"></option>`).join("");
}

function isIOS() {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/* -------- Download / autosave backup -------- */
function download() {
  const json = JSON.stringify(window.DB, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const file = new File([blob], filename, { type: "application/json" });
  if (isIOS() && typeof navigator.share === "function") {
    const ok = typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
    if (ok) {
      navigator.share({ files: [file], title: filename }).catch(() => {});
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function backupDB() {
  const app = document.getElementById("app");
  if (!window.DB || !app || app.classList.contains("hidden")) return;
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: Date.now(), filename, data: window.DB }));
  } catch (err) { /* storage unavailable - ignore */ }
}

function readBackup() {
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY)); } catch (err) { return null; }
}