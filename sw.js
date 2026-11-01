/* aMACEzing Sales: lets the web app open without a connection.
 *
 * The page, its scripts, fonts and icons are saved on first use and served from the device when the network is
 * unavailable. Business data is not handled here: Firestore keeps its own on-device copy and syncs when you are
 * back online. Every new build registers this file with a new ?v=, which replaces the old saved files. */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `amacezing-${VERSION}`;
const SCOPE = new URL(self.registration.scope).pathname; // e.g. /amacezing-sales-web/
const NAVIGATION_WAIT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // One missing file must not stop the install.
      await Promise.allSettled(
        [SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}logo.png`, `${SCOPE}icon-192.png`].map((url) => cache.add(new Request(url, { cache: 'reload' }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('amacezing-') && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

async function put(request, response) {
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/** Pages: the network first (so a new version shows up), the saved page if it is slow or offline. */
async function pageRequest(request) {
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), NAVIGATION_WAIT_MS)),
    ]);
    // Every route is the same single page.
    return await put(new Request(SCOPE), response);
  } catch {
    return (await caches.match(SCOPE)) || (await caches.match(request)) || Response.error();
  }
}

/** Built files have a hash in their name and never change: saved copy first. */
async function assetRequest(request) {
  const saved = await caches.match(request);
  if (saved) return saved;
  return put(request, await fetch(request));
}

/** Icons and the manifest: the saved copy at once, refreshed in the background. */
async function otherRequest(request) {
  const saved = await caches.match(request);
  const refresh = fetch(request).then((response) => put(request, response)).catch(() => saved);
  return saved || refresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  if (request.mode === 'navigate') event.respondWith(pageRequest(request));
  else if (url.pathname.startsWith(`${SCOPE}assets/`)) event.respondWith(assetRequest(request));
  else event.respondWith(otherRequest(request));
});
