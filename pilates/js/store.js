// Settings and workout history, kept in the browser's localStorage.

import { LENGTHS, PACES, SELECTIONS } from "./plan.js";
import { BY_ID } from "./data.js";

const CONFIG_KEY = "pilates-timer:config";
const HISTORY_KEY = "pilates-timer:history";

export const DEFAULTS = {
  length: 25, pace: "standard", selection: "levels", excluded: [], prepare: 10,
  sound: true, voice: true, ticks: true, breathVoice: false, theme: "dark",
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
  if (!LENGTHS.includes(cfg.length)) cfg.length = DEFAULTS.length;
  if (!(cfg.pace in PACES)) cfg.pace = DEFAULTS.pace;
  if (!(cfg.selection in SELECTIONS)) cfg.selection = DEFAULTS.selection;
  if (!Number.isInteger(cfg.prepare) || cfg.prepare < 0 || cfg.prepare > 60) cfg.prepare = DEFAULTS.prepare;
  if (!["dark", "light"].includes(cfg.theme)) cfg.theme = DEFAULTS.theme;
  if (Array.isArray(saved.excluded)) cfg.excluded = saved.excluded.filter((id) => BY_ID[id]);
  return cfg;
}

export const loadConfig = () => normaliseConfig(read(CONFIG_KEY));
export const saveConfig = (cfg) => write(CONFIG_KEY, cfg);

// A session: { id, start (ISO), end (ISO), length, seconds, planned: [exercise ids], done: [exercise ids], complete }
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

export function makeBackup(cfg) {
  return { app: "pilates-timer", version: 1, config: cfg, history: loadHistory() };
}

export function readBackup(data) {
  if (!data || typeof data !== "object" || data.app !== "pilates-timer")
    throw new Error("That file isn't a Pilates Timer backup.");
  return {
    config: data.config ? normaliseConfig(data.config) : null,
    history: Array.isArray(data.history) ? data.history.filter(validSession) : [],
  };
}

// ---------- progress figures ----------
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export { dayKey };

export function stats(history, now = new Date()) {
  const days = new Set(history.map((s) => dayKey(new Date(s.start))));
  // streak: consecutive days with a session, ending today (or yesterday if nothing yet today)
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
  const perExercise = {};
  for (const s of history) {
    for (const id of s.done) {
      const e = (perExercise[id] ||= { count: 0, last: null });
      e.count++;
      if (!e.last || s.start > e.last) e.last = s.start;
    }
  }
  return {
    sessions: history.length,
    complete: history.filter((s) => s.complete).length,
    week: week.length,
    weekMinutes: Math.round(week.reduce((a, s) => a + s.seconds, 0) / 60),
    minutes: Math.round(history.reduce((a, s) => a + s.seconds, 0) / 60),
    streak,
    days,
    perExercise,
  };
}
