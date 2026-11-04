// Selectable programs: the built-in Nick Program 2, an interval timer, a tempo timer, and custom programs.
// Custom programs are stored as { id, name, exercises: [{name, type, sets, reps, duration, tempo, rep_time, sides, cue}] }.

import { EXERCISES, SEQUENCE } from "./workout.js";

export const BUILTIN_KEY = "builtin";
export const TIMER_KEY = "timer";
export const TEMPO_KEY = "tempo";
export const STANDALONE = [TIMER_KEY, TEMPO_KEY]; // timers that aren't tied to a list of exercises

class Program {
  constructor({ key, name, exercises, sequence, kind = BUILTIN_KEY, rest = null, holdWord = "Hold", setWord = "set", raw = null }) {
    Object.assign(this, { key, name, exercises, sequence, kind, rest, holdWord, setWord, raw });
  }

  stepTitle(step) {
    const [id, side] = this.sequence[step];
    const name = this.exercises[id].name + (side ? ` (${side})` : "");
    return STANDALONE.includes(this.kind) ? name : `${id}. ${name}`;
  }

  shortTitle(step) {
    const [id, side] = this.sequence[step];
    return this.exercises[id].name + (side ? ` (${side})` : "");
  }

  tempoFor(cfg, id) {
    const ex = this.exercises[id];
    if (ex.type === "static") return null;
    if (this.kind === BUILTIN_KEY) return cfg.tempos[String(id)] ?? null;
    return ex.default_tempo ?? null;
  }

  restFor(cfg) {
    return this.rest ?? cfg.rest;
  }
}

export function builtin() {
  return new Program({ key: BUILTIN_KEY, name: "Nick Program 2", exercises: EXERCISES, sequence: SEQUENCE });
}

export function intervalTimer(cfg) {
  const t = cfg.timer;
  const exercises = { 1: { name: "Work", sets: t.rounds, reps: 1, duration: t.work, type: "static", default_tempo: null,
                           rep_time: null, cue: "Change work, rest, rounds and cycles in Settings." } };
  const sequence = Array.from({ length: t.cycles }, (_, c) => [1, t.cycles > 1 ? `Cycle ${c + 1}` : ""]);
  return new Program({ key: TIMER_KEY, name: "Interval Timer", exercises, sequence, kind: TIMER_KEY, rest: t.rest,
                       holdWord: "Work", setWord: "round" });
}

export function tempoTimer(cfg) {
  const t = cfg.tempo_timer;
  const exercises = { 1: { name: "Tempo timer", sets: t.sets, reps: t.reps, duration: null, type: "dynamic",
                           default_tempo: [...t.tempo], rep_time: null,
                           cue: "Change the tempo, reps, sets and rest in Settings." } };
  return new Program({ key: TEMPO_KEY, name: "Tempo Timer", exercises, sequence: [[1, ""]], kind: TEMPO_KEY, rest: t.rest });
}

export function newRaw(name = "My program") {
  return { id: Math.random().toString(16).slice(2, 10), name, exercises: [] };
}

export function fromRaw(raw) {
  const exercises = {};
  const sequence = [];
  raw.exercises.forEach((e, i) => {
    const id = i + 1;
    const isStatic = e.type === "static";
    exercises[id] = {
      name: String(e.name), sets: Math.max(1, parseInt(e.sets, 10) || 1),
      reps: isStatic ? 1 : Math.max(1, parseInt(e.reps, 10) || 1),
      duration: isStatic ? parseInt(e.duration, 10) : null, type: isStatic ? "static" : "dynamic",
      default_tempo: isStatic || !e.tempo ? null : [...e.tempo], rep_time: parseInt(e.rep_time, 10) || 4,
      cue: String(e.cue || ""),
    };
    if (e.sides) sequence.push([id, "Left"], [id, "Right"]);
    else sequence.push([id, ""]);
  });
  if (!sequence.length || !raw.id || !raw.name) throw new Error("empty program");
  return new Program({ key: `custom:${raw.id}`, name: String(raw.name), exercises, sequence, kind: "custom", raw });
}

export function loadCustom(rawList) {
  const out = [];
  for (const raw of rawList) {
    try {
      out.push(fromRaw(raw));
    } catch {
      // skip a broken entry rather than lose the rest
    }
  }
  return out;
}

export function resolve(cfg, customs, key) {
  if (key === TIMER_KEY) return intervalTimer(cfg);
  if (key === TEMPO_KEY) return tempoTimer(cfg);
  return customs.find((p) => p.key === key) || builtin();
}
