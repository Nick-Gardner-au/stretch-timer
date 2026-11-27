// Offline support for Pilates Mat: cache the app files, serve from cache, refresh in the background.
// Bump VERSION whenever you upload changed files so phones pick up the new version.
const VERSION = "pilates-mat-v8";
const FILES = [
  "./", "index.html", "pilates.css", "manifest.webmanifest",
  "js/app.js", "js/data.js", "js/plan.js", "js/store.js",
  "../styles.css", "../js/apps.js", "../js/controls.js", "../js/sync.js", "../js/engine.js", "../js/sound.js", "../js/workout.js", "../fonts/BebasNeue-Bold.otf",
  ...["hundred", "rollup", "rollover", "legcircle", "rollingball", "singleleg", "doubleleg", "spinestretch",
     "openrocker", "corkscrew", "saw", "swan", "singlekick", "doublekick", "neckpull", "scissors", "bicycle",
     "bridge", "spinetwist", "jackknife", "sidekick", "teaser", "hiptwist", "swimming", "legpullfront",
     "legpullback", "kneelingkick", "sidebend", "boomerang", "seal", "crab", "rocking", "controlbalance", "pushup"]
    .map((k) => `img/${k}.jpg`),
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pilates-mat-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const fresh = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
