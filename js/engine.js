// Timer engine: turns a program into timed segments and runs them against a clock.
// Time is measured from the clock rather than by counting ticks, so it stays accurate even when
// the browser delays timers, and catches up after the phone pauses the page.

import { PHASES, phaseSeconds } from "./workout.js";

export class Segment {
  constructor(kind, step, duration, extra = {}) {
    // kind: prepare | phase | rep | hold | setrest | rest
    Object.assign(this, { kind, step, duration, phase: null, rep: 0, reps: 0, set: 0, sets: 0 }, extra);
  }

  get label() {
    return { prepare: "Prepare", phase: PHASES[this.phase], rep: `Rep ${this.rep}`, hold: "Hold",
             setrest: "Rest", rest: "Rest" }[this.kind];
  }
}

// Segments for one step's work (no prepare, no trailing rest).
export function buildStep(cfg, program, step) {
  const [id] = program.sequence[step];
  const ex = program.exercises[id];
  const tempo = program.tempoFor(cfg, id);
  const rest = program.restFor(cfg);
  const segs = [];
  for (let s = 1; s <= ex.sets; s++) {
    if (s > 1 && rest > 0) segs.push(new Segment("setrest", step, rest, { set: s - 1, sets: ex.sets }));
    for (let r = 1; r <= ex.reps; r++) {
      const common = { rep: r, reps: ex.reps, set: s, sets: ex.sets };
      if (ex.type === "static") segs.push(new Segment("hold", step, ex.duration, common));
      else if (tempo) {
        tempo.map(phaseSeconds).forEach((d, p) => {
          if (d > 0) segs.push(new Segment("phase", step, d, { ...common, phase: p }));
        });
      } else segs.push(new Segment("rep", step, ex.rep_time || 4, common));
    }
  }
  return segs;
}

// Prepare countdown, then every step from startStep to the end with rests between.
export function buildWorkout(cfg, program, startStep) {
  const segs = [];
  if (cfg.prepare > 0) segs.push(new Segment("prepare", startStep, cfg.prepare));
  const rest = program.restFor(cfg);
  const last = program.sequence.length - 1;
  for (let step = startStep; step <= last; step++) {
    segs.push(...buildStep(cfg, program, step));
    if (step < last && rest > 0) segs.push(new Segment("rest", step, rest));
  }
  return segs;
}

export const STOPPED = "stopped", RUNNING = "running", PAUSED = "paused", FINISHED = "finished";

export class Engine {
  // cue(event, segment, remaining) is called for "segment" (a segment starts), "second" (each whole
  // second inside a segment, with the seconds remaining) and "finished".
  constructor({ cue = () => {}, clock = () => performance.now() / 1000 } = {}) {
    this.cue = cue;
    this.clock = clock;
    this.segments = [];
    this.state = STOPPED;
    this.idx = 0;
    this.elapsed = 0;
    this.last = 0;
    this.lastSec = 0;
  }

  load(segments) {
    this.segments = segments;
    this.state = STOPPED;
    this.idx = 0;
    this.elapsed = 0;
  }

  start() {
    if (!this.segments.length) return;
    this.state = RUNNING;
    this.idx = 0;
    this.elapsed = 0;
    this.lastSec = 0;
    this.last = this.clock();
    this.cue("segment", this.segments[0], this.segments[0].duration);
  }

  pause() {
    if (this.state !== RUNNING) return;
    this.tick();
    if (this.state === RUNNING) this.state = PAUSED;
  }

  resume() {
    if (this.state !== PAUSED) return;
    this.last = this.clock();
    this.state = RUNNING;
  }

  stop() {
    this.state = STOPPED;
    this.idx = 0;
    this.elapsed = 0;
  }

  get segment() {
    return this.segments[this.idx] || null;
  }

  // Advance the clock and fire cues. After a long gap (the page was paused in the background) it
  // catches up silently and only announces where the workout is now.
  tick() {
    if (this.state !== RUNNING) return [];
    const now = this.clock();
    const gap = now - this.last;
    this.elapsed += gap;
    this.last = now;
    let events = [];
    let seg = this.segments[this.idx];
    while (this.elapsed >= seg.duration - 1e-9) {
      this.elapsed -= seg.duration;
      this.idx += 1;
      this.lastSec = 0;
      if (this.idx >= this.segments.length) {
        this.idx = this.segments.length - 1;
        this.elapsed = seg.duration;
        this.state = FINISHED;
        events.push(["finished", seg, 0]);
        break;
      }
      seg = this.segments[this.idx];
      events.push(["segment", seg, seg.duration]);
    }
    if (this.state === RUNNING) {
      const sec = Math.floor(this.elapsed + 1e-9);
      if (sec > this.lastSec) {
        this.lastSec = sec;
        events.push(["second", seg, Math.round(seg.duration - sec)]);
      }
    }
    if (gap > 1.5 && events.length > 1) {
      const starts = events.filter((e) => e[0] !== "second");
      events = [starts.length ? starts[starts.length - 1] : events[events.length - 1]];
    }
    for (const ev of events) this.cue(...ev);
    return events;
  }
}
