# KEYGAUGE

KEYGAUGE is a local-first screen and photo key bitting estimation instrument for authorized locksmithing, maintenance, restoration, and measurement work. It is a visual measuring and documentation aid—not a substitute for manufacturer specifications, a physical key gauge, or professional locksmith judgment.

Version: 1.9.3 — Field validation, repeatability, and portable evidence

## Batch 9 field validation lab

Version 1.9.3 closes the gap between synthetic software checks and controlled real-world accuracy characterization:

- saved screen, photo, combined, or manual records can be compared cut by cut with user-supplied professional-tool depths and bitting;
- configurable acceptance gates cover complete reference data, per-cut depth tolerance, root-mean-square error, bitting-code agreement, readability, finalized photo review, and verified profile sources;
- every study keeps an image-free snapshot of the tested record and profile, reference-instrument provenance, calibration date, reviewer, disposition, criteria, per-cut errors, and gate outcomes;
- repeatability is summarized after at least three studies share the same campaign and profile;
- field studies persist locally, participate in project export and compact recovery checkpoints, and can be moved through bounded, privacy-scrubbed archives;
- flat CSV export supports external statistical review, while standalone signed HTML reports preserve limitations and exclude photographs and EXIF metadata;
- project schema version 3 migrates schema 1 and 2 projects; and
- automated coverage now includes field comparison, repeatability, validation archives, reports, privacy stripping, and the Batch 9 control contract, with 86 passing release checks.

A passing study characterizes only its recorded conditions. It does not certify a key-system profile, future measurement, or fitness for cutting a key.

## Batch 8 validation and release hardening

Version 1.8.3 adds a reproducible release gate and documents the boundary between software checks and professional measurement validation:

- a versioned golden fixture checks known scale, non-affine perspective, coordinate-conversion, and depth-code results;
- an in-app **Validation & Diagnostics** workbench runs deterministic checks without reading records or photographs;
- a synthetic-raster performance check reports contour availability, elapsed time, throughput, and an advisory interaction budget;
- privacy-safe diagnostics explicitly exclude photographs, measurement records, and local-storage contents;
- project, records-archive, and profile imports enforce byte, collection, revision, and cut-count limits while unsafe object keys are stripped;
- a strict Content Security Policy (CSP) and Apache/LiteSpeed headers constrain scripts, connections, framing, permissions, referrers, and MIME sniffing;
- a printable physical-scale and device verification sheet supports browser, input, camera, offline, print, and professional-tool sign-off;
- validation, security, browser-support, migration, performance, privacy, and controlled-field-pilot procedures are documented; and
- the automated release suite now contains 79 checks.

## Batch 7 stability and usability

Version 1.7.3 hardens the local-first application before formal measurement validation:

- autosave failures and browser-quota errors are now visible, while the prior saved project remains intact;
- a storage-health dashboard reports project payload size, browser usage, retention status, and access to persistent-storage protection where supported;
- recovery checkpoints are deduplicated, limited to five within a storage budget, and retain the current record state plus the three newest record revisions;
- previous-session duplication is skipped for large projects so it cannot crowd out the authoritative save;
- filtering, sorting, and saved-view changes no longer overwrite unsaved record-editor text;
- opening, duplicating, restoring, importing, or starting another record warns before discarding an unsaved editor draft;
- saved-view naming now uses an accessible in-app dialog, and mobile comparison can be driven from record checkboxes;
- startup verifies the required control contract and reports a visible failure instead of leaving an inert interface;
- navigation, live statuses, focus behavior, touch targets, and non-color status indicators were strengthened;
- the Progressive Web Application (PWA) worker now uses navigation-only offline fallback, explicit update acceptance, offline readiness status, and version-safe cache cleanup; and
- Fresh Start now permanently clears all KEYGAUGE browser data without keeping an undisclosed recovery snapshot.

## Batch 6 records, comparison, and reporting

Version 1.6.3 completes the professional records workflow:

