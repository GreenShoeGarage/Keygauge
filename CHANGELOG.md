# KEYGAUGE Changelog

## 1.9.3 — Batch 9 field validation and repeatability

- Added a local Field Validation Lab for comparing saved measurements with professional-tool depth and bitting references.
- Added explicit per-cut tolerance, root-mean-square error, code-agreement, readability, finalized-photo, and verified-profile acceptance gates.
- Added per-cut signed and absolute errors, depth and code agreement, aggregate bias, mean absolute error, RMS error, and maximum error.
- Added repeatability summaries for three or more same-campaign, same-profile runs.
- Added versioned, privacy-scrubbed validation-study archives, flat CSV export, and signed standalone HTML reports.
- Added image-free record and profile snapshots, reference-instrument provenance, calibration date, reviewer, notes, and disposition to saved studies.
- Added validation studies to project schema version 3, local recovery checkpoints, import migration, autosave, Fresh Start, and project backup.
- Preserved the evidence boundary: field results characterize recorded conditions and never claim certification.
- Rotated the complete offline shell to v1.9.3.
- Expanded the automated release suite from 79 to 86 passing tests.

## 1.8.3 — Batch 8 validation, security, and release hardening

- Added a versioned golden measurement corpus covering known scale, projective perspective, coordinate conversion, and depth-code matching.
- Added an in-app **Validation & Diagnostics** workbench with deterministic browser checks, a temporary storage round trip, unsupported-import rejection, a synthetic-raster performance benchmark, and visible pass/review/fail evidence.
- Added a privacy-safe diagnostics export that declares and enforces exclusion of photographs, measurement records, and local-storage contents.
- Added 12 MB project and records-archive limits, 2 MB profile limits, bounded imported collections, cut and revision limits, profile shape validation, and unsafe object-key removal.
- Added a hashed inline startup guard under a strict CSP so nested-path normalization remains reliable without permitting general inline scripts.
- Added Apache/LiteSpeed CSP, anti-framing, no-referrer, permissions, and MIME-sniffing response headers.
- Added a printable release verification sheet with exact physical rulers and shapes, browser/input/camera/offline matrix, reference-measurement table, and sign-off fields.
- Added validation, security, and supported-browser documents with field-pilot criteria, migration coverage, performance and privacy procedures, and known platform limits.
- Rotated the complete offline shell to v1.8.3 and precached the validation corpus, verification sheet, and release documents.
- Expanded automated coverage from 66 to 79 tests, including golden fixtures, import limits, unsafe keys, privacy audits, diagnostics, CSP, security headers, and offline evidence assets.

## 1.7.3 — Batch 7 stability, accessibility, and offline reliability

- Added visible autosave-failure handling, quota warnings, storage-health estimates, project-backup access, and optional persistent-storage protection.
- Rebuilt recovery retention around compact, deduplicated, byte-budgeted checkpoints with bounded revision and verification history.
- Prevented large previous-session copies from crowding out the authoritative project save.
- Protected unsaved record-editor text during search, filtering, sorting, saved-view changes, record loading, duplication, restore, import, and new-measurement actions.
- Replaced prompt-based saved-view naming with an accessible dialog and improved touch-friendly comparison selection.
- Added a required-control startup contract and retained the visible module-startup diagnostic.
- Added accessible navigation state, live view and action announcements, non-color storage states, larger coarse-pointer targets, and improved mobile reflow.
- Replaced the catch-all service-worker fallback with navigation-only fallback, explicit update acceptance, cache-version cleanup, offline readiness status, install access, and standard Portable Network Graphics (PNG) application icons.
- Added release-version asset URLs so shared hosts and previously installed offline caches cannot mix old scripts with a new document.
- Changed Fresh Start to permanently clear all KEYGAUGE local data without retaining a hidden recovery snapshot.
- Expanded automated coverage for recovery compaction, storage health, required controls, and offline routing.

## 1.6.3 — Batch 6 records, comparison, reporting, and worksheets

- Added project schema version 2 with supported schema version 1 migration.
- Added versioned record schemas, lineage, revision numbers, immutable prior snapshots, and separate source-estimate and accepted-value arrays.
- Added bounded local recovery checkpoints before material record and project changes.
- Added record search, method and verification filters, tag filtering, sorting, saved views, anonymized identifiers, duplication, and revision workflows.
- Added records-only archive export and restore with recursive image-reference removal.
- Replaced two-record comparison with same-profile comparison across two or more records and per-cut spread analysis.
- Expanded evidence reports with record revision, profile source and revision, calibration provenance, confidence explanation, source-versus-accepted values, warnings, verification history, and required photo-derived notation.
- Added a printable worksheet packet for screen calibration, photo capture, blank bitting measurement, and physical ruler verification, plus direct access to the printable marker.
- Expanded automated coverage from 52 to 60 tests.

## 1.5.0 — Batch 5 stronger verification workbench

