// Sync between devices through a private GitHub Gist.
//
// Synced: Pilates and Mobility session history, and Mobility track levels. Each device keeps its own
// copy in localStorage; a sync merges the local copy with the gist's and writes the result to both.
//   history  sessions from every device, by id; when both have a session, the later-saved copy wins.
//            Deleted sessions are remembered so another device does not bring them back.
//   levels   per track, the most recent change wins (so a "Too hard" step back is kept).
// The token is stored on the device only and sent only to api.github.com.

const API = "https://api.github.com";
const FILE = "training-sync.json";
const DESCRIPTION = "Training app progress sync (managed by the app, do not edit)";
const K = { token: "sync:token", gist: "sync:gist", last: "sync:last", error: "sync:error", deleted: "sync:deleted" };
const DATA = { pilatesHistory: "pilates-timer:history", mobilityHistory: "mobility:history", mobilityLevels: "mobility:levels" };
const MIN_INTERVAL = 60 * 1000; // automatic syncs at most once a minute
const MAX_DELETED = 2000;

function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked
  }
}

const getItem = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const setItem = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked
  }
};

// ---------- state ----------
export const isSetUp = () => Boolean(getItem(K.token) && getItem(K.gist));

export function syncStatus() {
  return { setUp: isSetUp(), last: Number(getItem(K.last)) || 0, error: getItem(K.error) || "" };
}

// Called by the apps when sessions are deleted, so the deletion syncs too.
export function recordDeleted(app, ids) {
  if (!ids.length) return;
  const d = readJSON(K.deleted, {});
  d[app] = [...new Set([...(d[app] || []), ...ids])].slice(-MAX_DELETED);
  writeJSON(K.deleted, d);
  syncSoon();
}

// ---------- merging (pure) ----------
const time = (iso) => Date.parse(iso) || 0;

function mergeHistory(a, b, deleted) {
  const gone = new Set(deleted);
  const byId = new Map();
  for (const s of [...(a || []), ...(b || [])]) {
    if (!s || typeof s.id !== "string" || gone.has(s.id) || !time(s.start)) continue;
    const cur = byId.get(s.id);
    if (!cur || time(s.end || s.start) > time(cur.end || cur.start)) byId.set(s.id, s);
  }
  return [...byId.values()].sort((x, y) => time(x.start) - time(y.start) || (x.id < y.id ? -1 : 1));
}

function mergeLevels(a, b) {
  const out = {};
  for (const id of [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].sort()) {
    const x = a?.[id], y = b?.[id];
    if (!x || !y) {
      out[id] = x || y;
      continue;
    }
    const tx = x.updated || 0, ty = y.updated || 0;
    if (tx !== ty) out[id] = tx > ty ? x : y;
    else if ((x.level || 0) !== (y.level || 0)) out[id] = x.level > y.level ? x : y;
    else out[id] = (x.met || 0) >= (y.met || 0) ? x : y;
  }
  return out;
}

const mergeDeleted = (a, b) => {
  const out = {};
  for (const app of ["pilates", "mobility"])
    out[app] = [...new Set([...(a?.[app] || []), ...(b?.[app] || [])])].sort().slice(-MAX_DELETED);
  return out;
};

export function mergeSnapshots(local, remote) {
  const deleted = mergeDeleted(local?.deleted, remote?.deleted);
  return {
    app: "training-sync",
    version: 1,
    deleted,
    pilates: { history: mergeHistory(local?.pilates?.history, remote?.pilates?.history, deleted.pilates) },
    mobility: {
      history: mergeHistory(local?.mobility?.history, remote?.mobility?.history, deleted.mobility),
      levels: mergeLevels(local?.mobility?.levels, remote?.mobility?.levels),
    },
  };
}

// ---------- local data ----------
export function localSnapshot() {
  return {
    deleted: readJSON(K.deleted, {}),
    pilates: { history: readJSON(DATA.pilatesHistory, []) },
    mobility: { history: readJSON(DATA.mobilityHistory, []), levels: readJSON(DATA.mobilityLevels, {}) },
  };
}

