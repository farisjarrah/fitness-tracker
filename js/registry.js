"use strict";

/* =====================================================================
   Fitness Tracker — tool registry.
   Every tool registers itself here. The shell (main.js) knows nothing
   about any individual tool; it iterates this list.
   ===================================================================== */

const TOOLS = [];

function registerTool(tool) {
  TOOLS.push(tool);
}

function toolById(id) {
  return TOOLS.find(t => t.id === id) || null;
}