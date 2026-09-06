"use strict";

const IMP_DATA = { climb: null, run: null, calorie: null };

function impEsc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function impDetectTool(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.routes && typeof raw.routes === "object") return "climb";
  if (raw.runs && typeof raw.runs === "object") return "run";
  if (raw.foods && typeof raw.foods === "object") return "calorie";
  return null;
}

function impCounts(tool, raw) {
  if (tool === "climb") return Object.keys(raw.routes || {}).length + " routes · " + (raw.climbs || []).length + " climbs";
  if (tool === "run") return Object.keys(raw.shoes || {}).length + " shoes · " + Object.keys(raw.runs || {}).length + " runs · " + (raw.entries || []).length + " entries";
  if (tool === "calorie") return Object.keys(raw.foods || {}).length + " foods · " + (raw.entries || []).length + " entries";
  return "";
}

function impShowStatus(tool, name, raw) {
  const box = document.querySelector('[data-status="' + tool + '"]');
  box.classList.remove("hidden");
  box.innerHTML = '<span class="clear">clear</span>' +
    '<div class="loaded-fname">' + impEsc(name) + " ✓</div>" +
    '<div class="loaded-detail">' + impEsc(impCounts(tool, raw)) + "</div>";
  box.querySelector(".clear").addEventListener("click", () => {
    IMP_DATA[tool] = null;
    box.classList.add("hidden");
    box.innerHTML = "";
    impRefresh();
  });
}

function impRefresh() {
  const n = ["climb", "run", "calorie"].filter(t => IMP_DATA[t]).length;
  document.getElementById("imp-msg").textContent = n === 0 ? "Load at least one file above, then tap merge." : n + " of 3 loaded.";
  document.getElementById("imp-merge").disabled = n === 0;
}

function impHandleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let raw;
    try { raw = JSON.parse(reader.result); } catch (e) {
      document.getElementById("imp-err").textContent = "Couldn't read " + file.name + " (not valid JSON).";
      return;
    }
    const tool = impDetectTool(raw);
    if (!tool) {
      document.getElementById("imp-err").textContent = "That doesn't look like a tracker file: " + file.name + " (expected 'routes', 'runs' or 'foods').";
      return;
    }
    document.getElementById("imp-err").textContent = "";
    IMP_DATA[tool] = raw;
    impShowStatus(tool, file.name, raw);
    impRefresh();
  };
  reader.readAsText(file);
}

/* Wire up pickers + drag/drop */
document.querySelectorAll("#tool-import label.drop").forEach(label => {
  const input = label.querySelector("input[type=file]");
  input.addEventListener("change", () => {
    Array.prototype.forEach.call(input.files, impHandleFile);
    input.value = "";
  });
  label.addEventListener("dragover", ev => { ev.preventDefault(); label.classList.add("drag"); });
  label.addEventListener("dragleave", () => label.classList.remove("drag"));
  label.addEventListener("drop", ev => {
    ev.preventDefault();
    label.classList.remove("drag");
    Array.prototype.forEach.call(ev.dataTransfer.files, impHandleFile);
  });
});

document.getElementById("imp-merge").addEventListener("click", () => {
  const merged = {
    calorie: IMP_DATA.calorie || { foods: {}, entries: [] },
    run: IMP_DATA.run || { shoes: {}, runs: {}, entries: [] },
    climb: IMP_DATA.climb || { routes: {}, climbs: [] }
  };

  const blob = new Blob([JSON.stringify(merged, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fitness-data.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  document.getElementById("imp-msg").textContent = "Downloaded fitness-data.json 📄";

  try {
    for (const tool of TOOLS) {
      if (tool.id in merged) applyToolData(tool.id, merged[tool.id]);
    }
    filename = "fitness-data.json";
    backupDB();
    refreshAll();
    document.getElementById("imp-msg").textContent = "Merged into this session — browse the tabs above. ✅";
  } catch (err) {
    document.getElementById("imp-err").textContent = "File downloaded, but showing it in this session failed: " + err.message;
  }
});

/* Temp 5th page: insert the Import button after the generated tool buttons */
window.initImportTab = function () {
  const bar = document.getElementById("toolbar");
  if (!bar || bar.querySelector('[data-tool="import"]')) return;
  bar.insertAdjacentHTML("beforeend", '<button class="tool-btn" data-tool="import" onclick="showTool(\'import\')">📥 Import</button>');
};