- Added per-cut decisions, reason codes, reviewer notes, and timestamps.
- Added explicit verification finalization gates for calibration, complete decisions, required reasons, and warning acknowledgment.
- Added accepted-cut protection and automatic reopening of finalized evidence after measurement changes.
- Added a bounded local audit trail for cut, contour, alignment, warning, and finalization events.
- Carried verification status, review notes, and decision history into saved records and professional reports.
- Added local blade-crop export as re-encoded PNG pixels with source metadata excluded.
- Expanded automated coverage for verification readiness, audit history, protected edits, privacy scrubbing, sanitized exports, and reports.

## 1.4.0 — Batch 4 records, reporting, and privacy

- Added record provenance, profile snapshots, calibration evidence, perspective status, and privacy declarations.
- Added professional report preview, standalone HTML download, and Print / Save PDF support.
- Added required photo-derived report notation and explicit draft-versus-finalized status.
- Excluded source photographs from reports and recursively removed image references from project export and import.
- Preserved shared-host subdirectory compatibility and visible startup diagnostics.

## 1.3.4 — Shared-host compatibility repair

- Replaced the runtime `.mjs` dependency with a standard `.js` module so Apache and LiteSpeed hosts serve it with a browser-approved JavaScript MIME type.
- Added directory-safe asset URLs and a trailing-slash guard for deployment inside paths such as `/projects/keygauge/`.
- Added Apache and LiteSpeed MIME declarations for JavaScript, web manifests, and SVG assets.
- Added a visible startup diagnostic when the application module cannot initialize, replacing the previous silent failure mode.
- Rotated the offline cache so repaired files replace previously cached application assets.

## 1.3.3 — Batch 3 verification and confidence

- Rebuilt the photo cut table as an editable verification workbench with calibrated depth inputs, nudges, valid-code selection, and per-cut review status.
- Added a visible verification progress gate and explicit acknowledgment before saving incomplete photo-derived records.
- Replaced the coarse photo confidence calculation with a nine-factor per-cut evidence model.
- Added expandable confidence evidence for resolution, focus, edge contrast, perspective, calibration reference, depth proximity, shoulder or tip visibility, edge definition or wear, and code ambiguity.
- Added visible cut centerlines, profile depth ticks, and measurement tolerance bands over the source photograph.
- Added whole-grid translation and fine rotation controls with undo and redo support.
- Added keyboard adjustment for selected scale, corner, baseline, shoulder or tip, crop, and cut handles.
- Added live photo-versus-screen comparison with tolerance agreement, root-mean-square difference, and maximum difference.
- Replaced equal averaging with confidence-weighted combined measurement records.
- Added verification status to saved records and preserved confidence evidence in exports.
- Expanded KEYGAUGE-specific automated coverage from 30 to 36 tests.

## 1.2.4 — Batch 2 local computer vision

- Replaced the coarse dark-pixel marker scan with local outer-ratio, border, corner-target, orientation, rotation, and perspective checks.
- Added separate confidence values for every automatically detected marker corner.
- Added automatic local image-quality preflight for resolution, blur, edge contrast, glare, shadow, camera angle, reference alignment, and frame obstruction.
- Added light-on-dark and dark-on-light blade segmentation with automatic polarity selection, threshold sensitivity, and mask cleanup controls.
- Added visible blade-mask, top-edge, bottom-edge, shoulder, and tip overlays.
- Added baseline fitting, likely-bitted-edge assessment, and profile-driven cut-center sampling.
- Added three ranked depth-code candidates per cut so neighboring-code ambiguity remains visible during verification.
- Added independent top- and bottom-edge analysis, editing, confidence, order reversal, result display, and record preservation for double-sided keys.
- Expanded KEYGAUGE-specific automated coverage from 20 to 30 tests.

## 1.1.3 — Batch 1 geometry foundation

- Added explicit source, oriented-source, projective-corrected, display, and physical coordinate spaces.
- Changed photo handles and cut points to persist in analysis-image coordinates, preventing interface resizing from changing measurements.
- Added a true four-corner projective homography with inverse coordinate conversion.
- Added full-resolution local rectification with a visible 24-million-pixel memory safety limit.
- Added correction residual, distortion, coordinate-space, image-size, and analysis-scale readouts.
- Added original-versus-corrected preview canvases.
- Added reversible correction rejection that restores earlier geometry and measurements.
- Preserved alignment and cut edits across rotation and mirroring.
- Replaced destructive blade cropping with a draggable, non-destructive crop window.
- Upgraded the inspection loupe to sample original source pixels.
- Added full-resolution local inspection of both the original and corrected image.
- Expanded undo and redo snapshots to include crop and calibration geometry.
- Expanded KEYGAUGE-specific automated coverage from 12 to 20 tests.

## 1.0.0 — Initial release

- Added calibrated on-screen physical alignment.
- Added local photo capture and import.
- Added scale, correction, contour estimation, manual verification, records, comparison, exports, offline operation, and privacy controls.
