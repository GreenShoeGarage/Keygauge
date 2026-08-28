import {
  adjacentViolations, analysisToDisplayPoint, applyHomography, calibrationFactor, clamp, cutPositions, displayPlan, displayToAnalysisPoint, measurementConfidence,
  depthCandidates, detectCalibrationMarker, estimateCutSamples, fitLine, imageQualityMetrics, measurementsToCsv, nearestDepth, parseProject, perspectiveMagnitude,
  pixelsPerMillimeter, multiplyMatrix3, orientationPlan, rectificationPlan, reverseBitting, rgbaToGrayscale, segmentBlade, serializeProject, transformGeometryModel, withoutImageData,
} from "./logic.mjs";

const VERSION = "1.2.4";
const STORAGE_KEY = "keygauge.project.v1";
const ACK_KEY = "keygauge.authorized.v1";

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
  photo: { geometryVersion: 3, coordinateSpace: "oriented-source", scaleMethod: "card", knownDistance: 85.6, ppm: null, calibrated: false, scalePoints: [], corners: [], baseline: null, reference: null, cuts: [], crop: null, rotation: 0, mirror: false, exposure: 0, contrast: 110, edgeVisibility: 30, polarity: "auto", quality: null, marker: null, segmentation: null, activeEdge: "top", edgeAnalyses: { top: [], bottom: [] }, edgeGeometry: { top: { baseline: null, reference: null }, bottom: { baseline: null, reference: null } }, correction: { scaleX: 1, scaleY: 1, keystone: 0, accepted: false, magnitude: 0, residual: null, downsample: 1 }, history: [], future: [] },
  currentRecord: { id: null, name: "Untitled key measurement", reference: "", notes: "", method: null, cuts: [], createdAt: null },
  records: [],
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const deepMerge = (base, saved) => {
  if (!saved || typeof saved !== "object") return base;
  for (const [key, value] of Object.entries(saved)) {
    if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) deepMerge(base[key], value);
    else base[key] = value;
  }
  return base;
};

