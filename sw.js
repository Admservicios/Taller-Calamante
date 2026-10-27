/* Se genera una versión con los recursos de la compilación actual, incluidos los módulos de PDF y ZIP. */
const BUILD_ID = 'c4f340d7e6c1b5fbece4';
const INDEX_HASH = '90d51d0bc160842359f1d3a429a6296d164245f17972e8b16001fb25f1671bde';
const PRECACHE = ["icons/app-180.png","icons/app-192.png","icons/app-512.png","icons/app.svg","index.html","manifest.webmanifest","site-assets/app-Buuzqzv-.css","site-assets/app-D_qNfVoO.js","site-assets/browser-B5ODykp-.js","site-assets/html2canvas-DuuAbA35.js","site-assets/index.es-DCU8sq3I.js","site-assets/jspdf.es.min-DNOyXhyl.js","site-assets/purify.es-Dqk5qvad.js","site-assets/sha256-C77sL9Ok.js"];
const ROOT = self.registration.scope;
const PREFIX = `taller-calamante-offline:${new URL(ROOT).pathname}:`;
const CACHE_NAME = PREFIX + BUILD_ID;
const urls = PRECACHE.map((path) => new URL(path, ROOT).href);
let preparation;
async function prepareCache() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(urls.map((url) => new Request(url, { cache: 'reload' })));
  const index = await cache.match(new URL('index.html', ROOT));
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await index.arrayBuffer())),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  if (hash !== INDEX_HASH) {
    await cache.delete(new URL('index.html', ROOT));
    throw new Error('El servidor tiene una versión nueva. Hay que actualizar la aplicación.');
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    prepareCache().catch(async (error) => {
      await caches.delete(CACHE_NAME);
      throw error;
    }),
  );
});

self.addEventListener('activate', (event) => {
  // No se retiran versiones anteriores: otra pestaña puede necesitar todavía sus módulos.
  // No se modifican registros, fotos, documentos ni cachés de otras aplicaciones del mismo dominio.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'APPLY_UPDATE') self.skipWaiting();
  if (event.data?.type === 'ENSURE_OFFLINE') {
    event.waitUntil(
      (async () => {
        try {
          const cache = await caches.open(CACHE_NAME);
          const stored = new Set((await cache.keys()).map((request) => request.url));
          if (!urls.every((url) => stored.has(url))) {
            if (!event.data.online) throw new Error('Faltan recursos sin conexión.');
            preparation ??= prepareCache().finally(() => {
              preparation = undefined;
            });
            await preparation;
          }
          event.ports[0]?.postMessage({ ready: true });
        } catch {
          event.ports[0]?.postMessage({ ready: false });
        }
      })(),
    );
  }
});

async function cachedAsset(request) {
  const current = await caches.open(CACHE_NAME);
  const cached = await current.match(request, { ignoreSearch: true });
  if (cached) return cached;
  for (const name of await caches.keys()) {
    if (name === CACHE_NAME || !name.startsWith(PREFIX)) continue;
    const previous = await (await caches.open(name)).match(request, { ignoreSearch: true });
    if (previous) return previous;
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(ROOT))
    return;
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = await (await caches.open(CACHE_NAME)).match(new URL('index.html', ROOT));
        if (cached) return cached;
        // Si el navegador retiró el caché, se intenta la red sin tocar la base local.
        try {
          return await fetch(request);
        } catch {
          return new Response(
            'Taller Calamante necesita una conexión para preparar la aplicación nuevamente. Tus datos locales no se han borrado.',
            { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
          );
        }
      })(),
    );
  } else if (
    urls.includes(url.origin + url.pathname) ||
    url.pathname.startsWith(new URL('site-assets/', ROOT).pathname)
  ) {
    event.respondWith(cachedAsset(request));
  }
});