- project schema version 2 automatically migrates supported schema version 1 files;
- every record uses a versioned schema, lineage identifier, revision number, immutable prior snapshots, and separate source-estimate and accepted-value arrays;
- automatic and manual local recovery checkpoints protect work before revisions, deletion, import, restore, and duplication;
- the record workbench adds search, method and verification filters, tag filters, sorting, saved views, tags, and anonymized asset identifiers;
- records can be duplicated independently or revised while preserving their earlier state;
- record archives can be exported and restored without carrying photographs or image references;
- multi-record comparison supports two or more same-profile measurements and reports per-cut spread;
- reports preserve calibration, alignment, profile source and revision, confidence explanation, warnings, source-versus-accepted values, verification history, and required photo-derived notation; and
- a printable packet provides a calibration worksheet, photo checklist, blank bitting form, verification rulers, and direct access to the KEYGAUGE marker.

## Batch 5 stronger verification workbench

Version 1.5 makes photo-derived bitting review explicit and auditable:

- every position records a decision, reason code, optional reviewer note, and review time;
- rejected and unreadable positions require reasons before verification can be finalized;
- calibration, unresolved decisions, ambiguity, profile status, and warnings feed visible finalization gates;
- accepted cuts are protected from accidental contour, depth, and code edits by default;
- geometry or evidence changes automatically return finalized verification to draft status;
- a bounded local decision history records per-cut and alignment changes with undo and redo support;
- saved records and reports distinguish draft from finalized evidence and retain verification notes; and
- an accepted blade crop can be exported as a pixel-only PNG derivative with source metadata excluded.

## Batch 4 records, reporting, and privacy

Version 1.4 added profile snapshots, measurement provenance, standalone local HTML reports, report previews, calibration and perspective evidence, rule warnings, required photo-derived notation, recursive image-reference scrubbing in project files, and photograph exclusion from reports by default.

## Batch 3 verification and confidence

Version 1.3 turns automatic photo detection into a stronger human-verification workbench:

- every cut now has editable calibrated depth, valid-code selection, coarse or fine nudges, acceptance, rejection, and unreadable status;
- a verification progress strip prevents an incomplete photo record from looking fully reviewed and requires an explicit acknowledgment before saving unreviewed cuts;
- cut confidence is calculated from nine visible factors: resolution, focus, edge contrast, perspective, scale-reference quality, distance from a valid depth, shoulder or tip visibility, edge definition or wear, and neighboring-code ambiguity;
- accepting, rejecting, or changing a cut immediately recalculates its confidence without hiding the source photograph;
- cut centerlines, valid-depth ticks, and tolerance bands are drawn directly over the photograph;
- the complete measurement grid can be translated and rotated while undo and redo preserve previous geometry;
- photo handles can be selected with a pointer and then adjusted with the keyboard arrow keys; and
- photo and on-screen measurements now have a live tolerance comparison with a confidence-weighted combined record rather than a simple arithmetic average.

## Batch 2 local computer vision

Version 1.2 adds a deterministic, browser-local analysis layer on top of the Batch 1 coordinate pipeline:

- the printable KEYGAUGE marker is searched by outer ratio, border geometry, corner targets, and orientation cues, with separate confidence for all four corners;
- every image receives a preflight score for effective resolution, focus, edge contrast, glare, shadow, camera angle, reference alignment, and possible frame obstruction;
- Otsu thresholding, local mask cleanup, connected-component analysis, and polarity selection separate a light or dark key from its background;
- the top and bottom blade edges, likely bitted edge, shoulder transition, tip, and baseline are proposed as visible overlays;
- profile cut centers sample the segmented edge and retain the nearest three depth-code candidates for ambiguity review;
- top and bottom edges can be analyzed, edited, reversed, and saved independently in one double-sided photo record; and
- the source photograph remains visible and all automatic results remain draggable, reversible starting points.

## Batch 1 geometry foundation

Version 1.1 introduces a non-destructive photo-coordinate pipeline:

- source-image, oriented-source, projective-corrected, display, and physical coordinates are handled separately;
- measurement points remain in full analysis coordinates instead of being stored in resized canvas coordinates;
- rotation, mirroring, interface resizing, and crop-window changes preserve existing measurement geometry;
- four manually verified corners now generate a true projective homography rather than a visual skew approximation;
- the source and corrected geometries can be compared side by side;
- the correction residual, distortion magnitude, analysis dimensions, and any memory-safety downsampling are visible;
- crop boundaries are draggable and non-destructive;
- the inspection loupe reads from original source pixels; and
- undo and redo now include crop geometry alongside scale, alignment, contour, and cut edits.

