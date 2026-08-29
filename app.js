import {
  adjacentViolations, analysisToDisplayPoint, appendVerificationEvent, applyHomography, calibrationFactor, clamp, cutIsEditable, cutPositions, displayPlan, displayToAnalysisPoint, measurementConfidence,
  combineMeasurements, compactRecoveryPoints, compareMeasurements, compareRecordSet, createLocalId, createRecordRevision, createRecoveryCheckpoint, depthCandidates, detectCalibrationMarker, estimateCutSamples, evaluateGoldenMeasurementFixture, fieldValidationResult, filterSortRecords, fitLine, imageQualityMetrics, localEdgeDefinition, measurementsToCsv, migrateRecord, nearestDepth, normalizeValidationStudy, parseProject, parseRecordsArchive, parseValidationStudiesArchive, performanceAssessment, perspectiveMagnitude, photoCutConfidence, privacyAudit, projectStorageHealth,
  pixelsPerMillimeter, multiplyMatrix3, orientationPlan, rectificationPlan, reverseBitting, rgbaToGrayscale, segmentBlade, serializeProject, transformGeometryModel, withoutImageData,
  measurementReportHtml, measurementReportModel, recordsArchive, sanitizedImageExportPlan, transformMeasurementGrid, validationProgramSummary, validationStudiesArchive, validationStudiesCsv, validationStudyReportHtml, verificationReadiness, verificationSummary, worksheetHtml,
} from "./logic.js?v=1.9.3";
import { GOLDEN_MEASUREMENT_FIXTURE } from "./validation-fixture.js?v=1.9.3";

const VERSION = "1.9.3";
const STORAGE_KEY = "keygauge.project.v1";
const ACK_KEY = "keygauge.authorized.v1";
const LAST_SESSION_LIMIT = 750_000;
const STORAGE_SOFT_LIMIT = 3_500_000;

const VERIFICATION_REASONS = [
  ["", "Select reason"], ["visible-match", "Visible contour matches"], ["manual-correction", "Manual contour correction"], ["wear-rounding", "Wear or rounded cut"],
  ["blur-focus", "Blur or focus limitation"], ["glare-shadow", "Glare or shadow"], ["ambiguous-code", "Ambiguous neighboring code"], ["obscured-edge", "Obscured blade edge"], ["other", "Other documented reason"],
];

const DEMO_PROFILES = [
  {
    id: "demo-5-shoulder", name: "Demonstration 5-pin Shoulder", manufacturer: "Demonstration only",
    blanks: "DEMO-A", cutCount: 5, firstCut: 4.8, spacing: 4.5, stop: "shoulder",
    tolerance: 0.14, depthMap: { 0: 0, 1: 0.32, 2: 0.64, 3: 0.96, 4: 1.28, 5: 1.6, 6: 1.92, 7: 2.24, 8: 2.56, 9: 2.88 },
    maxAdjacent: 7, verified: false, kind: "demonstration", revision: "2026-08-28",
    source: "Illustrative dimensions created for software demonstration; not a manufacturer specification.",
    notes: "Replace with dimensions from an authorized, verified source before professional use.",
  },
  {
    id: "demo-6-tip", name: "Demonstration 6-pin Tip", manufacturer: "Demonstration only",
    blanks: "DEMO-B", cutCount: 6, firstCut: 5.2, spacing: 4.1, stop: "tip",
    tolerance: 0.12, depthMap: { 0: 0, 1: 0.28, 2: 0.56, 3: 0.84, 4: 1.12, 5: 1.4, 6: 1.68, 7: 1.96, 8: 2.24 },
    maxAdjacent: 6, verified: false, kind: "demonstration", revision: "2026-08-28",
    source: "Illustrative dimensions created for software demonstration; not a manufacturer specification.",
    notes: "Tip-stop demonstration profile.",
  },
];

const defaultState = () => ({
  version: VERSION,
  settings: { theme: "dark", mode: "easy", uiScale: 1 },
  calibration: null,
  profiles: structuredClone(DEMO_PROFILES),
  activeProfileId: DEMO_PROFILES[0].id,
  screen: { orientation: "ltr", alignment: "shoulder", locked: false, depths: [0.64, 0.96, 1.28, 0.96, 0.64], rotation: 0, offsetX: 0, offsetY: 0, pan: 0, overlay: { color: "#d9a84e", opacity: 0.9, thickness: 3 } },
  photo: { geometryVersion: 5, coordinateSpace: "oriented-source", scaleMethod: "card", knownDistance: 85.6, ppm: null, calibrated: false, scalePoints: [], corners: [], baseline: null, reference: null, cuts: [], crop: null, rotation: 0, mirror: false, exposure: 0, contrast: 110, edgeVisibility: 30, polarity: "auto", quality: null, marker: null, segmentation: null, activeEdge: "top", edgeAnalyses: { top: [], bottom: [] }, edgeGeometry: { top: { baseline: null, reference: null }, bottom: { baseline: null, reference: null } }, verificationAcknowledged: false, verification: { finalized: false, finalizedAt: null, warningsAcknowledged: false, protectAccepted: true, sessionNote: "", log: [] }, correction: { scaleX: 1, scaleY: 1, keystone: 0, accepted: false, magnitude: 0, residual: null, downsample: 1 }, history: [], future: [] },
  currentRecord: { id: null, name: "Untitled key measurement", reference: "", anonymousId: "", tags: [], notes: "", method: null, cuts: [], createdAt: null },
  records: [],
  validationStudies: [],
  recordView: { search: "", method: "all", status: "all", tags: "", sort: "updated-desc", savedViews: [] },
  recoveryPoints: [],
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const UNSAFE_MERGE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const deepMerge = (base, saved) => {
  if (!saved || typeof saved !== "object") return base;
  for (const [key, value] of Object.entries(saved)) {
    if (UNSAFE_MERGE_KEYS.has(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) deepMerge(base[key], value);
    else base[key] = value;
  }
  return base;
};

let state = defaultState();
try { state = deepMerge(defaultState(), JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")); } catch { state = defaultState(); }
state.version = VERSION; state.records = (state.records || []).map(migrateRecord); state.validationStudies = (state.validationStudies || []).map(normalizeValidationStudy); state.currentRecord = state.currentRecord?.id ? migrateRecord(state.currentRecord) : state.currentRecord; state.recoveryPoints = compactRecoveryPoints(state.recoveryPoints || []);
let saveTimer = null;
let toastTimer = null;
let storageTimer = null;
let recordEditorDirty = false;
let deferredInstallPrompt = null;
let reloadingForServiceWorker = false;
let photoImage = null;
let photoDrag = null;
let activePhotoHandle = null;
let photoDisplay = null;
let orientedSurface = null;
let correctedSurface = null;
let orientationGeometry = null;
let correctionGeometry = null;
let preCorrectionSnapshot = null;
let fullResolutionPopup = null;
let visionRaster = null;
let activeScreenCut = 0;
let validationRun = null;
let performanceRun = null;
let capabilityRun = null;
let privacyRun = null;
let activeValidationStudyId = null;
let fieldValidationPreview = null;

function toast(message) {
  const node = $("#toast"); node.textContent = message; node.classList.add("show");
  const announcer = $("#app-announcer"); if (announcer) { announcer.textContent = ""; requestAnimationFrame(() => { announcer.textContent = message; }); }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
}

function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes))) return "Unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function persistedState() {
  const safeState = structuredClone(state);
  safeState.photo = withoutImageData(safeState.photo);
  safeState.recoveryPoints = compactRecoveryPoints(safeState.recoveryPoints || []);
  return safeState;
}

function setStorageWarning(message = "") {
  const warning = $("#storage-warning"); if (!warning) return;
  warning.classList.toggle("hidden", !message); $("#storage-warning-text").textContent = message;
}

async function updateStorageHealth(serialized = null) {
  const projectText = serialized || JSON.stringify(persistedState()), estimate = await navigator.storage?.estimate?.().catch(() => null), health = projectStorageHealth(projectText, { softLimit: STORAGE_SOFT_LIMIT, quota: estimate?.quota });
  const lamp = $("#storage-state"), project = $("#storage-project-size"), browser = $("#storage-browser-usage"), persistence = $("#storage-persistence");
  if (project) project.textContent = formatBytes(health.bytes);
  if (browser) browser.textContent = estimate?.quota ? `${formatBytes(estimate.usage || 0)} of ${formatBytes(estimate.quota)}` : "Browser estimate unavailable";
  if (persistence) persistence.textContent = await navigator.storage?.persisted?.().catch(() => false) ? "Protected from routine eviction" : "Best-effort browser storage";
  if (lamp) { lamp.classList.toggle("safe", health.level === "healthy"); lamp.classList.toggle("danger", health.level === "critical"); lamp.innerHTML = `<i></i> ${health.level === "healthy" ? "STORAGE OK" : health.level === "warning" ? "STORAGE WATCH" : "STORAGE CRITICAL"}`; }
  if (health.level === "critical") setStorageWarning("Local project storage is near its safe limit. Export a project backup and remove unneeded recovery checkpoints before continuing.");
}

function scheduleStorageHealthUpdate(serialized = null) {
  clearTimeout(storageTimer); storageTimer = setTimeout(() => updateStorageHealth(serialized), 120);
}

function persistEmergencyRecovery() {
  try {
    const compact = persistedState(); compact.recoveryPoints = []; compact.records = compact.records.map((record) => ({ ...record, revisions: record.revisions.slice(-3) }));
    const serialized = JSON.stringify(compact); if (new TextEncoder().encode(serialized).byteLength <= 1_500_000) localStorage.setItem(`${STORAGE_KEY}.recovery`, serialized);
  } catch { /* Primary data remains untouched when a compact recovery copy cannot be written. */ }
}

function verificationState() {
  state.photo.verification ||= structuredClone(defaultState().photo.verification);
  return state.photo.verification;
}

function logVerification(event) {
  const verification = verificationState(); verification.log = appendVerificationEvent(verification.log, { edge: state.photo.activeEdge, ...event });
}

function invalidateFinalVerification(reason = "Measurement evidence changed") {
  const verification = verificationState();
  if (verification.finalized) logVerification({ field: "finalization", before: "finalized", after: "draft", reason });
  verification.finalized = false; verification.finalizedAt = null; verification.warningsAcknowledged = false; state.photo.verificationAcknowledged = false;
}

function canEditPhotoCut(index, notify = true) {
  const cut = state.photo.cuts[index], editable = cutIsEditable(cut, verificationState().protectAccepted);
  if (!editable && notify) toast(`Cut ${index + 1} is accepted and protected. Change its decision to Review or turn off Protect accepted cuts before editing.`);
  return editable;
}

function scheduleSave() {
  const lamp = $("#autosave-state"); lamp.innerHTML = "<i></i> UNSAVED";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    lamp.innerHTML = "<i></i> SAVING";
    try {
      const safeState = persistedState(), serialized = JSON.stringify(safeState), previous = localStorage.getItem(STORAGE_KEY), previousBytes = previous ? new TextEncoder().encode(previous).byteLength : 0;
      state.recoveryPoints = safeState.recoveryPoints;
      try { if (previous && previous !== serialized && previousBytes <= LAST_SESSION_LIMIT) localStorage.setItem(`${STORAGE_KEY}.last`, previous); else if (previousBytes > LAST_SESSION_LIMIT) localStorage.removeItem(`${STORAGE_KEY}.last`); } catch { /* Preserve capacity for the authoritative save. */ }
      localStorage.setItem(STORAGE_KEY, serialized); setStorageWarning(""); scheduleStorageHealthUpdate(serialized);
      setTimeout(() => { lamp.classList.remove("danger"); lamp.innerHTML = "<i></i> SAVED"; }, 180);
    } catch (error) {
      lamp.classList.add("danger"); lamp.innerHTML = "<i></i> SAVE FAILED"; setStorageWarning("KEYGAUGE could not save this change. Your previous saved project remains intact. Export a backup now, then remove unneeded checkpoints or browser data.");
      toast(error?.name === "QuotaExceededError" ? "Local storage is full. This change was not saved." : "This change could not be saved locally.");
    }
  }, 420);
}

function profile() { return state.profiles.find((item) => item.id === state.activeProfileId) || state.profiles[0]; }
function makeCuts(depths = state.screen.depths, calibrated = Boolean(state.calibration), photoFactors = null) {
  const p = profile();
  return Array.from({ length: p.cutCount }, (_, index) => {
    const depth = Number(depths[index] ?? 0);
    const match = nearestDepth(depth, p.depthMap);
    const confidence = measurementConfidence({ calibrated, delta: match.difference, tolerance: p.tolerance, resolution: photoFactors?.resolution ?? 1, contrast: photoFactors?.contrast ?? 1, perspective: photoFactors?.perspective ?? 0, confirmed: photoFactors?.confirmed?.includes(index), readable: !photoFactors?.unreadable?.includes(index) });
    return { position: index + 1, depth, code: match.code, difference: match.difference, ambiguity: match.ambiguity, outOfRange: match.outOfRange, confidence, status: photoFactors?.unreadable?.includes(index) ? "unreadable" : photoFactors?.confirmed?.includes(index) ? "accepted" : "estimated" };
  });
}

function showView(name, pushHash = true) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $$(".nav-item").forEach((item) => { const active = item.dataset.view === name; item.classList.toggle("active", active); if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current"); });
  $("#side-rail").classList.remove("open");
  $("#mobile-menu").setAttribute("aria-expanded", "false");
  if (pushHash) history.replaceState(null, "", `#${name}`);
  if (name === "screen") { renderScreen(); setTimeout(renderScreen, 40); }
  if (name === "photo") { setTimeout(renderPhoto, 40); }
  if (name === "records") renderRecords();
  if (name === "profiles") renderProfiles();
  if (name === "validation") renderValidationWorkbench();
  $("#workspace").focus({ preventScroll: true }); $("#view-announcer").textContent = `${$("#view-" + name + " h1, #view-" + name + " h2")?.textContent || name} view`;
}

function applySettings() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.style.setProperty("--ui-scale", state.settings.uiScale || 1);
  document.body.classList.toggle("advanced", state.settings.mode === "advanced");
  $("#theme-select").value = state.settings.theme;
  $("#mode-select").value = state.settings.mode;
}

