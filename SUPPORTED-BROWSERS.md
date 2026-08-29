# KEYGAUGE Supported Browsers

Version 1.9.3

KEYGAUGE targets current maintained releases of Chromium-based browsers, Mozilla Firefox, and Apple Safari. Test the exact browser, operating system, input hardware, camera, printer, and hosting path used in production.

| Capability | Desktop Chromium | Desktop Firefox | Desktop Safari | Android Chromium | iOS/iPadOS Safari |
|---|---|---|---|---|---|
| Screen measurement | Expected | Expected | Expected | Expected | Expected |
| JPEG/PNG/WebP import | Expected | Expected | Expected | Expected | Expected |
| Drag-and-drop import | Expected | Expected | Expected | Limited by device UI | Limited by device UI |
| Clipboard image paste | Expected; permission varies | Expected; permission varies | Version-dependent | Limited | Version-dependent |
| Rear-camera preference | Device-dependent | Device-dependent | Device-dependent | Expected where supported | Expected where supported |
| Touch, mouse, keyboard | Expected | Expected | Expected | Touch expected | Touch expected |
| Offline service worker | Expected | Expected | Expected with platform limits | Expected | Expected with platform limits |
| Install prompt | Browser-managed | Browser UI only | Browser UI only | Expected when eligible | Add to Home Screen |
| Persistent storage request | Browser-managed | Browser-managed | Limited | Browser-managed | Limited |
| Printing and exact scale | Printer-dependent | Printer-dependent | Printer-dependent | Platform-dependent | Platform-dependent |

“Expected” means the application uses standardized browser features, not that every device has completed physical measurement validation.

## Requirements

- Use HTTPS for camera capture, reliable service-worker operation, and installation outside localhost.
- Serve the entire directory from one same-origin path. Nested deployment such as `/projects/keygauge/` is supported; the host must preserve or redirect the directory trailing slash.
- Serve JavaScript with a JavaScript MIME type and `.webmanifest` with `application/manifest+json`.
- Preserve the Content Security Policy and related headers where the host supports them.
- Keep browser zoom at 100 percent and use full screen for physical on-screen calibration.

## Known platform variation

Camera permission prompts, camera selection, clipboard reads, installation, storage quotas, storage persistence, background eviction, print scaling, and full-screen behavior are controlled by the browser and operating system. KEYGAUGE offers image-file import whenever direct capture is unavailable. Denying camera permission does not need to block file capture or import because **Take Photo** uses the browser’s capture-capable file input.

Very old browsers, embedded webviews, privacy modes that disable local storage, and hosts that rewrite missing assets to HTML are not supported. Opening the application directly with a `file://` address is not supported for full functionality; use a static web server.

## Required release checks

Use **Validation & Diagnostics** for the deterministic local checks, then complete `validation-sheet.html` on the target browser. Manual checks must cover camera allow and deny paths, image import, touch/mouse/keyboard editing, offline reopen and update, print scaling, root and subdirectory paths, permanent photo deletion, and professional-tool comparison of an authorized reference key.