## What it does

KEYGAUGE provides two equal measurement paths:

- **Measure on Screen:** calibrate a display with a known physical object, place the key lightly against the display, align the shoulder or tip, and adjust an independent depth control for every cut.
- **Analyze a Photo:** capture or import a JPEG, Portable Network Graphics (PNG), or WebP image; establish scale; review perspective; align the blade; estimate its contour; and manually verify every cut.

Both paths create the same local measurement-record format and can be compared cut by cut.

## Responsible use

Use KEYGAUGE only with keys you own or are authorized to service. The user is responsible for applicable laws, professional requirements, and property-access rules.

Do not cut a key or service a lock from a KEYGAUGE estimate alone. Verify all measurements with an appropriate professional key gauge, code source, and manufacturer data.

## Run or deploy

No compilation, package manager, account, server application, or external Application Programming Interface (API) is required.

1. Copy the contents of this directory to any ordinary static web host.
2. Serve the directory over Hypertext Transfer Protocol Secure (HTTPS) when camera capture or Progressive Web Application (PWA) installation is needed.
3. Open `index.html`.

For local testing, use a small static server rather than opening `index.html` with a `file://` address. For example:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Browsers consider localhost a secure context for many development purposes, but camera rules vary.

### Offline installation and updates

After the application has loaded successfully once, the header reports **OFFLINE READY** when its complete shell is cached. If a new version is waiting, KEYGAUGE displays an update banner and reloads only after the user accepts it. Failed script, stylesheet, image, or manifest requests never receive `index.html` as a substitute.

The **Guide & Privacy** view includes installation and local-storage controls. Browsers decide whether the installation prompt and persistent-storage protection are available.

### Local storage and recovery

KEYGAUGE records are intentionally device-local and are not synchronized to a server. The storage dashboard shows the approximate project payload and the browser's origin-wide usage estimate. Export a project backup before clearing browser data, changing devices, or performing major maintenance.

Compact recovery checkpoints omit older nested revision history to prevent repeated project copies from exhausting browser storage. A restored checkpoint retains the current state of every included record and up to its three newest prior revisions. **Fresh Start** removes the current project, prior-session copy, emergency recovery copy, named checkpoints, calibration, profiles, settings, and authorization acknowledgment. It does not retain a hidden recovery copy.

## Screen calibration

A Cascading Style Sheets (CSS) pixel is not a reliable physical unit. Calibrate before using the on-screen contour.

1. Open **Screen Calibration**.
2. Use full screen and set browser zoom to 100 percent.
3. Choose an identification card, a United States quarter, or a custom measured object.
4. Place the object lightly against the screen.
5. Adjust the horizontal and vertical outline sizes independently until they match.
6. Save the calibration.
7. Check the 10-millimeter verification ruler with a physical ruler.

The app stores separate millimeters-per-CSS-pixel factors for the horizontal and vertical axes. A warning appears when the device-pixel ratio, display dimensions, orientation, or window environment changes. Recalibrate after moving the browser to another display, changing zoom, changing orientation, or changing operating-system display scaling.

Calibration never makes a browser measurement exact. Reference-object tolerances, parallax, protective glass, zoom, and visual alignment remain error sources.

## Measure on screen

1. Select a profile. Bundled profiles are labeled **demonstration data** and are not manufacturer specifications.
2. Select key orientation and shoulder-stop or tip-stop alignment.
3. Align the physical key with the on-screen stop and blade baseline.
4. Lock the alignment to prevent accidental movement.
5. Adjust each cut slider. Use the plus and minus buttons for small changes; hold Shift while clicking for a finer increment.
6. Review the raw depth, nearest valid code, code difference, ambiguity warnings, confidence, and adjacent-cut warnings.
7. Save the measurement locally or export it.

Use only light contact. A key can scratch an unprotected display. A thin transparent screen protector is recommended.

## Analyze a photo

