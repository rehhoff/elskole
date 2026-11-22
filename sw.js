/* Service worker til Elskolen: appen virker uden net, når den har været åbnet én gang.
   Scope er appens egen mappe (/elskole/ på GitHub Pages), så den aldrig rører El-oversigtsappen på samme origin.
   VERSION skal være lig APP_VERSION i js/data.js og ?v= i index.html. Røgtesten kontrollerer det. */
const VERSION = '0.1.0';
const CACHE = 'elskole-' + VERSION, EKSTERN = 'elskole-ekstern';
const V = '?v=' + VERSION;
const SKAL = ['./', 'index.html', 'manifest.webmanifest', 'ikoner/ikon-192.png', 'ikoner/ikon-512.png', 'ikoner/ikon.svg', 'ikoner/apple-touch-icon.png',
  'css/app.css' + V, 'css/tailwind.css' + V,
  'js/data.js' + V, 'js/lager.js' + V, 'js/synk.js' + V, 'js/oev.js' + V, 'js/kort.js' + V, 'js/import.js' + V,
  'js/opgaver.js' + V, 'js/cases.js' + V, 'js/fejlfinding.js' + V, 'js/app.js' + V,
  'https://cdnjs.cloudflare.com/ajax/libs/alpinejs/3.14.1/cdn.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css',
  'https://cdn.jsdelivr.net/npm/ts-fsrs@5.2.3/dist/index.umd.js'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(SKAL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  /* Kun egne caches (elskole-*) ryddes. Andre apps på samme origin har deres egne. */
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('elskole-') && k !== CACHE && k !== EKSTERN).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const r = ev.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  /* Synkronisering går altid direkte til GitHub og gemmes aldrig. */
  if (/(^|\.)github(usercontent)?\.com$/.test(u.hostname)) return;
  /* Sider: net først. Offline bruges den gemte. */
  if (r.mode === 'navigate') {
    ev.respondWith(fetch(r).then(svar => { const k = svar.clone(); caches.open(CACHE).then(c => c.put('index.html', k)); return svar; })
      .catch(() => caches.match('index.html', { cacheName:CACHE }).then(s => s || caches.match('./'))));
    return;
  }
  /* Skrifttyper og KaTeX' skrifter: gemmes, når de hentes første gang. */
  if (u.origin !== self.location.origin) {
    ev.respondWith(caches.match(r).then(s => s || fetch(r).then(svar => { if (svar.ok || svar.type === 'opaque') { const k = svar.clone(); caches.open(EKSTERN).then(c => c.put(r, k)); } return svar; })));
    return;
  }
  /* App-filer med ?v= og startkort: cache først, ellers net. */
  ev.respondWith(caches.match(r).then(s => s || fetch(r)));
});
