# KEYGAUGE Changelog

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