Workflow: **CAPTURE → SCALE → CORRECT → ALIGN → DETECT → VERIFY → EXPORT**

### Capture

- Place the key on a flat, contrasting surface.
- Put a reference card, ruler, coin, custom reference, or printed KEYGAUGE marker in the same plane.
- Keep the camera directly above the objects.
- Include the complete blade, shoulder, and tip.
- Avoid shadows, glare, blur, and angled photographs.

Select **Take Photo** to request the mobile rear camera. Camera permission is requested only through that action. If capture is unavailable, use **Choose Image**, drag and drop, or paste an image from the clipboard.

### Scale

Choose a scale reference and drag the two circular scale handles to the endpoints of the known distance. The app reports pixels per millimeter. Profile-derived scale remains a lower-confidence fallback.

Do not rely on a scale reference that is not in the same flat plane as the key. An unscaled photograph is explicitly labeled **Uncalibrated**.

### Correct perspective

Drag the four square handles to the corners of the reference. **Detect marker** attempts to locate a high-contrast rectangular reference; it is only a starting point. Review every corner. Horizontal scale, vertical scale, and fine-keystone controls feed a four-point projective correction. The original pixels remain in memory, and rejecting the correction restores the earlier geometry and measurements.

Correction is generated locally at the image’s oriented resolution. When the result would exceed the browser’s 24-million-pixel safety budget, KEYGAUGE reports and applies a proportional analysis scale rather than risking a page crash or silently discarding the source photograph.

The printable marker is exactly 100 × 60 millimeters and includes corner targets, an orientation triangle, and 10-millimeter verification marks. Print at 100 percent with page fitting disabled, then verify the printed outer dimensions before use.

### Align, detect, and verify

1. Select the profile and shoulder or tip reference.
2. Choose the visible bitted edge, or select both edges for a double-sided key.
3. Drag the diamond reference handle and the two triangular baseline handles into place.
4. Run **Segment blade**, then detect the selected edge or analyze both.
5. Keep the source photograph visible while reviewing the detected edge and reconstructed contour. Use the source/corrected preview pair and coordinate readout to verify the transformation.
6. Drag every cut point to the visible edge. The inspection loupe follows the pointer.
7. Review the nearest code and alternate candidates, then mark every position as accepted, rejected, or unreadable.
8. Use undo and redo for contour edits.

The verification table exposes the evidence behind every confidence score. Calibrated depths can be typed or nudged; selecting a valid code moves the corresponding point to that profile depth. The measurement-grid arrows move or rotate all active-edge references together. After selecting a canvas handle with a pointer, use the arrow keys for one-pixel adjustment or hold Shift for finer movement.

Select **Compare with on-screen result** to calculate per-position differences, tolerance agreement, root-mean-square difference, and maximum difference against the current on-screen measurement. A combined record uses cut confidence as its weighting and retains the required photo-derived notation.

Automatic detection is intentionally an editable starting point. Blur, glare, rounded wear, shadows, compression, perspective, and a weak calibration reference reduce confidence.

## Key profiles

The two bundled profiles use fictional, illustrative dimensions and are labeled **Demonstration only**. They exist to exercise the software.

For professional use, duplicate or create a profile and enter dimensions from an authorized, verified source:

- manufacturer and key-system name;
- compatible blank identifiers;
- number of positions;
- first-cut distance and spacing;
- shoulder-stop or tip-stop method;
- tolerance;
- valid depth-code-to-millimeter map;
- source, revision, and notes.

Profiles can be imported and exported as JavaScript Object Notation (JSON). Review imported data before use. KEYGAUGE does not independently verify user-supplied dimensions.

## Records and export

Records can contain a name, anonymized job or asset reference, tags, notes, profile snapshot, bitting, separate source and accepted measurements, confidence, calibration method, measurement method, revision lineage, and immutable prior snapshots. Avoid addresses, customer names, lock locations, or access-control details.

Available exports:

- complete project JSON;
- records-only archive JSON with local restore;
- profile JSON;
- Comma-Separated Values (CSV) measurements;
- standalone evidence report and Portable Document Format (PDF) output through the browser print dialog;
- printable calibration, photo, bitting-form, and verification-ruler worksheets;
- printable calibration marker;
- copied bitting sequence.

