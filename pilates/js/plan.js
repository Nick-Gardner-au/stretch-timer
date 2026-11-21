// Turns the settings into a workout plan that fits the chosen length, and the plan into timed segments.

import { Segment } from "../../js/engine.js";
import { EXERCISES } from "./data.js";

export const LENGTHS = [15, 25, 45];
export const PACES = { slow: ["Slow", 1.25], standard: ["Standard", 1], brisk: ["Brisk", 0.8] };
export const SELECTIONS = { levels: "By level (recommended)", all: "All 34 every time" };
// Which levels each length includes when selecting by level.
export const LEVEL_FOR_LENGTH = { 15: 1, 25: 2, 45: 3 };
export const SWITCH_REST = 5; // seconds to change side or direction within one exercise
export const TRANSITION = [6, 30]; // allowed seconds between exercises
const REP_SCALE = [0.5, 2];

export function scaleTempo(tempo, pace) {
  const k = (PACES[pace] || PACES.standard)[1];
  return tempo.map((v) => (v === 0 ? 0 : Math.max(1, Math.round(v * k))));
}

const repSeconds = (tempo) => tempo.reduce((a, v) => a + v, 0);
const sideCount = (ex) => (ex.sides ? ex.sides.length : 1);
const minReps = (ex) => (ex.reps >= 3 ? 2 : 1);

export function selectExercises(cfg) {
  const top = LEVEL_FOR_LENGTH[cfg.length] || 3;
  const excluded = new Set(cfg.excluded || []);
  const picked = EXERCISES.filter((e) => (cfg.selection === "all" || e.level <= top) && !excluded.has(e.id));
  // never an empty workout: fall back to the level's exercises if everything was excluded
  return picked.length ? picked : EXERCISES.filter((e) => cfg.selection === "all" || e.level <= top);
}

// Plan: { steps: [{ ex, side, reps, tempo }], transition, total (seconds incl. prepare), exercises }
export function buildPlan(cfg) {
  const exercises = selectExercises(cfg);
  const target = cfg.length * 60 - cfg.prepare;
  const tempos = new Map(exercises.map((e) => [e.id, scaleTempo(e.tempo, cfg.pace)]));
  const work = (e, reps) => reps * repSeconds(tempos.get(e.id)) * sideCount(e);
  const switches = exercises.reduce((a, e) => a + sideCount(e) - 1, 0) * SWITCH_REST;
  const gaps = exercises.length - 1;

  const fixedWork = exercises.filter((e) => e.fixed).reduce((a, e) => a + work(e, e.reps), 0);
  const flexWork = exercises.filter((e) => !e.fixed).reduce((a, e) => a + work(e, e.reps), 0);
  const startGap = 15;
  let f = flexWork > 0 ? (target - fixedWork - switches - gaps * startGap) / flexWork : 1;
  f = Math.min(REP_SCALE[1], Math.max(REP_SCALE[0], f));
  const reps = new Map(exercises.map((e) => [e.id, e.fixed ? e.reps : Math.max(minReps(e), Math.round(e.reps * f))]));

  const total = exercises.reduce((a, e) => a + work(e, reps.get(e.id)), 0) + switches;
  let transition = gaps > 0 ? Math.round((target - total) / gaps) : 0;
  if (gaps > 0) transition = Math.min(TRANSITION[1], Math.max(TRANSITION[0], transition));

  const steps = [];
  for (const e of exercises) {
    for (const side of e.sides || [""]) steps.push({ ex: e, side, reps: reps.get(e.id), tempo: tempos.get(e.id) });
  }
  return { steps, transition, total: cfg.prepare + total + gaps * transition, exercises, length: cfg.length };
}

export function restAfter(plan, step) {
  if (step >= plan.steps.length - 1) return 0;
  return plan.steps[step + 1].ex === plan.steps[step].ex ? SWITCH_REST : plan.transition;
}

// Prepare countdown, then every step from startStep with rests between.
export function buildSegments(plan, prepare, startStep = 0) {
  const segs = [];
  if (prepare > 0) segs.push(new Segment("prepare", startStep, prepare));
  for (let step = startStep; step < plan.steps.length; step++) {
    const { reps, tempo } = plan.steps[step];
    for (let r = 1; r <= reps; r++) {
      tempo.forEach((d, p) => {
        if (d > 0) segs.push(new Segment("phase", step, d, { phase: p, rep: r, reps }));
      });
    }
    const rest = restAfter(plan, step);
    if (rest > 0) segs.push(new Segment("rest", step, rest, { switch: rest === SWITCH_REST && plan.steps[step + 1].ex === plan.steps[step].ex }));
  }
  return segs;
}

export function stepTitle(plan, step) {
  const { ex, side } = plan.steps[step];
  return ex.name + (side ? ` (${side})` : "");
}
