// Offline support: cache the app files, serve from cache, refresh in the background.
// Bump VERSION whenever you upload changed files so phones pick up the new version.
const VERSION = "stretch-timer-v6";
const PILATES_IMAGES = ["hundred", "rollup", "rollover", "legcircle", "rollingball", "singleleg", "doubleleg", "spinestretch",
  "openrocker", "corkscrew", "saw", "swan", "singlekick", "doublekick", "neckpull", "scissors", "bicycle",
  "bridge", "spinetwist", "jackknife", "sidekick", "teaser", "hiptwist", "swimming", "legpullfront",
  "legpullback", "kneelingkick", "sidebend", "boomerang", "seal", "crab", "rocking", "controlbalance", "pushup"];
// The launcher and all three apps, so the combined app works offline from the first visit.
const FILES = [
  "./", "index.html", "timer.html", "styles.css", "manifest.webmanifest",
  "js/app.js", "js/apps.js", "js/controls.js", "js/engine.js", "js/programs.js", "js/sound.js", "js/store.js", "js/workout.js",
  "fonts/BebasNeue-Bold.otf",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "pilates/", "pilates/index.html", "pilates/pilates.css", "pilates/manifest.webmanifest",
  "pilates/js/app.js", "pilates/js/data.js", "pilates/js/plan.js", "pilates/js/store.js", "pilates/icons/icon-192.png",
  ...PILATES_IMAGES.map((k) => `pilates/img/${k}.jpg`),
  "mobility/", "mobility/index.html", "mobility/mobility.css", "mobility/manifest.webmanifest",
  "mobility/js/app.js", "mobility/js/data.js", "mobility/js/plan.js", "mobility/js/store.js", "mobility/icons/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("stretch-timer-") && k !== VERSION).map((k) => caches.delete(k))))
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
