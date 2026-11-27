// Pilates Mat: guided timer for the 34 original mat exercises, with breath tempo, photos and progress tracking.
// Reuses the Stretch Timer's clock-based engine and wood-block sounds.

import { Engine, RUNNING, PAUSED, STOPPED, FINISHED } from "../../js/engine.js";
import { Player } from "../../js/sound.js";
import { switcherItems, rememberApp } from "../../js/apps.js";
import { soundSection, fillNextSteps } from "../../js/controls.js";
import { autoSync, syncSoon, watchVisibility } from "../../js/sync.js";
import * as store from "./store.js";
import { EXERCISES, BY_ID, LEVELS, PHASES } from "./data.js";
import { LENGTHS, PACES, SELECTIONS, LEVEL_FOR_LENGTH, buildPlan, buildSegments, stepTitle } from "./plan.js";

const $ = (id) => document.getElementById(id);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k === "html") el.innerHTML = v;
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

// The 2x2 sequence of Joseph Pilates' photos for an exercise.
const photo = (ex) => h("img", { class: "photo", src: `img/${ex.key}.jpg`, alt: `${ex.name}: four photos in sequence`, decoding: "async" });

const fmtMinutes = (seconds) => `${Math.round(seconds / 60)} min`;
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const fmtClock = (iso) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });

function segColour(seg) {
  if (!seg) return "var(--prepare)";
  if (seg.kind === "phase") return `var(--p${seg.phase})`;
  return seg.kind === "rest" ? "var(--rest)" : "var(--prepare)";
}

function setText(id, text) {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
}

const NUMBERS = { 1: "one", 2: "two", 3: "three" };