Photo-derived records include the required photo-estimate notation. The original photo is excluded from records and reports.

## Privacy and local storage

- All calculations and image processing occur in the browser.
- There is no telemetry, analytics, advertising, sign-in, remote image analysis, or external API.
- The original photo is held in volatile page memory and is not written to local storage.
- A sanitized blade derivative is created only on explicit request from an accepted crop. It is re-encoded as Portable Network Graphics (PNG) pixels, without source Exchangeable Image File Format (EXIF) metadata.
- **Delete Photo After Measurement** is enabled by default.
- **Permanently delete photo** removes the in-memory image immediately.
- Project state, profiles, screen calibration, and records use browser local storage.
- The records workbench retains up to five compact, deduplicated local recovery checkpoints within a storage budget. Each checkpoint keeps up to three recent record revisions; authoritative record histories retain up to 25 prior snapshots.
- **Fresh start** permanently clears the current project, prior-session copy, emergency recovery copy, named checkpoints, calibration, profiles, settings, and authorization acknowledgment. It retains no hidden recovery snapshot.

The service worker caches application code for offline use after a successful first load. It does not cache imported photographs.

## Accessibility and input

KEYGAUGE supports touch, mouse, and keyboard input. Native range controls support arrow-key adjustment. Controls have visible focus styles and large targets. Statuses include words and shapes rather than relying only on color. Reduced-motion and high-contrast preferences are supported.

## Files

- `index.html` — application shell
- `styles.css` — themes, responsive layout, measurement surfaces, and print rules
- `app.js` — user interface, local persistence, image analysis, records, and exports
- `logic.js` — pure calibration, homography, coordinate-space, image-quality, marker, segmentation, contour, confidence, and data-conversion functions
- `validation-fixture.js` — versioned golden measurement corpus
- `validation-sheet.html` — printable physical-scale, compatibility, and release sign-off sheet
- `VALIDATION.md` — automated and manual release protocol
- `SECURITY.md` — privacy boundary, threat model, and deployment guidance
- `SUPPORTED-BROWSERS.md` — feature matrix and platform limitations
- `.htaccess` — Apache and LiteSpeed MIME and security-header policy
- `marker.html` — printable KEYGAUGE marker
- `manifest.webmanifest` — PWA metadata
- `service-worker.js` — offline application cache
- `icon.svg` — scalable application icon

## Automated tests

The source repository includes 79 automated checks for calibration math, golden measurement fixtures, cut-position geometry, depth-code matching, bitting reversal, four-point homography, homography inversion, rotation and mirror mapping, resize-invariant coordinates, non-destructive crop windows, perspective rectification, memory-safety scaling, grayscale conversion, Otsu thresholding, image-quality metrics, mask cleanup, connected components, light/dark blade segmentation, bitted-edge selection, shoulder/tip references, marker detection, alternate depth candidates, edge-definition assessment, factor-based confidence, verification progress, method comparison, confidence-weighted combination, grid transformation, double-sided coordinate conversion, schema migration, bounded import rejection, unsafe-key removal, project and records export, privacy scrubbing, CSP and host headers, diagnostics boundaries, offline routing, and deletion-safe state behavior.

## Limitations

- No browser can infer physical screen dimensions reliably without calibration.
- A photograph cannot provide physical depth without a trustworthy in-plane scale reference.
- The included computer-vision layer uses deterministic local image statistics and shape heuristics; it is not a trained recognition service and cannot establish authorization or key-system identity.
- Perspective correction is projective, but a poor corner placement or a reference that is not in the key’s plane still produces an incorrect physical result. Strongly angled images should be retaken.
- Worn or rounded cuts may lie between valid codes.
- Double-sided, dimple, tubular, laser-track, magnetic, or electronic keys may require a different measuring method and profile model.
- KEYGAUGE does not validate manufacturer restrictions, patented systems, authorization, or local law.

## License and operational note

Review the code and choose an appropriate license before public redistribution. If deploying in a professional environment, document profile sources, validation procedures, and equipment calibration intervals.
