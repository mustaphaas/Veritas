// Veritas previously used this service worker to synthesize canned AI answers
// when /api/veritas was unavailable. The real AI endpoint now runs in the
// Cloudflare Worker, so API requests must reach the network and surface real
// configuration/errors instead of silently returning a scripted response.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