function refreshProfileSelects() {
  $$(".profile-select").forEach((select) => {
    select.innerHTML = state.profiles.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.kind === "demonstration" ? " · DEMO" : p.verified ? " · VERIFIED" : " · USER"}</option>`).join("");
    select.value = state.activeProfileId;
  });
  $("#home-profile").textContent = profile().name;
}

function escapeHtml(value) { const div = document.createElement("div"); div.textContent = String(value ?? ""); return div.innerHTML; }
function escapeAttribute(value) { return escapeHtml(value).replaceAll('"', "&quot;"); }

function calibrationReference() {
  const active = $("[data-calref].active")?.dataset.calref || "card";
  if (active === "quarter") return { width: 24.26, height: 24.26, label: "24.26 mm diameter", shape: "quarter-shape" };
  if (active === "custom") return { width: Number($("#custom-cal-width").value), height: Number($("#custom-cal-height").value), label: "Custom reference", shape: "card-shape" };
  return { width: 85.6, height: 53.98, label: "85.60 × 53.98 mm", shape: "card-shape" };
}

function renderCalibrationOutline() {
  const outline = $("#reference-outline");
  outline.style.width = `${$("#cal-width").value}px`; outline.style.height = `${$("#cal-height").value}px`;
  outline.classList.remove("card-shape", "quarter-shape"); const ref = calibrationReference(); outline.classList.add(ref.shape); outline.textContent = ref.label;
  $("#cal-width-output").textContent = `${$("#cal-width").value} px`; $("#cal-height-output").textContent = `${$("#cal-height").value} px`;
  $("#custom-cal-fields").classList.toggle("hidden", $("[data-calref].active")?.dataset.calref !== "custom");
}

function renderCalibrationStatus() {
  const cal = state.calibration;
  const chip = $("#calibration-chip"), warning = $("#screen-cal-warning"), lamp = $("#cal-status");
  if (cal) {
    chip.textContent = "SCREEN CALIBRATED · ESTIMATE"; chip.classList.remove("warn"); warning.classList.add("hidden");
    lamp.classList.add("safe"); lamp.innerHTML = "<i></i> CALIBRATED";
    $("#cal-x-factor").textContent = cal.mmPerCssX.toFixed(5); $("#cal-y-factor").textContent = cal.mmPerCssY.toFixed(5); $("#cal-confidence").textContent = cal.confidence; $("#cal-dpr").textContent = cal.devicePixelRatio.toFixed(2);
    $("#verification-ruler").style.width = `${10 / cal.mmPerCssX}px`;
  } else {
    chip.textContent = "SCREEN NOT CALIBRATED"; chip.classList.add("warn"); warning.classList.remove("hidden");
    lamp.classList.remove("safe"); lamp.innerHTML = "<i></i> NOT CALIBRATED";
    $("#cal-x-factor").textContent = "—"; $("#cal-y-factor").textContent = "—"; $("#cal-confidence").textContent = "Not set"; $("#cal-dpr").textContent = devicePixelRatio.toFixed(2); $("#verification-ruler").style.width = "160px";
  }
}

function saveCalibration() {
  const ref = calibrationReference();
  try {
    state.calibration = { method: $("[data-calref].active").dataset.calref, mmPerCssX: calibrationFactor(ref.width, $("#cal-width").value), mmPerCssY: calibrationFactor(ref.height, $("#cal-height").value), confidence: $("[data-calref].active").dataset.calref === "custom" ? "User reference" : "Reference matched", devicePixelRatio, innerWidth, innerHeight, screenWidth: screen.width, screenHeight: screen.height, orientation: screen.orientation?.type || "unknown", savedAt: new Date().toISOString() };
    renderCalibrationStatus(); renderScreen(); scheduleSave(); toast("Screen calibration saved locally.");
  } catch (error) { toast(error.message); }
}

function checkCalibrationEnvironment() {
  if (!state.calibration) return;
  const cal = state.calibration;
  const changed = Math.abs(cal.devicePixelRatio - devicePixelRatio) > 0.02 || cal.screenWidth !== screen.width || cal.screenHeight !== screen.height || cal.orientation !== (screen.orientation?.type || "unknown");
  if (changed) {
    $("#screen-cal-warning").classList.remove("hidden");
    $("#screen-cal-warning").firstChild.textContent = "Display, orientation, or zoom conditions changed. Recalibration is recommended. ";
    $("#calibration-chip").textContent = "RECALIBRATION RECOMMENDED"; $("#calibration-chip").classList.add("warn");
  }
}

function normalizeScreenDepths() {
  const p = profile(); const codes = Object.values(p.depthMap).map(Number); const mid = codes[Math.floor(codes.length / 3)] || 0;
  state.screen.depths = Array.from({ length: p.cutCount }, (_, i) => Number(state.screen.depths[i] ?? mid));
}

function renderScreen() {
  normalizeScreenDepths();
  const p = profile();
  const mmX = state.calibration?.mmPerCssX || 0.264583; const mmY = state.calibration?.mmPerCssY || 0.264583;
  const svg = $("#blade-svg"); const stageWidth = Math.max(320, $("#blade-stage").clientWidth || 800); const height = 360;
  svg.setAttribute("viewBox", `0 0 ${stageWidth} ${height}`); svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
  const positions = cutPositions(p, state.screen.orientation);
  const maxPos = Math.max(...positions, 20); const bladePx = (maxPos + 12) / mmX; const start = 88 + Number(state.screen.offsetX) + Number(state.screen.pan); const baseline = 235 + Number(state.screen.offsetY);
  const dir = state.screen.orientation === "rtl" ? -1 : 1; const anchor = dir === 1 ? start : Math.min(stageWidth - 80, start + bladePx);
  const orderedCuts = makeCuts(); const points = positions.map((pos, index) => ({ x: anchor + dir * (pos / mmX), y: baseline - orderedCuts[index].depth / mmY }));
  const color = state.screen.overlay.color; const opacity = state.screen.overlay.opacity; const thick = state.screen.overlay.thickness;
  const tipX = anchor + dir * bladePx; const shoulderX = anchor; const topY = baseline - 12 / mmY;
  const pathPoints = [{ x: anchor, y: baseline - 4 / mmY }, ...points, { x: tipX, y: baseline - 2 / mmY }];
  const path = pathPoints.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  svg.innerHTML = `<g transform="rotate(${state.screen.rotation} ${stageWidth / 2} ${height / 2})" opacity="${opacity}">
    <path d="M${anchor},${baseline} L${tipX},${baseline} L${tipX},${topY + 20} ${path} L${anchor},${topY} Z" fill="${color}10" stroke="${color}" stroke-width="${thick}"/>
    <line x1="${Math.min(anchor, tipX) - 25}" y1="${baseline}" x2="${Math.max(anchor, tipX) + 25}" y2="${baseline}" stroke="${color}" stroke-width="${thick}" stroke-dasharray="9 6"/>
    <line x1="${shoulderX}" y1="${topY - 20}" x2="${shoulderX}" y2="${baseline + 35}" stroke="${state.screen.alignment === "shoulder" ? color : "#777"}" stroke-width="${thick}"/>
    <path d="M${tipX - dir * 10},${baseline + 28} L${tipX},${baseline + 10} L${tipX + dir * 10},${baseline + 28}" fill="none" stroke="${state.screen.alignment === "tip" ? color : "#777"}" stroke-width="${thick}"/>
    ${points.map((point, index) => `<g class="svg-cut" data-index="${index}"><line x1="${point.x}" y1="${topY - 22}" x2="${point.x}" y2="${baseline + 22}" stroke="${color}" stroke-width="1" stroke-dasharray="4 5"/><circle cx="${point.x}" cy="${point.y}" r="${activeScreenCut === index ? 8 : 5}" fill="#111" stroke="${color}" stroke-width="${activeScreenCut === index ? 3 : 2}"/><text x="${point.x}" y="${baseline + 38}" fill="${color}" text-anchor="middle" font-family="monospace" font-size="11">${index + 1}:${orderedCuts[index].code}</text></g>`).join("")}
    <g fill="${color}" font-family="monospace" font-size="10"><text x="${Math.min(anchor, tipX)}" y="${baseline + 58}">${state.screen.alignment === "shoulder" ? "SHOULDER REFERENCE" : "TIP-STOP REFERENCE"}</text><text x="${Math.min(anchor, tipX)}" y="${topY - 30}">${p.kind === "demonstration" ? "DEMONSTRATION PROFILE · UNVERIFIED DIMENSIONS" : escapeHtml(p.name)}</text></g>
  </g>`;
  renderCutSliders(orderedCuts); renderResults("screen", orderedCuts); renderMagnifier(points[activeScreenCut], baseline, orderedCuts[activeScreenCut]);
  $("#home-result").textContent = orderedCuts.map((cut) => cut.code).join(" "); $("#home-method").textContent = "On-screen physical alignment";
}

function renderCutSliders(cuts) {
  const p = profile(), values = Object.values(p.depthMap).map(Number), min = Math.min(...values), max = Math.max(...values);
  $("#cut-slider-list").innerHTML = cuts.map((cut, index) => `<div class="cut-slider ${index === activeScreenCut ? "active" : ""}" data-cut="${index}"><strong>CUT ${index + 1}</strong><button data-nudge="-1" aria-label="Decrease cut ${index + 1}">−</button><input aria-label="Cut ${index + 1} depth" type="range" min="${min}" max="${max}" step="0.01" value="${cut.depth.toFixed(2)}"><button data-nudge="1" aria-label="Increase cut ${index + 1}">＋</button><output>${cut.depth.toFixed(2)} mm</output><span class="code-pill">${cut.code}</span><span class="delta">${cut.difference >= 0 ? "+" : ""}${cut.difference.toFixed(2)}</span></div>`).join("");
}

function renderMagnifier(point, baseline, cut) {
  if (!point || !cut) return; const canvas = $("#screen-magnifier canvas"), ctx = canvas.getContext("2d"), color = state.screen.overlay.color;
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#10110e"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 85); ctx.lineTo(95, 85); ctx.lineTo(120, 35); ctx.lineTo(145, 85); ctx.lineTo(240, 85); ctx.stroke(); ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(120, 4); ctx.lineTo(120, 115); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = "13px monospace"; ctx.fillText(`CUT ${cut.position}  ${cut.depth.toFixed(2)} mm  CODE ${cut.code}`, 8, 18);
}

function renderResults(mode, cuts) {
  const p = profile(); const target = mode === "photo" ? $("#photo-results") : $("#screen-results");
  const calibrated = mode === "photo" ? state.photo.calibrated : Boolean(state.calibration);
  const violations = adjacentViolations(cuts.map((cut) => cut.code), p.maxAdjacent ?? Infinity, p.minAdjacent ?? 0);
  const unreadable = cuts.filter((cut) => cut.status === "unreadable").length; const average = Math.round(cuts.reduce((sum, cut) => sum + cut.confidence.score, 0) / Math.max(1, cuts.length));
  const label = !calibrated ? "Uncalibrated" : unreadable ? "Review required" : average >= 82 ? "High confidence" : average >= 58 ? "Review recommended" : "Ambiguous";
  const edgeOverview = mode === "photo" ? ["top", "bottom"].filter((edge) => state.photo.edgeAnalyses?.[edge]?.length).map((edge) => { const edgeCuts = photoCutsFor(state.photo.edgeAnalyses[edge]); return `<div class="edge-sequence ${edge === state.photo.activeEdge ? "active" : ""}"><b>${edge === "top" ? "TOP EDGE" : "BOTTOM EDGE"}</b><span>${edgeCuts.map((cut) => cut.status === "unreadable" ? "?" : escapeHtml(cut.code)).join(" · ")}</span></div>`; }).join("") : "";
  target.innerHTML = `<h3>${mode === "photo" ? "PHOTO-DERIVED RESULT" : "ESTIMATED BITTING"}</h3>${edgeOverview ? `<div class="edge-sequences">${edgeOverview}</div>` : ""}<div class="bitting-sequence">${cuts.map((cut) => `<span title="${escapeHtml(cut.confidence.label)}">${cut.status === "unreadable" ? "?" : escapeHtml(cut.code)}</span>`).join("")}</div><div class="results-meta"><div><span>Overall confidence</span><strong class="${average >= 82 ? "confidence-high" : average >= 58 ? "confidence-review" : "confidence-low"}">${label} · ${average}%</strong></div><div><span>Profile</span><strong>${escapeHtml(p.name)}</strong></div><div><span>Profile status</span><strong>${p.kind === "demonstration" ? "Demonstration / unverified" : p.verified ? "Verified" : "User-defined"}</strong></div><div><span>Alignment</span><strong>${mode === "photo" ? $("#photo-alignment").value : state.screen.alignment} stop</strong></div><div><span>Calibration</span><strong>${calibrated ? mode === "photo" ? `${state.photo.ppm.toFixed(3)} px/mm` : "Screen reference matched" : "Uncalibrated"}</strong></div>${mode === "photo" ? `<div><span>Active edge</span><strong>${state.photo.activeEdge === "top" ? "Top" : "Bottom"}</strong></div><div><span>Photo quality</span><strong>${photoQualityLabel()}</strong></div><div><span>Perspective</span><strong>${state.photo.correction.accepted ? `Projective correction · ${Number(state.photo.correction.residual || 0).toFixed(3)} px residual` : "Not applied"}</strong></div><div><span>Analysis space</span><strong>${state.photo.coordinateSpace === "corrected" ? "Corrected image coordinates" : "Oriented source coordinates"}</strong></div>` : ""}</div><ul class="warning-list">${!calibrated ? "<li>Physical depth precision is not supported without calibration.</li>" : ""}${p.kind === "demonstration" ? "<li>Demonstration profile dimensions must be replaced before professional use.</li>" : ""}${violations.length ? `<li>${violations.length} adjacent-cut rule warning(s).</li>` : ""}${cuts.some((cut) => cut.ambiguity > .72) ? "<li>One or more cuts are ambiguous between neighboring codes.</li>" : ""}${unreadable ? `<li>${unreadable} cut(s) marked unreadable.</li>` : ""}</ul>${mode === "photo" ? "<p class=\"report-notation\">This bitting was estimated from a photograph using user-supplied scale and alignment references. Verify all measurements using appropriate professional locksmith tools before cutting a key or servicing a lock.</p>" : ""}`;
  return { average, label, violations };
}

function updateScreenDepth(index, value, snap = false) {
  let depth = Number(value); if (snap) depth = nearestDepth(depth, profile().depthMap).depth;
  state.screen.depths[index] = depth; activeScreenCut = index; scheduleSave(); renderScreen();
}

async function loadPhoto(file) {
  if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type)) { toast("Choose a JPEG, PNG, or WebP image."); return; }
  if (file.size > 40 * 1024 * 1024) { toast("This image is too large for dependable local processing."); return; }
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const image = new Image(); image.onload = () => {
    photoImage = image;
    state.photo = { ...defaultState().photo, scaleMethod: state.photo.scaleMethod, knownDistance: state.photo.knownDistance };
    orientedSurface = null; correctedSurface = null; orientationGeometry = null; correctionGeometry = null; preCorrectionSnapshot = null; visionRaster = null; activePhotoHandle = null;
    rebuildOrientedSurface();
    $("#photo-workspace").classList.remove("hidden"); $("#photo-dropzone").classList.add("has-image"); $("#photo-results-wrap").classList.add("hidden"); $("#method-comparison").classList.add("hidden");
    $("#photo-storage-status").textContent = "A photograph is held in memory for this measurement and is not saved to local storage.";
    setPhotoWorkflow(1); renderPhoto(); runPhotoPreflight(); toast("Image loaded and checked locally. It has not been uploaded or saved.");
  }; image.onerror = () => toast("The selected image could not be decoded."); image.src = dataUrl;
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height)); return canvas;
}

function rebuildOrientedSurface() {
  if (!photoImage) return;
  orientationGeometry = orientationPlan(photoImage.naturalWidth, photoImage.naturalHeight, state.photo.rotation, state.photo.mirror);
  orientedSurface = createCanvas(orientationGeometry.width, orientationGeometry.height);
  const ctx = orientedSurface.getContext("2d", { willReadFrequently: true }); const m = orientationGeometry.matrix;
  ctx.setTransform(m[0], m[3], m[1], m[4], m[2], m[5]); ctx.drawImage(photoImage, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function getAnalysisSurface() { return correctedSurface || orientedSurface; }

function buildVisionRaster(force = false) {
  const surface = getAnalysisSurface(); if (!surface) return null;
  if (!force && visionRaster?.source === surface) return visionRaster;
  const maximum = 1100, scale = Math.min(1, maximum / Math.max(surface.width, surface.height)), width = Math.max(2, Math.round(surface.width * scale)), height = Math.max(2, Math.round(surface.height * scale)), canvas = createCanvas(width, height), context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(surface, 0, 0, width, height); const imageData = context.getImageData(0, 0, width, height), gray = rgbaToGrayscale(imageData.data);
  visionRaster = { source: surface, canvas, width, height, gray, scaleX: surface.width / width, scaleY: surface.height / height, quality: imageQualityMetrics(gray, width, height), segmentation: null, marker: null, maskCanvas: null };
  return visionRaster;
}

const rasterToAnalysis = (point) => ({ x: point.x * visionRaster.scaleX, y: point.y * visionRaster.scaleY });

function runPhotoPreflight(force = false) {
  if (!photoImage) return;
  const raster = buildVisionRaster(false), surface = getAnalysisSurface(); if (force) raster.quality = imageQualityMetrics(raster.gray, raster.width, raster.height); const quality = raster.quality, megapixels = surface.width * surface.height / 1_000_000;
  const effectiveResolution = clamp(Math.min(surface.width, surface.height) / 1400, 0, 1), overall = Math.round(quality.score * .78 + effectiveResolution * 22);
  state.photo.quality = { ...quality, effectiveResolution, megapixels, score: overall, label: overall >= 76 ? "Good" : overall >= 48 ? "Review recommended" : "Retake recommended" };
  renderPhotoQuality(); scheduleSave();
}

function makeMaskCanvas(mask, width, height) {
  const canvas = createCanvas(width, height), context = canvas.getContext("2d"), image = context.createImageData(width, height);
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) { const offset = index * 4; image.data[offset] = 66; image.data[offset + 1] = 226; image.data[offset + 2] = 170; image.data[offset + 3] = 86; }
  context.putImageData(image, 0, 0); return canvas;
}

function storeActiveEdgeGeometry() {
  const edge = state.photo.activeEdge || "top";
  state.photo.edgeAnalyses[edge] = structuredClone(state.photo.cuts || []);
  state.photo.edgeGeometry[edge] = { baseline: structuredClone(state.photo.baseline), reference: structuredClone(state.photo.reference) };
}

function loadEdgeGeometry(edge) {
  if (!edge || edge === "both") return;
  if (state.photo.cuts?.length) storeActiveEdgeGeometry();
  state.photo.activeEdge = edge;
  state.photo.cuts = structuredClone(state.photo.edgeAnalyses[edge] || []);
  const geometry = state.photo.edgeGeometry[edge] || {};
  if (geometry.baseline) state.photo.baseline = structuredClone(geometry.baseline);
  if (geometry.reference) state.photo.reference = structuredClone(geometry.reference);
}

function bladeBaselineFor(edge, segmentation) {
  const opposite = edge === "top" ? segmentation.bottomEdge : segmentation.topEdge;
  const margin = Math.max(2, Math.round(opposite.length * .08)), trimmed = opposite.slice(margin, Math.max(margin + 2, opposite.length - margin));
  const fitted = fitLine(trimmed.length >= 2 ? trimmed : opposite);
  return [rasterToAnalysis(fitted.start), rasterToAnalysis(fitted.end)];
}

function bladeReferenceFor(edge, segmentation) {
  const component = segmentation.component, alignment = $("#photo-alignment").value, x = alignment === "tip" ? (segmentation.references?.tipX ?? component.maxX) : (segmentation.references?.shoulderX ?? component.minX), baseline = bladeBaselineFor(edge, segmentation), line = fitLine(baseline), analysisX = x * visionRaster.scaleX;
  return { x: analysisX, y: line.slope * analysisX + line.intercept };
}

function runBladeSegmentation(showToast = true) {
  if (!photoImage) { toast("Load a photograph first."); return null; }
  const raster = buildVisionRaster(), thresholdOffset = Number($("#segmentation-sensitivity").value || 0), segmentation = segmentBlade(raster.gray, raster.width, raster.height, { polarity: $("#segmentation-polarity").value, thresholdOffset, cleanupPasses: Number($("#segmentation-cleanup").value || 1) });
  if (!segmentation.found) { state.photo.segmentation = { found: false, confidence: 0 }; if (showToast) toast(segmentation.reason); renderPhoto(); return null; }
  raster.segmentation = segmentation; raster.maskCanvas = makeMaskCanvas(segmentation.mask, raster.width, raster.height);
  state.photo.polarity = segmentation.polarity; state.photo.segmentation = { found: true, confidence: segmentation.confidence, polarity: segmentation.polarity, threshold: segmentation.threshold, likelyBittedEdge: segmentation.likelyBittedEdge, references: segmentation.references, bounds: { x: segmentation.component.minX * raster.scaleX, y: segmentation.component.minY * raster.scaleY, width: segmentation.component.width * raster.scaleX, height: segmentation.component.height * raster.scaleY }, topRoughness: segmentation.topRoughness, bottomRoughness: segmentation.bottomRoughness };
  const selected = $("#photo-edge-side").value === "both" ? segmentation.likelyBittedEdge : $("#photo-edge-side").value;
  state.photo.activeEdge = selected; state.photo.baseline = bladeBaselineFor(selected, segmentation); state.photo.reference = bladeReferenceFor(selected, segmentation); state.photo.edgeGeometry[selected] = { baseline: structuredClone(state.photo.baseline), reference: structuredClone(state.photo.reference) };
  renderPhoto(); if (showToast) toast(`Blade segmented locally. ${segmentation.likelyBittedEdge === "top" ? "Top" : "Bottom"} edge appears more likely to be bitted; verify the overlay.`); scheduleSave(); return segmentation;
}

function currentSourceToAnalysisMatrix() {
  if (!orientationGeometry) return null;
  return correctionGeometry ? multiplyMatrix3(correctionGeometry.matrix, orientationGeometry.matrix) : orientationGeometry.matrix;
}

function analysisToSourcePoint(point) {
  if (!orientationGeometry) return point;
  const orientedPoint = correctionGeometry ? applyHomography(correctionGeometry.inverse, point) : point;
  return applyHomography(orientationGeometry.inverse, orientedPoint);
}

function mapPhotoGeometry(matrix) {
  const mapped = transformGeometryModel(geometrySnapshot(), matrix);
  for (const key of ["scalePoints", "corners", "baseline", "reference", "cuts", "crop", "edgeAnalyses", "edgeGeometry"]) state.photo[key] = mapped[key];
}

function geometrySnapshot() {
  return structuredClone({ scalePoints: state.photo.scalePoints, corners: state.photo.corners, baseline: state.photo.baseline, reference: state.photo.reference, cuts: state.photo.cuts, crop: state.photo.crop, ppm: state.photo.ppm, calibrated: state.photo.calibrated, edgeAnalyses: state.photo.edgeAnalyses, edgeGeometry: state.photo.edgeGeometry, activeEdge: state.photo.activeEdge });
}

function restoreGeometry(snapshot) {
  if (!snapshot) return;
  for (const key of ["scalePoints", "corners", "baseline", "reference", "cuts", "crop", "ppm", "calibrated", "edgeAnalyses", "edgeGeometry", "activeEdge"]) if (snapshot[key] !== undefined) state.photo[key] = structuredClone(snapshot[key]);
}

function reorientPhoto(rotation, mirror) {
  if (!photoImage) return;
  const oldSourceToAnalysis = currentSourceToAnalysisMatrix();
  const oldAnalysisToSource = correctionGeometry ? multiplyMatrix3(orientationGeometry.inverse, correctionGeometry.inverse) : orientationGeometry.inverse;
  state.photo.rotation = rotation; state.photo.mirror = mirror; correctedSurface = null; correctionGeometry = null; preCorrectionSnapshot = null; visionRaster = null; state.photo.segmentation = null; state.photo.correction = defaultState().photo.correction; state.photo.coordinateSpace = "oriented-source";
  rebuildOrientedSurface();
  if (oldSourceToAnalysis && state.photo.scalePoints.length) mapPhotoGeometry(multiplyMatrix3(orientationGeometry.matrix, oldAnalysisToSource));
  recalculatePhotoScale(); reflowPhotoCuts(); renderPhoto(); runPhotoPreflight(); scheduleSave();
}

function recalculatePhotoScale() {
  if (!state.photo.calibrated || state.photo.scalePoints.length !== 2) return;
  try { state.photo.ppm = pixelsPerMillimeter(state.photo.scalePoints[0], state.photo.scalePoints[1], state.photo.knownDistance); } catch { state.photo.ppm = null; state.photo.calibrated = false; }
}

function setPhotoWorkflow(step) {
  $$(".photo-workflow span").forEach((item, index) => { item.classList.toggle("done", index < step); item.classList.toggle("active", index === step); });
}

function renderPhoto() {
  if (!photoImage) return;
  if (!orientedSurface) rebuildOrientedSurface();
  const surface = getAnalysisSurface(); const canvas = $("#photo-canvas"), wrap = $("#photo-dropzone"), maxW = Math.max(320, Math.min(1100, wrap.clientWidth - 4));
  photoDisplay = displayPlan(surface.width, surface.height, maxW, 720, state.photo.crop);
  canvas.width = photoDisplay.displayWidth; canvas.height = photoDisplay.displayHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.filter = `brightness(${100 + state.photo.exposure}%) contrast(${state.photo.contrast}%)`;
  ctx.drawImage(surface, photoDisplay.x, photoDisplay.y, photoDisplay.width, photoDisplay.height, 0, 0, canvas.width, canvas.height); ctx.filter = "none";
  if (!$("#layer-photo").checked) { ctx.fillStyle = "#10110e"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  drawVisionOverlay(ctx); initializePhotoHandles(); drawPhotoOverlays(ctx); renderPhotoQuality(); renderSegmentationReadout();
  renderGeometryReadout(); renderPerspectivePreviews();
  if (state.photo.cuts.length) { const cuts = photoCuts(); renderResults("photo", cuts); renderPhotoCutTable(cuts); $("#photo-results-wrap").classList.remove("hidden"); }
}

function renderSegmentationReadout() {
  const target = $("#segmentation-readout"), segmentation = state.photo.segmentation; if (!target) return;
  if (!segmentation?.found) { target.innerHTML = `<small>BLADE SEGMENTATION</small><strong>Not run</strong><span>Choose polarity or Auto, then segment the blade.</span>`; return; }
  target.innerHTML = `<small>BLADE SEGMENTATION</small><strong>${segmentation.confidence}% confidence · ${segmentation.polarity} key</strong><span>${segmentation.likelyBittedEdge.toUpperCase()} edge appears bitted · ${segmentation.references?.tipSide || "right"} tip · threshold ${segmentation.threshold}</span>`;
}

function drawVisionOverlay(ctx) {
  const raster = visionRaster, segmentation = raster?.segmentation; if (!segmentation || raster.source !== getAnalysisSurface()) return;
  if ($("#layer-mask").checked && raster.maskCanvas) {
    ctx.save(); ctx.globalAlpha = Number($("#photo-overlay-opacity").value) / 160;
    ctx.drawImage(raster.maskCanvas, photoDisplay.x / raster.scaleX, photoDisplay.y / raster.scaleY, photoDisplay.width / raster.scaleX, photoDisplay.height / raster.scaleY, 0, 0, photoDisplay.displayWidth, photoDisplay.displayHeight); ctx.restore();
  }
  const drawEdge = (edge, color) => {
    if (!edge?.length) return; ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = Number($("#photo-overlay-opacity").value) / 100; ctx.lineWidth = Math.max(1, Number($("#photo-overlay-width").value) - 1); ctx.beginPath();
    edge.forEach((point, index) => { const display = analysisToDisplayPoint(rasterToAnalysis(point), photoDisplay); if (!index) ctx.moveTo(display.x, display.y); else ctx.lineTo(display.x, display.y); }); ctx.stroke(); ctx.restore();
  };
  if ($("#layer-top-edge").checked) drawEdge(segmentation.topEdge, "#75f0b1");
  if ($("#layer-bottom-edge").checked) drawEdge(segmentation.bottomEdge, "#c39cff");
  if (segmentation.references) {
    ctx.save(); ctx.font = "10px monospace"; ctx.setLineDash([4, 4]);
    for (const [label, rasterX, color] of [["SHOULDER?", segmentation.references.shoulderX, "#efc36f"], ["TIP?", segmentation.references.tipX, "#78bfff"]]) { const point = analysisToDisplayPoint({ x: rasterX * raster.scaleX, y: 0 }, photoDisplay); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(point.x, 0); ctx.lineTo(point.x, photoDisplay.displayHeight); ctx.stroke(); ctx.fillText(label, point.x + 4, 13); }
    ctx.restore();
  }
}

function initializePhotoHandles() {
  const surface = getAnalysisSurface(), w = surface.width, h = surface.height;
  if (!state.photo.scalePoints.length) state.photo.scalePoints = [{ x: w * .12, y: h * .86 }, { x: w * .42, y: h * .86 }];
  if (!state.photo.corners.length) state.photo.corners = [{ x: w * .08, y: h * .68 }, { x: w * .38, y: h * .68 }, { x: w * .38, y: h * .9 }, { x: w * .08, y: h * .9 }];
  if (!state.photo.baseline) state.photo.baseline = [{ x: w * .18, y: h * .6 }, { x: w * .9, y: h * .6 }];
  if (!state.photo.reference) state.photo.reference = { x: w * .2, y: h * .6 };
}

function renderGeometryReadout() {
  const surface = getAnalysisSurface(); if (!surface) return;
  $("#geometry-space").textContent = state.photo.coordinateSpace === "corrected" ? "PROJECTIVE-CORRECTED" : "ORIENTED SOURCE";
  $("#geometry-size").textContent = `${surface.width} × ${surface.height} px${state.photo.crop?.accepted ? " · CROPPED VIEW" : ""}`;
  $("#correction-residual").textContent = state.photo.correction.accepted ? `${Number(state.photo.correction.residual || 0).toFixed(3)} px` : "Not applied";
  $("#correction-detail").textContent = state.photo.correction.accepted ? `${Math.round(state.photo.correction.downsample * 100)}% analysis resolution · distortion ${(state.photo.correction.magnitude * 100).toFixed(1)}%` : "Four-corner projective transform";
}

function renderPerspectivePreviews() {
  if (!orientedSurface) return;
  const drawPreview = (canvas, surface, emptyLabel) => {
    const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#0d0e0b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!surface) { ctx.fillStyle = "#777"; ctx.font = "11px monospace"; ctx.textAlign = "center"; ctx.fillText(emptyLabel, canvas.width / 2, canvas.height / 2); return; }
    const scale = Math.min(canvas.width / surface.width, canvas.height / surface.height), width = surface.width * scale, height = surface.height * scale; ctx.drawImage(surface, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  };
  drawPreview($("#source-preview"), orientedSurface, "SOURCE"); drawPreview($("#corrected-preview"), correctedSurface, "NOT APPLIED");
}

function drawPhotoOverlays(ctx) {
  const p = state.photo, color = $("#photo-overlay-color").value, width = Number($("#photo-overlay-width").value), opacity = Number($("#photo-overlay-opacity").value) / 100;
  const display = (point) => analysisToDisplayPoint(point, photoDisplay);
  const scalePoints = p.scalePoints.map(display), perspectiveCorners = p.corners.map(display), baseline = p.baseline?.map(display), reference = p.reference ? display(p.reference) : null, cuts = p.cuts.map(display);
  ctx.save(); ctx.globalAlpha = opacity; ctx.lineWidth = width; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.font = "11px monospace";
  ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(scalePoints[0].x, scalePoints[0].y); ctx.lineTo(scalePoints[1].x, scalePoints[1].y); ctx.stroke(); ctx.setLineDash([]);
  const scaleAngle = Math.atan2(scalePoints[1].y - scalePoints[0].y, scalePoints[1].x - scalePoints[0].x); const scaleLength = Math.hypot(scalePoints[1].x - scalePoints[0].x, scalePoints[1].y - scalePoints[0].y); const known = Number($("#photo-known-distance").value || 0);
  if (known > 0) for (let mm = 0; mm <= known; mm += 10) { const t = mm / known, x = scalePoints[0].x + (scalePoints[1].x - scalePoints[0].x) * t, y = scalePoints[0].y + (scalePoints[1].y - scalePoints[0].y) * t, tick = mm % 50 === 0 ? 9 : 5; ctx.beginPath(); ctx.moveTo(x - Math.sin(scaleAngle) * tick, y + Math.cos(scaleAngle) * tick); ctx.lineTo(x + Math.sin(scaleAngle) * tick, y - Math.cos(scaleAngle) * tick); ctx.stroke(); if (scaleLength > 120 && mm % 50 === 0) ctx.fillText(`${mm} mm`, x + 4, y - 7); }
  scalePoints.forEach((pt, i) => { ctx.beginPath(); ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#111"; ctx.fillText(String(i + 1), pt.x - 3, pt.y + 4); ctx.fillStyle = color; });
  ctx.globalAlpha = opacity * .65; perspectiveCorners.forEach((pt, i) => { ctx.strokeRect(pt.x - 7, pt.y - 7, 14, 14); ctx.fillText(`C${i + 1}`, pt.x + 10, pt.y - 10); });
  ctx.globalAlpha = opacity;
  if (baseline) { ctx.setLineDash([9, 5]); ctx.beginPath(); ctx.moveTo(baseline[0].x, baseline[0].y); ctx.lineTo(baseline[1].x, baseline[1].y); ctx.stroke(); ctx.setLineDash([]); baseline.forEach((pt) => { ctx.beginPath(); ctx.moveTo(pt.x, pt.y - 9); ctx.lineTo(pt.x + 8, pt.y + 7); ctx.lineTo(pt.x - 8, pt.y + 7); ctx.closePath(); ctx.fill(); }); }
  if (reference) { ctx.save(); ctx.translate(reference.x, reference.y); ctx.rotate(Math.PI / 4); ctx.strokeRect(-8, -8, 16, 16); ctx.restore(); ctx.fillText($("#photo-alignment").value.toUpperCase(), reference.x + 14, reference.y - 10); }
  if (p.cuts.length) {
    const sign = p.activeEdge === "top" ? 1 : -1, scale = p.calibrated && p.ppm ? p.ppm : 18, tolerance = Number(profile().tolerance || .15);
    cuts.forEach((cut, index) => {
      ctx.save(); ctx.globalAlpha = opacity * .22; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(cut.x, 0); ctx.lineTo(cut.x, photoDisplay.displayHeight); ctx.stroke(); ctx.setLineDash([]);
      const analysisX = p.cuts[index].x, baseY = baselineYAt(analysisX); Object.entries(profile().depthMap).forEach(([code, depth]) => { const guide = display({ x: analysisX, y: baseY - sign * Number(depth) * scale }); ctx.beginPath(); ctx.moveTo(guide.x - 9, guide.y); ctx.lineTo(guide.x + 9, guide.y); ctx.stroke(); if (String(code) === String(p.cuts[index].code)) { const band = Math.max(2, tolerance * scale * photoDisplay.scale); ctx.fillRect(guide.x - 11, guide.y - band, 22, band * 2); } }); ctx.restore();
    });
    if ($("#layer-reconstruction").checked) { ctx.beginPath(); cuts.forEach((cut, index) => { if (!index) ctx.moveTo(cut.x, cut.y); else ctx.lineTo(cut.x, cut.y); }); ctx.stroke(); }
    if ($("#layer-edge").checked) cuts.forEach((cut, index) => { ctx.beginPath(); ctx.arc(cut.x, cut.y, 7, 0, Math.PI * 2); ctx.fillStyle = p.cuts[index].status === "unreadable" ? "#ef745f" : color; ctx.fill(); ctx.strokeStyle = "#111"; ctx.stroke(); ctx.fillStyle = color; ctx.fillText(`${index + 1}:${p.cuts[index].code ?? "?"}`, cut.x - 12, cut.y - 13); });
  }
  const otherEdge = p.activeEdge === "top" ? "bottom" : "top", otherCuts = (p.edgeAnalyses?.[otherEdge] || []).map(display);
  if (otherCuts.length && $("#layer-reconstruction").checked) { ctx.save(); ctx.strokeStyle = "#c39cff"; ctx.setLineDash([5, 4]); ctx.beginPath(); otherCuts.forEach((cut, index) => { if (!index) ctx.moveTo(cut.x, cut.y); else ctx.lineTo(cut.x, cut.y); }); ctx.stroke(); ctx.restore(); }
  if (p.crop) {
    const cropCorners = cropHandlePoints().map(display); ctx.strokeStyle = "#c39cff"; ctx.fillStyle = "#c39cff"; ctx.setLineDash([6, 4]); ctx.strokeRect(cropCorners[0].x, cropCorners[0].y, cropCorners[2].x - cropCorners[0].x, cropCorners[2].y - cropCorners[0].y); ctx.setLineDash([]);
    cropCorners.forEach((point) => { ctx.fillRect(point.x - 6, point.y - 6, 12, 12); }); ctx.fillText(p.crop.accepted ? "NON-DESTRUCTIVE CROP ACTIVE" : "DRAG CROP CORNERS · APPLY WHEN READY", cropCorners[0].x + 8, cropCorners[0].y + 18);
  }
  if (activePhotoHandle) { const selected = photoHandlePoint(activePhotoHandle); if (selected) { const point = display(selected); ctx.save(); ctx.globalAlpha = 1; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(point.x, point.y, 12, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillText("KEYBOARD SELECTED", point.x + 15, point.y + 4); ctx.restore(); } }
  ctx.restore();
}

function cropHandlePoints() {
  const crop = state.photo.crop; if (!crop) return [];
  return [{ x: crop.x, y: crop.y }, { x: crop.x + crop.width, y: crop.y }, { x: crop.x + crop.width, y: crop.y + crop.height }, { x: crop.x, y: crop.y + crop.height }];
}

function pushPhotoHistory() {
  state.photo.history.push(JSON.stringify(geometrySnapshot()));
  if (state.photo.history.length > 30) state.photo.history.shift(); state.photo.future = [];
}

function restorePhotoSnapshot(raw, destination) {
  if (!raw) return; destination.push(JSON.stringify(geometrySnapshot())); restoreGeometry(JSON.parse(raw)); invalidateFinalVerification("Undo or redo changed measurement evidence"); logVerification({ field: "history", before: null, after: "geometry restored", reason: "Undo or redo" }); renderPhoto(); scheduleSave();
}

function photoPointAt(x, y) {
  const hits = [];
  state.photo.scalePoints.forEach((pt, index) => hits.push({ type: "scale", index, pt }));
  state.photo.corners.forEach((pt, index) => hits.push({ type: "corner", index, pt }));
  state.photo.baseline?.forEach((pt, index) => hits.push({ type: "baseline", index, pt }));
  if (state.photo.reference) hits.push({ type: "reference", index: 0, pt: state.photo.reference });
  state.photo.cuts.forEach((pt, index) => hits.push({ type: "cut", index, pt }));
  cropHandlePoints().forEach((pt, index) => hits.push({ type: "crop", index, pt }));
  const threshold = 18 / Math.max(.01, photoDisplay.scale);
  return hits.sort((a, b) => Math.hypot(a.pt.x - x, a.pt.y - y) - Math.hypot(b.pt.x - x, b.pt.y - y)).find((hit) => Math.hypot(hit.pt.x - x, hit.pt.y - y) < threshold);
}

function canvasPoint(event) { const canvas = $("#photo-canvas"), rect = canvas.getBoundingClientRect(); const displayPoint = { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; return displayToAnalysisPoint(displayPoint, photoDisplay); }

function photoHandlePoint(handle) {
  if (handle.type === "reference") return state.photo.reference;
  if (handle.type === "crop") return cropHandlePoints()[handle.index];
  return state.photo[handle.type === "cut" ? "cuts" : handle.type === "scale" ? "scalePoints" : handle.type === "corner" ? "corners" : "baseline"][handle.index];
}

function setPhotoHandlePoint(handle, point) {
  if (handle.type === "cut" && !canEditPhotoCut(handle.index, false)) return;
  const surface = getAnalysisSurface(), bounded = { x: clamp(point.x, 0, surface.width - 1), y: clamp(point.y, 0, surface.height - 1) };
  if (handle.type === "crop") setCropCorner(handle.index, bounded);
  else { const target = handle.type === "reference" ? state.photo.reference : state.photo[handle.type === "cut" ? "cuts" : handle.type === "scale" ? "scalePoints" : handle.type === "corner" ? "corners" : "baseline"][handle.index]; target.x = bounded.x; target.y = bounded.y; }
  if (handle.type === "cut") updatePhotoCutFromPoint(handle.index);
  if (handle.type === "reference" || handle.type === "baseline") reflowPhotoCuts();
}

function updatePhotoCutFromPoint(index) {
  if (!canEditPhotoCut(index, false)) return;
  const cut = state.photo.cuts[index], baseY = baselineYAt(cut.x); const sign = state.photo.activeEdge === "top" ? 1 : -1;
  const depthPx = (baseY - cut.y) * sign; const depth = state.photo.calibrated && state.photo.ppm ? Math.max(0, depthPx / state.photo.ppm) : Math.max(0, depthPx / 18);
  const match = nearestDepth(depth, profile().depthMap); Object.assign(cut, { depth, code: match.code, difference: match.difference, ambiguity: match.ambiguity, candidates: depthCandidates(depth, profile().depthMap, 3), status: "estimated", reviewedAt: null }); invalidateFinalVerification("A cut point moved"); storeActiveEdgeGeometry();
}

function reflowPhotoCuts() {
  if (!state.photo.cuts.length) return;
  const surface = getAnalysisSurface(), p = profile(), ppm = state.photo.ppm || (surface.width * .55 / Math.max(1, p.firstCut + p.spacing * (p.cutCount - 1))), direction = $("#photo-alignment").value === "tip" ? -1 : 1, start = state.photo.reference.x + direction * p.firstCut * ppm, sign = state.photo.activeEdge === "top" ? 1 : -1;
  state.photo.cuts.forEach((cut, index) => { cut.x = clamp(start + direction * index * p.spacing * ppm, 2, surface.width - 3); cut.y = baselineYAt(cut.x) - sign * cut.depth * (state.photo.calibrated ? ppm : 18); if (cut.status === "accepted") { cut.status = "estimated"; cut.reviewedAt = null; } }); invalidateFinalVerification("Alignment or measurement grid changed");
  storeActiveEdgeGeometry();
}

function setCropCorner(index, point) {
  const corners = cropHandlePoints(); if (!corners.length) return; const opposite = corners[[2, 3, 0, 1][index]];
  const minX = Math.min(point.x, opposite.x), maxX = Math.max(point.x, opposite.x), minY = Math.min(point.y, opposite.y), maxY = Math.max(point.y, opposite.y);
  state.photo.crop = { ...state.photo.crop, x: minX, y: minY, width: Math.max(20, maxX - minX), height: Math.max(20, maxY - minY), accepted: false };
}

function baselineYAt(x) {
  const [a, b] = state.photo.baseline; const t = clamp((x - a.x) / Math.max(1, b.x - a.x), 0, 1); return a.y + (b.y - a.y) * t;
}

function acceptPhotoScale() {
  try {
    state.photo.ppm = pixelsPerMillimeter(state.photo.scalePoints[0], state.photo.scalePoints[1], Number($("#photo-known-distance").value));
    state.photo.calibrated = Number.isFinite(state.photo.ppm) && state.photo.ppm > .1;
    state.photo.knownDistance = Number($("#photo-known-distance").value); state.photo.scaleMethod = $("#photo-scale-method").value;
    $("#photo-ppm").textContent = `${state.photo.ppm.toFixed(3)} px / mm`; $("#photo-scale-quality").textContent = state.photo.scaleMethod === "profile" ? "Lower-confidence fallback" : "Manual scale accepted";
    setPhotoWorkflow(2); renderPhoto(); scheduleSave(); toast("Image scale accepted. Verify it with the on-image ruler.");
  } catch (error) { toast(error.message); }
}

function detectMarker() {
  if (!photoImage) return;
  pushPhotoHistory(); const raster = buildVisionRaster(), marker = detectCalibrationMarker(raster.gray, raster.width, raster.height); raster.marker = marker;
  if (!marker.found) { state.photo.marker = { found: false, confidence: marker.confidence, reason: marker.reason }; renderMarkerReadout(); toast("No reliable KEYGAUGE marker was found. Position the four corners manually."); return; }
  state.photo.corners = marker.corners.map(rasterToAnalysis); state.photo.scalePoints = [state.photo.corners[0], state.photo.corners[1]].map((point) => ({ ...point }));
  state.photo.marker = { found: true, confidence: marker.confidence, cornerConfidence: marker.cornerConfidence, orientation: marker.orientation, orientationConfidence: marker.orientationConfidence, rotationDegrees: marker.rotationDegrees, perspective: marker.perspective, measuredAspect: marker.measuredAspect, dimensionMatch: marker.dimensionMatch };
  $("#photo-scale-method").value = "marker"; $("#photo-known-distance").value = 100; state.photo.scaleMethod = "marker"; acceptPhotoScale(); renderMarkerReadout(); renderPhoto(); setPhotoWorkflow(2);
  toast(marker.confidence >= 70 ? "KEYGAUGE marker geometry found. Scale was set; verify and correct every corner before accepting correction." : "Possible marker found at limited confidence. Verify all four corners manually before continuing.");
}

function correctionAspectRatio() {
  const method = $("#photo-scale-method").value;
  if (method === "card") return 85.6 / 53.98;
  if (method === "quarter") return 1;
  if (method === "marker") return 100 / 60;
  return null;
}

async function warpPerspectiveSurface(source, plan, onProgress) {
  const sourceData = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height); const output = createCanvas(plan.width, plan.height), outputContext = output.getContext("2d", { willReadFrequently: true }), outputData = outputContext.createImageData(plan.width, plan.height); const src = sourceData.data, dst = outputData.data, inverse = plan.inverse;
  let row = 0; const rowsPerFrame = Math.max(2, Math.floor(180000 / Math.max(1, plan.width)));
  await new Promise((resolve) => {
    const processRows = () => {
      const end = Math.min(plan.height, row + rowsPerFrame);
      for (; row < end; row += 1) {
        for (let x = 0; x < plan.width; x += 1) {
          const denominator = inverse[6] * x + inverse[7] * row + inverse[8]; const sourceX = (inverse[0] * x + inverse[1] * row + inverse[2]) / denominator, sourceY = (inverse[3] * x + inverse[4] * row + inverse[5]) / denominator;
          if (sourceX < 0 || sourceY < 0 || sourceX >= source.width - 1 || sourceY >= source.height - 1) continue;
          const sx = Math.round(sourceX), sy = Math.round(sourceY), sourceIndex = (sy * source.width + sx) * 4, destinationIndex = (row * plan.width + x) * 4;
          dst[destinationIndex] = src[sourceIndex]; dst[destinationIndex + 1] = src[sourceIndex + 1]; dst[destinationIndex + 2] = src[sourceIndex + 2]; dst[destinationIndex + 3] = src[sourceIndex + 3];
        }
      }
      onProgress(Math.round(row / plan.height * 100)); if (row < plan.height) requestAnimationFrame(processRows); else resolve();
    };
    processRows();
  });
  outputContext.putImageData(outputData, 0, 0); return output;
}

async function applyPhotoCorrection() {
  if (state.photo.correction.accepted) { toast("Reject the current correction before calculating another one."); return; }
  try {
    const plan = rectificationPlan(state.photo.corners, orientedSurface.width, orientedSurface.height, { aspectRatio: correctionAspectRatio(), scaleX: Number($("#perspective-x").value) / 100, scaleY: Number($("#perspective-y").value) / 100, keystone: Number($("#perspective-skew").value) / 100, maxPixels: 24_000_000 });
    if (plan.magnitude > .55) { toast("Correction would require excessive distortion. Retake the photograph or reposition the four corners."); return; }
    preCorrectionSnapshot = geometrySnapshot(); correctionGeometry = plan; const progress = $("#correction-progress"); progress.classList.remove("hidden"); $("#correction-meter").value = 0; $("#apply-correction").disabled = true;
    correctedSurface = await warpPerspectiveSurface(orientedSurface, plan, (value) => { $("#correction-meter").value = value; $("#correction-output").textContent = `${value}%`; });
    mapPhotoGeometry(plan.matrix); state.photo.coordinateSpace = "corrected"; state.photo.correction = { scaleX: Number($("#perspective-x").value) / 100, scaleY: Number($("#perspective-y").value) / 100, keystone: Number($("#perspective-skew").value) / 100, accepted: true, magnitude: plan.magnitude, residual: plan.residual, downsample: plan.downsample };
    visionRaster = null; state.photo.segmentation = null; recalculatePhotoScale(); state.photo.cuts.forEach((cut, index) => updatePhotoCutFromPoint(index)); setPhotoWorkflow(3); renderPhoto(); runPhotoPreflight(); scheduleSave(); toast(plan.downsample < 1 ? "Perspective corrected locally. Analysis was safely downsampled to remain within the memory limit." : "Full-resolution perspective correction applied locally.");
  } catch (error) { correctedSurface = null; correctionGeometry = null; restoreGeometry(preCorrectionSnapshot); toast(error.message || "Perspective correction could not be completed."); }
  finally { $("#correction-progress").classList.add("hidden"); $("#apply-correction").disabled = false; }
}

function rejectPhotoCorrection(showToast = true) {
  if (!state.photo.correction.accepted) { if (showToast) toast("No accepted perspective correction is active."); return; }
  correctedSurface = null; correctionGeometry = null; visionRaster = null; restoreGeometry(preCorrectionSnapshot); preCorrectionSnapshot = null; state.photo.coordinateSpace = "oriented-source"; state.photo.correction = defaultState().photo.correction; state.photo.segmentation = null; $("#perspective-x").value = 100; $("#perspective-y").value = 100; $("#perspective-skew").value = 0; renderPhoto(); runPhotoPreflight(); scheduleSave(); if (showToast) toast("Perspective correction rejected; the original image and measurements were restored.");
}

function analyzeBladeEdge(edge, segmentation) {
  const surface = getAnalysisSurface(), p = profile(), baseline = bladeBaselineFor(edge, segmentation), reference = bladeReferenceFor(edge, segmentation), ppm = state.photo.ppm || (surface.width * .55 / Math.max(1, p.firstCut + p.spacing * (p.cutCount - 1))), direction = $("#photo-alignment").value === "tip" ? -1 : 1;
  const analysisEdge = (edge === "top" ? segmentation.topEdge : segmentation.bottomEdge).map(rasterToAnalysis);
  const cuts = estimateCutSamples({ edge: analysisEdge, baseline, referenceX: reference.x, positions: cutPositions(p), pixelsPerMm: ppm, direction, side: edge, depthMap: p.depthMap, calibrated: state.photo.calibrated, smoothingRadius: Math.max(2, Math.round(visionRaster.scaleX * 2)) });
  const edgeContrast = state.photo.quality?.edgeContrast ?? .5;
  cuts.forEach((cut) => { cut.detectedDepth = cut.depth; cut.detectedCode = cut.code; cut.contrast = edgeContrast; cut.edgeDefinition = localEdgeDefinition(analysisEdge, cut.x, Math.max(4, ppm * .3)); cut.wearRisk = 1 - cut.edgeDefinition; if (segmentation.confidence < 24) cut.status = "unreadable"; });
  state.photo.edgeAnalyses[edge] = cuts; state.photo.edgeGeometry[edge] = { baseline, reference }; return cuts;
}

function detectContour(forceBoth = false) {
  if (!photoImage) { toast("Load a photograph first."); return; }
  pushPhotoHistory(); const segmentation = visionRaster?.source === getAnalysisSurface() && visionRaster.segmentation ? visionRaster.segmentation : runBladeSegmentation(false);
  if (!segmentation) { toast("The blade could not be segmented. Adjust polarity, sensitivity, crop, or lighting controls and try again."); return; }
  const requested = forceBoth || $("#photo-edge-side").value === "both" ? ["top", "bottom"] : [$("#photo-edge-side").value];
  requested.forEach((edge) => analyzeBladeEdge(edge, segmentation));
  const active = requested.length === 2 ? segmentation.likelyBittedEdge : requested[0]; state.photo.activeEdge = active; state.photo.cuts = structuredClone(state.photo.edgeAnalyses[active]); state.photo.baseline = structuredClone(state.photo.edgeGeometry[active].baseline); state.photo.reference = structuredClone(state.photo.edgeGeometry[active].reference);
  setPhotoWorkflow(5); renderPhoto(); scheduleSave(); toast(requested.length === 2 ? "Both blade edges were analyzed independently. Select either edge to inspect and correct its cuts." : "Contour estimate created. Verify every reference and cut point.");
}

function photoCutsFor(rawCuts = state.photo.cuts) {
  const p = profile(), quality = state.photo.quality || {}, perspective = state.photo.correction.accepted ? state.photo.correction.magnitude : perspectiveMagnitude(state.photo.corners), methodQuality = { marker: .92, ruler: .82, card: .78, quarter: .72, custom: .65, profile: .38 }[state.photo.scaleMethod] || .55, calibrationQuality = state.photo.marker?.found ? Math.max(methodQuality, state.photo.marker.confidence / 100) : methodQuality, referenceVisibility = state.photo.segmentation?.references ? clamp(Number(state.photo.segmentation.references.confidence || 45) / 100, .35, 1) : .35;
  return rawCuts.map((raw, index) => {
    const depth = Number(raw.depth || 0), match = nearestDepth(depth, p.depthMap), status = raw.status || "estimated", confidence = photoCutConfidence({ calibrated: state.photo.calibrated, readable: status !== "unreadable", confirmed: status === "accepted", rejected: status === "rejected", delta: match.difference, tolerance: p.tolerance, resolution: photoResolutionScore(), focus: quality.focusScore ?? .45, contrast: raw.contrast ?? quality.edgeContrast ?? .45, perspective, calibrationQuality, referenceVisibility, edgeDefinition: raw.edgeDefinition ?? quality.edgeContrast ?? .45, ambiguity: match.ambiguity });
    return { position: index + 1, sourceDepth: Number(raw.detectedDepth ?? depth), sourceCode: String(raw.detectedCode ?? match.code), depth, code: match.code, difference: match.difference, ambiguity: match.ambiguity, outOfRange: match.outOfRange, confidence, status, reason: raw.reason || "", reviewNote: raw.reviewNote || "", reviewedAt: raw.reviewedAt || null, candidates: raw.candidates || depthCandidates(depth, p.depthMap, 3), sourceStatus: status };
  });
}

function photoCuts() { return photoCutsFor(state.photo.cuts); }

function photoResolutionScore() { if (!photoImage) return 0; return state.photo.quality?.effectiveResolution ?? clamp(Math.min(getAnalysisSurface()?.width || photoImage.naturalWidth, getAnalysisSurface()?.height || photoImage.naturalHeight) / 1400, 0, 1); }
function averagePhotoContrast() { if (!state.photo.cuts.length) return clamp((state.photo.contrast - 40) / 130, 0, 1); return state.photo.cuts.reduce((sum, cut) => sum + Number(cut.contrast || .5), 0) / state.photo.cuts.length; }
function photoQualityLabel() { return state.photo.quality?.label || "Not checked"; }

function renderMarkerReadout() {
  const marker = state.photo.marker, target = $("#marker-readout"); if (!target) return;
  if (!marker?.found) { target.innerHTML = `<small>MARKER DETECTION</small><strong>${marker ? "Not confirmed" : "Not run"}</strong><span>${escapeHtml(marker?.reason || "Use Detect marker for a local corner-target search.")}</span>`; $("#marker-corners").innerHTML = ""; return; }
  target.innerHTML = `<small>MARKER DETECTION</small><strong>${marker.confidence}% confidence · ${marker.orientation.toUpperCase()} indicator</strong><span>${(marker.dimensionMatch * 100).toFixed(0)}% outer-ratio match · ${marker.rotationDegrees.toFixed(1)}° rotation · ${(marker.perspective * 100).toFixed(1)}% perspective</span>`;
  $("#marker-corners").innerHTML = marker.cornerConfidence.map((confidence, index) => `<div><span>C${index + 1}</span><b class="${confidence >= 70 ? "ok" : confidence >= 45 ? "warn" : "bad"}">${confidence}%</b></div>`).join("");
}

function renderPhotoQuality() {
  if (!photoImage) return;
  const quality = state.photo.quality, perspective = state.photo.correction.accepted ? state.photo.correction.magnitude : perspectiveMagnitude(state.photo.corners), resolution = photoResolutionScore(), contrast = quality?.edgeContrast ?? averagePhotoContrast();
  const scaleAngle = Math.atan2(state.photo.scalePoints[1].y - state.photo.scalePoints[0].y, state.photo.scalePoints[1].x - state.photo.scalePoints[0].x); const baselineAngle = Math.atan2(state.photo.baseline[1].y - state.photo.baseline[0].y, state.photo.baseline[1].x - state.photo.baseline[0].x); const parallelError = Math.abs(((scaleAngle - baselineAngle) * 180 / Math.PI + 90) % 180 - 90);
  const bladePixels = state.photo.segmentation?.bounds?.width || 0, obscured = state.photo.segmentation?.bounds ? state.photo.segmentation.bounds.x < 3 || state.photo.segmentation.bounds.x + state.photo.segmentation.bounds.width > getAnalysisSurface().width - 3 : null;
  const items = [
    ["Effective blade resolution", bladePixels ? `${Math.round(bladePixels)} px` : resolution > .75 ? "Sufficient image" : resolution > .45 ? "Review image" : "Insufficient image", bladePixels > 700 || (!bladePixels && resolution > .75) ? "ok" : bladePixels > 380 || resolution > .45 ? "warn" : "bad"],
    ["Focus / blur", !quality ? "Not checked" : quality.focusScore > .68 ? "Sharp" : quality.focusScore > .38 ? "Review focus" : "Blur likely", !quality ? "warn" : quality.focusScore > .68 ? "ok" : quality.focusScore > .38 ? "warn" : "bad"],
    ["Blade-edge contrast", contrast > .58 ? "Visible" : contrast > .3 ? "Weak edge" : "Obscured", contrast > .58 ? "ok" : contrast > .3 ? "warn" : "bad"],
    ["Glare / shadow", !quality ? "Not checked" : quality.glareFraction < .08 && quality.shadowFraction < .16 ? "Limited clipping" : `${Math.round(quality.glareFraction * 100)}% glare · ${Math.round(quality.shadowFraction * 100)}% shadow`, !quality ? "warn" : quality.glareFraction < .08 && quality.shadowFraction < .16 ? "ok" : quality.glareFraction < .2 && quality.shadowFraction < .3 ? "warn" : "bad"],
    ["Camera angle", perspective < .12 ? "Low distortion" : perspective < .3 ? "Angled" : "Strongly angled", perspective < .12 ? "ok" : perspective < .3 ? "warn" : "bad"],
    ["Reference alignment", parallelError < 4 ? "Parallel to blade" : `${parallelError.toFixed(1)}° from blade`, parallelError < 4 ? "ok" : parallelError < 10 ? "warn" : "bad"],
    ["Blade boundary", obscured === null ? "Run blade segmentation" : obscured ? "Cropped or touching frame" : "Complete inside frame", obscured === null ? "warn" : obscured ? "bad" : "ok"],
    ["Scale", state.photo.calibrated ? "Calibrated" : "Uncalibrated", state.photo.calibrated ? "ok" : "bad"],
    ["Coordinate pipeline", state.photo.coordinateSpace === "corrected" ? "Projective corrected" : "Source geometry", state.photo.coordinateSpace === "corrected" ? "ok" : "warn"],
    ["Analysis resolution", state.photo.correction.downsample < 1 ? `${Math.round(state.photo.correction.downsample * 100)}% safety scale` : "Full resolution", state.photo.correction.downsample < 1 ? "warn" : "ok"],
    ["Crop", state.photo.crop?.accepted ? "Non-destructive crop active" : state.photo.crop ? "Crop awaiting acceptance" : "Full image", state.photo.crop && !state.photo.crop.accepted ? "warn" : "ok"],
    ["Reference plane", "User verification required", "warn"],
  ];
  $("#photo-quality-list").innerHTML = items.map(([label, value, cls]) => `<div class="quality-item"><span>${label}</span><b class="${cls}">${value}</b></div>`).join("");
  $("#preflight-verdict").textContent = quality?.label || "Not checked"; $("#preflight-detail").textContent = quality ? `${quality.score}% local quality score · ${quality.megapixels.toFixed(1)} MP source analysis` : "Load an image or run the preflight."; renderMarkerReadout();
}

function renderPhotoCutTable(cuts) {
  const factorLabels = { resolution: "Resolution", focus: "Focus", edgeContrast: "Edge contrast", perspective: "Perspective", calibrationReference: "Scale reference", depthProximity: "Valid-depth proximity", referenceVisibility: "Shoulder / tip", edgeDefinition: "Edge definition / wear", ambiguityClarity: "Code clarity" }, depthOptions = Object.entries(profile().depthMap).sort((a, b) => Number(a[1]) - Number(b[1])), protect = verificationState().protectAccepted;
  $("#photo-cut-table").innerHTML = `<div class="table-edge-label">EDITING ${state.photo.activeEdge.toUpperCase()} EDGE · accepted positions are ${protect ? "protected" : "editable"}</div><table class="cut-table verification-table"><thead><tr><th>Cut</th><th>Raw depth</th><th>Valid code</th><th>Difference</th><th>Confidence evidence</th><th>Decision</th><th>Reason</th><th>Review note</th></tr></thead><tbody>${cuts.map((cut, index) => { const stateCut = state.photo.cuts[index], rowClass = cut.outOfRange ? "out-of-range" : cut.ambiguity > .72 ? "ambiguous" : stateCut.status, locked = protect && stateCut.status === "accepted", factorRows = Object.entries(cut.confidence.factors || {}).map(([key, value]) => `<span><i>${escapeHtml(factorLabels[key] || key)}</i><b>${Math.round(value * 100)}%</b></span>`).join(""); return `<tr class="${rowClass}"><td><strong>${index + 1}</strong><small>${locked ? "PROTECTED" : cut.outOfRange ? "OUT OF RANGE" : cut.ambiguity > .72 ? "AMBIGUOUS" : stateCut.status.toUpperCase()}</small></td><td><div class="depth-editor"><button data-cut-nudge="-0.01" data-cut-index="${index}" ${locked ? "disabled" : ""} aria-label="Decrease cut ${index + 1} depth">−</button><input data-cut-depth="${index}" type="number" step="0.001" value="${cut.depth.toFixed(3)}" ${state.photo.calibrated && !locked ? "" : "disabled"} aria-label="Cut ${index + 1} raw depth in millimeters"><button data-cut-nudge="0.01" data-cut-index="${index}" ${locked ? "disabled" : ""} aria-label="Increase cut ${index + 1} depth">＋</button></div><small>${locked ? "accepted position protected" : state.photo.calibrated ? "millimeters" : "UNCALIBRATED · drag point"}</small></td><td><select data-photo-code="${index}" ${locked ? "disabled" : ""} aria-label="Valid depth code for cut ${index + 1}">${depthOptions.map(([code, depth]) => `<option value="${escapeAttribute(code)}" ${String(cut.code) === String(code) ? "selected" : ""}>${escapeHtml(code)} · ${Number(depth).toFixed(3)} mm</option>`).join("")}</select><small>${(cut.candidates || []).slice(1, 3).map((candidate) => `alt ${escapeHtml(candidate.code)}: ${candidate.absolute.toFixed(3)}`).join(" · ") || "No alternate"}</small></td><td><strong>${cut.difference >= 0 ? "+" : ""}${cut.difference.toFixed(3)} mm</strong><small>tolerance ±${Number(profile().tolerance).toFixed(3)} mm</small></td><td><details class="confidence-evidence"><summary class="${cut.confidence.score >= 82 ? "confidence-high" : cut.confidence.score >= 58 ? "confidence-review" : "confidence-low"}">${cut.confidence.label} · ${cut.confidence.score}%</summary><div>${factorRows}</div></details></td><td><select data-photo-status="${index}" aria-label="Decision for cut ${index + 1}"><option value="estimated" ${stateCut.status === "estimated" ? "selected" : ""}>Review</option><option value="accepted" ${stateCut.status === "accepted" ? "selected" : ""}>Accept</option><option value="rejected" ${stateCut.status === "rejected" ? "selected" : ""}>Reject</option><option value="unreadable" ${stateCut.status === "unreadable" ? "selected" : ""}>Unreadable</option></select><small>${stateCut.reviewedAt ? new Date(stateCut.reviewedAt).toLocaleTimeString() : "Not decided"}</small></td><td><select data-photo-reason="${index}" aria-label="Reason for cut ${index + 1}">${VERIFICATION_REASONS.map(([value, label]) => `<option value="${value}" ${stateCut.reason === value ? "selected" : ""}>${label}</option>`).join("")}</select>${["rejected", "unreadable"].includes(stateCut.status) && !stateCut.reason ? "<small class=required-reason>Required</small>" : ""}</td><td><input data-photo-note="${index}" value="${escapeAttribute(stateCut.reviewNote || "")}" maxlength="160" placeholder="Optional note" aria-label="Review note for cut ${index + 1}"></td></tr>`; }).join("")}</tbody></table>`;
  renderVerificationSummary(cuts); renderVerificationLog();
}

function currentVerificationReadiness(cuts = photoCuts()) {
  const verification = verificationState(); return verificationReadiness(cuts, { calibrated: state.photo.calibrated, profileVerified: Boolean(profile().verified), warningsAcknowledged: verification.warningsAcknowledged });
}

function renderVerificationSummary(cuts = photoCuts()) {
  const summary = currentVerificationReadiness(cuts), verification = verificationState(); if (!$("#verification-progress")) return;
  $("#verification-progress").value = summary.percent; $("#verification-percent").textContent = verification.finalized ? "FINAL" : `${summary.percent}%`; $("#verification-detail").textContent = verification.finalized ? `Finalized ${new Date(verification.finalizedAt).toLocaleString()}` : `${summary.accepted} accepted · ${summary.rejected} rejected · ${summary.unreadable} unreadable · ${summary.unreviewed} to review`;
  $("#verification-strip").classList.toggle("complete", summary.complete); $("#verification-strip").classList.toggle("finalized", verification.finalized);
  $("#verification-readiness").innerHTML = summary.blockers.length ? summary.blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : summary.warnings.length ? summary.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "<li>Every cut has a complete, calibrated verification decision.</li>";
  $("#finalize-verification").disabled = !summary.canFinalize || verification.finalized; $("#reopen-verification").disabled = !verification.finalized;
  $("#ack-verification-warnings").checked = verification.warningsAcknowledged; $("#protect-accepted").checked = verification.protectAccepted; $("#verification-session-note").value = verification.sessionNote || "";
}

function renderVerificationLog() {
  const log = verificationState().log || []; $("#verification-log-count").textContent = `${log.length} event${log.length === 1 ? "" : "s"}`;
  $("#verification-log").innerHTML = log.length ? [...log].reverse().slice(0, 50).map((event) => `<div><time>${new Date(event.timestamp).toLocaleString()}</time><strong>${event.position ? `Cut ${event.position} · ` : ""}${escapeHtml(event.field)}</strong><span>${escapeHtml(event.reason || `${JSON.stringify(event.before)} → ${JSON.stringify(event.after)}`)}</span></div>`).join("") : `<p>No verification decisions recorded yet.</p>`;
}

function setCutDecision(index, status) {
  const cut = state.photo.cuts[index]; if (!cut) return; const before = cut.status; invalidateFinalVerification("A cut decision changed"); cut.status = status; cut.reviewedAt = status === "estimated" ? null : new Date().toISOString();
  if (status === "accepted" && !cut.reason) cut.reason = "visible-match"; if (["rejected", "unreadable"].includes(status) && cut.reason === "visible-match") cut.reason = "";
  logVerification({ position: index + 1, field: "decision", before, after: status, reason: cut.reason || null }); storeActiveEdgeGeometry(); renderPhoto(); scheduleSave();
}

function finalizeVerification() {
  const readiness = currentVerificationReadiness(); if (!readiness.canFinalize) { toast(readiness.blockers[0]); return; }
  const verification = verificationState(); verification.finalized = true; verification.finalizedAt = new Date().toISOString(); logVerification({ field: "finalization", before: "draft", after: "finalized", reason: "All verification gates satisfied" }); storeActiveEdgeGeometry(); renderPhoto(); scheduleSave(); toast("Photo verification finalized. Any later evidence change will return it to draft status.");
}

function reopenVerification() {
  const verification = verificationState(); if (!verification.finalized) return; logVerification({ field: "finalization", before: "finalized", after: "draft", reason: "User reopened verification" }); verification.finalized = false; verification.finalizedAt = null; renderPhoto(); scheduleSave(); toast("Verification reopened for editing.");
}

function setPhotoCutDepth(index, value) {
  const cut = state.photo.cuts[index], depth = Number(value); if (!cut || !Number.isFinite(depth) || !canEditPhotoCut(index)) return;
  const before = { depth: cut.depth, code: cut.code, status: cut.status }; cut.depth = Math.max(0, depth); const match = nearestDepth(cut.depth, profile().depthMap); cut.code = match.code; cut.difference = match.difference; cut.ambiguity = match.ambiguity; cut.candidates = depthCandidates(cut.depth, profile().depthMap, 3); cut.status = "estimated"; cut.reviewedAt = null;
  const sign = state.photo.activeEdge === "top" ? 1 : -1, scale = state.photo.calibrated && state.photo.ppm ? state.photo.ppm : 18; cut.y = baselineYAt(cut.x) - sign * cut.depth * scale; invalidateFinalVerification("A cut depth changed"); logVerification({ position: index + 1, field: "depth", before, after: { depth: cut.depth, code: cut.code, status: cut.status } }); storeActiveEdgeGeometry(); renderPhoto(); scheduleSave();
}

function setPhotoCutCode(index, code) {
  const depth = Number(profile().depthMap[code]); if (!Number.isFinite(depth) || !canEditPhotoCut(index)) return; const beforeCode = state.photo.cuts[index].code; setPhotoCutDepth(index, depth); logVerification({ position: index + 1, field: "code selection", before: beforeCode, after: code });
}

function adjustMeasurementGrid({ dx = 0, dy = 0, rotationDegrees = 0 }) {
  if (!state.photo.cuts.length) return; pushPhotoHistory(); const transformed = transformMeasurementGrid({ baseline: state.photo.baseline, reference: state.photo.reference, cuts: state.photo.cuts }, { dx, dy, rotationDegrees });
  state.photo.baseline = transformed.baseline; state.photo.reference = transformed.reference; state.photo.cuts = transformed.cuts.map((cut) => ({ ...cut, status: cut.status === "unreadable" ? "unreadable" : "estimated", reviewedAt: cut.status === "unreadable" ? cut.reviewedAt : null })); invalidateFinalVerification("Measurement grid changed"); logVerification({ field: "measurement grid", before: null, after: { dx, dy, rotationDegrees } }); storeActiveEdgeGeometry(); renderPhoto(); scheduleSave();
}

function renderMethodComparison() {
  if (!state.photo.cuts.length) { toast("Create a photo analysis before comparing methods."); return; }
  const photo = photoCuts(), screen = makeCuts(), comparison = compareMeasurements(photo, screen, Number(profile().tolerance || .15)), calibrated = state.photo.calibrated && Boolean(state.calibration);
  $("#method-comparison-summary").innerHTML = `<div class="comparison-metrics"><div><small>AGREEMENT</small><strong>${comparison.agreementPercent}%</strong></div><div><small>COMPARED CUTS</small><strong>${comparison.compared}</strong></div><div><small>ROOT-MEAN-SQUARE DIFFERENCE</small><strong>${calibrated && comparison.rmsDifference !== null ? `${comparison.rmsDifference.toFixed(3)} mm` : "UNCALIBRATED"}</strong></div><div><small>MAXIMUM DIFFERENCE</small><strong>${calibrated && comparison.maximumDifference !== null ? `${comparison.maximumDifference.toFixed(3)} mm` : "UNCALIBRATED"}</strong></div></div>${calibrated ? "" : "<p class=\"comparison-warning\">Both methods must be calibrated before physical depth differences are meaningful.</p>"}`;
  $("#method-comparison-table").innerHTML = `<table class="comparison-table"><thead><tr><th>Position</th><th>Photo</th><th>On screen</th><th>Difference</th><th>Assessment</th></tr></thead><tbody>${comparison.rows.map((row) => `<tr><td>${row.position}</td><td>${row.first ? `${row.first.code} · ${row.first.depth.toFixed(3)} mm` : "—"}</td><td>${row.second ? `${row.second.code} · ${row.second.depth.toFixed(3)} mm` : "—"}</td><td>${calibrated && row.delta !== null ? `${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(3)} mm` : "—"}</td><td><span class="agreement ${row.agreement.replaceAll(" ", "-")}">${row.agreement}</span></td></tr>`).join("")}</tbody></table>`;
  $("#method-comparison").classList.remove("hidden"); $("#method-comparison").scrollIntoView({ behavior: "smooth", block: "start" });
}

function deletePhoto(permanent = true) {
  photoImage = null; orientedSurface = null; correctedSurface = null; orientationGeometry = null; correctionGeometry = null; preCorrectionSnapshot = null; visionRaster = null; activePhotoHandle = null; if (fullResolutionPopup && !fullResolutionPopup.closed) fullResolutionPopup.close(); fullResolutionPopup = null; state.photo = defaultState().photo; $("#photo-workspace").classList.add("hidden"); $("#photo-results-wrap").classList.add("hidden"); $("#method-comparison").classList.add("hidden"); $("#photo-dropzone").classList.remove("has-image"); $("#photo-storage-status").textContent = "No photograph is currently stored locally."; setPhotoWorkflow(0); scheduleSave(); if (permanent) toast("Photograph and all derived image surfaces were permanently removed from this session.");
}

function cropPhotoToBlade() {
  if (!photoImage || !state.photo.cuts.length) { toast("Detect or place the blade contour before cropping."); return; }
  pushPhotoHistory(); const surface = getAnalysisSurface(), points = [...state.photo.cuts, ...state.photo.baseline, state.photo.reference], paddingX = surface.width * .04, paddingY = surface.height * .12, minX = clamp(Math.min(...points.map((p) => p.x)) - paddingX, 0, surface.width - 1), maxX = clamp(Math.max(...points.map((p) => p.x)) + paddingX, 1, surface.width), minY = clamp(Math.min(...points.map((p) => p.y)) - paddingY, 0, surface.height - 1), maxY = clamp(Math.max(...points.map((p) => p.y)) + paddingY, 1, surface.height);
  state.photo.crop = { x: minX, y: minY, width: Math.max(20, maxX - minX), height: Math.max(20, maxY - minY), accepted: false }; renderPhoto(); scheduleSave(); toast("Blade crop proposed. Drag the purple corner handles, then select Apply crop.");
}

function applyPhotoCrop() {
  if (!state.photo.crop) { toast("Set a blade crop first."); return; } state.photo.crop.accepted = true; renderPhoto(); scheduleSave(); toast("Non-destructive crop applied. Original and corrected image pixels remain available.");
}

function resetPhotoCrop() {
  if (!state.photo.crop) return; pushPhotoHistory(); state.photo.crop = null; renderPhoto(); scheduleSave(); toast("Crop removed; the full analysis image is visible again.");
}

function openFullResolutionInspection() {
  if (!photoImage) return;
  const analysis = getAnalysisSurface(); fullResolutionPopup = window.open("", "_blank"); if (!fullResolutionPopup) { toast("Allow pop-ups to inspect the full-resolution image."); return; }
  const correctedDataUrl = correctedSurface ? correctedSurface.toDataURL("image/png") : ""; fullResolutionPopup.document.write(`<title>KEYGAUGE full-resolution inspection</title><style>body{margin:0;background:#111;color:#eee;font:13px ui-monospace,monospace}header{position:sticky;top:0;padding:10px 14px;background:#171815;border-bottom:1px solid #64512e;z-index:2}section{padding:14px;border-bottom:1px solid #3b3b33}h2{font-size:13px;color:#f0ca77}img{display:block;max-width:none}</style><header>LOCAL FULL-RESOLUTION INSPECTION · NOTHING LEAVES THIS DEVICE</header><section><h2>ORIGINAL SOURCE · ${photoImage.naturalWidth} × ${photoImage.naturalHeight} px</h2><img alt="Original full-resolution key photograph" src="${photoImage.src}"></section>${correctedDataUrl ? `<section><h2>PROJECTIVE-CORRECTED ANALYSIS · ${analysis.width} × ${analysis.height} px</h2><img alt="Projective-corrected key photograph" src="${correctedDataUrl}"></section>` : ""}`); fullResolutionPopup.document.close();
}

function downloadBlob(name, blob) { const url = URL.createObjectURL(blob), a = Object.assign(document.createElement("a"), { href: url, download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

function exportSanitizedBladeImage() {
  if (!photoImage || !state.photo.crop?.accepted) { toast("Apply a blade crop before exporting a sanitized derivative."); return; }
  const surface = getAnalysisSurface(), plan = sanitizedImageExportPlan(surface.width, surface.height, state.photo.crop), canvas = document.createElement("canvas"), context = canvas.getContext("2d"); canvas.width = plan.output.width; canvas.height = plan.output.height;
  context.filter = `brightness(${100 + Number(state.photo.exposure || 0)}%) contrast(${Number(state.photo.contrast || 100)}%)`; context.drawImage(surface, plan.source.x, plan.source.y, plan.source.width, plan.source.height, 0, 0, plan.output.width, plan.output.height); context.filter = "none";
  canvas.toBlob((blob) => { if (!blob) return toast("The browser could not create the sanitized image."); downloadBlob(`KEYGAUGE-sanitized-blade-${new Date().toISOString().slice(0, 10)}.png`, blob); toast("Sanitized PNG created locally with source metadata excluded."); }, plan.mimeType);
}

function currentRecord(method) {
  if (state.photo.cuts.length) storeActiveEdgeGeometry();
  const usePhoto = method === "photo"; let cuts;
  if (method === "manual") {
    const codes = $("#manual-bitting").value.split(/[\s,.-]+/).filter(Boolean); cuts = codes.map((code, index) => { const depth = Number(profile().depthMap[code]); const valid = Number.isFinite(depth); const match = valid ? nearestDepth(depth, profile().depthMap) : { difference: 0, ambiguity: 1, outOfRange: true }; return { position: index + 1, depth: valid ? depth : 0, code, difference: match.difference, ambiguity: match.ambiguity, outOfRange: match.outOfRange, confidence: { score: valid ? 65 : 20, label: valid ? "Review recommended" : "Ambiguous" }, status: "manual" }; });
  } else if (method === "combined" && state.photo.cuts.length) {
    cuts = combineMeasurements(photoCuts(), makeCuts(), profile().depthMap);
  } else cuts = usePhoto && state.photo.cuts.length ? photoCuts() : makeCuts();
  const summary = renderResults(usePhoto ? "photo" : "screen", cuts);
  const methodLabel = usePhoto ? "Photo analysis" : method === "combined" ? "Combination of on-screen and photo methods" : method === "manual" ? "Manual entry" : "On-screen physical alignment"; const continuing = state.currentRecord.method === methodLabel; const usesPhotoEvidence = usePhoto || method === "combined";
  const edgeResults = usesPhotoEvidence ? Object.fromEntries(["top", "bottom"].filter((edge) => state.photo.edgeAnalyses[edge]?.length).map((edge) => [edge, photoCutsFor(state.photo.edgeAnalyses[edge])])) : undefined;
  const verification = verificationState();
  const sourceMeasurements = cuts.map((cut, index) => ({ position: index + 1, depth: Number(cut.sourceDepth ?? cut.depth ?? 0), code: String(cut.sourceCode ?? cut.code ?? "?"), method: methodLabel })), acceptedMeasurements = cuts.map((cut, index) => ({ position: index + 1, depth: Number(cut.depth || 0), code: String(cut.status === "unreadable" ? "?" : cut.code), status: cut.status || "estimated" }));
  return migrateRecord({ id: continuing && state.currentRecord.id ? state.currentRecord.id : createLocalId(), lineageId: continuing ? state.currentRecord.lineageId : undefined, revisionNumber: continuing ? state.currentRecord.revisionNumber : 1, revisions: continuing ? state.currentRecord.revisions : [], name: $("#record-name").value.trim() || "Untitled key measurement", reference: $("#record-reference").value.trim(), anonymousId: $("#record-anonymous-id").value.trim(), tags: $("#record-tags").value.split(",").map((tag) => tag.trim()).filter(Boolean), notes: $("#record-notes").value.trim(), createdAt: continuing && state.currentRecord.createdAt ? state.currentRecord.createdAt : new Date().toISOString(), updatedAt: new Date().toISOString(), method: methodLabel, profileId: profile().id, profileName: profile().name, profileKind: profile().kind, profileSnapshot: structuredClone(profile()), alignment: usesPhotoEvidence ? $("#photo-alignment").value : state.screen.alignment, bitting: cuts.map((cut) => cut.status === "unreadable" ? "?" : cut.code), cuts, sourceMeasurements, acceptedMeasurements, edgeResults, activeEdge: usesPhotoEvidence ? state.photo.activeEdge : undefined, confidence: summary.label, verification: usesPhotoEvidence ? { ...verificationSummary(state.photo.cuts), finalized: verification.finalized, finalizedAt: verification.finalizedAt, warningsAcknowledged: verification.warningsAcknowledged, sessionNote: verification.sessionNote, log: structuredClone(verification.log) } : undefined, photoQuality: usesPhotoEvidence ? state.photo.quality : undefined, segmentation: usesPhotoEvidence ? state.photo.segmentation : undefined, calibration: usesPhotoEvidence ? { screen: state.calibration, photo: { method: state.photo.scaleMethod, pixelsPerMillimeter: state.photo.ppm, perspectiveCorrected: state.photo.correction.accepted, correctionResidualPixels: state.photo.correction.residual, analysisResolutionScale: state.photo.correction.downsample, coordinateSpace: state.photo.coordinateSpace, cropApplied: Boolean(state.photo.crop?.accepted), alignment: $("#photo-alignment").value } } : state.calibration, privacy: { processing: "local-browser", photographIncluded: false, exifIncluded: false, deletePhotoAfterMeasurement: $("#delete-photo-after").checked }, reportNotice: usesPhotoEvidence ? "This bitting was estimated from a photograph using user-supplied scale and alignment references. Verify all measurements using appropriate professional locksmith tools before cutting a key or servicing a lock." : "Estimated using a screen-based visual alignment method. Verify all measurements with appropriate professional locksmith tools before cutting or servicing a lock." });
}

function createLocalRecoveryPoint(label = "Manual checkpoint", announce = true) {
  const checkpoint = createRecoveryCheckpoint({ calibration: state.calibration, profiles: state.profiles, records: state.records, currentRecord: state.currentRecord, validationStudies: state.validationStudies }, label), beforeCount = (state.recoveryPoints || []).length;
  state.recoveryPoints = compactRecoveryPoints([checkpoint, ...(state.recoveryPoints || [])]); scheduleSave(); renderRecoveryPoints();
  if (announce) toast(state.recoveryPoints.length === beforeCount && state.recoveryPoints[0]?.id !== checkpoint.id ? "An identical recovery checkpoint already exists." : "Compact local recovery checkpoint created.");
  return checkpoint;
}

function renderRecoveryPoints() {
  const target = $("#recovery-list"); if (!target) return; const points = state.recoveryPoints || [];
  target.innerHTML = points.length ? points.map((point) => `<div><strong>${escapeHtml(point.label)}</strong><span>${new Date(point.createdAt).toLocaleString()} · ${point.records.length} record(s) · ${formatBytes(point.storageBytes || 0)}</span><button class="subtle-button" data-restore-point="${escapeAttribute(point.id)}">Restore</button><button class="danger-button" data-delete-point="${escapeAttribute(point.id)}">Delete</button></div>`).join("") : `<p class="lede">No local recovery checkpoints yet.</p>`;
}

function restoreRecoveryPoint(id) {
  const point = state.recoveryPoints.find((item) => item.id === id); if (!point || !confirmDiscardRecordDraft() || !confirm(`Restore “${point.label}”? Current project data will be checkpointed first.`)) return; createLocalRecoveryPoint("Before checkpoint restore", false); state.calibration = structuredClone(point.calibration); state.profiles = structuredClone(point.profiles); state.records = point.records.map(migrateRecord); state.validationStudies = (point.validationStudies || []).map(normalizeValidationStudy); state.currentRecord = structuredClone(point.currentRecord || defaultState().currentRecord); state.activeProfileId = state.currentRecord.profileId || state.profiles[0]?.id; activeValidationStudyId = null; fieldValidationPreview = null; recordEditorDirty = false; refreshAll({ refreshEditor: true }); scheduleSave(); toast("Recovery checkpoint restored.");
}

function saveRecord(method) {
  if (method === "photo") {
    const verification = verificationSummary(state.photo.cuts);
    if (verification.unreviewed && !state.photo.verificationAcknowledged) {
      if (!confirm(`${verification.unreviewed} cut position(s) have not been reviewed. Save this explicitly incomplete photo-derived record anyway?`)) return;
      state.photo.verificationAcknowledged = true;
    }
  }
  const record = currentRecord(method), existing = state.records.findIndex((item) => item.id === record.id); createLocalRecoveryPoint(existing >= 0 ? `Before revision ${Number(state.records[existing].revisionNumber || 1) + 1}` : "Before new record", false);
  const saved = existing >= 0 ? createRecordRevision(state.records[existing], record) : migrateRecord(record); if (existing >= 0) state.records[existing] = saved; else state.records.unshift(saved); state.currentRecord = structuredClone(saved);
  if (method === "photo" && $("#delete-photo-after").checked) deletePhoto(false);
  recordEditorDirty = false; scheduleSave(); renderRecords({ refreshEditor: true }); toast(existing >= 0 ? `Revision ${saved.revisionNumber} saved with an immutable prior snapshot.` : "Measurement record saved locally.");
}

const RECORD_EDITOR_IDS = ["record-name", "record-method", "manual-bitting", "record-reference", "record-anonymous-id", "record-tags", "record-notes"];

function populateRecordEditor(force = false) {
  if (recordEditorDirty && !force) return;
  $("#record-name").value = state.currentRecord.name || "Untitled key measurement"; $("#record-reference").value = state.currentRecord.reference || ""; $("#record-anonymous-id").value = state.currentRecord.anonymousId || ""; $("#record-tags").value = (state.currentRecord.tags || []).join(", "); $("#record-notes").value = state.currentRecord.notes || ""; $("#record-method").value = state.currentRecord.method === "Photo analysis" ? "photo" : state.currentRecord.method?.startsWith("Combination") ? "combined" : state.currentRecord.method === "Manual entry" ? "manual" : "screen"; $("#manual-bitting").value = state.currentRecord.method === "Manual entry" ? (state.currentRecord.bitting || []).join("-") : "";
  recordEditorDirty = false; $("#record-editor-state").textContent = "EDITOR SAVED"; $("#record-editor-state").classList.add("safe");
}

function markRecordEditorDirty() {
  recordEditorDirty = true; const lamp = $("#record-editor-state"); lamp.textContent = "UNSAVED EDITOR"; lamp.classList.remove("safe");
}

function confirmDiscardRecordDraft() {
  return !recordEditorDirty || confirm("Discard the unsaved changes in the record editor?");
}

function renderRecords(options = {}) {
  const records = state.records.map(migrateRecord), view = state.recordView, visible = filterSortRecords(records, view), compare = $("#compare-records"), selectedCompare = new Set([...compare.selectedOptions].map((option) => option.value));
  $("#record-count").innerHTML = `<i></i> ${visible.length} OF ${records.length} RECORDS`;
  $("#records-list").innerHTML = visible.length ? visible.map((record) => `<div class="record-row"><label class="record-select"><input type="checkbox" data-compare-check="${record.id}" ${selectedCompare.has(record.id) ? "checked" : ""} aria-label="Select ${escapeAttribute(record.name)} for comparison"></label><div><strong>${escapeHtml(record.name)}</strong><small>${escapeHtml(record.anonymousId || record.reference || "No anonymized ID")} · revision ${record.revisionNumber}${record.revisions.length ? ` · ${record.revisions.length} prior snapshot(s)` : ""}</small></div><code>${record.bitting.join("-")}</code><span>${escapeHtml(record.method)}${record.verification ? ` · ${record.verification.finalized ? "FINALIZED" : `${record.verification.percent}% reviewed · DRAFT`}` : ""}<small>${record.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ") || "No tags"}</small></span><span>${new Date(record.updatedAt || record.createdAt).toLocaleString()}</span><div><button class="subtle-button" data-load-record="${record.id}">Open</button> <button class="subtle-button" data-revise-record="${record.id}">Revise</button> <button class="subtle-button" data-duplicate-record="${record.id}">Duplicate</button> <button class="subtle-button" data-report-record="${record.id}">Report</button> <button class="danger-button" data-delete-record="${record.id}">Delete</button></div></div>`).join("") : `<p class="lede">No records match the current filters.</p>`;
  compare.innerHTML = records.map((record, index) => `<option value="${record.id}" ${selectedCompare.has(record.id) || (!selectedCompare.size && index < 2) ? "selected" : ""}>${escapeHtml(record.name)} · r${record.revisionNumber} · ${record.bitting.join("-")}</option>`).join("");
  const reportSelect = $("#report-record"), selected = reportSelect.value; reportSelect.innerHTML = `<option value="">Select record</option>${records.map((record) => `<option value="${record.id}" ${record.id === selected ? "selected" : ""}>${escapeHtml(record.name)} · r${record.revisionNumber} · ${record.bitting.join("-")}</option>`).join("")}`; if (!reportSelect.value && records[0]) reportSelect.value = records[0].id; renderReportPreview();
  $("#record-search").value = view.search; $("#record-filter-method").value = view.method; $("#record-filter-status").value = view.status; $("#record-filter-tags").value = view.tags; $("#record-sort").value = view.sort;
  const saved = view.savedViews || [], savedSelect = $("#saved-view-select"), selectedView = savedSelect.value; savedSelect.innerHTML = `<option value="">Current filters</option>${saved.map((item) => `<option value="${escapeAttribute(item.id)}" ${item.id === selectedView ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}`;
  populateRecordEditor(Boolean(options.refreshEditor)); renderRecoveryPoints(); updateComparisonSelectionStatus();
}

function selectedReportRecord() { return state.records.find((record) => record.id === $("#report-record").value); }
function reportProfile(record) { return record?.profileSnapshot || state.profiles.find((item) => item.id === record?.profileId) || {}; }
function renderReportPreview() {
  const record = selectedReportRecord(), target = $("#report-preview"); if (!record) { target.innerHTML = `<p class="lede">Save a measurement record to generate a report.</p>`; return; }
  const report = measurementReportModel(record, reportProfile(record)); target.innerHTML = `<div class="report-preview-head"><div><small>${report.finalized ? "FINALIZED VERIFICATION" : "DRAFT MEASUREMENT"} · REVISION ${report.revisionNumber}</small><h4>${escapeHtml(report.title)}</h4><span>${escapeHtml(report.anonymousId || report.reference || "No anonymized ID")} · ${report.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ") || "No tags"}</span></div><code>${escapeHtml(report.bitting)}</code></div><div class="report-preview-meta"><span><b>Method</b>${escapeHtml(report.method)}</span><span><b>Profile provenance</b>${escapeHtml(report.profileName)} · ${escapeHtml(report.profileRevision)}</span><span><b>Calibration</b>${escapeHtml(report.calibrated ? report.calibrationMethod : "Uncalibrated")}</span><span><b>Perspective</b>${escapeHtml(report.perspectiveStatus)}</span></div><p class="privacy-caption">${escapeHtml(report.confidenceExplanation)}</p><div class="table-wrap"><table class="comparison-table"><thead><tr><th>Cut</th><th>Source estimate</th><th>Accepted value</th><th>Confidence</th><th>Decision</th><th>Reason / note</th></tr></thead><tbody>${report.cuts.map((cut) => `<tr><td>${cut.position}</td><td>${cut.sourceDepth.toFixed(3)} mm · ${escapeHtml(cut.sourceCode)}</td><td>${cut.depth.toFixed(3)} mm · ${escapeHtml(cut.code)}</td><td>${escapeHtml(cut.confidence)}</td><td>${escapeHtml(cut.status)}</td><td>${escapeHtml(cut.reason || "—")}${cut.reviewNote ? `<br><small>${escapeHtml(cut.reviewNote)}</small>` : ""}</td></tr>`).join("")}</tbody></table></div>${report.issues.length ? `<ul class="report-issues">${report.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` : `<p class="report-clear">No unresolved measurement warnings were recorded.</p>`}<p class="report-notice">${escapeHtml(report.reportNotice)}</p>`;
}
function downloadReport() { const record = selectedReportRecord(); if (!record) return toast("Choose a saved record first."); download(`${record.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "KEYGAUGE"}-report.html`, measurementReportHtml(record, reportProfile(record)), "text/html"); }
function printReport() { const record = selectedReportRecord(); if (!record) return toast("Choose a saved record first."); const popup = window.open("", "_blank"); if (!popup) return toast("Allow pop-ups to print the report."); popup.document.write(measurementReportHtml(record, reportProfile(record))); popup.document.close(); popup.addEventListener("load", () => popup.print(), { once: true }); }

function compareRecords() {
  const ids = [...$("#compare-records").selectedOptions].map((option) => option.value), records = ids.map((id) => state.records.find((record) => record.id === id)).filter(Boolean); if (records.length < 2) { toast("Choose at least two saved records to compare."); return; }
  if (new Set(records.map((record) => record.profileId)).size !== 1) { toast("Multi-record comparison requires the same key profile."); return; }
  const selectedProfile = records[0].profileSnapshot || state.profiles.find((item) => item.id === records[0].profileId), comparison = compareRecordSet(records, Number(selectedProfile?.tolerance || .15));
  $("#comparison-output").innerHTML = `<div class="comparison-metrics"><div><small>RECORDS</small><strong>${records.length}</strong></div><div><small>CUTS WITHIN TOLERANCE</small><strong>${comparison.agreementPercent}%</strong></div><div><small>MAXIMUM SPREAD</small><strong>${comparison.maximumSpread === null ? "—" : `${comparison.maximumSpread.toFixed(3)} mm`}</strong></div></div><div class="table-wrap"><table class="comparison-table multi-compare"><thead><tr><th>Position</th>${records.map((record) => `<th>${escapeHtml(record.name)}<small>r${record.revisionNumber}</small></th>`).join("")}<th>Spread</th><th>Assessment</th></tr></thead><tbody>${comparison.rows.map((row) => `<tr><td>${row.position}</td>${row.values.map((value, index) => `<td>${value === null ? "—" : `${escapeHtml(records[index].cuts[row.position - 1]?.code ?? "?")}<br>${value.toFixed(3)} mm`}</td>`).join("")}<td>${row.spread === null ? "—" : `${row.spread.toFixed(3)} mm`}</td><td><span class="agreement ${row.agreement.replaceAll(" ", "-")}">${row.agreement}</span></td></tr>`).join("")}</tbody></table></div>`;
}

function updateComparisonSelectionStatus() {
  const select = $("#compare-records"), status = $("#compare-selection-count"); if (!select || !status) return;
  const selected = select.selectedOptions.length; status.textContent = `${selected} selected`;
  $("#run-compare").disabled = selected < 2; $("#export-csv").disabled = selected < 1; $("#copy-bitting").disabled = selected < 1;
}

function loadRecord(id) {
  const record = state.records.find((item) => item.id === id); if (!record || !confirmDiscardRecordDraft()) return; state.currentRecord = structuredClone(record); state.activeProfileId = record.profileId; state.screen.depths = record.cuts.map((cut) => cut.depth); recordEditorDirty = false; refreshProfileSelects(); renderScreen(); renderRecords({ refreshEditor: true }); showView(record.method.startsWith("Photo") ? "records" : "screen"); toast("Measurement loaded for review.");
}

function reviseRecord(id) { loadRecord(id); showView("records"); $("#record-name").focus(); toast("Record opened for revision. Saving will preserve the current revision as an immutable snapshot."); }

function duplicateRecord(id) {
  const source = state.records.find((record) => record.id === id); if (!source || !confirmDiscardRecordDraft()) return; createLocalRecoveryPoint("Before record duplicate", false); const now = new Date().toISOString(), copy = migrateRecord({ ...structuredClone(source), id: createLocalId(), lineageId: createLocalId(), name: `${source.name} — copy`, createdAt: now, updatedAt: now, revisionNumber: 1, revisions: [] }); state.records.unshift(copy); state.currentRecord = structuredClone(copy); recordEditorDirty = false; renderRecords({ refreshEditor: true }); scheduleSave(); toast("Independent record copy created.");
}

function deleteRecord(id) {
  if (!confirm("Delete this local measurement record and its revision history?")) return; createLocalRecoveryPoint("Before record deletion", false); persistEmergencyRecovery(); state.records = state.records.filter((item) => item.id !== id); scheduleSave(); renderRecords(); toast("Record deleted. A compact local recovery checkpoint was retained.");
}

function renderProfiles() {
  const p = profile(); $("#profile-list").innerHTML = state.profiles.map((item) => `<button class="profile-card ${item.id === p.id ? "active" : ""}" data-profile="${item.id}"><strong>${escapeHtml(item.name)}</strong><span>${item.kind === "demonstration" ? "DEMONSTRATION" : item.verified ? "VERIFIED" : "USER-DEFINED"} · ${item.cutCount} cuts · ${item.stop} stop</span></button>`).join("");
  const form = $("#profile-form"); for (const field of ["name", "manufacturer", "blanks", "cutCount", "firstCut", "spacing", "stop", "tolerance", "revision", "source", "notes"]) if (form.elements[field]) form.elements[field].value = p[field] ?? "";
  form.elements.depthText.value = Object.entries(p.depthMap).map(([code, mm]) => `${code}:${mm}`).join("\n");
}

function saveProfile(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget), existing = profile(); const depthMap = {};
  String(form.get("depthText")).split(/\n|,/).forEach((line) => { const [code, value] = line.split(":").map((part) => part.trim()); if (code && Number.isFinite(Number(value))) depthMap[code] = Number(value); });
  if (!Object.keys(depthMap).length) { toast("Enter at least one valid code:depth pair."); return; }
  const saved = { ...existing, name: form.get("name"), manufacturer: form.get("manufacturer"), blanks: form.get("blanks"), cutCount: Number(form.get("cutCount")), firstCut: Number(form.get("firstCut")), spacing: Number(form.get("spacing")), stop: form.get("stop"), tolerance: Number(form.get("tolerance")), revision: form.get("revision"), source: form.get("source"), notes: form.get("notes"), depthMap, kind: existing.kind === "demonstration" ? "user-defined" : existing.kind, verified: false };
  const index = state.profiles.findIndex((item) => item.id === saved.id); state.profiles[index] = saved; normalizeScreenDepths(); refreshProfileSelects(); renderProfiles(); renderScreen(); scheduleSave(); toast("Profile saved as user-defined data.");
}

function duplicateProfile() {
  const copy = { ...structuredClone(profile()), id: createLocalId(), name: `${profile().name} — copy`, kind: "user-defined", verified: false, source: profile().kind === "demonstration" ? "Copied from demonstration data; replace with a verified source." : profile().source };
  state.profiles.push(copy); state.activeProfileId = copy.id; refreshProfileSelects(); renderProfiles(); scheduleSave(); toast("Profile duplicated for editing.");
}

function download(name, text, type = "application/json") { downloadBlob(name, new Blob([text], { type })); }

function exportProject() { download(`KEYGAUGE-project-${new Date().toISOString().slice(0, 10)}.json`, serializeProject({ calibration: state.calibration, profiles: state.profiles, records: state.records, validationStudies: state.validationStudies, currentRecord: state.currentRecord, recordView: state.recordView, recoveryPoints: compactRecoveryPoints(state.recoveryPoints || []) })); }
async function importProject(file) { try { if (!file || !confirmDiscardRecordDraft()) return; if (file.size > 12_000_000) throw new Error("The project file is larger than the 12 MB import limit."); const project = parseProject(await file.text()); createLocalRecoveryPoint("Before project import", false); persistEmergencyRecovery(); state.calibration = project.calibration; state.profiles = project.profiles; state.records = project.records.map(migrateRecord); state.validationStudies = (project.validationStudies || []).map(normalizeValidationStudy); state.currentRecord = project.currentRecord?.id ? migrateRecord(project.currentRecord) : defaultState().currentRecord; state.recordView = deepMerge(defaultState().recordView, project.recordView || {}); state.recoveryPoints = compactRecoveryPoints([...(state.recoveryPoints || []), ...(project.recoveryPoints || [])]); state.activeProfileId = state.currentRecord.profileId || state.profiles[0]?.id; activeValidationStudyId = null; fieldValidationPreview = null; recordEditorDirty = false; refreshAll({ refreshEditor: true }); scheduleSave(); toast(project.migratedFromVersion ? `Project migrated from schema ${project.migratedFromVersion} with a recovery checkpoint.` : "Project imported. A compact recovery checkpoint was created."); } catch (error) { toast(error.message); } }
function exportRecordsArchive() { download(`KEYGAUGE-records-${new Date().toISOString().slice(0, 10)}.json`, recordsArchive(state.records)); }
async function importRecordsArchive(file) { try { if (!file) return; if (file.size > 12_000_000) throw new Error("The records archive is larger than the 12 MB import limit."); const records = parseRecordsArchive(await file.text()); createLocalRecoveryPoint("Before records archive restore", false); const existing = new Set(state.records.map((record) => record.id)); state.records = [...records.map((record) => existing.has(record.id) ? migrateRecord({ ...record, id: createLocalId(), lineageId: createLocalId(), name: `${record.name} — restored` }) : record), ...state.records]; refreshAll(); scheduleSave(); toast(`${records.length} archived record(s) restored locally.`); } catch (error) { toast(error.message); } }
function recordViewFromControls() { return { search: $("#record-search").value, method: $("#record-filter-method").value, status: $("#record-filter-status").value, tags: $("#record-filter-tags").value, sort: $("#record-sort").value }; }
function openSavedViewDialog() { const dialog = $("#saved-view-dialog"), input = $("#saved-view-name"); input.value = `View ${(state.recordView.savedViews || []).length + 1}`; dialog.showModal(); requestAnimationFrame(() => { input.focus(); input.select(); }); }
function saveRecordView(event) { event?.preventDefault(); const name = $("#saved-view-name").value.trim(); if (!name) { $("#saved-view-name").focus(); return; } const item = { id: createLocalId(), name, ...recordViewFromControls() }; state.recordView.savedViews = [...(state.recordView.savedViews || []), item]; $("#saved-view-dialog").close(); renderRecords(); scheduleSave(); $("#saved-view-select").value = item.id; toast("Record view saved locally."); }
function applySavedRecordView(id) { const item = state.recordView.savedViews.find((view) => view.id === id); if (!item) return; Object.assign(state.recordView, { search: item.search, method: item.method, status: item.status, tags: item.tags, sort: item.sort }); renderRecords(); scheduleSave(); }
function worksheetSections() { return [...$$('.worksheet-options input[type="checkbox"]:checked')].map((input) => input.value); }
function downloadWorksheets() { download("KEYGAUGE-printable-worksheets.html", worksheetHtml(profile(), { sections: worksheetSections() }), "text/html"); }
function printWorksheets() { const popup = window.open("", "_blank"); if (!popup) return toast("Allow pop-ups to print the worksheets."); popup.document.write(worksheetHtml(profile(), { sections: worksheetSections() })); popup.document.close(); popup.addEventListener("load", () => popup.print(), { once: true }); }
function exportProfiles() { download("KEYGAUGE-profiles.json", JSON.stringify({ schema: "keygauge.profiles", version: 1, profiles: state.profiles }, null, 2)); }
async function importProfiles(file) { try { if (!file) return; if (file.size > 2_000_000) throw new Error("The profile file is larger than the 2 MB import limit."); const parsed = JSON.parse(await file.text()); if (parsed.schema !== "keygauge.profiles" || !Array.isArray(parsed.profiles) || parsed.profiles.length > 500) throw new Error("Unsupported profile file or profile count."); parsed.profiles.forEach((item, index) => { if (!item || typeof item !== "object" || Array.isArray(item) || !String(item.name || "").trim() || !Number.isInteger(Number(item.cutCount)) || Number(item.cutCount) < 1 || Number(item.cutCount) > 32 || !item.depthMap || typeof item.depthMap !== "object" || Array.isArray(item.depthMap)) throw new Error(`Profile ${index + 1} is invalid.`); }); state.profiles.push(...parsed.profiles.map((source) => { const p = privacyAudit(source).sanitized; return { ...p, id: p.id || createLocalId(), kind: p.kind || "user-defined", verified: Boolean(p.verified) }; })); refreshAll(); scheduleSave(); toast("Profiles imported."); } catch (error) { toast(error.message); } }

function browserCapabilityChecks() {
  const cameraInput = $("#camera-input"), canvas = document.createElement("canvas");
  return [
    { name: "Canvas 2D image processing", passed: Boolean(canvas.getContext("2d")), required: true, detail: "Required for local contour analysis." },
    { name: "Local file decoding", passed: typeof FileReader !== "undefined" && typeof Blob !== "undefined", required: true, detail: "Required for JPEG, PNG, and WebP import." },
    { name: "Pointer input", passed: typeof PointerEvent !== "undefined", required: true, detail: "Supports touch, mouse, and pen contour editing." },
    { name: "Offline service worker", passed: "serviceWorker" in navigator, required: false, detail: "Needed for installed/offline operation; not required while online." },
    { name: "Storage estimation", passed: Boolean(navigator.storage?.estimate), required: false, detail: "Improves local storage health reporting." },
    { name: "Rear-camera capture path", passed: cameraInput?.getAttribute("capture") === "environment", required: false, detail: navigator.mediaDevices?.getUserMedia ? "Camera API available; permission is requested only by Take Photo." : "File capture/import fallback remains available." },
    { name: "Clipboard image paste", passed: typeof ClipboardEvent !== "undefined", required: false, detail: "Browser and permission support varies." },
    { name: "Secure context", passed: window.isSecureContext, required: false, detail: "HTTPS is required for reliable camera and install features outside localhost." },
    { name: "Print support", passed: typeof window.print === "function", required: false, detail: "Required for marker and ruler verification sheets." },
  ];
}

function fieldStudyDraft() {
  const record = state.records.find((item) => item.id === $("#field-study-record").value); if (!record) throw new Error("Choose a saved measurement record first.");
  const reference = { source: $("#field-reference-source").value, instrument: $("#field-reference-instrument").value.trim(), calibrationDate: $("#field-reference-calibration-date").value || null, bitting: $("#field-reference-bitting").value, depths: $("#field-reference-depths").value };
  const criteria = { depthTolerance: Number($("#field-depth-tolerance").value), maximumRmsError: Number($("#field-max-rms").value), minimumCodeAgreement: Number($("#field-min-code-agreement").value), requireAllReadable: $("#field-require-readable").checked, requireFinalizedPhoto: $("#field-require-finalized").checked, requireVerifiedProfile: $("#field-require-profile").checked };
  const result = fieldValidationResult(record, reference, criteria), now = new Date().toISOString(), existing = state.validationStudies.find((study) => study.id === activeValidationStudyId);
  if (!reference.instrument) throw new Error("Identify the professional reference instrument or authorized source revision.");
  if (!result.count || !result.sufficient) throw new Error(`Enter exactly ${record.cuts.length} professional-tool depths and ${record.cuts.length} bitting codes.`);
  return normalizeValidationStudy({ id: existing?.id || createLocalId(), createdAt: existing?.createdAt || now, updatedAt: now, name: $("#field-study-name").value.trim() || "Field validation", campaign: $("#field-study-campaign").value.trim() || "Ungrouped", disposition: $("#field-study-disposition").value, reviewer: $("#field-study-reviewer").value.trim(), notes: $("#field-study-notes").value.trim(), recordId: record.id, recordName: record.name, recordRevision: record.revisionNumber, recordMethod: record.method, recordSnapshot: privacyAudit(record).sanitized, profileId: record.profileId, profileName: record.profileName, profileSnapshot: privacyAudit(record.profileSnapshot || {}).sanitized, reference, criteria, result, environment: { userAgent: navigator.userAgent, viewport: `${window.innerWidth}×${window.innerHeight}`, devicePixelRatio: window.devicePixelRatio }, reportNotice: "This field validation compares a KEYGAUGE estimate with user-supplied professional-tool reference values. It characterizes the recorded test conditions only and does not certify future measurements, a key-system profile, or fitness for cutting a key." });
}

function fieldNumber(value) { return Number.isFinite(Number(value)) ? `${Number(value).toFixed(3)} mm` : "—"; }

function renderFieldValidationPreview(study = fieldValidationPreview) {
  const target = $("#field-validation-preview"), reportButton = $("#download-field-report"), printButton = $("#print-field-report"), lamp = $("#field-validation-status"); if (!target) return;
  reportButton.disabled = printButton.disabled = !study?.result;
  if (!study?.result) { target.innerHTML = '<p class="lede">Choose a saved record, enter professional-tool reference values, then analyze.</p>'; lamp.classList.remove("safe", "danger"); lamp.innerHTML = "<i></i> NO STUDY"; return; }
  const result = study.result; lamp.classList.toggle("safe", result.passed); lamp.classList.toggle("danger", !result.passed); lamp.innerHTML = `<i></i> ${escapeHtml(result.status.toUpperCase())}`;
  target.innerHTML = `<div class="field-result-head"><div><span class="kicker">${escapeHtml(study.campaign)}</span><h4>${escapeHtml(study.name)}</h4><p class="lede">${escapeHtml(study.recordName)} · ${escapeHtml(study.recordMethod)} · ${escapeHtml(study.profileName)}</p></div><span class="status-lamp ${result.passed ? "safe" : "danger"}"><i></i> ${escapeHtml(String(result.status || "Not analyzed").toUpperCase())}</span></div><div class="field-metrics"><div><small>MEAN ABS. ERROR</small><strong>${fieldNumber(result.meanAbsoluteError)}</strong></div><div><small>RMS ERROR</small><strong>${fieldNumber(result.rmsError)}</strong></div><div><small>MAX ERROR</small><strong>${fieldNumber(result.maximumAbsoluteError)}</strong></div><div><small>DEPTH AGREEMENT</small><strong>${Number(result.toleranceAgreementPercent || 0).toFixed(1)}%</strong></div><div><small>CODE AGREEMENT</small><strong>${Number(result.codeAgreementPercent || 0).toFixed(1)}%</strong></div><div><small>DISPOSITION</small><strong>${escapeHtml(study.disposition.toUpperCase())}</strong></div></div><div class="gate-list">${(result.gates || []).map((gate) => `<div class="gate ${gate.passed ? "" : "fail"}"><b>${gate.passed ? "PASS" : "REVIEW"}</b><span>${escapeHtml(gate.label)} · ${escapeHtml(gate.detail)}</span></div>`).join("")}</div><div class="table-scroll"><table class="field-table"><thead><tr><th>CUT</th><th>MEASURED</th><th>REFERENCE</th><th>ERROR</th><th>CODE</th><th>REFERENCE</th><th>TOLERANCE</th><th>CONFIDENCE</th></tr></thead><tbody>${(result.rows || []).map((row) => `<tr><td>${row.position}</td><td>${fieldNumber(row.measuredDepth)}</td><td>${fieldNumber(row.referenceDepth)}</td><td>${fieldNumber(row.signedError)}</td><td>${escapeHtml(row.measuredCode)}</td><td>${escapeHtml(row.referenceCode)}</td><td>${row.withinTolerance ? "Within" : "Review"}</td><td>${escapeHtml(row.confidence)}</td></tr>`).join("")}</tbody></table></div><div class="notice"><span>i</span><p>${escapeHtml(study.reportNotice)}</p></div>`;
}

function renderFieldValidationLab() {
  const select = $("#field-study-record"); if (!select) return; const selected = select.value;
  select.innerHTML = `<option value="">Select a saved record…</option>${state.records.map((record) => `<option value="${escapeAttribute(record.id)}">${escapeHtml(record.name)} · ${escapeHtml(record.method || "Unknown method")} · rev ${Number(record.revisionNumber || 1)}</option>`).join("")}`; select.value = state.records.some((record) => record.id === selected) ? selected : "";
  const summary = validationProgramSummary(state.validationStudies); $("#field-study-count").textContent = String(summary.totalStudies); $("#field-pass-rate").textContent = summary.totalStudies ? `${summary.passedStudies}/${summary.totalStudies} · ${summary.passPercent.toFixed(1)}%` : "—"; $("#field-mean-error").textContent = fieldNumber(summary.meanAbsoluteError); $("#field-max-error").textContent = fieldNumber(summary.maximumAbsoluteError);
  $("#validation-program-summary").innerHTML = summary.campaigns.length ? summary.campaigns.map((item) => `<article class="repeatability-card"><strong>${escapeHtml(item.campaign)} · ${escapeHtml(item.profileName)}</strong><span>${item.repeatability.runCount} run(s) · ${escapeHtml(item.repeatability.status)} · maximum spread ${fieldNumber(item.repeatability.maximumSpread)}</span></article>`).join("") : '<p class="lede">Save at least three studies under the same campaign and profile to assess repeatability.</p>';
  $("#field-study-list").innerHTML = state.validationStudies.length ? state.validationStudies.map((study) => `<article class="field-study-row"><div><strong>${escapeHtml(study.name)} · ${escapeHtml(study.result?.status || "Not analyzed")}</strong><span>${escapeHtml(study.campaign)} · ${escapeHtml(study.recordName)} · ${escapeHtml(study.profileName)} · ${escapeHtml(study.disposition)} · ${study.updatedAt ? new Date(study.updatedAt).toLocaleString() : "No date"}</span></div><div class="button-row"><button class="subtle-button" data-load-field-study="${escapeAttribute(study.id)}">Load</button><button class="subtle-button" data-report-field-study="${escapeAttribute(study.id)}">Report</button><button class="danger-button" data-delete-field-study="${escapeAttribute(study.id)}">Delete</button></div></article>`).join("") : '<p class="lede">No field validation studies have been saved.</p>';
  renderFieldValidationPreview();
}

function analyzeFieldStudy() { try { if (!$("#field-study-form").reportValidity()) return; fieldValidationPreview = fieldStudyDraft(); renderFieldValidationPreview(); toast(fieldValidationPreview.result.passed ? "Field comparison meets the recorded criteria." : "Field comparison has gates requiring review."); } catch (error) { toast(error.message); } }

function saveFieldStudy() { try { if (!$("#field-study-form").reportValidity()) return; const study = fieldStudyDraft(), index = state.validationStudies.findIndex((item) => item.id === study.id); createLocalRecoveryPoint(index >= 0 ? "Before field study revision" : "Before new field study", false); if (index >= 0) state.validationStudies[index] = study; else state.validationStudies.unshift(study); activeValidationStudyId = study.id; fieldValidationPreview = study; scheduleSave(); renderFieldValidationLab(); toast("Field validation study saved locally without a photograph."); } catch (error) { toast(error.message); } }

function newFieldStudy() { activeValidationStudyId = null; fieldValidationPreview = null; $("#field-study-form").reset(); $("#field-study-name").value = "Field validation"; $("#field-study-campaign").value = "Campaign 1"; $("#field-depth-tolerance").value = "0.150"; $("#field-max-rms").value = "0.150"; $("#field-min-code-agreement").value = "100"; $("#field-require-readable").checked = true; $("#field-require-finalized").checked = true; renderFieldValidationLab(); }

function loadFieldStudy(id) {
  const study = state.validationStudies.find((item) => item.id === id); if (!study) return; activeValidationStudyId = study.id; fieldValidationPreview = study;
  const values = { "field-study-name": study.name, "field-study-campaign": study.campaign, "field-study-record": study.recordId, "field-reference-source": study.reference.source, "field-reference-instrument": study.reference.instrument, "field-reference-calibration-date": study.reference.calibrationDate || "", "field-reference-bitting": study.reference.bitting.join("-"), "field-reference-depths": study.reference.depths.join(", "), "field-depth-tolerance": study.criteria.depthTolerance, "field-max-rms": study.criteria.maximumRmsError, "field-min-code-agreement": study.criteria.minimumCodeAgreement, "field-study-reviewer": study.reviewer || "", "field-study-disposition": study.disposition, "field-study-notes": study.notes || "" }; Object.entries(values).forEach(([id, value]) => { const node = $("#" + id); if (node) node.value = value; }); $("#field-require-readable").checked = study.criteria.requireAllReadable; $("#field-require-finalized").checked = study.criteria.requireFinalizedPhoto; $("#field-require-profile").checked = study.criteria.requireVerifiedProfile; renderFieldValidationLab(); $("#field-study-record").value = study.recordId || ""; $("#field-study-name").focus();
}

function openFieldReport(study, print = false) { if (!study?.result) return toast("Analyze or load a field study first."); const html = validationStudyReportHtml(study); if (!print) { download(`KEYGAUGE-field-validation-${new Date().toISOString().slice(0, 10)}.html`, html, "text/html"); return; } const popup = window.open("", "_blank"); if (!popup) return toast("Allow pop-ups to print the field report."); popup.document.write(html); popup.document.close(); popup.addEventListener("load", () => popup.print(), { once: true }); }
function exportValidationStudies() { if (!state.validationStudies.length) return toast("No validation studies are available to export."); download(`KEYGAUGE-validation-studies-${new Date().toISOString().slice(0, 10)}.json`, validationStudiesArchive(state.validationStudies)); }
function exportValidationCsv() { if (!state.validationStudies.length) return toast("No validation studies are available to export."); download(`KEYGAUGE-validation-studies-${new Date().toISOString().slice(0, 10)}.csv`, validationStudiesCsv(state.validationStudies), "text/csv"); }
async function importValidationStudies(file) { try { if (!file) return; if (file.size > 4_000_000) throw new Error("The validation archive is larger than the 4 MB import limit."); const studies = parseValidationStudiesArchive(await file.text()), existing = new Set(state.validationStudies.map((study) => study.id)); createLocalRecoveryPoint("Before validation archive import", false); state.validationStudies = [...studies.map((study) => existing.has(study.id) ? { ...study, id: createLocalId(), name: `${study.name} — imported` } : study), ...state.validationStudies]; scheduleSave(); renderFieldValidationLab(); toast(`${studies.length} field validation study or studies imported locally.`); } catch (error) { toast(error.message); } }

function validationItem(check) {
  const status = check.passed ? "pass" : check.required ? "fail" : "review";
  const detail = check.detail || (Number.isFinite(check.error) ? `Error ${check.error.toExponential(2)}` : check.category || "Checked");
  return `<div class="validation-item ${status}"><span aria-hidden="true">${check.passed ? "✓" : check.required ? "×" : "!"}</span><div><strong>${escapeHtml(check.name)}</strong><small>${escapeHtml(detail)}</small></div><b>${check.passed ? "PASS" : check.required ? "FAIL" : "REVIEW"}</b></div>`;
}

function renderValidationWorkbench() {
  capabilityRun = browserCapabilityChecks();
  const requiredCapabilities = capabilityRun.filter((item) => item.required), requiredPassed = requiredCapabilities.filter((item) => item.passed).length, allCapabilities = capabilityRun.filter((item) => item.passed).length;
  $("#capability-results").innerHTML = capabilityRun.map(validationItem).join("");
  $("#validation-browser").textContent = `${requiredPassed}/${requiredCapabilities.length} core · ${allCapabilities}/${capabilityRun.length} total`;
  if (validationRun) { $("#validation-results").innerHTML = validationRun.checks.map((check) => validationItem({ ...check, detail: Number.isFinite(check.error) ? `${check.category} · error ${check.error.toExponential(2)}` : check.detail || check.category, required: true })).join(""); $("#validation-checks").textContent = `${validationRun.passedChecks}/${validationRun.totalChecks} passed`; }
  if (privacyRun) { $("#privacy-results").innerHTML = validationItem({ name: "Nested image-reference scrub", passed: privacyRun.passed && privacyRun.removedReferenceCount === privacyRun.sourceReferenceCount, required: true, detail: `${privacyRun.removedReferenceCount} of ${privacyRun.sourceReferenceCount} synthetic references removed; no user data inspected.` }); $("#validation-privacy").textContent = privacyRun.passed ? "Passed" : "Failed"; }
  if (performanceRun) { $("#performance-results").innerHTML = [validationItem({ name: "Synthetic contour pass", passed: performanceRun.found, required: true, detail: `${performanceRun.elapsedMilliseconds.toFixed(1)} ms · ${performanceRun.megapixelsPerSecond?.toFixed(2) || "—"} MP/s · component ${performanceRun.found ? "found" : "not found"}` }), validationItem({ name: "Interactive time budget", passed: performanceRun.passed, required: false, detail: `${performanceRun.level}; advisory budget ${performanceRun.budgetMilliseconds} ms.` })].join(""); $("#validation-performance").textContent = `${performanceRun.elapsedMilliseconds.toFixed(0)} ms · ${performanceRun.level}`; }
  const coreCapabilityFailure = requiredCapabilities.some((item) => !item.passed), complete = validationRun && privacyRun, passed = complete && validationRun.passed && privacyRun.passed && !coreCapabilityFailure, lamp = $("#validation-status");
  lamp.classList.toggle("safe", Boolean(passed)); lamp.classList.toggle("danger", Boolean(complete && !passed)); lamp.innerHTML = `<i></i> ${!complete ? "NOT RUN" : passed ? "LOCAL CHECKS PASSED" : "REVIEW FAILURES"}`;
  renderFieldValidationLab();
}

async function runLocalValidation() {
  const button = $("#run-validation"), lamp = $("#validation-status"); button.disabled = true; lamp.classList.remove("safe", "danger"); lamp.innerHTML = "<i></i> RUNNING";
  await new Promise((resolve) => setTimeout(resolve, 20));
  const fixtureResult = evaluateGoldenMeasurementFixture(GOLDEN_MEASUREMENT_FIXTURE), extraChecks = [];
  try { const key = `keygauge.validation.${createLocalId()}`; localStorage.setItem(key, "ok"); const passed = localStorage.getItem(key) === "ok"; localStorage.removeItem(key); extraChecks.push({ category: "storage", name: "Temporary local-storage round trip", passed, required: true, detail: "Synthetic value written, read, and permanently removed." }); } catch { extraChecks.push({ category: "storage", name: "Temporary local-storage round trip", passed: false, required: true, detail: "Browser storage is unavailable or blocked." }); }
  try { parseProject('{"schema":"unsupported","version":99}'); extraChecks.push({ category: "import", name: "Unsupported project rejection", passed: false, required: true, detail: "Invalid schema was unexpectedly accepted." }); } catch { extraChecks.push({ category: "import", name: "Unsupported project rejection", passed: true, required: true, detail: "Invalid schema rejected before state mutation." }); }
  validationRun = { ...fixtureResult, checks: [...fixtureResult.checks, ...extraChecks], totalChecks: fixtureResult.totalChecks + extraChecks.length, passedChecks: fixtureResult.passedChecks + extraChecks.filter((item) => item.passed).length, failedChecks: fixtureResult.failedChecks + extraChecks.filter((item) => !item.passed).length };
  validationRun.passed = validationRun.failedChecks === 0;
  privacyRun = privacyAudit({ records: [{ imageData: "data:image/jpeg;base64,synthetic", evidence: { objectUrl: "blob:synthetic", note: "preserved" } }], thumbnail: "synthetic" });
  button.disabled = false; renderValidationWorkbench(); toast(validationRun.passed && privacyRun.passed ? "Local validation passed." : "Validation found an item that requires review.");
}

async function runPerformanceBenchmark() {
  const button = $("#run-performance"); button.disabled = true; $("#performance-results").innerHTML = "<p>Generating and analyzing a synthetic 960 × 540 raster…</p>"; await new Promise((resolve) => setTimeout(resolve, 20));
  const width = 960, height = 540, gray = new Uint8ClampedArray(width * height).fill(232);
  for (let x = 90; x < 870; x += 1) { const top = 190 + Math.round(12 * Math.sin(x / 26)) + (Math.floor((x - 90) / 78) % 3) * 6; for (let y = top; y < 350; y += 1) gray[y * width + x] = 28; }
  const started = performance.now(), quality = imageQualityMetrics(gray, width, height), segmentation = segmentBlade(gray, width, height, { polarity: "dark", cleanupPasses: 1 }), elapsedMilliseconds = performance.now() - started;
  performanceRun = { ...performanceAssessment({ pixels: width * height, elapsedMilliseconds, budgetMilliseconds: 1200 }), found: segmentation.found, segmentationConfidence: segmentation.confidence || 0, qualityScore: quality.score };
  button.disabled = false; renderValidationWorkbench(); toast(segmentation.found ? "Synthetic performance check completed." : "Synthetic contour detection requires review in this browser.");
}

async function diagnosticModel() {
  const estimate = await navigator.storage?.estimate?.().catch(() => null), persisted = await navigator.storage?.persisted?.().catch(() => false), capabilities = capabilityRun || browserCapabilityChecks();
  return { schema: "keygauge.diagnostic", version: 1, appVersion: VERSION, createdAt: new Date().toISOString(), privacy: { containsPhotograph: false, containsMeasurementRecords: false, containsLocalStorageContents: false, generatedLocally: true }, environment: { userAgent: navigator.userAgent, viewport: { width: window.innerWidth, height: window.innerHeight }, devicePixelRatio: window.devicePixelRatio, secureContext: window.isSecureContext, online: navigator.onLine, serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller) }, storage: { estimateAvailable: Boolean(estimate), usageBytes: estimate?.usage ?? null, quotaBytes: estimate?.quota ?? null, persisted: Boolean(persisted) }, capabilities: capabilities.map(({ name, passed, required, detail }) => ({ name, passed, required, detail })), validation: validationRun ? { passed: validationRun.passed, passedChecks: validationRun.passedChecks, totalChecks: validationRun.totalChecks, checks: validationRun.checks.map(({ name, category, passed }) => ({ name, category, passed })) } : null, performance: performanceRun, privacyAudit: privacyRun ? { passed: privacyRun.passed, sourceReferenceCount: privacyRun.sourceReferenceCount, removedReferenceCount: privacyRun.removedReferenceCount } : null, policies: { imageProcessing: "local-browser-only", telemetry: "none", diagnosticContent: "synthetic-results-and-environment-only" } };
}

async function downloadDiagnostics() { download(`KEYGAUGE-diagnostics-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await diagnosticModel(), null, 2)); toast("Privacy-safe diagnostics downloaded without records or photographs."); }

function refreshAll(options = {}) { applySettings(); refreshProfileSelects(); renderCalibrationStatus(); renderCalibrationOutline(); renderScreen(); renderRecords(options); renderProfiles(); renderFieldValidationLab(); checkCalibrationEnvironment(); scheduleStorageHealthUpdate(); }

function wireEvents() {
  $$("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
  $("#mobile-menu").addEventListener("click", (event) => { const open = $("#side-rail").classList.toggle("open"); event.currentTarget.setAttribute("aria-expanded", String(open)); });
  $("#theme-select").addEventListener("change", (e) => { state.settings.theme = e.target.value; applySettings(); scheduleSave(); });
  $("#mode-select").addEventListener("change", (e) => { state.settings.mode = e.target.value; applySettings(); scheduleSave(); });
  $("#fullscreen-btn").addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => toast("Full screen is unavailable in this browser.")));
  $$("[data-calref]").forEach((button) => button.addEventListener("click", () => { $$("[data-calref]").forEach((item) => item.classList.remove("active")); button.classList.add("active"); if (button.dataset.calref === "quarter") { $("#cal-width").value = 180; $("#cal-height").value = 180; } else if (button.dataset.calref === "card") { $("#cal-width").value = 324; $("#cal-height").value = 204; } renderCalibrationOutline(); }));
  [$("#cal-width"), $("#cal-height"), $("#custom-cal-width"), $("#custom-cal-height")].forEach((input) => input.addEventListener("input", renderCalibrationOutline));
  $("#save-calibration").addEventListener("click", saveCalibration); $("#reset-calibration").addEventListener("click", () => { state.calibration = null; renderCalibrationStatus(); scheduleSave(); toast("Screen calibration cleared."); });
  $$(".profile-select").forEach((select) => select.addEventListener("change", (e) => { state.activeProfileId = e.target.value; refreshProfileSelects(); normalizeScreenDepths(); renderScreen(); renderPhoto(); scheduleSave(); }));
  $("#screen-orientation").addEventListener("change", (e) => { state.screen.orientation = e.target.value; renderScreen(); scheduleSave(); });
  $("#screen-alignment").addEventListener("change", (e) => { state.screen.alignment = e.target.value; renderScreen(); scheduleSave(); });
  $("#lock-alignment").addEventListener("click", (e) => { state.screen.locked = !state.screen.locked; e.currentTarget.setAttribute("aria-pressed", String(state.screen.locked)); e.currentTarget.textContent = state.screen.locked ? "◆ Alignment locked" : "◇ Alignment unlocked"; scheduleSave(); });
  $("#screen-high-contrast").addEventListener("change", (e) => $("#blade-stage").classList.toggle("high-contrast", e.target.checked));
  $("#screen-pan-left").addEventListener("click", () => { state.screen.pan -= 40; renderScreen(); }); $("#screen-pan-right").addEventListener("click", () => { state.screen.pan += 40; renderScreen(); });
  $("#cut-slider-list").addEventListener("input", (e) => { const row = e.target.closest(".cut-slider"); if (e.target.type === "range") updateScreenDepth(Number(row.dataset.cut), e.target.value, false); });
  $("#cut-slider-list").addEventListener("change", (e) => { const row = e.target.closest(".cut-slider"); if (e.target.type === "range" && $("#snap-depths").checked) updateScreenDepth(Number(row.dataset.cut), e.target.value, true); });
  $("#cut-slider-list").addEventListener("click", (e) => { const row = e.target.closest(".cut-slider"); if (!row) return; activeScreenCut = Number(row.dataset.cut); if (e.target.dataset.nudge) updateScreenDepth(activeScreenCut, state.screen.depths[activeScreenCut] + Number(e.target.dataset.nudge) * (e.shiftKey ? .01 : .05)); else renderScreen(); });
  $("#reverse-bitting").addEventListener("click", () => { state.screen.depths = reverseBitting(state.screen.depths); renderScreen(); scheduleSave(); });
  $("#all-cuts-down").addEventListener("click", (e) => { const amount = e.shiftKey ? .01 : .05; state.screen.depths = state.screen.depths.map((depth) => Math.max(0, depth - amount)); renderScreen(); scheduleSave(); }); $("#all-cuts-up").addEventListener("click", (e) => { const amount = e.shiftKey ? .01 : .05; state.screen.depths = state.screen.depths.map((depth) => depth + amount); renderScreen(); scheduleSave(); });
  $("#reset-cuts").addEventListener("click", () => { state.screen.depths = Array(profile().cutCount).fill(0); renderScreen(); scheduleSave(); });
  $("#reset-screen").addEventListener("click", () => { state.screen = defaultState().screen; normalizeScreenDepths(); renderScreen(); scheduleSave(); });
  [["screen-rotation", "rotation", "°"], ["screen-offset-x", "offsetX", " px"], ["screen-offset-y", "offsetY", " px"]].forEach(([id, key, suffix]) => $("#" + id).addEventListener("input", (e) => { state.screen[key] = Number(e.target.value); $("output", e.target.parentElement).textContent = `${Number(e.target.value).toFixed(key === "rotation" ? 1 : 0)}${suffix}`; renderScreen(); scheduleSave(); }));
  $("#overlay-thickness").addEventListener("input", (e) => { state.screen.overlay.thickness = Number(e.target.value); e.target.nextElementSibling.textContent = `${e.target.value} px`; renderScreen(); });
  $("#overlay-opacity").addEventListener("input", (e) => { state.screen.overlay.opacity = Number(e.target.value) / 100; e.target.nextElementSibling.textContent = `${e.target.value}%`; renderScreen(); });
  $("#overlay-color").addEventListener("input", (e) => { state.screen.overlay.color = e.target.value; renderScreen(); });
  $("#take-photo").addEventListener("click", () => $("#camera-input").click()); $("#choose-photo").addEventListener("click", () => $("#photo-input").click()); $("#replace-photo").addEventListener("click", () => $("#photo-input").click());
  [$("#camera-input"), $("#photo-input")].forEach((input) => input.addEventListener("change", () => loadPhoto(input.files[0])));
  const drop = $("#photo-dropzone"); ["dragenter", "dragover"].forEach((type) => drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add("dragging"); })); ["dragleave", "drop"].forEach((type) => drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.remove("dragging"); })); drop.addEventListener("drop", (e) => loadPhoto(e.dataTransfer.files[0]));
  document.addEventListener("paste", (e) => { const file = [...e.clipboardData.items].find((item) => item.type.startsWith("image/"))?.getAsFile(); if (file) { showView("photo"); loadPhoto(file); } });
  $("#rotate-left").addEventListener("click", () => reorientPhoto((state.photo.rotation - 90) % 360, state.photo.mirror));
  $("#mirror-photo").addEventListener("click", () => reorientPhoto(state.photo.rotation, !state.photo.mirror));
  $("#crop-photo").addEventListener("click", cropPhotoToBlade); $("#apply-crop").addEventListener("click", applyPhotoCrop); $("#reset-crop").addEventListener("click", resetPhotoCrop); $("#full-photo").addEventListener("click", openFullResolutionInspection);
  $("#restore-photo").addEventListener("click", () => { const keep = { scaleMethod: state.photo.scaleMethod, knownDistance: state.photo.knownDistance }; state.photo = { ...defaultState().photo, ...keep }; orientedSurface = null; correctedSurface = null; correctionGeometry = null; preCorrectionSnapshot = null; visionRaster = null; rebuildOrientedSurface(); renderPhoto(); runPhotoPreflight(); scheduleSave(); toast("Original image geometry restored; all photo edits were reset without replacing the source photograph."); });
  [["photo-exposure", "exposure"], ["photo-contrast", "contrast"], ["photo-edge", "edgeVisibility"]].forEach(([id, key]) => $("#" + id).addEventListener("input", (e) => { state.photo[key] = Number(e.target.value); renderPhoto(); }));
  $("#photo-scale-method").addEventListener("change", (e) => { const map = { card: 85.6, quarter: 24.26, ruler: 10, marker: 100, custom: 50, profile: profile().spacing }; $("#photo-known-distance").value = map[e.target.value]; state.photo.scaleMethod = e.target.value; });
  $("#set-scale").addEventListener("click", acceptPhotoScale); $("#detect-marker").addEventListener("click", detectMarker); $("#apply-correction").addEventListener("click", applyPhotoCorrection); $("#detect-contour").addEventListener("click", () => detectContour(false)); $("#detect-both").addEventListener("click", () => detectContour(true)); $("#segment-blade").addEventListener("click", () => runBladeSegmentation()); $("#run-preflight").addEventListener("click", () => { runPhotoPreflight(true); renderPhoto(); toast("Image-quality preflight recalculated locally."); });
  $("#reject-correction").addEventListener("click", () => rejectPhotoCorrection());
  [["perspective-x", "scaleX"], ["perspective-y", "scaleY"]].forEach(([id, key]) => $("#" + id).addEventListener("input", (e) => { state.photo.correction[key] = Number(e.target.value) / 100; renderGeometryReadout(); })); $("#perspective-skew").addEventListener("input", (e) => { state.photo.correction.keystone = Number(e.target.value) / 100; renderGeometryReadout(); });
  ["photo-overlay-color", "photo-overlay-width", "photo-overlay-opacity", "layer-photo", "layer-edge", "layer-reconstruction", "layer-mask", "layer-top-edge", "layer-bottom-edge"].forEach((id) => $("#" + id).addEventListener("input", renderPhoto));
  ["segmentation-polarity", "segmentation-sensitivity", "segmentation-cleanup"].forEach((id) => $("#" + id).addEventListener("input", () => { state.photo.polarity = $("#segmentation-polarity").value; state.photo.segmentation = null; if (visionRaster) { visionRaster.segmentation = null; visionRaster.maskCanvas = null; } renderPhoto(); scheduleSave(); }));
  $("#reverse-photo").addEventListener("click", () => { storeActiveEdgeGeometry(); for (const edge of ["top", "bottom"]) if (state.photo.edgeAnalyses[edge]?.length) state.photo.edgeAnalyses[edge].reverse(); state.photo.cuts = structuredClone(state.photo.edgeAnalyses[state.photo.activeEdge]); renderPhoto(); scheduleSave(); });
  $("#photo-alignment").addEventListener("change", () => { if (visionRaster?.segmentation) { const active = state.photo.activeEdge; storeActiveEdgeGeometry(); for (const edge of ["top", "bottom"]) if (state.photo.edgeAnalyses[edge]?.length) { state.photo.edgeGeometry[edge].reference = bladeReferenceFor(edge, visionRaster.segmentation); state.photo.activeEdge = edge; state.photo.cuts = structuredClone(state.photo.edgeAnalyses[edge]); state.photo.baseline = structuredClone(state.photo.edgeGeometry[edge].baseline); state.photo.reference = structuredClone(state.photo.edgeGeometry[edge].reference); reflowPhotoCuts(); } loadEdgeGeometry(active); } else reflowPhotoCuts(); renderPhoto(); scheduleSave(); });
  $("#photo-edge-side").addEventListener("change", (event) => { if (event.target.value !== "both") loadEdgeGeometry(event.target.value); renderPhoto(); scheduleSave(); });
  $$("[data-grid-dx],[data-grid-dy],[data-grid-rotate]").forEach((button) => button.addEventListener("click", (event) => { const fine = event.shiftKey ? .2 : 1, physicalPixel = state.photo.calibrated && state.photo.ppm ? state.photo.ppm * .1 : 1; adjustMeasurementGrid({ dx: Number(button.dataset.gridDx || 0) * physicalPixel * fine, dy: Number(button.dataset.gridDy || 0) * physicalPixel * fine, rotationDegrees: Number(button.dataset.gridRotate || 0) * fine }); }));
  $("#photo-undo").addEventListener("click", () => restorePhotoSnapshot(state.photo.history.pop(), state.photo.future)); $("#photo-redo").addEventListener("click", () => restorePhotoSnapshot(state.photo.future.pop(), state.photo.history));
  $("#photo-canvas").addEventListener("pointerdown", (e) => { const pt = canvasPoint(e), hit = photoPointAt(pt.x, pt.y); if (!hit || (hit.type === "cut" && !canEditPhotoCut(hit.index))) return; pushPhotoHistory(); const point = photoHandlePoint(hit); photoDrag = { ...hit, before: point ? { x: point.x, y: point.y, depth: point.depth } : null }; activePhotoHandle = { type: hit.type, index: hit.index }; e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); });
  $("#photo-canvas").addEventListener("pointermove", (e) => { if (!photoImage) return; const pt = canvasPoint(e), sourcePoint = analysisToSourcePoint(pt), loupe = $("#inspection-loupe"), lctx = $("canvas", loupe).getContext("2d"), sampleWidth = 28, sampleHeight = 20; loupe.classList.add("active"); lctx.clearRect(0, 0, 220, 160); lctx.imageSmoothingEnabled = false; lctx.drawImage(photoImage, clamp(sourcePoint.x - sampleWidth / 2, 0, photoImage.naturalWidth - sampleWidth), clamp(sourcePoint.y - sampleHeight / 2, 0, photoImage.naturalHeight - sampleHeight), sampleWidth, sampleHeight, 0, 0, 220, 160); $("#analysis-coordinate").textContent = `${pt.x.toFixed(1)}, ${pt.y.toFixed(1)} px`; $("#source-coordinate").textContent = `${sourcePoint.x.toFixed(1)}, ${sourcePoint.y.toFixed(1)} px`; $("#physical-coordinate").textContent = state.photo.calibrated && state.photo.ppm ? `${(pt.x / state.photo.ppm).toFixed(2)}, ${(pt.y / state.photo.ppm).toFixed(2)} mm` : "UNCALIBRATED"; if (!photoDrag) return; setPhotoHandlePoint(photoDrag, pt); renderPhoto(); });
  $("#photo-canvas").addEventListener("pointerup", () => { if (photoDrag) { const point = photoHandlePoint(photoDrag); logVerification({ position: photoDrag.type === "cut" ? photoDrag.index + 1 : null, field: photoDrag.type === "cut" ? "contour point" : `${photoDrag.type} handle`, before: photoDrag.before, after: point ? { x: point.x, y: point.y, depth: point.depth } : null }); } photoDrag = null; scheduleSave(); }); $("#photo-canvas").addEventListener("pointerleave", () => $("#inspection-loupe").classList.remove("active"));
  $("#photo-canvas").addEventListener("keydown", (event) => { const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }; if (!activePhotoHandle || !directions[event.key] || (activePhotoHandle.type === "cut" && !canEditPhotoCut(activePhotoHandle.index))) return; const point = photoHandlePoint(activePhotoHandle); if (!point) return; event.preventDefault(); pushPhotoHistory(); const before = { x: point.x, y: point.y, depth: point.depth }, [dx, dy] = directions[event.key], fine = event.shiftKey ? .2 : 1; setPhotoHandlePoint(activePhotoHandle, { x: point.x + dx * fine, y: point.y + dy * fine }); const after = photoHandlePoint(activePhotoHandle); logVerification({ position: activePhotoHandle.type === "cut" ? activePhotoHandle.index + 1 : null, field: activePhotoHandle.type === "cut" ? "keyboard contour edit" : `keyboard ${activePhotoHandle.type} edit`, before, after: { x: after.x, y: after.y, depth: after.depth } }); renderPhoto(); scheduleSave(); });
  $("#photo-cut-table").addEventListener("change", (e) => { if (e.target.dataset.photoStatus !== undefined) { pushPhotoHistory(); setCutDecision(Number(e.target.dataset.photoStatus), e.target.value); } else if (e.target.dataset.photoReason !== undefined) { const index = Number(e.target.dataset.photoReason), cut = state.photo.cuts[index], before = cut.reason || ""; cut.reason = e.target.value; invalidateFinalVerification("A decision reason changed"); logVerification({ position: index + 1, field: "reason code", before, after: cut.reason }); storeActiveEdgeGeometry(); renderPhoto(); scheduleSave(); } else if (e.target.dataset.photoNote !== undefined) { const index = Number(e.target.dataset.photoNote), cut = state.photo.cuts[index], before = cut.reviewNote || ""; cut.reviewNote = e.target.value.trim(); invalidateFinalVerification("A review note changed"); logVerification({ position: index + 1, field: "review note", before, after: cut.reviewNote }); storeActiveEdgeGeometry(); renderPhoto(); scheduleSave(); } else if (e.target.dataset.photoCode !== undefined) { pushPhotoHistory(); setPhotoCutCode(Number(e.target.dataset.photoCode), e.target.value); } else if (e.target.dataset.cutDepth !== undefined) { pushPhotoHistory(); setPhotoCutDepth(Number(e.target.dataset.cutDepth), e.target.value); } });
  $("#photo-cut-table").addEventListener("click", (e) => { const button = e.target.closest("[data-cut-nudge]"); if (!button) return; pushPhotoHistory(); const index = Number(button.dataset.cutIndex), amount = Number(button.dataset.cutNudge) * (e.shiftKey ? .1 : 1); setPhotoCutDepth(index, Number(state.photo.cuts[index].depth) + amount); });
  $("#accept-readable").addEventListener("click", () => { if (!state.photo.cuts.length) return; pushPhotoHistory(); invalidateFinalVerification("Readable cuts were accepted in a batch"); state.photo.cuts.forEach((cut, index) => { if (cut.status !== "unreadable") { const before = cut.status; cut.status = "accepted"; cut.reason ||= "visible-match"; cut.reviewedAt = new Date().toISOString(); logVerification({ position: index + 1, field: "decision", before, after: "accepted", reason: cut.reason }); } }); storeActiveEdgeGeometry(); renderPhoto(); scheduleSave(); });
  $("#reset-verification").addEventListener("click", () => { if (!state.photo.cuts.length) return; pushPhotoHistory(); invalidateFinalVerification("Verification decisions were reset"); state.photo.cuts.forEach((cut, index) => { if (cut.status !== "unreadable") { const before = cut.status; cut.status = "estimated"; cut.reviewedAt = null; logVerification({ position: index + 1, field: "decision", before, after: "estimated", reason: "Batch reset" }); } }); storeActiveEdgeGeometry(); renderPhoto(); scheduleSave(); });
  $("#protect-accepted").addEventListener("change", (event) => { const verification = verificationState(), before = verification.protectAccepted; verification.protectAccepted = event.target.checked; logVerification({ field: "accepted-cut protection", before, after: verification.protectAccepted }); renderPhoto(); scheduleSave(); });
  $("#ack-verification-warnings").addEventListener("change", (event) => { const verification = verificationState(); verification.warningsAcknowledged = event.target.checked; logVerification({ field: "warning acknowledgment", before: !event.target.checked, after: event.target.checked }); renderVerificationSummary(); renderVerificationLog(); scheduleSave(); });
  $("#verification-session-note").addEventListener("change", (event) => { const verification = verificationState(), before = verification.sessionNote; verification.sessionNote = event.target.value.trim(); invalidateFinalVerification("The verification session note changed"); logVerification({ field: "session note", before, after: verification.sessionNote }); renderVerificationSummary(); renderVerificationLog(); scheduleSave(); });
  $("#finalize-verification").addEventListener("click", finalizeVerification); $("#reopen-verification").addEventListener("click", reopenVerification); $("#export-sanitized-image").addEventListener("click", exportSanitizedBladeImage);
  $("#save-screen-record").addEventListener("click", () => saveRecord("screen")); $("#save-photo-record").addEventListener("click", () => saveRecord("photo")); $("#manual-save").addEventListener("click", () => { const method = $("#record-method").value; if (method === "photo" && !state.photo.cuts.length) return toast("Create a photo analysis before saving a photo-derived record."); if (method === "manual" && !$("#manual-bitting").value.trim()) return toast("Enter a manual bitting sequence first."); saveRecord(method); });
  $("#compare-methods").addEventListener("click", renderMethodComparison); $("#close-method-comparison").addEventListener("click", () => $("#method-comparison").classList.add("hidden")); $("#save-combined-record").addEventListener("click", () => { saveRecord("combined"); showView("records"); toast("Confidence-weighted combined-method record saved locally."); });
  $("#delete-photo").addEventListener("click", () => { if (confirm("Permanently delete the photograph from this session?")) deletePhoto(); });
  $("#print-marker").addEventListener("click", () => window.open("marker.html", "_blank", "noopener"));
  $("#export-project").addEventListener("click", exportProject); $("#import-project").addEventListener("click", () => $("#import-project-file").click()); $("#import-project-file").addEventListener("change", (e) => importProject(e.target.files[0]));
  $("#export-profiles").addEventListener("click", exportProfiles); $("#import-profiles").addEventListener("click", () => $("#import-profiles-file").click()); $("#import-profiles-file").addEventListener("change", (e) => importProfiles(e.target.files[0])); $("#duplicate-profile").addEventListener("click", duplicateProfile); $("#profile-form").addEventListener("submit", saveProfile);
  $("#new-profile").addEventListener("click", () => { const copy = { ...structuredClone(DEMO_PROFILES[0]), id: createLocalId(), name: "New custom profile", manufacturer: "", blanks: "", kind: "user-defined", source: "", notes: "", verified: false }; state.profiles.push(copy); state.activeProfileId = copy.id; refreshProfileSelects(); renderProfiles(); scheduleSave(); });
  $("#profile-list").addEventListener("click", (e) => { const card = e.target.closest("[data-profile]"); if (!card) return; state.activeProfileId = card.dataset.profile; refreshProfileSelects(); renderProfiles(); renderScreen(); scheduleSave(); });
  $("#records-list").addEventListener("click", (e) => { const load = e.target.closest("[data-load-record]"), revise = e.target.closest("[data-revise-record]"), duplicate = e.target.closest("[data-duplicate-record]"), report = e.target.closest("[data-report-record]"), del = e.target.closest("[data-delete-record]"); if (load) loadRecord(load.dataset.loadRecord); if (revise) reviseRecord(revise.dataset.reviseRecord); if (duplicate) duplicateRecord(duplicate.dataset.duplicateRecord); if (report) { $("#report-record").value = report.dataset.reportRecord; renderReportPreview(); $("#report-builder").scrollIntoView({ behavior: "smooth" }); } if (del) deleteRecord(del.dataset.deleteRecord); });
  $("#records-list").addEventListener("change", (event) => { if (event.target.dataset.compareCheck === undefined) return; const option = [...$("#compare-records").options].find((item) => item.value === event.target.dataset.compareCheck); if (option) option.selected = event.target.checked; updateComparisonSelectionStatus(); });
  ["record-search", "record-filter-tags"].forEach((id) => $("#" + id).addEventListener("input", () => { Object.assign(state.recordView, recordViewFromControls()); renderRecords(); scheduleSave(); })); ["record-filter-method", "record-filter-status", "record-sort"].forEach((id) => $("#" + id).addEventListener("change", () => { Object.assign(state.recordView, recordViewFromControls()); renderRecords(); scheduleSave(); }));
  RECORD_EDITOR_IDS.forEach((id) => $("#" + id).addEventListener(id === "record-method" ? "change" : "input", markRecordEditorDirty));
  $("#save-record-view").addEventListener("click", openSavedViewDialog); $("#saved-view-form").addEventListener("submit", saveRecordView); $("#cancel-saved-view").addEventListener("click", () => $("#saved-view-dialog").close()); $("#saved-view-select").addEventListener("change", (event) => applySavedRecordView(event.target.value)); $("#delete-record-view").addEventListener("click", () => { const id = $("#saved-view-select").value; if (!id) return; state.recordView.savedViews = state.recordView.savedViews.filter((view) => view.id !== id); renderRecords(); scheduleSave(); toast("Saved view deleted."); });
  $("#export-records-archive").addEventListener("click", exportRecordsArchive); $("#import-records-archive").addEventListener("click", () => $("#records-archive-file").click()); $("#records-archive-file").addEventListener("change", (event) => importRecordsArchive(event.target.files[0]));
  $("#recovery-list").addEventListener("click", (event) => { const restore = event.target.closest("[data-restore-point]"), del = event.target.closest("[data-delete-point]"); if (restore) restoreRecoveryPoint(restore.dataset.restorePoint); if (del) { state.recoveryPoints = state.recoveryPoints.filter((point) => point.id !== del.dataset.deletePoint); renderRecoveryPoints(); scheduleSave(); } }); $("#create-recovery-point").addEventListener("click", () => createLocalRecoveryPoint("Manual checkpoint")); $("#clear-recovery-points").addEventListener("click", () => { if (!state.recoveryPoints.length || !confirm("Delete every local recovery checkpoint? Saved records are not affected.")) return; state.recoveryPoints = []; renderRecoveryPoints(); scheduleSave(); toast("Recovery checkpoints deleted."); });
  $("#download-worksheets").addEventListener("click", downloadWorksheets); $("#print-worksheets").addEventListener("click", printWorksheets); $("#worksheet-marker").addEventListener("click", () => window.open("marker.html", "_blank", "noopener"));
  $("#run-compare").addEventListener("click", compareRecords); $("#compare-records").addEventListener("change", updateComparisonSelectionStatus); $("#clear-comparison").addEventListener("click", () => { [...$("#compare-records").options].forEach((option) => { option.selected = false; }); $$('[data-compare-check]').forEach((checkbox) => { checkbox.checked = false; }); $("#comparison-output").innerHTML = ""; updateComparisonSelectionStatus(); }); $("#export-csv").addEventListener("click", () => { const first = $("#compare-records").selectedOptions[0], record = state.records.find((item) => item.id === first?.value); if (!record) return toast("Select a saved record first."); download("KEYGAUGE-measurement.csv", measurementsToCsv(record), "text/csv"); }); $("#report-record").addEventListener("change", renderReportPreview); $("#preview-report").addEventListener("click", renderReportPreview); $("#download-report").addEventListener("click", downloadReport); $("#print-report").addEventListener("click", printReport);
  $("#copy-bitting").addEventListener("click", async () => { const first = $("#compare-records").selectedOptions[0], record = state.records.find((item) => item.id === first?.value); if (!record) return toast("Select a saved record first."); try { await navigator.clipboard.writeText(record.bitting.join("")); toast("Bitting sequence copied."); } catch { toast("Clipboard access is unavailable. Select and copy the sequence from the comparison table."); } });
  $("#new-measurement").addEventListener("click", () => { if (!confirmDiscardRecordDraft()) return; state.currentRecord = defaultState().currentRecord; state.screen.depths = Array(profile().cutCount).fill(0); state.photo.cuts = []; recordEditorDirty = false; renderScreen(); renderRecords({ refreshEditor: true }); scheduleSave(); showView("home"); });
  $("#restore-session").addEventListener("click", () => { if (!confirmDiscardRecordDraft()) return; try { const recovery = localStorage.getItem(`${STORAGE_KEY}.last`) || localStorage.getItem(`${STORAGE_KEY}.recovery`); if (!recovery) return toast("No prior-session snapshot is available. Large projects rely on named recovery checkpoints and exported backups."); state = deepMerge(defaultState(), JSON.parse(recovery)); state.version = VERSION; state.records = (state.records || []).map(migrateRecord); state.validationStudies = (state.validationStudies || []).map(normalizeValidationStudy); state.currentRecord = state.currentRecord?.id ? migrateRecord(state.currentRecord) : state.currentRecord; state.recoveryPoints = compactRecoveryPoints(state.recoveryPoints || []); activeValidationStudyId = null; fieldValidationPreview = null; recordEditorDirty = false; refreshAll({ refreshEditor: true }); scheduleSave(); toast("Previous local session restored and migrated if needed."); } catch { toast("The prior-session snapshot could not be restored."); } });
  $("#fresh-start").addEventListener("click", () => { if (!confirm("Permanently clear all KEYGAUGE project data, recovery checkpoints, calibration, profiles, records, validation studies, and settings from this browser? Export a backup first if needed.")) return; for (const key of [STORAGE_KEY, `${STORAGE_KEY}.last`, `${STORAGE_KEY}.recovery`, ACK_KEY]) localStorage.removeItem(key); state = defaultState(); activeValidationStudyId = null; fieldValidationPreview = null; recordEditorDirty = false; $("#ack-check").checked = false; $("#ack-button").disabled = true; deletePhoto(false); refreshAll({ refreshEditor: true }); $("#responsible-dialog").showModal(); toast("Fresh start complete. No hidden recovery snapshot was retained."); });
  $("#download-static").addEventListener("click", () => { const a = Object.assign(document.createElement("a"), { href: "KEYGAUGE-static.zip", download: "KEYGAUGE-static.zip" }); a.click(); });
  $("#run-validation").addEventListener("click", runLocalValidation); $("#run-performance").addEventListener("click", runPerformanceBenchmark); $("#download-diagnostics").addEventListener("click", downloadDiagnostics); $("#open-validation-sheet").addEventListener("click", () => window.open("validation-sheet.html", "_blank", "noopener"));
  $("#analyze-field-study").addEventListener("click", analyzeFieldStudy); $("#save-field-study").addEventListener("click", saveFieldStudy); $("#new-field-study").addEventListener("click", newFieldStudy); $("#download-field-report").addEventListener("click", () => openFieldReport(fieldValidationPreview)); $("#print-field-report").addEventListener("click", () => openFieldReport(fieldValidationPreview, true));
  $("#export-validation-studies").addEventListener("click", exportValidationStudies); $("#export-validation-csv").addEventListener("click", exportValidationCsv); $("#import-validation-studies").addEventListener("click", () => $("#validation-studies-file").click()); $("#validation-studies-file").addEventListener("change", (event) => importValidationStudies(event.target.files[0]));
  $("#field-study-list").addEventListener("click", (event) => { const load = event.target.closest("[data-load-field-study]"), report = event.target.closest("[data-report-field-study]"), del = event.target.closest("[data-delete-field-study]"); if (load) loadFieldStudy(load.dataset.loadFieldStudy); if (report) openFieldReport(state.validationStudies.find((study) => study.id === report.dataset.reportFieldStudy)); if (del && confirm("Permanently delete this saved field validation study?")) { createLocalRecoveryPoint("Before field study deletion", false); state.validationStudies = state.validationStudies.filter((study) => study.id !== del.dataset.deleteFieldStudy); if (activeValidationStudyId === del.dataset.deleteFieldStudy) newFieldStudy(); else renderFieldValidationLab(); scheduleSave(); toast("Field validation study deleted."); } });
  $("#ack-check").addEventListener("change", (e) => $("#ack-button").disabled = !e.target.checked); $("#ack-button").addEventListener("click", () => { try { localStorage.setItem(ACK_KEY, "accepted"); } catch { toast("Authorization acknowledgment could not be stored, but you may continue this session."); } });
  $("#storage-export-backup").addEventListener("click", exportProject); $("#request-persistent-storage").addEventListener("click", async () => { if (!navigator.storage?.persist) return toast("Persistent storage is unavailable in this browser."); const granted = await navigator.storage.persist(); await updateStorageHealth(); toast(granted ? "Browser storage protection was granted." : "The browser kept best-effort storage. Export backups regularly."); }); $("#install-app").addEventListener("click", async () => { if (!deferredInstallPrompt) return toast("Use your browser menu to install KEYGAUGE on this device."); deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $("#install-app").classList.add("hidden"); });
  window.addEventListener("resize", () => { checkCalibrationEnvironment(); if ($("#view-screen").classList.contains("active")) renderScreen(); if ($("#view-photo").classList.contains("active")) renderPhoto(); });
  window.addEventListener("beforeunload", (event) => { if (!recordEditorDirty) return; event.preventDefault(); event.returnValue = ""; });
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; $("#install-app").classList.remove("hidden"); });
  window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; $("#install-app").classList.add("hidden"); toast("KEYGAUGE installed for quicker offline access."); });
}

const REQUIRED_CONTROL_IDS = ["workspace", "autosave-state", "storage-state", "mobile-menu", "save-calibration", "save-screen-record", "take-photo", "choose-photo", "photo-canvas", "save-photo-record", "manual-save", "record-search", "compare-records", "save-record-view", "create-recovery-point", "export-project", "run-validation", "run-performance", "download-diagnostics", "field-study-form", "analyze-field-study", "save-field-study", "export-validation-studies", "fresh-start"];

function assertControlContract() {
  const missing = REQUIRED_CONTROL_IDS.filter((id) => !document.getElementById(id));
  if (missing.length) throw new Error(`Missing required controls: ${missing.join(", ")}`);
}

function setConnectionStatus(ready = Boolean(navigator.serviceWorker?.controller)) {
  const lamp = $("#connection-state"); if (!lamp) return;
  const offline = !navigator.onLine; lamp.classList.toggle("safe", ready || offline); lamp.classList.toggle("danger", offline && !ready); lamp.innerHTML = `<i></i> ${offline ? ready ? "OFFLINE READY" : "OFFLINE LIMITED" : ready ? "OFFLINE READY" : "ONLINE"}`;
}

function showUpdateAvailable(registration) {
  const banner = $("#update-banner"); banner.classList.remove("hidden");
  $("#apply-update").onclick = () => registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  $("#dismiss-update").onclick = () => banner.classList.add("hidden");
}

async function registerOfflineSupport() {
  setConnectionStatus(false); window.addEventListener("online", () => setConnectionStatus()); window.addEventListener("offline", () => setConnectionStatus());
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloadingForServiceWorker) return; reloadingForServiceWorker = true; location.reload(); });
  try {
    const registration = await navigator.serviceWorker.register("service-worker.js");
    if (registration.waiting) showUpdateAvailable(registration);
    registration.addEventListener("updatefound", () => { const worker = registration.installing; worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateAvailable(registration); }); });
    await navigator.serviceWorker.ready; setConnectionStatus(true);
  } catch { setConnectionStatus(false); toast("Offline installation is unavailable. KEYGAUGE remains usable while this page is open."); }
}

function initialize() {
  try {
    assertControlContract(); wireEvents(); refreshAll({ refreshEditor: true });
    const hash = location.hash.slice(1); showView(["home", "screen", "photo", "calibration", "records", "profiles", "validation", "help"].includes(hash) ? hash : "home", false);
    if (!localStorage.getItem(ACK_KEY)) $("#responsible-dialog").showModal();
    registerOfflineSupport(); window.__KEYGAUGE_BOOTED = true;
  } catch (error) {
    console.error(error); const boot = $("#boot-error"); boot.hidden = false; $("span", boot).textContent = `Startup stopped before controls were enabled: ${error.message}`;
  }
}

initialize();