let state = defaultState();
try { state = deepMerge(defaultState(), JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")); } catch { state = defaultState(); }
let saveTimer = null;
let toastTimer = null;
let photoImage = null;
let photoDrag = null;
let photoDisplay = null;
let orientedSurface = null;
let correctedSurface = null;
let orientationGeometry = null;
let correctionGeometry = null;
let preCorrectionSnapshot = null;
let fullResolutionPopup = null;
let visionRaster = null;
let activeScreenCut = 0;

function toast(message) {
  const node = $("#toast"); node.textContent = message; node.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
}

function scheduleSave() {
  const lamp = $("#autosave-state"); lamp.innerHTML = "<i></i> UNSAVED";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    lamp.innerHTML = "<i></i> SAVING";
    const safeState = structuredClone(state);
    safeState.photo = withoutImageData(safeState.photo);
    const previous = localStorage.getItem(STORAGE_KEY); if (previous) localStorage.setItem(`${STORAGE_KEY}.last`, previous);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
    setTimeout(() => { lamp.innerHTML = "<i></i> SAVED"; }, 180);
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
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  $("#side-rail").classList.remove("open");
  if (pushHash) history.replaceState(null, "", `#${name}`);
  if (name === "screen") { renderScreen(); setTimeout(renderScreen, 40); }
  if (name === "photo") { setTimeout(renderPhoto, 40); }
  if (name === "records") renderRecords();
  if (name === "profiles") renderProfiles();
  $("#workspace").focus({ preventScroll: true });
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
    orientedSurface = null; correctedSurface = null; orientationGeometry = null; correctionGeometry = null; preCorrectionSnapshot = null; visionRaster = null;
    rebuildOrientedSurface();
    $("#photo-workspace").classList.remove("hidden"); $("#photo-dropzone").classList.add("has-image"); $("#photo-results-wrap").classList.add("hidden");
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
    if ($("#layer-reconstruction").checked) { ctx.beginPath(); cuts.forEach((cut, index) => { if (!index) ctx.moveTo(cut.x, cut.y); else ctx.lineTo(cut.x, cut.y); }); ctx.stroke(); }
    if ($("#layer-edge").checked) cuts.forEach((cut, index) => { ctx.beginPath(); ctx.arc(cut.x, cut.y, 7, 0, Math.PI * 2); ctx.fillStyle = p.cuts[index].status === "unreadable" ? "#ef745f" : color; ctx.fill(); ctx.strokeStyle = "#111"; ctx.stroke(); ctx.fillStyle = color; ctx.fillText(`${index + 1}:${p.cuts[index].code ?? "?"}`, cut.x - 12, cut.y - 13); });
  }
  const otherEdge = p.activeEdge === "top" ? "bottom" : "top", otherCuts = (p.edgeAnalyses?.[otherEdge] || []).map(display);
  if (otherCuts.length && $("#layer-reconstruction").checked) { ctx.save(); ctx.strokeStyle = "#c39cff"; ctx.setLineDash([5, 4]); ctx.beginPath(); otherCuts.forEach((cut, index) => { if (!index) ctx.moveTo(cut.x, cut.y); else ctx.lineTo(cut.x, cut.y); }); ctx.stroke(); ctx.restore(); }
  if (p.crop) {
    const cropCorners = cropHandlePoints().map(display); ctx.strokeStyle = "#c39cff"; ctx.fillStyle = "#c39cff"; ctx.setLineDash([6, 4]); ctx.strokeRect(cropCorners[0].x, cropCorners[0].y, cropCorners[2].x - cropCorners[0].x, cropCorners[2].y - cropCorners[0].y); ctx.setLineDash([]);
    cropCorners.forEach((point) => { ctx.fillRect(point.x - 6, point.y - 6, 12, 12); }); ctx.fillText(p.crop.accepted ? "NON-DESTRUCTIVE CROP ACTIVE" : "DRAG CROP CORNERS · APPLY WHEN READY", cropCorners[0].x + 8, cropCorners[0].y + 18);
  }
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
  if (!raw) return; destination.push(JSON.stringify(geometrySnapshot())); restoreGeometry(JSON.parse(raw)); renderPhoto(); scheduleSave();
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

function updatePhotoCutFromPoint(index) {
  const cut = state.photo.cuts[index], baseY = baselineYAt(cut.x); const sign = state.photo.activeEdge === "top" ? 1 : -1;
  const depthPx = (baseY - cut.y) * sign; const depth = state.photo.calibrated && state.photo.ppm ? Math.max(0, depthPx / state.photo.ppm) : Math.max(0, depthPx / 18);
  const match = nearestDepth(depth, profile().depthMap); Object.assign(cut, { depth, code: match.code, difference: match.difference, ambiguity: match.ambiguity, candidates: depthCandidates(depth, profile().depthMap, 3) }); storeActiveEdgeGeometry();
}

function reflowPhotoCuts() {
  if (!state.photo.cuts.length) return;
  const surface = getAnalysisSurface(), p = profile(), ppm = state.photo.ppm || (surface.width * .55 / Math.max(1, p.firstCut + p.spacing * (p.cutCount - 1))), direction = $("#photo-alignment").value === "tip" ? -1 : 1, start = state.photo.reference.x + direction * p.firstCut * ppm, sign = state.photo.activeEdge === "top" ? 1 : -1;
  state.photo.cuts.forEach((cut, index) => { cut.x = clamp(start + direction * index * p.spacing * ppm, 2, surface.width - 3); cut.y = baselineYAt(cut.x) - sign * cut.depth * (state.photo.calibrated ? ppm : 18); });
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
  cuts.forEach((cut) => { cut.contrast = edgeContrast; if (segmentation.confidence < 24) cut.status = "unreadable"; });
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
  const unreadable = [], confirmed = []; rawCuts.forEach((cut, index) => { if (cut.status === "unreadable") unreadable.push(index); if (cut.status === "accepted") confirmed.push(index); });
  return makeCuts(rawCuts.map((cut) => cut.depth), state.photo.calibrated, { resolution: photoResolutionScore(), contrast: rawCuts.length ? rawCuts.reduce((sum, cut) => sum + Number(cut.contrast || .5), 0) / rawCuts.length : averagePhotoContrast(), perspective: state.photo.correction.accepted ? state.photo.correction.magnitude : perspectiveMagnitude(state.photo.corners), confirmed, unreadable }).map((cut, index) => ({ ...cut, candidates: rawCuts[index]?.candidates || depthCandidates(cut.depth, profile().depthMap, 3), sourceStatus: rawCuts[index]?.status || "estimated" }));
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
  $("#photo-cut-table").innerHTML = `<div class="table-edge-label">EDITING ${state.photo.activeEdge.toUpperCase()} EDGE · alternate candidates remain visible until each cut is verified</div><table class="cut-table"><thead><tr><th>Cut</th><th>Raw depth</th><th>Nearest code</th><th>Alternate</th><th>Difference</th><th>Confidence</th><th>Verification</th></tr></thead><tbody>${cuts.map((cut, index) => { const alternatives = (cut.candidates || []).slice(1, 3).map((candidate) => `${candidate.code} (${candidate.difference >= 0 ? "+" : ""}${candidate.difference.toFixed(3)})`).join(" · ") || "—"; return `<tr><td>${index + 1}</td><td>${cut.depth.toFixed(3)} mm</td><td>${cut.code}</td><td>${alternatives}</td><td>${cut.difference >= 0 ? "+" : ""}${cut.difference.toFixed(3)} mm</td><td>${cut.confidence.label} · ${cut.confidence.score}%</td><td><select data-photo-status="${index}"><option value="estimated" ${state.photo.cuts[index].status === "estimated" ? "selected" : ""}>Review</option><option value="accepted" ${state.photo.cuts[index].status === "accepted" ? "selected" : ""}>Accept</option><option value="rejected" ${state.photo.cuts[index].status === "rejected" ? "selected" : ""}>Reject</option><option value="unreadable" ${state.photo.cuts[index].status === "unreadable" ? "selected" : ""}>Unreadable</option></select></td></tr>`; }).join("")}</tbody></table>`;
}

function deletePhoto(permanent = true) {
  photoImage = null; orientedSurface = null; correctedSurface = null; orientationGeometry = null; correctionGeometry = null; preCorrectionSnapshot = null; visionRaster = null; if (fullResolutionPopup && !fullResolutionPopup.closed) fullResolutionPopup.close(); fullResolutionPopup = null; state.photo = defaultState().photo; $("#photo-workspace").classList.add("hidden"); $("#photo-results-wrap").classList.add("hidden"); $("#photo-dropzone").classList.remove("has-image"); $("#photo-storage-status").textContent = "No photograph is currently stored locally."; setPhotoWorkflow(0); scheduleSave(); if (permanent) toast("Photograph and all derived image surfaces were permanently removed from this session.");
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

function currentRecord(method) {
  if (state.photo.cuts.length) storeActiveEdgeGeometry();
  const usePhoto = method === "photo"; let cuts;
  if (method === "manual") {
    const codes = $("#manual-bitting").value.split(/[\s,.-]+/).filter(Boolean); cuts = codes.map((code, index) => { const depth = Number(profile().depthMap[code]); const valid = Number.isFinite(depth); const match = valid ? nearestDepth(depth, profile().depthMap) : { difference: 0, ambiguity: 1, outOfRange: true }; return { position: index + 1, depth: valid ? depth : 0, code, difference: match.difference, ambiguity: match.ambiguity, outOfRange: match.outOfRange, confidence: { score: valid ? 65 : 20, label: valid ? "Review recommended" : "Ambiguous" }, status: "manual" }; });
  } else if (method === "combined" && state.photo.cuts.length) {
    const photo = photoCuts(), screen = makeCuts(); cuts = makeCuts(screen.map((cut, index) => (cut.depth + (photo[index]?.depth ?? cut.depth)) / 2), Boolean(state.calibration) && state.photo.calibrated);
  } else cuts = usePhoto && state.photo.cuts.length ? photoCuts() : makeCuts();
  const summary = renderResults(usePhoto ? "photo" : "screen", cuts);
  const methodLabel = usePhoto ? "Photo analysis" : method === "combined" ? "Combination of on-screen and photo methods" : method === "manual" ? "Manual entry" : "On-screen physical alignment"; const continuing = state.currentRecord.method === methodLabel; const usesPhotoEvidence = usePhoto || method === "combined";
  const edgeResults = usesPhotoEvidence ? Object.fromEntries(["top", "bottom"].filter((edge) => state.photo.edgeAnalyses[edge]?.length).map((edge) => [edge, photoCutsFor(state.photo.edgeAnalyses[edge])])) : undefined;
  return { id: continuing && state.currentRecord.id ? state.currentRecord.id : crypto.randomUUID(), name: $("#record-name").value.trim() || "Untitled key measurement", reference: $("#record-reference").value.trim(), notes: $("#record-notes").value.trim(), createdAt: continuing && state.currentRecord.createdAt ? state.currentRecord.createdAt : new Date().toISOString(), updatedAt: new Date().toISOString(), method: methodLabel, profileId: profile().id, profileName: profile().name, profileKind: profile().kind, bitting: cuts.map((cut) => cut.status === "unreadable" ? "?" : cut.code), cuts, edgeResults, activeEdge: usesPhotoEvidence ? state.photo.activeEdge : undefined, confidence: summary.label, photoQuality: usesPhotoEvidence ? state.photo.quality : undefined, segmentation: usesPhotoEvidence ? state.photo.segmentation : undefined, calibration: usesPhotoEvidence ? { screen: state.calibration, photo: { method: state.photo.scaleMethod, pixelsPerMillimeter: state.photo.ppm, perspectiveCorrected: state.photo.correction.accepted, correctionResidualPixels: state.photo.correction.residual, analysisResolutionScale: state.photo.correction.downsample, coordinateSpace: state.photo.coordinateSpace, cropApplied: Boolean(state.photo.crop?.accepted), alignment: $("#photo-alignment").value } } : state.calibration, reportNotice: usesPhotoEvidence ? "This bitting was estimated from a photograph using user-supplied scale and alignment references. Verify all measurements using appropriate professional locksmith tools before cutting a key or servicing a lock." : "Estimated using a screen-based visual alignment method. Verify all measurements with appropriate professional locksmith tools before cutting or servicing a lock." };
}

function saveRecord(method) {
  const record = currentRecord(method); const existing = state.records.findIndex((item) => item.id === record.id); if (existing >= 0) state.records[existing] = record; else state.records.unshift(record); state.currentRecord = { ...record };
  if (method === "photo" && $("#delete-photo-after").checked) deletePhoto(false);
  scheduleSave(); renderRecords(); toast("Measurement record saved locally.");
}

function renderRecords() {
  const records = state.records;
  $("#records-list").innerHTML = records.length ? records.map((record) => `<div class="record-row"><strong>${escapeHtml(record.name)}</strong><code>${record.bitting.join("-")}</code><span>${escapeHtml(record.method)}</span><span>${new Date(record.updatedAt || record.createdAt).toLocaleString()}</span><div><button class="subtle-button" data-load-record="${record.id}">Open</button> <button class="danger-button" data-delete-record="${record.id}">Delete</button></div></div>`).join("") : `<p class="lede">No saved measurements yet.</p>`;
  [$("#compare-a"), $("#compare-b")].forEach((select, position) => { select.innerHTML = `<option value="">Select record</option>${records.map((record, index) => `<option value="${record.id}" ${index === position ? "selected" : ""}>${escapeHtml(record.name)} · ${record.bitting.join("")}</option>`).join("")}`; });
  $("#record-name").value = state.currentRecord.name || "Untitled key measurement"; $("#record-reference").value = state.currentRecord.reference || ""; $("#record-notes").value = state.currentRecord.notes || ""; $("#record-method").value = state.currentRecord.method === "Photo analysis" ? "photo" : state.currentRecord.method?.startsWith("Combination") ? "combined" : state.currentRecord.method === "Manual entry" ? "manual" : "screen"; $("#manual-bitting").value = state.currentRecord.method === "Manual entry" ? (state.currentRecord.bitting || []).join("-") : "";
}

function compareRecords() {
  const a = state.records.find((record) => record.id === $("#compare-a").value), b = state.records.find((record) => record.id === $("#compare-b").value);
  if (!a || !b) { toast("Choose two saved records to compare."); return; } if (a.profileId !== b.profileId) { toast("Comparison requires the same key profile."); return; }
  const count = Math.max(a.cuts.length, b.cuts.length); $("#comparison-output").innerHTML = `<table class="comparison-table"><thead><tr><th>Record</th>${Array.from({ length: count }, (_, i) => `<th>Cut ${i + 1}</th>`).join("")}</tr></thead><tbody><tr><th>${escapeHtml(a.name)}</th>${a.cuts.map((cut) => `<td>${cut.code}<br>${cut.depth.toFixed(3)} mm</td>`).join("")}</tr><tr><th>${escapeHtml(b.name)}</th>${b.cuts.map((cut) => `<td>${cut.code}<br>${cut.depth.toFixed(3)} mm</td>`).join("")}</tr><tr><th>Difference</th>${Array.from({ length: count }, (_, i) => `<td>${((b.cuts[i]?.depth || 0) - (a.cuts[i]?.depth || 0)).toFixed(3)} mm</td>`).join("")}</tr></tbody></table>`;
}

function loadRecord(id) {
  const record = state.records.find((item) => item.id === id); if (!record) return; state.currentRecord = structuredClone(record); state.activeProfileId = record.profileId; state.screen.depths = record.cuts.map((cut) => cut.depth); refreshProfileSelects(); renderScreen(); renderRecords(); showView(record.method.startsWith("Photo") ? "records" : "screen"); toast("Measurement loaded for review.");
}

function deleteRecord(id) {
  if (!confirm("Delete this local measurement record?")) return; localStorage.setItem(`${STORAGE_KEY}.recovery`, JSON.stringify(state)); state.records = state.records.filter((item) => item.id !== id); scheduleSave(); renderRecords(); toast("Record deleted. A recovery snapshot was retained.");
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
  const copy = { ...structuredClone(profile()), id: crypto.randomUUID(), name: `${profile().name} — copy`, kind: "user-defined", verified: false, source: profile().kind === "demonstration" ? "Copied from demonstration data; replace with a verified source." : profile().source };
  state.profiles.push(copy); state.activeProfileId = copy.id; refreshProfileSelects(); renderProfiles(); scheduleSave(); toast("Profile duplicated for editing.");
}

function download(name, text, type = "application/json") { const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const a = Object.assign(document.createElement("a"), { href: url, download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

function exportProject() { download(`KEYGAUGE-project-${new Date().toISOString().slice(0, 10)}.json`, serializeProject({ calibration: state.calibration, profiles: state.profiles, records: state.records, currentRecord: state.currentRecord })); }
async function importProject(file) { try { const project = parseProject(await file.text()); localStorage.setItem(`${STORAGE_KEY}.recovery`, JSON.stringify(state)); state.calibration = project.calibration; state.profiles = project.profiles; state.records = project.records; state.currentRecord = project.currentRecord; state.activeProfileId = state.profiles[0]?.id; refreshAll(); scheduleSave(); toast("Project imported. A recovery snapshot was created."); } catch (error) { toast(error.message); } }
function exportProfiles() { download("KEYGAUGE-profiles.json", JSON.stringify({ schema: "keygauge.profiles", version: 1, profiles: state.profiles }, null, 2)); }
async function importProfiles(file) { try { const parsed = JSON.parse(await file.text()); if (parsed.schema !== "keygauge.profiles" || !Array.isArray(parsed.profiles)) throw new Error("Unsupported profile file."); state.profiles.push(...parsed.profiles.map((p) => ({ ...p, id: p.id || crypto.randomUUID(), kind: p.kind || "user-defined", verified: Boolean(p.verified) }))); refreshAll(); scheduleSave(); toast("Profiles imported."); } catch (error) { toast(error.message); } }

function refreshAll() { applySettings(); refreshProfileSelects(); renderCalibrationStatus(); renderCalibrationOutline(); renderScreen(); renderRecords(); renderProfiles(); checkCalibrationEnvironment(); }

function wireEvents() {
  $$("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
  $("#mobile-menu").addEventListener("click", () => $("#side-rail").classList.toggle("open"));
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
  $("#photo-undo").addEventListener("click", () => restorePhotoSnapshot(state.photo.history.pop(), state.photo.future)); $("#photo-redo").addEventListener("click", () => restorePhotoSnapshot(state.photo.future.pop(), state.photo.history));
  $("#photo-canvas").addEventListener("pointerdown", (e) => { const pt = canvasPoint(e), hit = photoPointAt(pt.x, pt.y); if (!hit) return; pushPhotoHistory(); photoDrag = hit; e.currentTarget.setPointerCapture(e.pointerId); });
  $("#photo-canvas").addEventListener("pointermove", (e) => { if (!photoImage) return; const pt = canvasPoint(e), sourcePoint = analysisToSourcePoint(pt), loupe = $("#inspection-loupe"), lctx = $("canvas", loupe).getContext("2d"), sampleWidth = 28, sampleHeight = 20; loupe.classList.add("active"); lctx.clearRect(0, 0, 220, 160); lctx.imageSmoothingEnabled = false; lctx.drawImage(photoImage, clamp(sourcePoint.x - sampleWidth / 2, 0, photoImage.naturalWidth - sampleWidth), clamp(sourcePoint.y - sampleHeight / 2, 0, photoImage.naturalHeight - sampleHeight), sampleWidth, sampleHeight, 0, 0, 220, 160); $("#analysis-coordinate").textContent = `${pt.x.toFixed(1)}, ${pt.y.toFixed(1)} px`; $("#source-coordinate").textContent = `${sourcePoint.x.toFixed(1)}, ${sourcePoint.y.toFixed(1)} px`; $("#physical-coordinate").textContent = state.photo.calibrated && state.photo.ppm ? `${(pt.x / state.photo.ppm).toFixed(2)}, ${(pt.y / state.photo.ppm).toFixed(2)} mm` : "UNCALIBRATED"; if (!photoDrag) return; const surface = getAnalysisSurface(), bounded = { x: clamp(pt.x, 0, surface.width - 1), y: clamp(pt.y, 0, surface.height - 1) }; if (photoDrag.type === "crop") setCropCorner(photoDrag.index, bounded); else { const target = photoDrag.type === "reference" ? state.photo.reference : state.photo[photoDrag.type === "cut" ? "cuts" : photoDrag.type === "scale" ? "scalePoints" : photoDrag.type === "corner" ? "corners" : "baseline"][photoDrag.index]; target.x = bounded.x; target.y = bounded.y; } if (photoDrag.type === "cut") updatePhotoCutFromPoint(photoDrag.index); if (photoDrag.type === "reference" || photoDrag.type === "baseline") reflowPhotoCuts(); renderPhoto(); });
  $("#photo-canvas").addEventListener("pointerup", () => { photoDrag = null; scheduleSave(); }); $("#photo-canvas").addEventListener("pointerleave", () => $("#inspection-loupe").classList.remove("active"));
  $("#photo-cut-table").addEventListener("change", (e) => { if (!e.target.dataset.photoStatus) return; state.photo.cuts[Number(e.target.dataset.photoStatus)].status = e.target.value; storeActiveEdgeGeometry(); renderPhoto(); scheduleSave(); });
  $("#save-screen-record").addEventListener("click", () => saveRecord("screen")); $("#save-photo-record").addEventListener("click", () => saveRecord("photo")); $("#manual-save").addEventListener("click", () => { const method = $("#record-method").value; if (method === "photo" && !state.photo.cuts.length) return toast("Create a photo analysis before saving a photo-derived record."); if (method === "manual" && !$("#manual-bitting").value.trim()) return toast("Enter a manual bitting sequence first."); saveRecord(method); });
  $("#compare-methods").addEventListener("click", () => { if (!state.records.some((r) => r.method === "On-screen physical alignment")) { toast("Save an on-screen measurement first, then compare it with this photo result."); return; } saveRecord("combined"); showView("records"); toast("Combined-method record saved; choose the related records to compare cut by cut."); });
  $("#delete-photo").addEventListener("click", () => { if (confirm("Permanently delete the photograph from this session?")) deletePhoto(); });
  $("#print-marker").addEventListener("click", () => window.open("marker.html", "_blank", "noopener"));
  $("#export-project").addEventListener("click", exportProject); $("#import-project").addEventListener("click", () => $("#import-project-file").click()); $("#import-project-file").addEventListener("change", (e) => importProject(e.target.files[0]));
  $("#export-profiles").addEventListener("click", exportProfiles); $("#import-profiles").addEventListener("click", () => $("#import-profiles-file").click()); $("#import-profiles-file").addEventListener("change", (e) => importProfiles(e.target.files[0])); $("#duplicate-profile").addEventListener("click", duplicateProfile); $("#profile-form").addEventListener("submit", saveProfile);
  $("#new-profile").addEventListener("click", () => { const copy = { ...structuredClone(DEMO_PROFILES[0]), id: crypto.randomUUID(), name: "New custom profile", manufacturer: "", blanks: "", kind: "user-defined", source: "", notes: "", verified: false }; state.profiles.push(copy); state.activeProfileId = copy.id; refreshProfileSelects(); renderProfiles(); scheduleSave(); });
  $("#profile-list").addEventListener("click", (e) => { const card = e.target.closest("[data-profile]"); if (!card) return; state.activeProfileId = card.dataset.profile; refreshProfileSelects(); renderProfiles(); renderScreen(); scheduleSave(); });
  $("#records-list").addEventListener("click", (e) => { const load = e.target.closest("[data-load-record]"), del = e.target.closest("[data-delete-record]"); if (load) loadRecord(load.dataset.loadRecord); if (del) deleteRecord(del.dataset.deleteRecord); });
  $("#run-compare").addEventListener("click", compareRecords); $("#export-csv").addEventListener("click", () => { const record = state.records.find((r) => r.id === $("#compare-a").value) || currentRecord("screen"); download("KEYGAUGE-measurement.csv", measurementsToCsv(record), "text/csv"); }); $("#print-report").addEventListener("click", () => window.print());
  $("#copy-bitting").addEventListener("click", async () => { const record = state.records.find((r) => r.id === $("#compare-a").value) || currentRecord("screen"); await navigator.clipboard.writeText(record.bitting.join("")); toast("Bitting sequence copied."); });
  $("#clear-sample").addEventListener("click", () => { state.records = state.records.filter((r) => !r.sample); scheduleSave(); renderRecords(); toast("Sample data cleared."); });
  $("#new-measurement").addEventListener("click", () => { state.currentRecord = defaultState().currentRecord; state.screen.depths = Array(profile().cutCount).fill(0); state.photo.cuts = []; renderScreen(); renderRecords(); scheduleSave(); showView("home"); });
  $("#restore-session").addEventListener("click", () => { try { const recovery = localStorage.getItem(`${STORAGE_KEY}.last`) || localStorage.getItem(`${STORAGE_KEY}.recovery`); if (!recovery) return toast("No prior-session snapshot is available."); state = deepMerge(defaultState(), JSON.parse(recovery)); refreshAll(); scheduleSave(); toast("Previous local session restored."); } catch { toast("The prior-session snapshot could not be restored."); } });
  $("#fresh-start").addEventListener("click", () => { if (!confirm("Clear all KEYGAUGE calibration, profiles, records, and settings stored in this browser?")) return; localStorage.setItem(`${STORAGE_KEY}.recovery`, JSON.stringify(state)); localStorage.removeItem(STORAGE_KEY); state = defaultState(); deletePhoto(false); refreshAll(); toast("Fresh start complete. A recovery snapshot was retained."); });
  $("#download-static").addEventListener("click", () => { const a = Object.assign(document.createElement("a"), { href: "KEYGAUGE-static.zip", download: "KEYGAUGE-static.zip" }); a.click(); });
  $("#ack-check").addEventListener("change", (e) => $("#ack-button").disabled = !e.target.checked); $("#ack-button").addEventListener("click", () => localStorage.setItem(ACK_KEY, "accepted"));
  window.addEventListener("resize", () => { checkCalibrationEnvironment(); if ($("#view-screen").classList.contains("active")) renderScreen(); if ($("#view-photo").classList.contains("active")) renderPhoto(); });
}

function initialize() {
  wireEvents(); refreshAll();
  const hash = location.hash.slice(1); showView(["home", "screen", "photo", "calibration", "records", "profiles", "help"].includes(hash) ? hash : "home", false);
  if (!localStorage.getItem(ACK_KEY)) $("#responsible-dialog").showModal();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

initialize();
