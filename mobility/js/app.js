// Mobility: guided hip, spine and hamstring sessions whose exercises progress as benchmarks are met.
// Reuses the Stretch Timer's clock-based engine and wood-block sounds.

import { Engine, RUNNING, PAUSED, STOPPED, FINISHED } from "../../js/engine.js";
import { Player } from "../../js/sound.js";
import { switcherItems, rememberApp } from "../../js/apps.js";
import { soundSection, fillNextSteps } from "../../js/controls.js";
import * as store from "./store.js";
import { TRACKS, TRACK_BY_ID, REGIONS, MAX_LEVEL, BASE_LEVELS, EXERCISES, exerciseFor, trackTitle, doseText, equipmentText } from "./data.js";
import { SESSIONS, TRANSITIONS, buildPlan, buildSegments, stepTitle } from "./plan.js";

const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds - 1e-6));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const fmtMinutes = (seconds) => `${Math.round(seconds / 60)} min`;
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const fmtClock = (iso) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });

function setText(id, text) {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
}

const segColour = (seg) => (!seg ? "var(--prepare)" : seg.kind === "rest" ? "var(--rest)" : seg.kind === "prepare" ? "var(--prepare)" : "var(--work)");
const NUMBERS = { 1: "one", 2: "two", 3: "three" };

// Four bars filled to the level; the top one turns solid when mastered.
const ladder = (state, cls = "ladder") => h("span", { class: cls, "aria-label": `Level ${state.level} of ${MAX_LEVEL}` },
  ...Array.from({ length: MAX_LEVEL }, (_, i) => h("i", {
    class: [i < state.level ? (state.mastered ? "on gold" : "on") : "", i >= BASE_LEVELS ? "eq" : ""].join(" ").trim(),
    style: `height: ${Math.round(((i + 1) / MAX_LEVEL) * 100)}%` })));

// Dots for sessions meeting the benchmark at this level.
const metDots = (state, need) => h("span", { class: "dots" },
  ...Array.from({ length: need }, (_, i) => h("i", { class: i < state.met ? "on" : "" })));

