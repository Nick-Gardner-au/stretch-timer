// Settings, track levels, workout history and the progression rules, kept in localStorage.

import { SESSIONS, TRANSITIONS } from "./plan.js";
import { TRACKS, TRACK_BY_ID, MAX_LEVEL } from "./data.js";

const CONFIG_KEY = "mobility:config";
const LEVELS_KEY = "mobility:levels";
const HISTORY_KEY = "mobility:history";

export const TO_PROGRESS = [2, 3, 4]; // sessions meeting the benchmark needed to move up a level

export const DEFAULTS = {
  session: "full", transition: 15, prepare: 10, toProgress: 3, excluded: [],
  sound: true, voice: true, ticks: true, theme: "dark",
};

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: data just won't persist
  }
}

export function normaliseConfig(saved) {
  const cfg = { ...DEFAULTS, excluded: [] };
  if (!saved || typeof saved !== "object") return cfg;
  for (const [key, def] of Object.entries(DEFAULTS))
    if (key !== "excluded" && typeof saved[key] === typeof def) cfg[key] = saved[key];
  if (!(cfg.session in SESSIONS)) cfg.session = DEFAULTS.session;
  if (!TRANSITIONS.includes(cfg.transition)) cfg.transition = DEFAULTS.transition;
  if (!TO_PROGRESS.includes(cfg.toProgress)) cfg.toProgress = DEFAULTS.toProgress;
  if (!Number.isInteger(cfg.prepare) || cfg.prepare < 0 || cfg.prepare > 60) cfg.prepare = DEFAULTS.prepare;
  if (!["dark", "light"].includes(cfg.theme)) cfg.theme = DEFAULTS.theme;
  if (Array.isArray(saved.excluded)) cfg.excluded = saved.excluded.filter((id) => TRACK_BY_ID[id]);
  return cfg;
}

export const loadConfig = () => normaliseConfig(read(CONFIG_KEY));
export const saveConfig = (cfg) => write(CONFIG_KEY, cfg);

// ---------- levels ----------
// { trackId: { level: 1-4, met: sessions in a row meeting the benchmark at this level, mastered } }
export function normaliseLevels(saved) {
  const out = {};
  for (const t of TRACKS) {
    const s = saved && typeof saved === "object" ? saved[t.id] : null;
    const level = s && Number.isInteger(s.level) && s.level >= 1 && s.level <= MAX_LEVEL ? s.level : 1;
    const met = s && Number.isInteger(s.met) && s.met >= 0 ? s.met : 0;
    out[t.id] = { level, met, mastered: Boolean(s && s.mastered && level === MAX_LEVEL) };
  }
  return out;
}

export const loadLevels = () => normaliseLevels(read(LEVELS_KEY));
export const saveLevels = (levels) => write(LEVELS_KEY, levels);

export const RESULTS = { met: "Met", not: "Not yet", hard: "Too hard" };

// Applies one session's check-in. results: { trackId: "met" | "not" | "hard" }; tracks without a
// result are unchanged.
//   met   counts toward progression; reaching toProgress in a row moves up a level
//         (at the top level it marks the track mastered)
//   not   resets the count at this level
//   hard  (pain, or the exercise could not be done with control) steps back a level
// Returns { levels, changes: [{ track, from, to, kind: "up" | "down" | "mastered" }] }.
export function applyCheckIn(levels, results, toProgress) {
  const next = normaliseLevels(levels);
  const changes = [];
  for (const [id, result] of Object.entries(results || {})) {
    const t = next[id];
    if (!t) continue;
    const from = t.level;
    if (result === "met") {
      t.met += 1;
      if (t.met >= toProgress) {
        t.met = 0;
        if (t.level < MAX_LEVEL) {
          t.level += 1;
          changes.push({ track: id, from, to: t.level, kind: "up" });
        } else if (!t.mastered) {
          t.mastered = true;
          changes.push({ track: id, from, to: from, kind: "mastered" });
        }
      }
    } else if (result === "not") t.met = 0;
    else if (result === "hard") {
      t.met = 0;
      t.mastered = false;
      if (t.level > 1) {
        t.level -= 1;
        changes.push({ track: id, from, to: t.level, kind: "down" });
      }
    }
  }
  return { levels: next, changes };
}

// Manually choose a level (from the Library); the count starts again.
export function setLevel(levels, trackId, level) {
  const next = normaliseLevels(levels);
  next[trackId] = { level, met: 0, mastered: false };
  return next;
}

// Mobility score: levels gained across all tracks, 0-100 %.
export function score(levels) {
  const gained = TRACKS.reduce((a, t) => a + (levels[t.id].level - 1) + (levels[t.id].mastered ? 1 : 0), 0);
  return Math.round((gained / (TRACKS.length * MAX_LEVEL)) * 100);
}

// ---------- history ----------
// A session: { id, start, end (ISO), session, seconds, planned: [track ids], done: [track ids],
//              levels: { trackId: level }, results: { trackId: result }, changes: [...], complete }
function validSession(s) {
  return s && typeof s === "object" && typeof s.id === "string" && !Number.isNaN(Date.parse(s.start)) &&
    Array.isArray(s.done) && Array.isArray(s.planned) && Number.isFinite(s.seconds);
}

export function loadHistory() {
  const data = read(HISTORY_KEY);
  return Array.isArray(data) ? data.filter(validSession) : [];
}

export const saveHistory = (list) => write(HISTORY_KEY, list);

export function upsertSession(session) {
  const list = loadHistory().filter((s) => s.id !== session.id);
  list.push(session);
  list.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  saveHistory(list);
}

export function deleteSession(id) {
  saveHistory(loadHistory().filter((s) => s.id !== id));
}

export function makeBackup(cfg, levels) {
  return { app: "mobility", version: 1, config: cfg, levels, history: loadHistory() };
}

export function readBackup(data) {
  if (!data || typeof data !== "object" || data.app !== "mobility") throw new Error("That file isn't a Mobility backup.");
  return {
    config: data.config ? normaliseConfig(data.config) : null,
    levels: data.levels ? normaliseLevels(data.levels) : null,
    history: Array.isArray(data.history) ? data.history.filter(validSession) : [],
  };
}

// ---------- progress figures ----------
export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function stats(history, now = new Date()) {
  const days = new Set(history.map((s) => dayKey(new Date(s.start))));
  let streak = 0;
  const d = new Date(now);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = history.filter((s) => new Date(s.start) >= monday);
  return {
    sessions: history.length,
    week: week.length,
    minutes: Math.round(history.reduce((a, s) => a + s.seconds, 0) / 60),
    levelUps: history.reduce((a, s) => a + (s.changes || []).filter((c) => c.kind === "up").length, 0),
    streak,
  };
}
