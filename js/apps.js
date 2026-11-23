// The three apps in this site, and the "switch app" entries added to each app's title menu.
// Paths are resolved from this file, so they work from the site root and from the sub-folders.

const ROOT = new URL("../", import.meta.url);

export const APPS = [
  { key: "timer", name: "Stretch Timer", path: "timer.html", icon: "icons/icon-192.png",
    blurb: "Nick Program 2, interval and tempo timers, custom programs." },
  { key: "pilates", name: "Pilates Mat", path: "pilates/", icon: "pilates/icons/icon-192.png",
    blurb: "The 34 original mat exercises with breath tempo, in 15, 25 or 45 minutes." },
  { key: "mobility", name: "Mobility", path: "mobility/", icon: "mobility/icons/icon-192.png",
    blurb: "Hip, spine and hamstring tracks that level up as you meet benchmarks." },
];

export const appUrl = (path) => new URL(path, ROOT).href;
export const HOME_URL = ROOT.href;

const LAST_KEY = "apps:last";
export function rememberApp(key) {
  try {
    localStorage.setItem(LAST_KEY, key);
  } catch {
    // storage blocked: nothing to remember
  }
}
export function lastApp() {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

// Menu entries: a divider, one entry per other app, and "All apps". isBusy() is asked before
// leaving so a running workout is not lost by accident.
export function switcherItems(current, isBusy = () => false) {
  const go = (url) => {
    if (isBusy() && !confirm("Leave this workout and switch app?")) return;
    location.href = url;
  };
  const button = (label, url) => {
    const b = document.createElement("button");
    b.setAttribute("role", "menuitem");
    b.className = "app-link";
    b.textContent = label;
    b.addEventListener("click", () => go(url));
    return b;
  };
  return [
    document.createElement("hr"),
    ...APPS.filter((a) => a.key !== current).map((a) => button(`Switch to ${a.name}`, appUrl(a.path))),
    button("All apps", HOME_URL),
  ];
}