function saveLocal(s) {
  writeJSON(K.deleted, s.deleted);
  writeJSON(DATA.pilatesHistory, s.pilates.history);
  writeJSON(DATA.mobilityHistory, s.mobility.history);
  writeJSON(DATA.mobilityLevels, s.mobility.levels);
}

// Compare data only (not the wrapper fields).
const same = (a, b) => JSON.stringify(mergeSnapshots(a, {})) === JSON.stringify(mergeSnapshots(b, {}));

// ---------- GitHub ----------
async function api(path, { method = "GET", body, token = getItem(K.token) } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(API + path, {
      method,
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) throw new Error("GitHub did not accept the token. Check it has the gist scope and has not expired.");
    if (res.status === 404) throw new Error("The sync gist was not found. Set up sync again.");
    if (!res.ok) throw new Error(`GitHub error ${res.status}.`);
    return res.json();
  } catch (e) {
    if (e.name === "AbortError" || e instanceof TypeError) throw new Error("Could not reach GitHub. Check the connection; sync will retry later.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function readGist(id) {
  const gist = await api(`/gists/${id}`);
  const file = gist.files && gist.files[FILE];
  if (!file) return {};
  let text = file.content;
  if (file.truncated && file.raw_url) text = await (await fetch(file.raw_url, { cache: "no-store" })).text();
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

const gistBody = (data) => ({ files: { [FILE]: { content: JSON.stringify(data) } } });

// Finds this app's gist in the account, or creates one.
async function findOrCreateGist(token) {
  for (let page = 1; page <= 5; page++) {
    const list = await api(`/gists?per_page=100&page=${page}`, { token });
    const hit = list.find((g) => g.description === DESCRIPTION && g.files && g.files[FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  const created = await api("/gists", { method: "POST", token,
    body: { description: DESCRIPTION, public: false, ...gistBody(mergeSnapshots(localSnapshot(), {})) } });
  return created.id;
}

// ---------- public actions ----------
let running = null;

export async function setUpSync(token) {
  token = token.trim();
  if (!token) throw new Error("Paste a token first.");
  const id = await findOrCreateGist(token);
  setItem(K.token, token);
  setItem(K.gist, id);
  return syncNow();
}

export function disconnectSync() {
  for (const key of [K.token, K.gist, K.last, K.error]) setItem(key, null);
}

// Merges local and remote. Resolves to { localChanged, remoteChanged }; the window gets a
// "training-sync" event with the same detail so open apps can reload.
export function syncNow() {
  if (!isSetUp()) return Promise.reject(new Error("Sync is not set up."));
  if (running) return running;
  running = (async () => {
    try {
      const id = getItem(K.gist);
      const remote = await readGist(id);
      const local = localSnapshot();
      const merged = mergeSnapshots(local, remote);
      const localChanged = !same(local, merged);
      const remoteChanged = !same(remote, merged) || remote.app !== "training-sync";
      if (localChanged) saveLocal(merged);
      if (remoteChanged) await api(`/gists/${id}`, { method: "PATCH", body: gistBody({ ...merged, updated: new Date().toISOString() }) });
      setItem(K.last, String(Date.now()));
      setItem(K.error, null);
      const detail = { localChanged, remoteChanged };
      window.dispatchEvent(new CustomEvent("training-sync", { detail }));
      return detail;
    } catch (e) {
      setItem(K.error, e.message);
      throw e;
    } finally {
      running = null;
    }
  })();
  return running;
}

// Background sync: when an app opens or returns to the screen (at most once a minute), and shortly
// after a session or check-in is saved. Failures are kept for the home screen to show.
export function autoSync() {
  if (!isSetUp() || Date.now() - syncStatus().last < MIN_INTERVAL) return;
  syncNow().catch(() => {});
}

let soon = null;
export function syncSoon(delay = 3000) {
  if (!isSetUp()) return;
  clearTimeout(soon);
  soon = setTimeout(() => syncNow().catch(() => {}), delay);
}

export function watchVisibility() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") autoSync();
  });
}