class App {
  constructor() {
    this.cfg = store.loadConfig();
    this.levels = store.loadLevels();
    this.player = new Player();
    this.engine = new Engine({ cue: (...a) => this.cue(...a) });
    this.step = 0;
    this.segs = [];
    this.meta = [];
    this.preview = null;
    this.wakeLock = null;
    this.session = null;
    this.lastTick = this.engine.clock();
    this.lastSave = 0;

    this.bind();
    this.applyTheme();
    this.rebuildPlan();

    setInterval(() => this.tickEngine(), 20);
    const frame = () => {
      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ---------- wiring ----------
  bind() {
    $("playBtn").addEventListener("click", () => this.startPause());
    $("stopBtn").addEventListener("click", () => this.stop());
    $("prevBtn").addEventListener("click", () => this.goTo(this.navStep() - 1));
    $("nextBtn").addEventListener("click", () => this.goTo(this.navStep() + 1));
    $("stepSelect").addEventListener("change", (e) => {
      this.goTo(Number(e.target.value));
      e.target.blur();
    });
    $("settingsBtn").addEventListener("click", () => this.openSettings());
    $("progressBtn").addEventListener("click", () => this.openProgress());
    $("benchBtn").addEventListener("click", () => this.openDetail(this.plan.steps[this.step].ex, false));
    $("benchBtn").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.openDetail(this.plan.steps[this.step].ex, false);
    });
    $("sessionBtn").addEventListener("click", () => this.toggleSessionMenu());
    document.addEventListener("pointerdown", (e) => {
      if (!$("sessionMenu").hidden && !$("sessionMenu").contains(e.target) && !$("sessionBtn").contains(e.target))
        this.closeSessionMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (!$("sheet").hidden || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) {
        if (e.key === "Escape" && !$("sheet").hidden) this.closeSheet();
        return;
      }
      if (e.key === "Escape" && !$("sessionMenu").hidden) return this.closeSessionMenu();
      if (e.key === " ") {
        e.preventDefault();
        this.startPause();
      } else if (e.key === "ArrowLeft") this.goTo(this.navStep() - 1);
      else if (e.key === "ArrowRight") this.goTo(this.navStep() + 1);
      else if (e.key === "Escape") this.stop();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.tickEngine();
        if (this.isActive()) this.keepAwake();
      } else this.saveSession();
    });
  }

  save() {
    store.saveConfig(this.cfg);
  }

  isActive() {
    return this.engine.state === RUNNING || this.engine.state === PAUSED;
  }

  // The step ◀ ▶ move from: the one the timer is in (during a transition the screen already shows the next).
  navStep() {
    const seg = this.engine.segment;
    return this.isActive() && seg ? seg.step : this.step;
  }

  // A rest before a different exercise (not a side switch): the screen shows that exercise and its steps.
  isTransition(seg) {
    return Boolean(seg && seg.kind === "rest" && !seg.switch && seg.step + 1 < this.plan.steps.length);
  }

  tickEngine() {
    const now = this.engine.clock();
    const running = this.engine.state === RUNNING;
    const wasFinished = this.engine.state === FINISHED;
    this.engine.tick();
    this.recordProgress();
    if (running && this.session) {
      this.session.seconds += now - this.lastTick;
      if (performance.now() - this.lastSave > 15000) this.saveSession();
    }
    this.lastTick = now;
    if (!wasFinished && this.engine.state === FINISHED) this.releaseWake();
  }

  async keepAwake() {
    try {
      if ("wakeLock" in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => (this.wakeLock = null));
      }
    } catch {
      // not allowed right now; the timer still works
    }
  }

  releaseWake() {
    if (this.wakeLock) this.wakeLock.release().catch(() => {});
    this.wakeLock = null;
  }

  applyTheme() {
    document.documentElement.dataset.theme = this.cfg.theme;
    document.querySelector('meta[name="theme-color"]').content = this.cfg.theme === "dark" ? "#141414" : "#ececec";
  }

  // ---------- plan ----------
  rebuildPlan() {
    this.plan = buildPlan(this.cfg, this.levels);
    this.step = Math.min(this.step, this.plan.steps.length - 1);
    const n = this.plan.steps.length;
    $("stepSelect").replaceChildren(...this.plan.steps.map((s, i) =>
      h("option", { value: i }, `${i + 1}/${n}  ${stepTitle(this.plan, i)}`)));
    this.refreshStatic();
  }

  toggleSessionMenu() {
    if (!$("sessionMenu").hidden) return this.closeSessionMenu();
    const menu = $("sessionMenu");
    menu.replaceChildren(...Object.entries(SESSIONS).map(([key, s]) => {
      const p = buildPlan({ ...this.cfg, session: key }, this.levels);
      const on = key === this.cfg.session;
      return h("button", { role: "menuitemradio", "aria-checked": String(on), onclick: () => { this.closeSessionMenu(); this.setSession(key); } },
        h("span", { class: `dot${on ? " on" : ""}` }), `${s.title} · ${p.tracks.length} exercises · ${fmtMinutes(p.total)}`);
    }), ...switcherItems("mobility", () => this.isActive()));
    menu.hidden = false;
    $("sessionBtn").setAttribute("aria-expanded", "true");
  }

  closeSessionMenu() {
    $("sessionMenu").hidden = true;
    $("sessionBtn").setAttribute("aria-expanded", "false");
  }

  setSession(key) {
    if (key === this.cfg.session) return;
    this.endWorkout();
    this.cfg.session = key;
    this.save();
    this.step = 0;
    this.rebuildPlan();
  }

  // ---------- actions ----------
  startPause() {
    this.player.unlock();
    const state = this.engine.state;
    if (state === STOPPED || state === FINISHED) {
      if (state === FINISHED || !this.session) this.newSession();
      const segs = buildSegments(this.plan, this.cfg.prepare, this.step);
      this.computeMeta(segs);
      this.runStart = this.step;
      this.engine.load(segs);
      this.lastTick = this.engine.clock();
      this.engine.start();
      this.keepAwake();
    } else if (state === RUNNING) this.engine.pause();
    else if (state === PAUSED) {
      this.lastTick = this.engine.clock();
      this.engine.resume();
    }
  }

  // Stop ends the session; if any exercise was finished, the benchmark check-in follows.
  stop() {
    const s = this.session;
    this.endWorkout();
    this.refreshStatic();
    if (s && s.done.length) this.openCheckIn(s);
  }

  endWorkout() {
    this.engine.stop();
    this.engine.load([]);
    this.releaseWake();
    this.saveSession();
    this.session = null;
  }

  // Jumping to another step pauses the timer but keeps the session going.
  goTo(step) {
    if (step < 0 || step >= this.plan.steps.length) return;
    this.engine.stop();
    this.engine.load([]);
    this.releaseWake();
    this.saveSession();
    this.step = step;
    this.refreshStatic();
  }

  // ---------- sessions ----------
  newSession() {
    this.saveSession();
    this.session = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      start: new Date().toISOString(), end: new Date().toISOString(), session: this.plan.session, seconds: 0,
      planned: [...this.plan.tracks], done: [], complete: false, checked: false, results: {}, changes: [],
      levels: Object.fromEntries(this.plan.tracks.map((id) => [id, this.levels[id].level])), doneSteps: new Set(),
    };
  }

  // Steps behind the engine's position in this run are done, worked out from the position so that
  // steps passed while the phone was asleep still count.
  recordProgress() {
    const s = this.session;
    const eng = this.engine;
    const seg = eng.segment;
    if (!s || !seg || eng.state === STOPPED) return;
    let upto;
    if (eng.state === FINISHED) upto = this.plan.steps.length - 1;
    else if (seg.kind === "rest") upto = seg.step;
    else if (seg.kind === "hold" || seg.kind === "rep") upto = seg.step - 1;
    else return;
    let changed = false;
    for (let i = this.runStart; i <= upto; i++) {
      if (!s.doneSteps.has(i)) {
        s.doneSteps.add(i);
        changed = true;
      }
    }
    if (!changed) return;
    const stepsOf = {};
    this.plan.steps.forEach((st, i) => (stepsOf[st.track] ||= []).push(i));
    s.done = s.planned.filter((id) => (stepsOf[id] || []).every((i) => s.doneSteps.has(i)));
    s.complete = s.done.length === s.planned.length;
    this.saveSession();
  }

  saveSession(s = this.session) {
    this.lastSave = performance.now();
    if (!s || (s.seconds < 60 && !s.done.length)) return; // ignore accidental starts
    s.end = new Date().toISOString();
    const { doneSteps, ...record } = s;
    store.upsertSession({ ...record, seconds: Math.round(s.seconds) });
  }

  // ---------- sound + voice ----------
  sound(name) {
    if (this.cfg.sound) this.player.play(name);
  }

  say(text) {
    if (this.cfg.sound && this.cfg.voice) this.player.say(text);
  }

  cue(event, seg, remaining) {
    if (event === "finished") {
      this.recordProgress();
      this.sound("done");
      this.say("Session complete. Check in on your benchmarks.");
      const s = this.session;
      this.session = null;
      setTimeout(() => this.openCheckIn(s), 400);
      return;
    }
    if (event === "second") {
      if ((seg.kind !== "rep") && NUMBERS[remaining]) {
        this.sound("tick");
        this.say(NUMBERS[remaining]);
      } else if (seg.kind === "hold" && remaining === 10 && seg.duration >= 30) {
        this.say("Ten seconds");
      } else if (this.cfg.sound && this.cfg.ticks) this.player.play("tick");
      return;
    }
    const st = this.plan.steps[seg.step];
    const named = (s) => `${s.ex.name}${s.side ? `, ${s.side.toLowerCase()} side` : ""}`;
    if (seg.kind === "prepare") {
      this.sound("prepare");
      this.say(`Prepare. ${named(st)}`);
    } else if (seg.kind === "rest") {
      this.sound("rest");
      const next = this.plan.steps[seg.step + 1];
      this.say(seg.switch ? `Switch. ${next.side} side` : `Next, ${named(next)}`);
    } else if (seg.kind === "hold") {
      this.sound("go");
      this.say("Hold");
    } else if (seg.kind === "rep") {
      this.sound("rep");
      this.say(String(seg.rep));
    }
  }

  // ---------- derived data ----------
  computeMeta(segs) {
    const totals = {};
    for (const s of segs) if (s.kind === "hold" || s.kind === "rep") totals[s.step] = (totals[s.step] || 0) + s.duration;
    const before = {};
    let left = segs.reduce((a, s) => a + s.duration, 0);
    this.meta = segs.map((s) => {
      const m = [before[s.step] || 0, totals[s.step] || 1, left];
      left -= s.duration;
      if (s.kind === "hold" || s.kind === "rep") before[s.step] = (before[s.step] || 0) + s.duration;
      return m;
    });
    this.segs = segs;
  }

  refreshStatic() {
    const st = this.plan.steps[this.step];
    const { ex } = st;
    const t = TRACK_BY_ID[st.track];
    const lv = this.levels[st.track];
    setText("exTrack", trackTitle(t));
    setText("exName", ex.name);
    setText("exDetail", [st.side ? `${st.side} side` : null, ex.source, doseText(ex), equipmentText(ex) || null].filter(Boolean).join("  ·  "));
    $("benchLevel").replaceChildren(ladder(lv), h("span", { class: "lv" }, lv.mastered ? "MASTERED" : `LEVEL ${lv.level}/${MAX_LEVEL}`));
    $("benchText").textContent = ex.benchmark;
    $("benchMet").replaceChildren(metDots(lv, this.cfg.toProgress),
      h("span", {}, lv.level === MAX_LEVEL && lv.mastered ? "Top level mastered"
        : `${lv.met}/${this.cfg.toProgress} met${lv.level === MAX_LEVEL ? " to master" : " to level up"}`));
    $("stepSelect").value = String(this.step);
    $("programName").textContent = `Mobility · ${SESSIONS[this.plan.session].name}`;
    this.preview = null;
  }

  previewSegs() {
    if (!this.preview) {
      const segs = buildSegments(this.plan, this.cfg.prepare, this.step);
      this.preview = { segs, total: segs.reduce((a, s) => a + s.duration, 0) };
    }
    return this.preview;
  }

  segName(seg) {
    if (seg.kind === "hold") return "Hold";
    if (seg.kind === "rep") return `Rep ${seg.rep} of ${seg.reps}`;
    if (seg.kind === "rest") return seg.switch ? "Switch side" : "Transition";
    return "Prepare";
  }

  shortTitle(step) {
    const st = this.plan.steps[step];
    return st.ex.name + (st.side ? ` · ${st.side}` : "");
  }

  // ---------- rendering ----------
  render() {
    const eng = this.engine;
    const state = eng.state;
    const seg = eng.segment;
    const active = (state === RUNNING || state === PAUSED) && seg && eng.idx < this.meta.length;
    const upcoming = Boolean(active && this.isTransition(seg));
    const shown = upcoming ? seg.step + 1 : active ? seg.step : this.step;
    if (active && shown !== this.step && seg.kind !== "prepare") {
      this.step = shown;
      this.refreshStatic();
    }
    $("upNext").hidden = !upcoming;
    let view;
    if (active) {
      view = { seg, nxt: this.segs[eng.idx + 1] || null, remaining: seg.duration - eng.elapsed,
               frac: eng.elapsed / seg.duration, left: this.meta[eng.idx][2] - eng.elapsed, paused: state === PAUSED };
    } else {
      const { segs, total } = this.previewSegs();
      view = { seg: segs[0] || null, nxt: segs[1] || null, remaining: segs[0] ? segs[0].duration : 0, frac: 0,
               left: total, paused: false, finished: state === FINISHED };
    }
    view.upcoming = upcoming;
    setText("timeLeft", fmtTime(view.left));
    this.renderStage(view);
    this.renderDash(state, active ? seg : null);
  }

  renderStage(v) {
    const { seg, nxt } = v;
    let label, colour, time;
    if (v.finished) [label, colour, time] = ["Session complete", "var(--work)", "Done"];
    else if (!seg) [label, colour, time] = ["Ready", "var(--prepare)", "00:00"];
    else {
      label = (v.paused ? "Paused · " : "") + this.segName(seg);
      colour = segColour(seg);
      time = fmtTime(v.remaining);
    }
    $("mainBlock").style.setProperty("--b", colour);
    setText("mainLabel", label);
    setText("mainTime", time);
    $("mainBar").style.width = `${Math.min(1, v.frac) * 100}%`;

    let nLabel, nTime = "", nColour = null;
    const next = $("nextBlock");
    next.classList.toggle("instructions", v.upcoming);
    $("nextSteps").hidden = !v.upcoming;
    if (v.upcoming) {
      if (this.stepsKey !== this.step) {
        fillNextSteps($("nextSteps"), this.plan.steps[this.step].ex.steps);
        this.stepsKey = this.step;
      }
      next.classList.remove("blank");
      setText("nextLabel", `Up next: ${this.shortTitle(this.step)}`);
      setText("nextTime", "");
      $("nextTime").hidden = true;
      return;
    }
    if (v.finished) nLabel = "Pick an exercise and press Start";
    else if (!nxt) nLabel = "Next: Finish";
    else {
      nLabel = "Next: " + (seg && nxt.step !== seg.step ? this.shortTitle(nxt.step) : this.segName(nxt));
      nTime = fmtTime(nxt.duration);
      nColour = segColour(nxt);
    }
    next.classList.toggle("blank", !nColour);
    if (nColour) next.style.setProperty("--b", nColour);
    setText("nextLabel", nLabel);
    setText("nextTime", nTime);
    $("nextTime").hidden = !nTime;
  }

  renderDash(state, seg) {
    const st = this.plan.steps[this.step];
    const reps = st.ex.mode === "reps";
    let count = reps ? st.ex.dose : 1;
    const exLeft = (from) => new Set(this.plan.steps.slice(from).map((s) => s.track)).size;
    let left = exLeft(this.step);
    let ring = 0;
    if (state === FINISHED) [count, left, ring] = [0, 0, 1];
    else if (seg) {
      const [before, total] = this.meta[this.engine.idx];
      if (seg.kind === "rest") {
        [count, ring] = [0, 1];
        if (!seg.switch) left = exLeft(seg.step + 1);
      } else if (seg.kind === "hold" || seg.kind === "rep") {
        count = seg.reps - seg.rep + 1;
        ring = (before + this.engine.elapsed) / total;
      }
    }
    setText("leftNum", String(count));
    setText("leftLbl", reps ? "Reps left" : "Holds left");
    setText("rightNum", String(left));
    setText("rightLbl", "Exercises left");
    $("ring").style.strokeDasharray = `${Math.min(1, ring) * 100} 100`;
    const running = state === RUNNING;
    $("playIcon").className = `icon ${running ? "pause-icon" : "play-icon"}`;
    const word = running ? "Pause" : state === PAUSED ? "Resume" : state === FINISHED ? "Restart" : this.session ? "Continue" : "Start";
    setText("playLbl", word);
    $("playBtn").setAttribute("aria-label", word);
  }

  // ---------- sheets ----------
  openSheet(body, buttons) {
    this.closeSessionMenu();
    $("sheetBody").replaceChildren(...body);
    $("sheetButtons").replaceChildren(...buttons);
    $("sheet").hidden = false;
    $("sheetBody").scrollTop = 0;
  }

  closeSheet() {
    $("sheet").hidden = true;
    $("sheetBody").replaceChildren();
  }

  closeBtn(label = "Close") {
    return h("button", { class: "btn primary", onclick: () => this.closeSheet() }, label);
  }

  // Check-in: for each finished exercise, was the benchmark met at the prescribed dose?
  openCheckIn(session) {
    if (!session || !session.done.length) return;
    const results = { ...(session.results || {}) };
    const rows = session.done.map((id) => {
      const level = session.levels[id] || this.levels[id].level;
      const ex = exerciseFor(id, level);
      const current = this.levels[id].level === level;
      const pick = h("div", { class: "pick" });
      const draw = () => pick.replaceChildren(...Object.entries(store.RESULTS).map(([k, label]) =>
        h("button", { class: `${results[id] === k ? `on ${k}` : ""}`, disabled: !current,
                      onclick: () => { results[id] = results[id] === k ? undefined : k; draw(); } }, label)));
      draw();
      return h("div", { class: "check" },
        h("div", { class: "check-head" }, h("b", {}, ex.name), h("small", {}, `${trackTitle(TRACK_BY_ID[id])} · Level ${level}`)),
        h("p", {}, ex.benchmark),
        current ? pick : h("p", { class: "hint" }, "This track's level has changed since the session; no check-in needed."));
    });
    const apply = () => {
      const chosen = Object.fromEntries(Object.entries(results).filter(([id, r]) => r && this.levels[id].level === (session.levels[id] || 0)));
      const { levels, changes } = store.applyCheckIn(this.levels, chosen, this.cfg.toProgress);
      this.levels = levels;
      store.saveLevels(levels);
      session.results = chosen;
      session.changes = changes;
      session.checked = true;
      this.saveSession(session);
      this.resetIfFinished();
      if (!this.isActive()) this.rebuildPlan();
      this.openCheckInResult(changes, chosen);
    };
    this.openSheet([
      h("h2", {}, "BENCHMARK CHECK-IN"),
      h("p", { class: "hint" }, `Met: you achieved the benchmark at the full dose. ${this.cfg.toProgress} sessions met in a row moves you up a level. ` +
        "Not yet: keep working at this level. Too hard: it caused pain or could not be done with control; you move down a level."),
      ...rows,
    ], [h("button", { class: "btn", onclick: () => { this.resetIfFinished(); this.closeSheet(); } }, "Later"), h("span", { class: "spacer" }),
        h("button", { class: "btn primary", onclick: apply }, "Save")]);
  }

  // After a finished session, return to the first exercise ready for next time.
  resetIfFinished() {
    if (this.engine.state !== FINISHED) return;
    this.engine.stop();
    this.engine.load([]);
    this.step = 0;
    this.refreshStatic();
  }

  openCheckInResult(changes, results) {
    const text = { up: "Level up", down: "Stepped back", mastered: "Mastered" };
    const rows = changes.map((c) => {
      const ex = exerciseFor(c.track, c.to);
      return h("div", { class: `change ${c.kind}` }, h("b", {}, `${text[c.kind]}: ${trackTitle(TRACK_BY_ID[c.track])}`),
        h("small", {}, c.kind === "mastered" ? `All ${MAX_LEVEL} levels complete. Keep ${ex.name} in your sessions to maintain the range.`
          : `Level ${c.from} → ${c.to}. Next session: ${ex.name} (${ex.source})${ex.equipment ? `, using ${equipmentText(ex).toLowerCase()}` : ""}.`
            + (c.kind === "up" && c.from === BASE_LEVELS ? " All bodyweight levels complete: levels 5 and 6 add equipment." : "")));
    });
    const met = Object.values(results).filter((r) => r === "met").length;
    this.openSheet([
      h("h2", {}, "CHECK-IN SAVED"),
      h("div", { class: "tiles", style: "grid-template-columns: repeat(3, minmax(0, 1fr))" },
        h("div", { class: "tile" }, h("div", { class: "n" }, String(met)), h("div", { class: "t" }, "Benchmarks met")),
        h("div", { class: "tile" }, h("div", { class: "n" }, String(changes.filter((c) => c.kind === "up").length)), h("div", { class: "t" }, "Level ups")),
        h("div", { class: "tile" }, h("div", { class: "n" }, `${store.score(this.levels)}%`), h("div", { class: "t" }, "Mobility score"))),
      ...(rows.length ? rows : [h("p", { class: "hint" }, "No level changes this time. Benchmarks met count toward the next level.")]),
    ], [h("button", { class: "btn", onclick: () => this.openProgress() }, "Progress"), h("span", { class: "spacer" }), this.closeBtn("Done")]);
  }

  // Settings: session, transition, progression, prepare, theme, backup.
  setSound(key, on, draft) {
    this.cfg[key] = on;
    if (draft) draft[key] = on;
    this.save();
  }

  librarySection() {
    return [h("h2", {}, "LIBRARY"),
      h("p", { class: "hint" }, `All ${EXERCISES.length} exercises by movement, with steps, benchmarks and cautions. Choose a level or exclude a movement from its page.`),
      h("div", { class: "row-btns" }, h("button", { class: "btn", onclick: () => this.openLibrary() }, "Open library"))];
  }

  // During a workout only the sound switches and the library are available.
  openQuickSettings() {
    this.openSheet([...soundSection(this.cfg, (k, on) => this.setSound(k, on)), ...this.librarySection(),
      h("p", { class: "hint" }, "The other settings are available when the workout is stopped.")],
    [h("span", { class: "spacer" }), h("button", { class: "btn primary", onclick: () => this.closeSheet() }, "Done")]);
  }

  openSettings() {
    if (this.isActive()) return this.openQuickSettings();
    const draft = { ...this.cfg, excluded: [...this.cfg.excluded] };
    const body = h("div");
    const choice = (options, current, pick, cols) => h("div", { class: "choice", style: cols ? `grid-template-columns: repeat(${cols}, minmax(0, 1fr))` : null },
      ...options.map(([value, label, sub]) =>
        h("button", { class: value === current ? "on" : "", onclick: () => { pick(value); draw(); } }, label, sub ? h("small", {}, sub) : null)));
    const draw = () => {
      const plan = buildPlan(draft, this.levels);
      const prep = h("input", { type: "number", inputmode: "numeric", min: 0, max: 60, value: draft.prepare,
                                onchange: (e) => { draft.prepare = Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)); draw(); } });
      body.replaceChildren(
        ...soundSection(draft, (k, on) => this.setSound(k, on, draft)),
        ...this.librarySection(),
        h("h2", {}, "SESSION"),
        choice(Object.entries(SESSIONS).map(([k, s]) => [k, s.name.toUpperCase(), `${fmtMinutes(buildPlan({ ...draft, session: k }, this.levels).total)}`]),
          draft.session, (v) => (draft.session = v)),
        h("p", { class: "hint" }, "Full: all 12 movement tracks. Hips: flexion, extension, abduction, adduction and both rotations. Spine + hamstrings: flexion, extension, side bending, rotation and both hamstring tracks."),
        h("h2", {}, "TIME BETWEEN EXERCISES"),
        choice(TRANSITIONS.map((s) => [s, `${s} S`]), draft.transition, (v) => (draft.transition = v), 4),
        h("h2", {}, "PROGRESSION"),
        choice(store.TO_PROGRESS.map((n) => [n, `${n} SESSIONS`, "in a row"]), draft.toProgress, (v) => (draft.toProgress = v)),
        h("p", { class: "hint" }, "How many sessions in a row the benchmark must be met before moving up a level. 3 is recommended; tissues adapt more slowly than they feel."),
        h("h2", {}, "THIS SESSION"),
        h("p", { class: "hint" }, `About ${fmtMinutes(plan.total)} · ${plan.tracks.length} exercises`),
        h("div", { class: "tally" }, ...plan.tracks.flatMap((id) => {
          const ex = exerciseFor(id, this.levels[id].level);
          return [h("span", {}, ex.name), h("span", { class: "muted" }, `L${ex.level}`), h("span", { class: "count small" }, doseText(ex))];
        })),
        h("h2", {}, "TIMING"),
        h("label", { class: "form-row" }, h("span", {}, "Prepare countdown (s)"), prep),
        h("h2", {}, "THEME"),
        choice(["dark", "light"].map((t) => [t, t.toUpperCase()]), draft.theme, (v) => (draft.theme = v), 2),
        h("h2", {}, "BACKUP"),
        h("p", { class: "hint" }, "Saves settings, levels and history to a file, or loads them from one."),
        h("div", { class: "row-btns" },
          h("button", { class: "btn", onclick: () => this.exportBackup() }, "Export"),
          h("button", { class: "btn", onclick: () => this.importBackup() }, "Import"),
          h("button", { class: "btn", onclick: () => {
            if (confirm("Reset every track to level 1? History is kept.")) {
              this.levels = store.normaliseLevels(null);
              store.saveLevels(this.levels);
              this.rebuildPlan();
              draw();
            }
          } }, "Reset levels")),
        h("h2", {}, "SAFETY"),
        h("p", { class: "hint" }, "Stretch to mild tension, never pain. Stop any exercise that causes sharp, pinching or nerve-like pain (tingling, numbness) and mark it Too hard. Seek medical advice before starting if you have an injury, recent surgery, osteoporosis or hypermobility, or are pregnant."),
      );
    };
    draw();
    const saveBtn = h("button", { class: "btn primary", onclick: () => {
      const reset = ["session", "transition", "prepare", "toProgress"].some((k) => draft[k] !== this.cfg[k]);
      this.cfg = store.normaliseConfig(draft);
      this.save();
      this.applyTheme();
      if (reset) {
        this.endWorkout();
        this.step = 0;
      }
      this.rebuildPlan();
      this.closeSheet();
    } }, "Save");
    this.openSheet([body], [h("span", { class: "spacer" }), h("button", { class: "btn", onclick: () => this.closeSheet() }, "Cancel"), saveBtn]);
  }

  // Library: every track with its 4-level ladder.
  openLibrary() {
    const groups = Object.entries(REGIONS).map(([region, label]) => [
      h("h2", {}, label.toUpperCase()),
      ...TRACKS.filter((t) => t.region === region).map((t) => {
        const lv = this.levels[t.id];
        const off = this.cfg.excluded.includes(t.id);
        return h("div", { class: `track${off ? " off" : ""}` },
          h("div", { class: "track-head" }, h("b", {}, t.name), ladder(lv, "ladder small"),
            h("small", {}, off ? "Excluded" : lv.mastered ? "Mastered" : `Level ${lv.level}`)),
          h("p", { class: "hint" }, t.aim),
          ...Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).flatMap((n) => {
            const ex = exerciseFor(t.id, n);
            const row = h("button", { class: `lib-item${n === lv.level ? " current" : ""}${n < lv.level ? " passed" : ""}${n > BASE_LEVELS ? " eq" : ""}`, onclick: () => this.openDetail(ex, true) },
              h("span", { class: "lv-num" }, String(n)),
              h("span", {}, h("b", {}, ex.name), h("small", {}, [ex.alt, doseText(ex), equipmentText(ex)].filter(Boolean).join(" · "))),
              h("span", { class: `tag ${ex.source.toLowerCase()}` }, ex.source));
            return n === BASE_LEVELS + 1 ? [h("div", { class: "eq-divider" }, "With equipment, after level 4"), row] : [row];
          }));
      }),
    ]);
    this.openSheet([h("h2", {}, "EXERCISE LIBRARY"),
                    h("p", { class: "hint" }, `${TRACKS.length} movement tracks, ${MAX_LEVEL} levels each, from yoga, Pilates, rehabilitation and strength training. Levels 1–${BASE_LEVELS} need little or no equipment; levels ${BASE_LEVELS + 1}–${MAX_LEVEL} add blocks, bands, sliders, ankle weights, kettlebells or the hamstring stretch tool. Your current level is highlighted. Tap an exercise for steps, the benchmark and cautions.`),
                    ...groups.flat()],
                   [h("span", { class: "spacer" }), this.closeBtn()]);
  }

  openDetail(ex, fromLibrary) {
    const t = TRACK_BY_ID[ex.track];
    const lv = this.levels[ex.track];
    const stepIndex = this.plan.steps.findIndex((s) => s.ex === ex);
    const include = h("input", { type: "checkbox", checked: !this.cfg.excluded.includes(t.id), onchange: (e) => {
      const set = new Set(this.cfg.excluded);
      if (e.target.checked) set.delete(t.id);
      else set.add(t.id);
      this.cfg.excluded = [...set];
      this.save();
      if (!this.isActive()) {
        this.endWorkout();
        this.step = 0;
        this.rebuildPlan();
      }
    } });
    const body = [
      h("h2", {}, ex.name.toUpperCase()),
      h("dl", { class: "facts" },
        h("dt", {}, "Track"), h("dd", {}, trackTitle(t)),
        h("dt", {}, "Level"), h("dd", {}, `${ex.level} of ${MAX_LEVEL}${ex.level === lv.level ? " (current)" : ""}`),
        h("dt", {}, "Origin"), h("dd", {}, `${ex.source} · ${ex.alt}`),
        h("dt", {}, "Dose"), h("dd", {}, doseText(ex) + (ex.mode === "reps" ? ` · ${ex.rep} s a rep` : "")),
        ex.equipment ? h("dt", {}, "Equipment") : null, ex.equipment ? h("dd", {}, equipmentText(ex)) : null),
      h("div", { class: "bench-card" }, h("div", { class: "bench-h" }, "BENCHMARK"), h("p", {}, ex.benchmark)),
      h("ol", { class: "steps" }, ...ex.steps.map((s) => h("li", {}, s))),
      h("p", { class: "caution" }, ex.caution),
      h("label", { class: "form-row" }, h("span", {}, `Include ${t.name.toLowerCase()} (${REGIONS[t.region].toLowerCase()}) in sessions`), include),
    ];
    const buttons = [];
    if (fromLibrary) buttons.push(h("button", { class: "btn", onclick: () => this.openLibrary() }, "◀ Library"));
    buttons.push(h("span", { class: "spacer" }));
    if (ex.level !== lv.level && !this.isActive())
      buttons.push(h("button", { class: "btn", onclick: () => {
        if (!confirm(`Make ${ex.name} your level for ${trackTitle(t)}? The benchmark count starts again.`)) return;
        this.levels = store.setLevel(this.levels, t.id, ex.level);
        store.saveLevels(this.levels);
        this.endWorkout();
        this.rebuildPlan();
        this.openDetail(ex, fromLibrary);
      } }, "Use this level"));
    else if (stepIndex >= 0 && stepIndex !== this.step && !this.isActive())
      buttons.push(h("button", { class: "btn", onclick: () => { this.closeSheet(); this.goTo(stepIndex); } }, "Go to it"));
    buttons.push(this.closeBtn());
    this.openSheet(body, buttons);
  }

  // Progress: score, stats, level ladders and recent sessions.
  openProgress() {
    const history = store.loadHistory();
    const s = store.stats(history);
    const tile = (n, t) => h("div", { class: "tile" }, h("div", { class: "n" }, String(n)), h("div", { class: "t" }, t));
    const ladders = Object.entries(REGIONS).flatMap(([region, label]) => [
      h("div", { class: "region" }, label.toUpperCase()),
      ...TRACKS.filter((t) => t.region === region).map((t) => {
        const lv = this.levels[t.id];
        return h("div", { class: "lad-row" }, h("span", {}, t.name), ladder(lv, "ladder small"), metDots(lv, this.cfg.toProgress));
      }),
    ]);
    const recent = history.slice(-12).reverse().map((x) => {
      const ups = (x.changes || []).filter((c) => c.kind === "up").length;
      const met = Object.values(x.results || {}).filter((r) => r === "met").length;
      const summary = x.checked ? `${met} met${ups ? ` · ${ups} level up${ups > 1 ? "s" : ""}` : ""}` : "Not checked in";
      return h("div", { class: "session" },
        h("div", {}, h("b", {}, `${fmtDate(x.start)} · ${fmtClock(x.start)}`),
          h("small", {}, `${(SESSIONS[x.session] || SESSIONS.full).title} · ${fmtMinutes(x.seconds)} · ${x.done.length}/${x.planned.length} exercises · ${summary}`)),
        !x.checked && x.done.length && x === history[history.length - 1]
          ? h("button", { class: "btn", onclick: () => this.openCheckIn(x) }, "Check in")
          : h("button", { class: "btn", "aria-label": "Delete session", onclick: () => {
            if (confirm("Delete this session? Levels are not changed.")) {
              store.deleteSession(x.id);
              this.openProgress();
            }
          } }, "✕"));
    });
    this.openSheet([
      h("h2", {}, "PROGRESS"),
      h("div", { class: "tiles" }, tile(`${store.score(this.levels)}%`, "Mobility score"), tile(s.week, "This week"),
        tile(s.streak, "Day streak"), tile(s.levelUps, "Level ups")),
      h("p", { class: "hint" }, `${s.sessions} session${s.sessions === 1 ? "" : "s"} · ${s.minutes} min in total. The score counts levels gained across all 12 tracks; 100% is every track mastered at level ${MAX_LEVEL}.`),
      h("h2", {}, "LEVELS"),
      h("div", { class: "ladders" }, ...ladders),
      h("div", { class: "legend" },
        h("span", {}, h("i", { style: "background: var(--work)" }), "Level reached"),
        h("span", {}, h("i", { style: "background: var(--hi)" }), `Sessions met toward the next (${this.cfg.toProgress} needed)`)),
      h("h2", {}, "RECENT SESSIONS"),
      ...(recent.length ? recent : [h("p", { class: "hint" }, "No sessions yet. Press Start to begin.")]),
      h("div", { class: "row-btns", style: "margin-top:14px" },
        h("button", { class: "btn", onclick: () => this.exportBackup() }, "Export"),
        h("button", { class: "btn", onclick: () => {
          if (history.length && confirm("Delete all session history? Levels are kept. This cannot be undone.")) {
            store.saveHistory([]);
            this.openProgress();
          }
        } }, "Clear history")),
    ], [h("span", { class: "spacer" }), this.closeBtn()]);
  }

  exportBackup() {
    const blob = new Blob([JSON.stringify(store.makeBackup(this.cfg, this.levels), null, 2)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `mobility-backup-${store.dayKey(new Date())}.json` });
    document.body.append(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  importBackup() {
    const input = h("input", { type: "file", accept: "application/json,.json" });
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const { config, levels, history } = store.readBackup(JSON.parse(await file.text()));
        const ids = new Set(history.map((x) => x.id));
        store.saveHistory(store.loadHistory().filter((x) => !ids.has(x.id)).concat(history)
          .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)));
        if (config) {
          this.cfg = config;
          this.save();
          this.applyTheme();
        }
        if (levels) {
          this.levels = levels;
          store.saveLevels(levels);
        }
        this.endWorkout();
        this.step = 0;
        this.rebuildPlan();
        this.closeSheet();
        alert(`Backup loaded: ${history.length} sessions.`);
      } catch (e) {
        alert(e instanceof SyntaxError ? "That file isn't valid JSON." : e.message);
      }
    });
    input.click();
  }
}

window.mobilityApp = new App();
rememberApp("mobility");

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
