# KEYGAUGE Security and Privacy Boundary

Version 1.9.3

## Data boundary

KEYGAUGE is a static, local-first browser application. Image decoding, scale calculation, perspective correction, contour estimation, confidence assessment, record handling, and exports run in the browser. The application has no analytics, telemetry, advertising, account system, remote image-analysis service, or application programming interface (API) client.

Photographs are held in page memory for the active measurement. They are not written to local storage, records, checkpoints, reports, project exports, records archives, or the offline application cache. **Delete Photo After Measurement** is enabled by default. **Permanently delete photo** releases the image, oriented and corrected canvases, analysis raster, mask, and full-resolution inspection window.

An explicitly requested sanitized derivative uses only an accepted blade crop and re-encodes pixels as PNG. It does not copy source Exchangeable Image File Format (EXIF) metadata. Reports exclude photographs by default.

## Browser storage

Project state, profiles, screen calibration, records, field validation studies, saved views, compact recovery checkpoints, the authorization acknowledgment, and a bounded prior-session recovery copy use same-origin browser storage. Field studies may include an image-free measurement and profile snapshot plus user-entered professional reference values, instrument identifiers, reviewer names, and notes. Clearing site data or using **Fresh Start** permanently removes those values. Users should export a backup before changing devices or clearing browser storage.

## Threat model and defenses

KEYGAUGE assumes imported images, project files, records archives, and profiles may be malformed or hostile.

- JPEG, PNG, and WebP image files are limited to 40 MB and decoded by the browser.
- Project and records-archive JSON files are limited to 12 MB, 5,000 records, 500 profiles, 50 recovery checkpoints, 32 cuts per record, and 50 imported revisions per record.
- Validation-study archives are limited to 4 MB, 500 studies, and 32 per-cut comparison rows per study.
- Profile files are limited to 2 MB and 500 validated profile objects.
- Imported object keys named `__proto__`, `prototype`, or `constructor` are not merged or retained.
- Image-reference keys, data-image URLs, and blob URLs are recursively removed from durable models and exports.
- No imported markup or script is executed. User-controlled display strings are escaped before insertion into generated interface markup.
- A Content Security Policy limits scripts, images, workers, media, connections, forms, frames, and base URLs. Apache/LiteSpeed deployments also emit no-referrer, anti-framing, permission, and MIME-sniffing headers.
- The service worker handles same-origin GET requests only. It caches the fixed application shell and never imports or caches source photographs.

The local-only design does not protect data from malware, browser extensions, another person with access to the unlocked device, operating-system compromise, screenshots, developer tools, or a maliciously modified deployment. HTTPS protects the delivered application in transit; it does not prove the deployment itself is trustworthy.

## Diagnostics

The optional diagnostics download contains version, time, browser user-agent string, viewport, device-pixel ratio, secure-context and online state, service-worker state, coarse storage estimates, capability checks, and synthetic validation summaries. It explicitly excludes photographs, measurements, record values, and local-storage contents. Review the file before sharing it.

## Deployment guidance

- Serve the unmodified package over HTTPS.
- Preserve `.htaccess` on Apache/LiteSpeed, or reproduce its headers in the target host configuration.
- Do not add analytics, tag managers, remote fonts, image proxies, or external scripts without revisiting the privacy promise and CSP.
- Restrict access at the host if measurements or profiles are operationally sensitive.
- Keep the complete versioned shell together; do not mix files from different releases.
- Run the validation protocol after every host, browser, security-header, or service-worker change.

## Reporting a concern

Report suspected security or privacy issues privately through the project repository or the maintainer’s established contact channel. Do not include real key photographs, customer information, addresses, access-control details, or bitting records unless an authorized maintainer specifically requests a sanitized reproduction.