class App {
  constructor() {
    this.cfg = store.loadConfig();
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
    $("diagramBtn").addEventListener("click", () => this.openDetail(this.plan.steps[this.step].ex, false));
    $("diagramBtn").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.openDetail(this.plan.steps[this.step].ex, false);
    });
    $("lengthBtn").addEventListener("click", () => this.toggleLengthMenu());
    document.addEventListener("pointerdown", (e) => {
      if (!$("lengthMenu").hidden && !$("lengthMenu").contains(e.target) && !$("lengthBtn").contains(e.target))
        this.closeLengthMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (!$("sheet").hidden || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) {
        if (e.key === "Escape" && !$("sheet").hidden) this.closeSheet();
        return;
      }
      if (e.key === "Escape" && !$("lengthMenu").hidden) return this.closeLengthMenu();
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
    this.plan = buildPlan(this.cfg);
    this.step = Math.min(this.step, this.plan.steps.length - 1);
    const n = this.plan.steps.length;
    $("stepSelect").replaceChildren(...this.plan.steps.map((s, i) =>
      h("option", { value: i }, `${i + 1}/${n}  ${s.ex.id}. ${stepTitle(this.plan, i)}`)));
    this.refreshStatic();
  }

  toggleLengthMenu() {
    if (!$("lengthMenu").hidden) return this.closeLengthMenu();
    const menu = $("lengthMenu");
    menu.replaceChildren(...LENGTHS.map((len) => {
      const p = buildPlan({ ...this.cfg, length: len });
      const on = len === this.cfg.length;
      return h("button", { role: "menuitemradio", "aria-checked": String(on), onclick: () => { this.closeLengthMenu(); this.setLength(len); } },
        h("span", { class: `dot${on ? " on" : ""}` }), `${len} minutes · ${p.exercises.length} exercises`);
    }), ...switcherItems("pilates", () => this.isActive()));
    menu.hidden = false;
    $("lengthBtn").setAttribute("aria-expanded", "true");
  }

  closeLengthMenu() {
    $("lengthMenu").hidden = true;
    $("lengthBtn").setAttribute("aria-expanded", "false");
  }

  setLength(len) {
    if (len === this.cfg.length) return;
    this.endWorkout();
    this.cfg.length = len;
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

  // Stop ends the current session (it is kept in Progress if anything was done).
  stop() {
    this.endWorkout();
    this.refreshStatic();
  }

  endWorkout() {
    this.engine.stop();
    this.engine.load([]);
    this.releaseWake();
    this.saveSession();
    if (this.session) syncSoon();
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

  // ---------- sessions (progress tracking) ----------
  newSession() {
    this.saveSession();
    this.session = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      start: new Date().toISOString(), end: new Date().toISOString(), length: this.cfg.length, seconds: 0,
      planned: this.plan.exercises.map((e) => e.id), done: [], complete: false, doneSteps: new Set(),
    };
  }

  // Steps behind the engine's position in this run are done. Worked out from the position rather than
  // from cues, so steps passed while the phone was asleep still count.
  recordProgress() {
    const s = this.session;
    const eng = this.engine;
    const seg = eng.segment;
    if (!s || !seg || eng.state === STOPPED) return;
    let upto;
    if (eng.state === FINISHED) upto = this.plan.steps.length - 1;
    else if (seg.kind === "rest") upto = seg.step;
    else if (seg.kind === "phase") upto = seg.step - 1;
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
    this.plan.steps.forEach((st, i) => (stepsOf[st.ex.id] ||= []).push(i));
    s.done = s.planned.filter((id) => (stepsOf[id] || []).every((i) => s.doneSteps.has(i)));
    s.complete = s.done.length === s.planned.length;
    this.saveSession();
  }

  saveSession() {
    const s = this.session;
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
      this.say("Workout complete. Well done.");
      const s = this.session;
      this.session = null;
      setTimeout(() => this.openComplete(s), 400);
      syncSoon();
      return;
    }
    if (event === "second") {
      if ((seg.kind === "prepare" || seg.kind === "rest") && NUMBERS[remaining]) {
        this.sound("tick");
        this.say(NUMBERS[remaining]);
      } else if (this.cfg.sound && this.cfg.ticks) this.player.play("tick");
      return;
    }
    const st = this.plan.steps[seg.step];
    if (seg.kind === "prepare") {
      this.sound("prepare");
      this.say(`Prepare. ${st.ex.name}${st.side ? `, ${st.side}` : ""}`);
    } else if (seg.kind === "rest") {
      this.sound("rest");
      const next = this.plan.steps[seg.step + 1];
      if (seg.switch) this.say(`Switch. ${next.side}`);
      else this.say(`Next, ${next.ex.name}${next.side ? `, ${next.side}` : ""}`);
    } else if (seg.kind === "phase") {
      this.sound(`phase${seg.phase}`);
      const first = st.tempo.findIndex((d) => d > 0);
      if (this.cfg.breathVoice) this.say(seg.phase === first ? `${seg.rep}. ${PHASES[seg.phase]}` : PHASES[seg.phase]);
      else if (seg.phase === first) this.say(String(seg.rep));
    }
  }

  // ---------- derived data ----------
  computeMeta(segs) {
    const totals = {};
    for (const s of segs) if (s.kind === "phase") totals[s.step] = (totals[s.step] || 0) + s.duration;
    const before = {};
    let left = segs.reduce((a, s) => a + s.duration, 0);
    this.meta = segs.map((s) => {
      const m = [before[s.step] || 0, totals[s.step] || 1, left];
      left -= s.duration;
      if (s.kind === "phase") before[s.step] = (before[s.step] || 0) + s.duration;
      return m;
    });
    this.segs = segs;
  }

  refreshStatic() {
    const plan = this.plan;
    const st = plan.steps[this.step];
    const ex = st.ex;
    $("exName").textContent = `${ex.id}. ${ex.name}`;
    const bits = [];
    if (st.side) bits.push(st.side);
    bits.push(`${st.reps} ${ex.fixed ? "breaths" : "reps"}`, LEVELS[ex.level]);
    $("exDetail").textContent = bits.join("  ·  ");
    $("exCue").textContent = ex.cue;
    if (this.diagramKey !== ex.key) {
      $("diagram").replaceChildren(photo(ex));
      this.diagramKey = ex.key;
    }
    $("stepSelect").value = String(this.step);
    $("programName").textContent = `Pilates · ${plan.length} min`;
    this.preview = null;
    this.tempoKey = null;
  }

  previewSegs() {
    if (!this.preview) {
      const segs = buildSegments(this.plan, this.cfg.prepare, this.step);
      this.preview = { segs, total: segs.reduce((a, s) => a + s.duration, 0) };
    }
    return this.preview;
  }

  segName(seg) {
    if (seg.kind === "phase") return PHASES[seg.phase];
    if (seg.kind === "rest") return seg.switch ? "Switch side" : "Transition";
    return "Prepare";
  }

  shortTitle(step) {
    const st = this.plan.steps[step];
    return st.ex.name.replace(/^The /, "") + (st.side ? ` · ${st.side}` : "");
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
    this.renderTempo(active ? seg : null);
    this.renderStage(view);
    this.renderDash(state, active ? seg : null);
  }

  renderTempo(seg) {
    const st = this.plan.steps[this.step];
    const activePhase = seg && seg.kind === "phase" ? seg.phase : -1;
    const key = `${this.step}|${st.tempo.join()}|${activePhase}`;
    if (key === this.tempoKey) return;
    this.tempoKey = key;
    const note = st.ex.fixed ? "PUMP THE ARMS ON EVERY TICK" : `BREATH TEMPO ${st.tempo.join("-")}  ·  ${st.tempo.reduce((a, b) => a + b, 0)}S A REP`;
    $("tempo").replaceChildren(
      h("div", { class: "tempo-code" }, note),
      h("div", { class: "tempo-cells" }, ...st.tempo.map((v, i) =>
        h("div", { class: `cell${i === activePhase ? " on" : ""}${v === 0 ? " skipped" : ""}`, style: `--c: var(--p${i})` },
          h("div", { class: "val" }, String(v), h("small", {}, "S")),
          h("div", { class: "phase" }, PHASES[i].toUpperCase())))));
  }

  renderStage(v) {
    const { seg, nxt } = v;
    let label, colour, time;
    if (v.finished) [label, colour, time] = ["Workout complete", "var(--work)", "Done"];
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
    let count = st.reps;
    const exLeft = (from) => new Set(this.plan.steps.slice(from).map((s) => s.ex.id)).size;
    let left = exLeft(this.step);
    let ring = 0;
    if (state === FINISHED) [count, left, ring] = [0, 0, 1];
    else if (seg) {
      const [before, total] = this.meta[this.engine.idx];
      if (seg.kind === "rest") {
        [count, ring] = [0, 1];
        if (!seg.switch) left = exLeft(seg.step + 1);
      } else if (seg.kind === "phase") {
        count = seg.reps - seg.rep + 1;
        ring = (before + this.engine.elapsed) / total;
      }
    }
    setText("leftNum", String(count));
    setText("leftLbl", st.ex.fixed ? "Breaths left" : "Reps left");
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
    this.closeLengthMenu();
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

  // Settings: length, pace, exercise selection, prepare, voice, theme, backup.
  setSound(key, on, draft) {
    this.cfg[key] = on;
    if (draft) draft[key] = on;
    this.save();
  }

  librarySection() {
    return [h("h2", {}, "LIBRARY"),
      h("p", { class: "hint" }, "All 34 exercises with photos, steps and cautions. Exclude an exercise from its page."),
      h("div", { class: "row-btns" }, h("button", { class: "btn", onclick: () => this.openLibrary() }, "Open library"))];
  }

  // During a workout only the sound switches and the library are available.
  openQuickSettings() {
    this.openSheet([...soundSection(this.cfg, (k, on) => this.setSound(k, on), this.player), ...this.librarySection(),
      h("p", { class: "hint" }, "The other settings are available when the workout is stopped.")],
    [h("span", { class: "spacer" }), h("button", { class: "btn primary", onclick: () => this.closeSheet() }, "Done")]);
  }

  openSettings() {
    if (this.isActive()) return this.openQuickSettings();
    const draft = { ...this.cfg, excluded: [...this.cfg.excluded] };
    const body = h("div");
    const choice = (options, current, pick) => h("div", { class: "choice" }, ...options.map(([value, label, sub]) =>
      h("button", { class: value === current ? "on" : "", onclick: () => { pick(value); draw(); } }, label, sub ? h("small", {}, sub) : null)));
    const draw = () => {
      const plan = buildPlan(draft);
      const prep = h("input", { type: "number", inputmode: "numeric", min: 0, max: 60, value: draft.prepare,
                                onchange: (e) => { draft.prepare = Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)); draw(); } });
      const breath = h("input", { type: "checkbox", checked: draft.breathVoice, onchange: (e) => (draft.breathVoice = e.target.checked) });
      const over = Math.abs(plan.total - draft.length * 60) > 60;
      body.replaceChildren(...[
        ...soundSection(draft, (k, on) => this.setSound(k, on, draft), this.player),
        ...this.librarySection(),
        h("h2", {}, "WORKOUT LENGTH"),
        choice(LENGTHS.map((len) => {
          const p = buildPlan({ ...draft, length: len });
          return [len, `${len} MIN`, `${p.exercises.length} exercises`];
        }), draft.length, (v) => (draft.length = v)),
        h("p", { class: "hint" }, draft.selection === "levels"
          ? "15 min: fundamental exercises. 25 min: adds intermediate. 45 min: all 34 in the original order. Repetitions and transition time are adjusted to fit the length."
          : "All 34 exercises every time; repetitions are reduced to fit shorter lengths."),
        over ? h("p", { class: "caution" }, `This combination needs about ${fmtMinutes(plan.total)}, even at minimum repetitions.`) : null,
        h("h2", {}, "PACE"),
        choice(Object.entries(PACES).map(([k, [label, x]]) => [k, label.toUpperCase(), `breath × ${x}`]), draft.pace, (v) => (draft.pace = v)),
        h("p", { class: "hint" }, "Slower breathing gives fewer repetitions in the same time; brisk gives more."),
        h("h2", {}, "EXERCISES"),
        h("div", { class: "choice", style: "grid-template-columns: 1fr 1fr" }, ...Object.entries(SELECTIONS).map(([k, label]) =>
          h("button", { class: k === draft.selection ? "on" : "", style: "font-size:17px", onclick: () => { draft.selection = k; draw(); } }, label))),
        h("p", { class: "hint" }, `${draft.excluded.length ? `${draft.excluded.length} excluded in the Library. ` : ""}Exclude an exercise (for example, for an injury) from its page in the Library.`),
        h("h2", {}, "THIS PLAN"),
        h("p", { class: "hint" }, `About ${fmtMinutes(plan.total)} · ${plan.exercises.length} exercises · ${plan.transition}s between exercises`),
        h("div", { class: "tally" }, ...plan.exercises.flatMap((e) => {
          const st = plan.steps.find((s) => s.ex === e);
          const sides = e.sides ? ` × ${e.sides.length}` : "";
          return [h("span", {}, `${e.id}. ${e.name}`), h("span", { class: "muted" }, st.tempo.join("-")),
                  h("span", { class: "count" }, `${st.reps}${sides}`)];
        })),
        h("h2", {}, "TIMING AND VOICE"),
        h("label", { class: "form-row" }, h("span", {}, "Prepare countdown (s)"), prep),
        h("label", { class: "form-row" }, h("span", {}, "Speak breath cues (in / out)"), breath),
        h("h2", {}, "THEME"),
        h("div", { class: "choice", style: "grid-template-columns: 1fr 1fr" }, ...["dark", "light"].map((t) =>
          h("button", { class: t === draft.theme ? "on" : "", onclick: () => { draft.theme = t; draw(); } }, t.toUpperCase()))),
        h("h2", {}, "BACKUP"),
        h("p", { class: "hint" }, "Saves settings and workout history to a file, or loads them from one."),
        h("div", { class: "row-btns" },
          h("button", { class: "btn", onclick: () => this.exportBackup() }, "Export"),
          h("button", { class: "btn", onclick: () => this.importBackup() }, "Import")),
        h("h2", {}, "SAFETY"),
        h("p", { class: "hint" }, "Advanced exercises load the neck and spine. Skip or modify any exercise that causes pain, and seek medical advice before starting if you have an injury, osteoporosis or are pregnant."),
      ].filter(Boolean));
    };
    draw();
    const saveBtn = h("button", { class: "btn primary", onclick: () => {
      const lengthChanged = ["length", "pace", "selection", "prepare"].some((k) => draft[k] !== this.cfg[k]);
      this.cfg = store.normaliseConfig(draft);
      this.save();
      this.applyTheme();
      if (lengthChanged) {
        this.endWorkout();
        this.step = 0;
      }
      this.rebuildPlan();
      this.closeSheet();
    } }, "Save");
    this.openSheet([body], [h("span", { class: "spacer" }), h("button", { class: "btn", onclick: () => this.closeSheet() }, "Cancel"), saveBtn]);
  }

  // Library: all 34 exercises with photos.
  openLibrary() {
    const inPlan = new Set(this.plan.exercises.map((e) => e.id));
    const items = EXERCISES.map((ex) => {
      const off = this.cfg.excluded.includes(ex.id);
      return h("button", { class: `lib-item${off ? " off" : ""}`, onclick: () => this.openDetail(ex, true) },
        h("span", { class: "fig-slot" }, photo(ex)),
        h("span", {}, h("b", {}, `${ex.id}. ${ex.name}`),
          h("small", {}, off ? "Excluded from workouts" : inPlan.has(ex.id) ? "In this workout" : `From ${Object.entries(LEVEL_FOR_LENGTH).find(([, l]) => l >= ex.level)[0]} min`)),
        h("span", { class: `tag l${ex.level}` }, LEVELS[ex.level]));
    });
    this.openSheet([h("h2", {}, "THE 34 MAT EXERCISES"),
                    h("p", { class: "hint" }, "In the original order. Tap an exercise for steps, breathing and cautions."), ...items],
                   [h("span", { class: "spacer" }), this.closeBtn()]);
  }

  openDetail(ex, fromLibrary) {
    const st = this.plan.steps.find((s) => s.ex === ex);
    const stepIndex = this.plan.steps.findIndex((s) => s.ex === ex);
    const include = h("input", { type: "checkbox", checked: !this.cfg.excluded.includes(ex.id), onchange: (e) => {
      const set = new Set(this.cfg.excluded);
      if (e.target.checked) set.delete(ex.id);
      else set.add(ex.id);
      this.cfg.excluded = [...set];
      this.save();
      if (!this.isActive()) {
        this.endWorkout();
        this.step = 0;
        this.rebuildPlan();
      }
    } });
    const body = [
      h("h2", {}, `${ex.id}. ${ex.name.toUpperCase()}`),
      h("div", { class: "detail-figure" }, photo(ex),
        h("p", { class: "credit" }, "Photos 1–4 in sequence: Joseph H. Pilates, Return to Life. Poster © Pilates Guild.")),
      h("dl", { class: "facts" },
        h("dt", {}, "Level"), h("dd", {}, h("span", { class: `tag l${ex.level}` }, LEVELS[ex.level])),
        h("dt", {}, "This workout"), h("dd", {}, st ? `${st.reps} ${ex.fixed ? "breaths" : "reps"}${ex.sides ? ` × ${ex.sides.join(", ")}` : ""}` : "Not included"),
        h("dt", {}, "Breath"), h("dd", {}, `In ${ex.tempo[0]}s · pause ${ex.tempo[1]}s · out ${ex.tempo[2]}s · pause ${ex.tempo[3]}s (standard pace)`),
        h("dt", {}, "Focus"), h("dd", {}, ex.focus)),
      h("ol", { class: "steps" }, ...ex.steps.map((s) => h("li", {}, s))),
      h("p", { class: "caution" }, ex.caution),
      h("label", { class: "form-row" }, h("span", {}, "Include in workouts"), include),
    ];
    const buttons = [];
    if (fromLibrary) buttons.push(h("button", { class: "btn", onclick: () => this.openLibrary() }, "◀ Library"));
    buttons.push(h("span", { class: "spacer" }));
    if (st && stepIndex !== this.step && !this.isActive())
      buttons.push(h("button", { class: "btn", onclick: () => { this.closeSheet(); this.goTo(stepIndex); } }, "Go to it"));
    buttons.push(this.closeBtn());
    this.openSheet(body, buttons);
  }

  // Progress: stats, calendar, sessions, per-exercise tally.
  openProgress() {
    const history = store.loadHistory();
    const s = store.stats(history);
    const tile = (n, t) => h("div", { class: "tile" }, h("div", { class: "n" }, String(n)), h("div", { class: "t" }, t));

    // last 5 weeks, Monday first
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 28);
    const byDay = {};
    for (const x of history) {
      const k = store.dayKey(new Date(x.start));
      byDay[k] = byDay[k] === "full" || x.complete ? "full" : "part";
    }
    const cells = ["M", "T", "W", "T", "F", "S", "S"].map((d) => h("div", { class: "dow" }, d));
    for (let i = 0; i < 35; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const k = store.dayKey(d);
      const cls = ["day", byDay[k] || "", d.getTime() === today.getTime() ? "today" : "", d > today ? "future" : ""].join(" ");
      cells.push(h("div", { class: cls, title: k }, String(d.getDate())));
    }

    const recent = history.slice(-12).reverse().map((x) =>
      h("div", { class: "session" },
        h("div", {}, h("b", {}, `${fmtDate(x.start)} · ${fmtClock(x.start)}`),
          h("small", {}, `${x.length} min plan · ${fmtMinutes(x.seconds)} active · ${x.done.length}/${x.planned.length} exercises · ${x.complete ? "Complete" : "Partial"}`)),
        h("button", { class: "btn", "aria-label": "Delete session", onclick: () => {
          if (confirm("Delete this session?")) {
            store.deleteSession(x.id);
            this.openProgress();
          }
        } }, "✕")));

    const tally = EXERCISES.flatMap((ex) => {
      const t = s.perExercise[ex.id];
      return [h("span", {}, `${ex.id}. ${ex.name}`), h("span", { class: "muted" }, t ? fmtDate(t.last) : "–"),
              h("span", { class: "count" }, String(t ? t.count : 0))];
    });

    this.openSheet([
      h("h2", {}, "PROGRESS"),
      h("div", { class: "tiles" }, tile(s.week, "This week"), tile(s.streak, "Day streak"), tile(s.sessions, "Sessions"),
        tile(s.minutes >= 600 ? `${Math.round(s.minutes / 60)}h` : s.minutes, s.minutes >= 600 ? "Total time" : "Total min")),
      h("p", { class: "hint" }, `${s.weekMinutes} min this week · ${s.complete} complete workouts. Sessions under 1 minute with no finished exercise are not recorded.`),
      h("div", { class: "cal" }, ...cells),
      h("div", { class: "legend", style: "margin-bottom:10px" },
        h("span", {}, h("i", { style: "background: var(--work)" }), "Complete"),
        h("span", {}, h("i", { style: "background: color-mix(in srgb, var(--work) 40%, var(--card))" }), "Partial")),
      h("h2", {}, "RECENT SESSIONS"),
      ...(recent.length ? recent : [h("p", { class: "hint" }, "No sessions yet. Press Start to begin.")]),
      h("h2", {}, "EXERCISES COMPLETED"),
      h("div", { class: "tally" }, ...tally),
      h("div", { class: "row-btns", style: "margin-top:14px" },
        h("button", { class: "btn", onclick: () => this.exportBackup() }, "Export"),
        h("button", { class: "btn", onclick: () => {
          if (history.length && confirm("Delete all workout history? This cannot be undone.")) {
            store.clearHistory();
            this.openProgress();
          }
        } }, "Clear history")),
    ], [h("span", { class: "spacer" }), this.closeBtn()]);
  }

  openComplete(session) {
    if (!session) return;
    const mins = fmtMinutes(session.seconds);
    this.openSheet([
      h("h2", {}, "WORKOUT COMPLETE"),
      h("div", { class: "tiles", style: "grid-template-columns: repeat(3, minmax(0, 1fr))" },
        h("div", { class: "tile" }, h("div", { class: "n" }, String(session.done.length)), h("div", { class: "t" }, "Exercises")),
        h("div", { class: "tile" }, h("div", { class: "n" }, mins.replace(" min", "")), h("div", { class: "t" }, "Minutes")),
        h("div", { class: "tile" }, h("div", { class: "n" }, String(store.stats(store.loadHistory()).streak)), h("div", { class: "t" }, "Day streak"))),
      h("p", { class: "hint" }, session.complete ? "Every exercise in the plan was completed. Saved to Progress."
        : `${session.planned.length - session.done.length} planned exercises were skipped. Saved to Progress as partial.`),
    ], [h("button", { class: "btn", onclick: () => this.openProgress() }, "Progress"), h("span", { class: "spacer" }), this.closeBtn("Done")]);
  }

  exportBackup() {
    const blob = new Blob([JSON.stringify(store.makeBackup(this.cfg), null, 2)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `pilates-mat-backup-${store.dayKey(new Date())}.json` });
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
        const { config, history } = store.readBackup(JSON.parse(await file.text()));
        const ids = new Set(history.map((x) => x.id));
        store.saveHistory(store.loadHistory().filter((x) => !ids.has(x.id)).concat(history)
          .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)));
        if (config) {
          this.cfg = config;
          this.save();
          this.applyTheme();
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

window.pilatesApp = new App();
rememberApp("pilates");
watchVisibility();
autoSync();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
