// Builds a session from the chosen session type and the current level of each track, and turns it
// into timed segments for the Stretch Timer's engine.

import { Segment } from "../../js/engine.js";
import { TRACKS, exerciseFor } from "./data.js";

const ALL = TRACKS.map((t) => t.id);
export const SESSIONS = {
  full: { name: "Full", title: "Full body", tracks: ALL },
  hips: { name: "Hips", title: "Hips", tracks: ALL.filter((id) => id.startsWith("hip")) },
  back: { name: "Spine + Hamstrings", title: "Spine + hamstrings", tracks: ALL.filter((id) => !id.startsWith("hip")) },
};
export const SWITCH_REST = 5; // seconds to change sides within one exercise
export const TRANSITIONS = [10, 15, 20, 30]; // seconds between exercises

// Plan: { steps: [{ track, ex, side }], tracks: [track ids], total (seconds incl. prepare), session }
export function buildPlan(cfg, levels) {
  const session = SESSIONS[cfg.session] || SESSIONS.full;
  const excluded = new Set(cfg.excluded || []);
  let tracks = session.tracks.filter((id) => !excluded.has(id));
  if (!tracks.length) tracks = session.tracks; // never an empty session
  const steps = [];
  for (const id of tracks) {
    const ex = exerciseFor(id, levels[id]?.level || 1);
    for (const side of ex.sides ? ["Left", "Right"] : [""]) steps.push({ track: id, ex, side });
  }
  const plan = { steps, tracks, session: cfg.session in SESSIONS ? cfg.session : "full", transition: cfg.transition };
  plan.total = buildSegments(plan, cfg.prepare).reduce((a, s) => a + s.duration, 0);
  return plan;
}

export function restAfter(plan, step) {
  if (step >= plan.steps.length - 1) return 0;
  return plan.steps[step + 1].track === plan.steps[step].track ? SWITCH_REST : plan.transition;
}

// Prepare countdown, then every step from startStep with rests between.
export function buildSegments(plan, prepare, startStep = 0) {
  const segs = [];
  if (prepare > 0) segs.push(new Segment("prepare", startStep, prepare));
  for (let step = startStep; step < plan.steps.length; step++) {
    const { ex } = plan.steps[step];
    if (ex.mode === "hold") segs.push(new Segment("hold", step, ex.dose, { rep: 1, reps: 1 }));
    else for (let r = 1; r <= ex.dose; r++) segs.push(new Segment("rep", step, ex.rep, { rep: r, reps: ex.dose }));
    const rest = restAfter(plan, step);
    if (rest > 0) segs.push(new Segment("rest", step, rest, { switch: plan.steps[step + 1].track === plan.steps[step].track }));
  }
  return segs;
}

export function stepTitle(plan, step) {
  const { ex, side } = plan.steps[step];
  return ex.name + (side ? ` (${side})` : "");
}
