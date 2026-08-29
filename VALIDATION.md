# KEYGAUGE Validation Protocol

Version 1.9.3 · Batch 9 release-candidate protocol

KEYGAUGE is a visual measurement and documentation aid. Passing this protocol confirms deterministic software behavior on the tested build and device; it does not certify real-world bitting accuracy, a key-system profile, or fitness for cutting a key.

## Automated release gate

The repository test suite must pass before packaging. It covers scale calculation, projective homography and inverse mapping, source/display coordinate conversion, depth-code matching, confidence labeling, contour editing, deletion-safe state, schema migration, bounded imports, unsafe-object-key removal, Content Security Policy (CSP), offline-cache boundaries, and the golden measurement fixture.

The bundled `validation-fixture.js` is a versioned, deterministic corpus with:

- three known scale-reference calculations;
- one non-affine four-point perspective transform with three ground-truth probes;
- three depth-code samples, including a signed difference;
- two coordinate-conversion cases covering scale, rotation, mirror, and offset.

The **Validation & Diagnostics** view evaluates that corpus in the browser, adds a temporary local-storage round trip and invalid-project rejection, checks the image-reference scrub, and reports browser capabilities. The temporary value is deleted immediately. Saved measurements and photographs are not read.

## Field Validation Lab

The Field Validation Lab is separate from the synthetic release gate. It compares a saved KEYGAUGE record with user-supplied professional-tool reference depths and bitting, then records:

- signed and absolute error for each cut;
- per-cut tolerance and bitting-code agreement;
- mean bias, mean absolute error, root-mean-square error, and maximum absolute error;
- reference instrument or authorized source, calibration date, profile snapshot, method, reviewer, notes, criteria, and disposition; and
- repeatability spread and standard deviation after at least three runs share a campaign and profile.

Create a campaign before collecting repeated measurements. Keep the key, professional reference, operator procedure, profile revision, and test conditions stable. Enter the professional reference independently of the KEYGAUGE result. Review every failed or unavailable gate, save the study, export an archive, and obtain an independent sign-off on the report.

The app’s default numeric thresholds are study inputs, not universal locksmith tolerances. A passing result characterizes only the recorded conditions and does not certify later measurements, a profile, or fitness for cutting a key.

## Manual browser matrix

Run the following on current maintained releases of desktop Chromium, Firefox, and Safari, plus mobile Chrome and Safari where available:

1. Open the app from a root path and a nested path such as `/projects/keygauge/`.
2. Confirm every navigation control and both home entry paths work.
3. Test the screen editor with mouse, touch where available, and keyboard.
4. Import JPEG, PNG, and WebP samples by picker, drag-and-drop, and clipboard paste where supported.
5. Select **Take Photo**, allow camera access, and verify the rear-camera preference on mobile.
6. Deny camera access and verify file import remains available without a blocked workflow.
7. Rotate, mirror, crop, calibrate, correct perspective, align, detect, edit every cut, undo, redo, and permanently delete the photograph.
8. Create screen and photo records, compare them, export a report, and verify the method notation.
9. Load once online, confirm **OFFLINE READY**, close the tab, reopen offline, and exercise non-camera workflows.
10. Publish a changed cache version, accept the update banner, and confirm the complete new shell loads together.

Record results on `validation-sheet.html`.

## Physical scale and reference runs

Print the verification sheet at 100 percent with page fitting disabled. Measure the 100 mm and 50 mm lines, the 85.60 × 53.98 mm card outline, the 25 mm square, and multiple 10 mm grid cells. A suggested print-scale check is ±0.5 mm; this is a printout check, not a permissible bitting error.

For a measurement validation run:

1. Use an authorized reference key and a verified key-system profile.
2. Record reference dimensions with calibrated professional locksmith tools.
3. Capture multiple photographs at different supported resolutions, backgrounds, and modest camera angles.
4. Preserve the true scale, perspective probes, shoulder or tip reference, cut centers, and measured depths as the run’s ground truth.
5. Compare automatic starting points, manually accepted values, confidence labels, and final codes against that ground truth.
6. Repeat on each supported browser and input class.

Do not derive acceptance thresholds from the demonstration profiles. Establish tolerances with the verified profile, equipment uncertainty, intended task, and professional review.

## Performance and memory

The in-app advisory check analyzes a synthetic 960 × 540 grayscale raster and reports elapsed time, throughput, quality score, and contour availability. The 1,200 ms threshold is an interaction budget, not an accuracy threshold.

Real-photo testing must also cover high-resolution images near the 40 MB import limit. KEYGAUGE analyzes a bounded raster for vision features and caps perspective-corrected output at 24 million pixels. Confirm the page remains responsive, reports any downsampling, and releases the source image after permanent deletion or default post-measurement deletion.

## Privacy and security verification

- Monitor network activity during capture, analysis, record save, report creation, diagnostics, and photo deletion. No photograph, record, profile, or telemetry request may be sent.
- Confirm diagnostics state `containsPhotograph: false`, `containsMeasurementRecords: false`, and `containsLocalStorageContents: false`.
- Confirm exported projects, archives, reports, checkpoints, and revisions contain no data-image URLs, blob URLs, thumbnails, image objects, or source-photo fields.
- Confirm sanitized derivatives are re-encoded as PNG pixels and contain no source Exchangeable Image File Format (EXIF) metadata.
- Confirm **Delete Photo After Measurement** is enabled by default and one-click permanent deletion removes all in-memory references.
- Exercise malformed, oversized, deeply nested, and excessive-count JSON imports; state must remain unchanged after rejection.

## Compatibility and migration

Project schema version 3 is current. Supported schema version 1 and 2 projects are migrated on import and receive a recovery checkpoint before replacing current state. Unknown schema names and versions are rejected. Records receive current record-schema fields and validation studies are normalized during migration. Re-export a migrated project and verify it can be imported into a clean v1.9.3 session.

## Release decision

A release candidate is ready for a controlled field pilot only when automated checks pass, target browsers complete the manual matrix, print scaling is verified, no network or metadata leak is observed, and reference-key results are independently confirmed with professional tools. Document all deviations and known limitations before wider deployment.
