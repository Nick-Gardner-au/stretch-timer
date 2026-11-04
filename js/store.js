// Settings and custom programs, kept in the browser's localStorage (same shape as the desktop
// app's config.json and programs.json, so backups can move between the two).

import { EXERCISES, validTempo } from "./workout.js";

const CONFIG_KEY = "stretch-timer:config";
const PROGRAMS_KEY = "stretch-timer:programs";

export const DEFAULTS = { rest: 30, prepare: 5, sound: true, voice: true, ticks: true, theme: "dark", program: "builtin" };
export const TIMER_DEFAULTS = { work: 30, rest: 10, rounds: 8, cycles: 1 };
export const TIMER_LIMITS = { work: [1, 3600], rest: [0, 600], rounds: [1, 99], cycles: [1, 20] };
export const TEMPO_TIMER_DEFAULTS = { tempo: [3, 1, 1, 0], reps: 10, sets: 3, rest: 60 };
export const TEMPO_TIMER_LIMITS = { reps: [1, 200], sets: [1, 20], rest: [0, 600] };

export function defaultTempos() {
  return Object.fromEntries(Object.entries(EXERCISES).map(([id, ex]) => [id, ex.default_tempo ? [...ex.default_tempo] : null]));
}

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
    // storage full or blocked: settings just won't persist
  }
}

const inRange = (v, [lo, hi]) => Number.isInteger(v) && v >= lo && v <= hi;

// Build a valid config from anything (a saved one, an imported backup, or nothing).
export function normaliseConfig(saved) {
  const cfg = { ...DEFAULTS, tempos: defaultTempos(), timer: { ...TIMER_DEFAULTS },
                tempo_timer: { ...TEMPO_TIMER_DEFAULTS, tempo: [...TEMPO_TIMER_DEFAULTS.tempo] } };
  if (!saved || typeof saved !== "object") return cfg;
  for (const [key, def] of Object.entries(DEFAULTS)) if (typeof saved[key] === typeof def) cfg[key] = saved[key];
  if (cfg.rest < 0 || cfg.rest > 600) cfg.rest = DEFAULTS.rest;
  if (cfg.prepare < 0 || cfg.prepare > 60) cfg.prepare = DEFAULTS.prepare;
  for (const [key, value] of Object.entries(saved.timer || {}))
    if (key in TIMER_LIMITS && inRange(value, TIMER_LIMITS[key])) cfg.timer[key] = value;
  for (const [key, value] of Object.entries(saved.tempo_timer || {})) {
    if (key === "tempo" && validTempo(value)) cfg.tempo_timer.tempo = value;
    else if (key in TEMPO_TIMER_LIMITS && inRange(value, TEMPO_TIMER_LIMITS[key])) cfg.tempo_timer[key] = value;
  }
  for (const [key, value] of Object.entries(saved.tempos || {}))
    if (key in cfg.tempos && (value === null || validTempo(value))) cfg.tempos[key] = value;
  return cfg;
}

export function loadConfig() {
  return normaliseConfig(read(CONFIG_KEY));
}

export function saveConfig(cfg) {
  write(CONFIG_KEY, cfg);
}

export function loadCustomRaw() {
  const data = read(PROGRAMS_KEY);
  return Array.isArray(data) ? data : [];
}

export function saveCustomRaw(list) {
  write(PROGRAMS_KEY, list);
}

// A backup holds both; the desktop app's programs.json (a bare list) is accepted too.
export function makeBackup(cfg) {
  return { app: "stretch-timer", version: 1, config: cfg, programs: loadCustomRaw() };
}

export function readBackup(data) {
  if (Array.isArray(data)) return { config: null, programs: data };
  if (data && typeof data === "object" && (data.config || data.programs))
    return { config: data.config ? normaliseConfig(data.config) : null, programs: Array.isArray(data.programs) ? data.programs : null };
  throw new Error("That file isn't a Stretch Timer backup or programs.json.");
}
