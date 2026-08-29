const CACHE = "keygauge-v1.9.3";
const SHELL = ["./index.html", "./styles.css?v=1.9.3", "./app.js?v=1.9.3", "./logic.js?v=1.9.3", "./validation-fixture.js?v=1.9.3", "./manifest.webmanifest?v=1.9.3", "./icon.svg", "./icon-192.png", "./icon-512.png", "./marker.html", "./validation-sheet.html", "./README.md", "./CHANGELOG.md", "./VALIDATION.md", "./SECURITY.md", "./SUPPORTED-BROWSERS.md"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function navigationResponse(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put("./index.html", response.clone());
    return response;
  } catch {
    return (await cache.match("./index.html")) || new Response("KEYGAUGE is not available offline yet.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function assetResponse(request) {
  const cached = await caches.match(request); if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
  } catch {
    return new Response("Offline asset unavailable", { status: 504, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(event.request.mode === "navigate" ? navigationResponse(event.request) : assetResponse(event.request));
});
