// Stretch Timer — phone/web version of the desktop app.

import * as store from "./store.js";
import * as programs from "./programs.js";
import { Engine, buildWorkout, RUNNING, PAUSED, STOPPED, FINISHED } from "./engine.js";
import { Player, Announcer } from "./sound.js";
import { EXERCISES, PHASES, PHASE_PORTIONS, TEMPO_SYMBOLS, parseTempo, phaseSeconds, tempoCode } from "./workout.js";

const $ = (id) => document.getElementById(id);

// Small element builder: h("div", {class: "x", onclick: fn}, "text", child, ...)
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
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function segColour(seg) {
  if (!seg) return "var(--prepare)";
  if (seg.kind === "phase") return `var(--p${seg.phase})`;
  return { prepare: "var(--prepare)", hold: "var(--work)", rep: "var(--work)", rest: "var(--rest)", setrest: "var(--rest)" }[seg.kind];
}

const TEMPO_VALUES = [...TEMPO_SYMBOLS, ...Array.from({ length: 61 }, (_, i) => i)];

class App {
  constructor() {
    this.cfg = store.loadConfig();
    this.customs = programs.loadCustom(store.loadCustomRaw());
    this.program = programs.resolve(this.cfg, this.customs, this.cfg.program);
    this.player = new Player();
    const announcer = new Announcer(() => this.cfg, () => this.program, this.player);
    this.engine = new Engine({ cue: (...a) => announcer.cue(...a) });
    this.step = 0;
    this.segs = [];
    this.meta = [];
    this.preview = null;
    this.wakeLock = null;

    this.bind();
    this.applyTheme();
    for (const key of ["sound", "voice", "ticks"]) $(`t${key[0].toUpperCase()}${key.slice(1)}`).checked = this.cfg[key];
    this.loadProgramSteps();

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
    $("prevBtn").addEventListener("click", () => this.goTo(this.step - 1));
    $("nextBtn").addEventListener("click", () => this.goTo(this.step + 1));
    $("stepSelect").addEventListener("change", (e) => {
      this.goTo(Number(e.target.value));
      e.target.blur();
    });
    $("themeBtn").addEventListener("click", () => this.toggleTheme());
    $("settingsBtn").addEventListener("click", () => this.openSettings());
    $("programBtn").addEventListener("click", () => this.toggleProgramMenu());
    for (const key of ["sound", "voice", "ticks"]) {
      $(`t${key[0].toUpperCase()}${key.slice(1)}`).addEventListener("change", (e) => {
        this.cfg[key] = e.target.checked;
        this.save();
      });
    }
    // the menu stays open until something is chosen or you tap outside it
    document.addEventListener("pointerdown", (e) => {
      if (!$("programMenu").hidden && !$("programMenu").contains(e.target) && !$("programBtn").contains(e.target))
        this.closeProgramMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (!$("sheet").hidden || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) {
        if (e.key === "Escape" && !$("sheet").hidden) this.closeSheet();
        return;
      }
      if (e.key === "Escape" && !$("programMenu").hidden) return this.closeProgramMenu();
      if (e.key === " ") {
        e.preventDefault();
        this.startPause();
      } else if (e.key === "ArrowLeft") this.goTo(this.step - 1);
      else if (e.key === "ArrowRight") this.goTo(this.step + 1);
      else if (e.key === "Escape") this.stop();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.tickEngine();
        if (this.isActive()) this.keepAwake();
      }
    });
  }

  save() {
    store.saveConfig(this.cfg);
  }

  isActive() {
    return this.engine.state === RUNNING || this.engine.state === PAUSED;
  }

  tickEngine() {
    const wasFinished = this.engine.state === FINISHED;
    this.engine.tick();
    if (!wasFinished && this.engine.state === FINISHED) this.releaseWake();
  }

  // ---------- screen wake lock ----------
  async keepAwake() {
    try {
      if ("wakeLock" in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => (this.wakeLock = null));
      }
    } catch {
      // not allowed right now (e.g. low battery mode); the timer still works
    }
  }

  releaseWake() {
    if (this.wakeLock) this.wakeLock.release().catch(() => {});
    this.wakeLock = null;
  }

  // ---------- theme ----------
  applyTheme() {
    document.documentElement.dataset.theme = this.cfg.theme;
    document.querySelector('meta[name="theme-color"]').content = this.cfg.theme === "dark" ? "#141414" : "#ececec";
    $("themeLbl").textContent = this.cfg.theme === "dark" ? "Light" : "Dark";
  }

  toggleTheme() {
    this.cfg.theme = this.cfg.theme === "dark" ? "light" : "dark";
    this.save();
    this.applyTheme();
  }

  // ---------- programs ----------
  toggleProgramMenu() {
    if (!$("programMenu").hidden) return this.closeProgramMenu();
    const menu = $("programMenu");
    const item = (label, onclick, { checked = null, disabled = false } = {}) =>
      h("button", { role: checked === null ? "menuitem" : "menuitemradio", "aria-checked": checked === null ? null : String(checked),
                    disabled, onclick: () => { this.closeProgramMenu(); onclick(); } },
        checked === null ? null : h("span", { class: `dot${checked ? " on" : ""}` }), label);
    const entries = [[programs.BUILTIN_KEY, "Nick Program 2"], [programs.TIMER_KEY, "Interval timer"],
                     [programs.TEMPO_KEY, "Tempo timer"], ...this.customs.map((p) => [p.key, p.name])];
    const custom = this.program.kind === "custom";
    menu.replaceChildren(
      ...entries.map(([key, label]) => item(label, () => this.setProgram(key), { checked: key === this.program.key })),
      h("hr"),
      item("Enter custom program…", () => this.openCustomEditor(null)),
      item("Edit this program…", () => this.openCustomEditor(this.program), { disabled: !custom }),
      item("Delete this program", () => this.deleteProgram(), { disabled: !custom }),
    );
    menu.hidden = false;
    $("programBtn").setAttribute("aria-expanded", "true");
  }

  closeProgramMenu() {
    $("programMenu").hidden = true;
    $("programBtn").setAttribute("aria-expanded", "false");
  }

  setProgram(key) {
    this.engine.stop();
    this.engine.load([]);
    this.releaseWake();
    this.customs = programs.loadCustom(store.loadCustomRaw());
    this.program = programs.resolve(this.cfg, this.customs, key);
    this.cfg.program = this.program.key;
    this.save();
    this.step = 0;
    this.loadProgramSteps();
  }

  reloadProgram() {
    this.customs = programs.loadCustom(store.loadCustomRaw());
    this.program = programs.resolve(this.cfg, this.customs, this.program.key);
    this.step = Math.min(this.step, this.program.sequence.length - 1);
    this.loadProgramSteps();
  }

  deleteProgram() {
    const prog = this.program;
    if (prog.kind !== "custom" || !confirm(`Delete the custom program “${prog.name}”?`)) return;
    store.saveCustomRaw(store.loadCustomRaw().filter((r) => `custom:${r.id}` !== prog.key));
    this.setProgram(programs.BUILTIN_KEY);
  }

  loadProgramSteps() {
    const prog = this.program;
    const n = prog.sequence.length;
    $("stepSelect").replaceChildren(...prog.sequence.map((_, i) => h("option", { value: i }, `${i + 1}/${n}  ${prog.stepTitle(i)}`)));
    this.refreshStatic();
  }

  // ---------- actions ----------
  startPause() {
    this.player.unlock(); // must happen inside the tap for iPhone audio
    const state = this.engine.state;
    if (state === STOPPED || state === FINISHED) {
      const segs = buildWorkout(this.cfg, this.program, this.step);
      this.computeMeta(segs);
      this.engine.load(segs);
      this.engine.start();
      this.keepAwake();
    } else if (state === RUNNING) this.engine.pause();
    else if (state === PAUSED) this.engine.resume();
  }

  stop() {
    this.engine.stop();
    this.engine.load([]);
    this.releaseWake();
    this.refreshStatic();
  }

  goTo(step) {
    if (step < 0 || step >= this.program.sequence.length) return;
    this.engine.stop();
    this.engine.load([]);
    this.releaseWake();
    this.step = step;
    this.refreshStatic();
  }

  // ---------- derived data ----------
  // Per segment: seconds of this step's work before it, that step's work total, workout time left.
  computeMeta(segs) {
    const totals = {};
    for (const s of segs) if (s.kind !== "prepare" && s.kind !== "rest") totals[s.step] = (totals[s.step] || 0) + s.duration;
    const before = {};
    let left = segs.reduce((a, s) => a + s.duration, 0);
    this.meta = segs.map((s) => {
      const m = [before[s.step] || 0, totals[s.step] || 1, left];
      left -= s.duration;
      if (s.kind !== "prepare" && s.kind !== "rest") before[s.step] = (before[s.step] || 0) + s.duration;
      return m;
    });
    this.segs = segs;
  }

  refreshStatic() {
    const prog = this.program;
    const [id, side] = prog.sequence[this.step];
    const ex = prog.exercises[id];
    let bits;
    if (prog.kind === programs.TIMER_KEY) {
      const t = this.cfg.timer;
      $("exName").textContent = "Interval timer";
      bits = [`Work ${t.work}s`, `Rest ${t.rest}s`, `${t.rounds} rounds`];
      if (t.cycles > 1) bits.push(`${t.cycles} cycles`);
    } else if (prog.kind === programs.TEMPO_KEY) {
      const t = this.cfg.tempo_timer;
      $("exName").textContent = "Tempo timer";
      bits = [`Tempo ${tempoCode(t.tempo)}`, `${t.reps} reps`, `${t.sets} sets`, `Rest ${t.rest}s`];
    } else {
      $("exName").textContent = `${id}. ${ex.name}`;
      bits = side ? [side] : [];
      bits.push(`Sets ${ex.sets}`, ex.type === "static" ? `Hold ${ex.duration}s` : `Reps ${ex.reps}`);
    }
    $("exDetail").textContent = bits.join("  ·  ");
    $("exCue").textContent = ex.cue;
    $("stepSelect").value = String(this.step);
    $("programName").textContent = prog.name;
    this.preview = null;
    this.tempoKey = null;
  }

  previewSegs() {
    if (!this.preview) {
      const segs = buildWorkout(this.cfg, this.program, this.step);
      this.preview = { segs, total: segs.reduce((a, s) => a + s.duration, 0) };
    }
    return this.preview;
  }

  segName(seg) {
    return seg.kind === "hold" ? this.program.holdWord : seg.label;
  }

  // ---------- rendering (every animation frame) ----------
  render() {
    const eng = this.engine;
    const state = eng.state;
    const seg = eng.segment;
    const active = (state === RUNNING || state === PAUSED) && seg && eng.idx < this.meta.length;
    if (active && seg.step !== this.step && seg.kind !== "prepare") {
      this.step = seg.step;
      this.refreshStatic();
    }
    let view;
    if (active) {
      view = { seg, nxt: this.segs[eng.idx + 1] || null, remaining: seg.duration - eng.elapsed,
               frac: eng.elapsed / seg.duration, left: this.meta[eng.idx][2] - eng.elapsed, paused: state === PAUSED };
    } else {
      const { segs, total } = this.previewSegs();
      view = { seg: segs[0] || null, nxt: segs[1] || null, remaining: segs[0] ? segs[0].duration : 0, frac: 0,
               left: total, paused: false, finished: state === FINISHED };
    }
    $("timeLeft").textContent = fmtTime(view.left);
    $("settingsBtn").disabled = active;
    this.renderTempo(active ? seg : null);
    this.renderStage(view);
    this.renderDash(state, active ? seg : null);
  }

  renderTempo(seg) {
    const prog = this.program;
    const [id] = prog.sequence[this.step];
    const ex = prog.exercises[id];
    const tempo = prog.tempoFor(this.cfg, id);
    const activePhase = seg && seg.kind === "phase" ? seg.phase : -1;
    const key = `${prog.key}|${this.step}|${JSON.stringify(tempo)}|${activePhase}|${JSON.stringify(this.cfg.timer)}`;
    if (key === this.tempoKey) return;
    this.tempoKey = key;
    const box = $("tempo");
    if (!tempo) {
      let text;
      if (prog.kind === programs.TIMER_KEY) text = `Intervals · ${this.cfg.timer.work}s work / ${this.cfg.timer.rest}s rest`;
      else if (ex.type === "static") text = `Static hold · ${ex.duration}s`;
      else text = `Tempo N/A · counting reps (${ex.rep_time}s each)`;
      box.replaceChildren(h("div", { class: "tempo-note" }, text));
      return;
    }
    box.replaceChildren(
      h("div", { class: "tempo-code" }, `TEMPO ${tempoCode(tempo)}`),
      h("div", { class: "tempo-cells" }, ...tempo.map((v, i) =>
        h("div", { class: `cell${i === activePhase ? " on" : ""}${phaseSeconds(v) === 0 ? " skipped" : ""}`, style: `--c: var(--p${i})` },
          h("div", { class: "portion" }, PHASE_PORTIONS[i].toUpperCase()),
          h("div", { class: "val" }, String(v), TEMPO_SYMBOLS.includes(v) ? null : h("small", {}, "S")),
          h("div", { class: "phase" }, PHASES[i].toUpperCase()))))
    );
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
    const main = $("mainBlock");
    main.style.setProperty("--b", colour);
    setText("mainLabel", label);
    setText("mainTime", time);
    $("mainBar").style.width = `${Math.min(1, v.frac) * 100}%`;

    let nLabel, nTime = "", nColour = null;
    if (v.finished) nLabel = "Pick a step and press Start";
    else if (!nxt) nLabel = "Next: Finish";
    else {
      nLabel = "Next: " + (seg && nxt.step !== seg.step ? this.program.shortTitle(nxt.step) : this.segName(nxt));
      nTime = fmtTime(nxt.duration);
      nColour = segColour(nxt);
    }
    const next = $("nextBlock");
    next.classList.toggle("blank", !nColour);
    if (nColour) next.style.setProperty("--b", nColour);
    setText("nextLabel", nLabel);
    setText("nextTime", nTime);
    $("nextTime").hidden = !nTime;
  }

  renderDash(state, seg) {
    const prog = this.program;
    const ex = prog.exercises[prog.sequence[this.step][0]];
    const isStatic = ex.type === "static";
    let count = isStatic ? ex.sets : ex.reps;
    let stepsLeft = prog.sequence.length - this.step;
    let ring = 0;
    if (state === FINISHED) [count, stepsLeft, ring] = [0, 0, 1];
    else if (seg) {
      const [before, total] = this.meta[this.engine.idx];
      if (seg.kind === "rest") [count, ring] = [0, 1];
      else if (seg.kind !== "prepare") {
        count = isStatic ? seg.sets - seg.set + 1 : seg.reps - seg.rep + 1;
        if (seg.kind === "setrest") count = seg.sets - seg.set;
        ring = (before + (seg.kind === "setrest" ? 0 : this.engine.elapsed)) / total;
      }
    }
    let leftLbl = isStatic ? "Sets left" : "Reps left";
    let rightLbl = "Steps left";
    if (prog.kind === programs.TIMER_KEY) [leftLbl, rightLbl] = ["Rounds left", "Cycles left"];
    else if (prog.kind === programs.TEMPO_KEY) {
      [leftLbl, rightLbl] = ["Reps left", "Sets left"];
      stepsLeft = state === FINISHED ? 0 : seg && seg.kind !== "prepare" ? seg.sets - seg.set + (seg.kind === "setrest" ? 0 : 1) : ex.sets;
    }
    setText("leftNum", String(count));
    setText("leftLbl", leftLbl);
    setText("rightNum", String(stepsLeft));
    setText("rightLbl", rightLbl);
    $("ring").style.strokeDasharray = `${Math.min(1, ring) * 100} 100`;
    const running = state === RUNNING;
    $("playIcon").className = `icon ${running ? "pause-icon" : "play-icon"}`;
    const word = running ? "Pause" : state === PAUSED ? "Resume" : state === FINISHED ? "Restart" : "Start";
    setText("playLbl", word);
    $("playBtn").setAttribute("aria-label", word);
  }

  // ---------- sheets ----------
  openSheet(body, buttons) {
    $("sheetBody").replaceChildren(...body);
    $("sheetButtons").replaceChildren(...buttons);
    $("sheet").hidden = false;
    $("sheetBody").scrollTop = 0;
  }

  closeSheet() {
    $("sheet").hidden = true;
    $("sheetBody").replaceChildren();
  }

  openSettings() {
    if (this.isActive()) return;
    const prog = this.program;
    const cfg = this.cfg;
    const num = (value, lo, hi) => h("input", { type: "number", inputmode: "numeric", min: lo, max: hi, value });
    const tempoSelect = (value) => {
      const s = h("select", {}, ...TEMPO_VALUES.map((v) => h("option", { value: v }, String(v))));
      s.value = String(value);
      return s;
    };
    const row = (label, input) => h("label", { class: "form-row" }, h("span", {}, label), input);

    const prep = num(cfg.prepare, 0, 60);
    const body = [h("h2", {}, "TIMING"), row("Prepare countdown (s)", prep)];
    let rest = null;
    const timerIn = {}, ttIn = {}, ttTempo = [], tempoRows = {};
    if (!programs.STANDALONE.includes(prog.kind)) {
      rest = num(cfg.rest, 0, 600);
      body.push(row("Rest between steps (s)", rest));
    }

    if (prog.kind === programs.TIMER_KEY) {
      body.push(h("h2", {}, "INTERVAL TIMER"),
        h("p", { class: "hint" }, "Each cycle runs the rounds of work with rest between them. Cycles are separated by the same rest."));
      for (const [key, label] of [["work", "Work (s)"], ["rest", "Rest (s)"], ["rounds", "Rounds"], ["cycles", "Cycles"]]) {
        timerIn[key] = num(cfg.timer[key], ...store.TIMER_LIMITS[key]);
        body.push(row(label, timerIn[key]));
      }
    } else if (prog.kind === programs.TEMPO_KEY) {
      const t = cfg.tempo_timer;
      body.push(h("h2", {}, "TEMPO TIMER"),
        h("p", { class: "hint" }, "Seconds for lowering · pause at bottom · lifting · pause at top (e.g. 4010). X = explosive (timed as 1s), - = that part doesn't exist."),
        h("div", { class: "tempo-row head" }, h("span", {}, ""), ...["Ecc", "Bot", "Con", "Top"].map((x) => h("span", {}, x)), h("span", {})),
        h("div", { class: "tempo-row" }, h("span", {}, "Tempo"), ...t.tempo.map((v) => {
          const s = tempoSelect(v);
          ttTempo.push(s);
          return s;
        }), h("span", {})));
      for (const [key, label] of [["reps", "Reps per set"], ["sets", "Sets"], ["rest", "Rest between sets (s)"]]) {
        ttIn[key] = num(t[key], ...store.TEMPO_TIMER_LIMITS[key]);
        body.push(row(label, ttIn[key]));
      }
    } else {
      body.push(h("h2", {}, "TEMPO PER EXERCISE"),
        h("p", { class: "hint" }, "Seconds for lowering · pause at bottom · lifting · pause at top (e.g. 4010). X = explosive (timed as 1s), - = that part doesn't exist. Tick N/A to just count reps."),
        h("div", { class: "tempo-row head" }, ...["Exercise", "Ecc", "Bot", "Con", "Top", "N/A"].map((x) => h("span", {}, x))));
      for (const [id, ex] of Object.entries(prog.exercises)) {
        const name = h("span", {}, `${id}. ${ex.name}`);
        if (ex.type === "static") {
          body.push(h("div", { class: "tempo-row" }, name, h("span", { class: "static" }, `Static hold · ${ex.duration}s`)));
          continue;
        }
        const tempo = prog.tempoFor(cfg, Number(id));
        const vals = tempo || ex.default_tempo || [2, 0, 2, 0];
        const selects = vals.map(tempoSelect);
        const na = h("input", { type: "checkbox", "aria-label": "No tempo" });
        na.checked = tempo === null;
        const sync = () => selects.forEach((s) => (s.disabled = na.checked));
        na.addEventListener("change", sync);
        sync();
        tempoRows[id] = { selects, na };
        body.push(h("div", { class: "tempo-row" }, name, ...selects, na));
      }
    }

    body.push(h("h2", {}, "BACKUP"),
      h("p", { class: "hint" }, "Save your settings and custom programs to a file, or load them from a backup. You can also load the desktop app's programs.json."),
      h("div", { class: "form-row" },
        h("button", { class: "btn", onclick: () => this.exportBackup() }, "Export"),
        h("button", { class: "btn", onclick: () => this.importBackup() }, "Import")));

    const toInt = (input, what) => {
      const v = Number(input.value);
      const lo = Number(input.min), hi = Number(input.max);
      if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${what} must be a whole number from ${lo} to ${hi}.`);
      return v;
    };
    const tempoVal = (s) => (TEMPO_SYMBOLS.includes(s.value) ? s.value : Number(s.value));

    const saveBtn = h("button", { class: "btn primary", onclick: () => {
      try {
        const prepare = toInt(prep, "Prepare");
        const restVal = rest ? toInt(rest, "Rest") : cfg.rest;
        const timer = Object.fromEntries(Object.entries(timerIn).map(([k, i]) => [k, toInt(i, k[0].toUpperCase() + k.slice(1))]));
        const tt = Object.fromEntries(Object.entries(ttIn).map(([k, i]) => [k, toInt(i, k[0].toUpperCase() + k.slice(1))]));
        if (ttTempo.length) {
          tt.tempo = ttTempo.map(tempoVal);
          if (tt.tempo.reduce((a, v) => a + phaseSeconds(v), 0) === 0) throw new Error("The tempo can't be all zeros.");
        }
        const tempos = {};
        for (const [id, { selects, na }] of Object.entries(tempoRows)) {
          if (na.checked) tempos[id] = null;
          else {
            tempos[id] = selects.map(tempoVal);
            if (tempos[id].reduce((a, v) => a + phaseSeconds(v), 0) === 0)
              throw new Error(`Exercise ${id}: tempo can't be all zeros (tick N/A instead).`);
          }
        }
        cfg.prepare = prepare;
        cfg.rest = restVal;
        Object.assign(cfg.timer, timer);
        Object.assign(cfg.tempo_timer, tt);
        if (prog.kind === programs.BUILTIN_KEY) Object.assign(cfg.tempos, tempos);
        else if (prog.kind === "custom" && Object.keys(tempos).length) {
          const raws = store.loadCustomRaw();
          const raw = raws.find((r) => `custom:${r.id}` === prog.key);
          if (raw) for (const [id, t] of Object.entries(tempos)) raw.exercises[Number(id) - 1].tempo = t;
          store.saveCustomRaw(raws);
        }
        this.save();
        this.closeSheet();
        this.reloadProgram();
      } catch (e) {
        alert(e.message);
      }
    } }, "Save");

    const resetBtn = prog.kind === "custom" ? null : h("button", { class: "btn", onclick: () => {
      prep.value = 5;
      if (rest) rest.value = 30;
      for (const [k, i] of Object.entries(timerIn)) i.value = store.TIMER_DEFAULTS[k];
      for (const [k, i] of Object.entries(ttIn)) i.value = store.TEMPO_TIMER_DEFAULTS[k];
      ttTempo.forEach((s, i) => (s.value = String(store.TEMPO_TIMER_DEFAULTS.tempo[i])));
      for (const [id, { selects, na }] of Object.entries(tempoRows)) {
        const d = EXERCISES[id].default_tempo;
        na.checked = d === null;
        selects.forEach((s, i) => {
          s.value = String((d || [2, 0, 2, 0])[i]);
          s.disabled = na.checked;
        });
      }
    } }, "Reset");

    this.openSheet(body, [resetBtn, h("span", { class: "spacer" }),
                          h("button", { class: "btn", onclick: () => this.closeSheet() }, "Cancel"), saveBtn]);
  }

  // ---------- custom program editor ----------
  openCustomEditor(program) {
    const raw = program ? structuredClone(program.raw) : programs.newRaw();
    const blank = () => ({ name: "", type: "Reps", sets: 1, reps: 10, time: 4, tempo: "2020", sides: false, cue: "" });
    const fromRaw = (e) => {
      const isStatic = e.type === "static";
      return { name: e.name, type: isStatic ? "Hold" : "Reps", sets: e.sets, reps: e.reps || 1,
               time: isStatic ? e.duration : e.rep_time || 4, tempo: e.tempo ? tempoCode(e.tempo) : "",
               sides: !!e.sides, cue: e.cue || "" };
    };
    let rows = raw.exercises.length ? raw.exercises.map(fromRaw) : [blank()];
    const nameInput = h("input", { type: "text", value: raw.name, placeholder: "Program name", autocomplete: "off" });
    const list = h("div");
    let fields = [];

    const collect = () => {
      rows = fields.map((f) => ({ name: f.name.value, type: f.type.value, sets: f.sets.value, reps: f.reps.value,
                                  time: f.time.value, tempo: f.tempo.value, sides: f.sides.checked, cue: f.cue.value }));
    };
    const draw = () => {
      fields = [];
      list.replaceChildren(...rows.map((r, i) => {
        const f = {
          name: h("input", { type: "text", value: r.name, placeholder: "Exercise name", autocomplete: "off" }),
          type: h("select", {}, h("option", {}, "Reps"), h("option", {}, "Hold")),
          sets: h("input", { type: "number", inputmode: "numeric", min: 1, max: 20, value: r.sets }),
          reps: h("input", { type: "number", inputmode: "numeric", min: 1, max: 200, value: r.reps }),
          time: h("input", { type: "number", inputmode: "numeric", min: 0, max: 3600, value: r.time }),
          tempo: h("input", { type: "text", value: r.tempo, placeholder: "e.g. 4010", autocomplete: "off", autocapitalize: "characters" }),
          sides: h("input", { type: "checkbox" }),
          cue: h("input", { type: "text", value: r.cue, placeholder: "Cue / note (optional)", autocomplete: "off" }),
        };
        f.type.value = r.type;
        f.sides.checked = !!r.sides;
        const syncType = () => {
          const hold = f.type.value === "Hold";
          f.reps.disabled = hold;
          f.tempo.disabled = hold;
        };
        f.type.addEventListener("change", syncType);
        syncType();
        fields.push(f);
        const act = (label, fn, aria) => h("button", { class: "btn", "aria-label": aria, onclick: () => { collect(); fn(); draw(); } }, label);
        return h("div", { class: "ex-card" },
          h("div", { class: "ex-head" }, h("span", {}, `${i + 1}.`), f.name),
          h("div", { class: "row" },
            h("label", {}, "Type", f.type), h("label", {}, "Sets", f.sets),
            h("label", {}, "Reps", f.reps), h("label", {}, "Time (s)", f.time)),
          h("div", { class: "row2" },
            h("label", {}, "Tempo (blank = count reps)", f.tempo),
            h("label", { class: "lr" }, f.sides, "L/R"),
            h("div", { class: "actions" },
              act("▲", () => i > 0 && ([rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]), "Move up"),
              act("▼", () => i < rows.length - 1 && ([rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]), "Move down"),
              act("✕", () => { rows.splice(i, 1); if (!rows.length) rows.push(blank()); }, "Remove"))),
          f.cue);
      }));
    };
    draw();

    const save = () => {
      try {
        const name = nameInput.value.trim();
        if (!name) throw new Error("Give the program a name.");
        const int = (input, lo, hi, what) => {
          const v = Number(input.value);
          if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${what} must be a whole number from ${lo} to ${hi}.`);
          return v;
        };
        const exercises = fields.map((f, n) => {
          const exName = f.name.value.trim();
          if (!exName) throw new Error(`Exercise ${n + 1}: give it a name (or remove it with ✕).`);
          const isStatic = f.type.value === "Hold";
          const sets = int(f.sets, 1, 20, `${exName}: sets`);
          const time = int(f.time, 0, 3600, `${exName}: time`);
          const reps = isStatic ? 1 : int(f.reps, 1, 200, `${exName}: reps`);
          let tempo = null;
          if (!isStatic) {
            try {
              tempo = parseTempo(f.tempo.value);
            } catch (e) {
              throw new Error(`${exName}: ${e.message}`);
            }
          }
          if (isStatic && time === 0) throw new Error(`${exName}: a hold needs a time in seconds.`);
          if (!isStatic && !tempo && time === 0) throw new Error(`${exName}: give a tempo, or a time per rep to count reps.`);
          return { name: exName, type: isStatic ? "static" : "dynamic", sets, reps, duration: isStatic ? time : null,
                   tempo, rep_time: isStatic ? null : time || 4, sides: f.sides.checked, cue: f.cue.value.trim() };
        });
        Object.assign(raw, { name, exercises });
        const raws = store.loadCustomRaw();
        const i = raws.findIndex((r) => r.id === raw.id);
        if (i >= 0) raws[i] = raw;
        else raws.push(raw);
        store.saveCustomRaw(raws);
        this.closeSheet();
        this.setProgram(`custom:${raw.id}`);
      } catch (e) {
        alert(e.message);
      }
    };

    this.openSheet(
      [h("h2", {}, program ? "EDIT CUSTOM PROGRAM" : "NEW CUSTOM PROGRAM"), nameInput,
       h("p", { class: "hint", style: "margin-top:10px" },
         "Reps: give a tempo like 4010 or 10,0,10,0 (X = explosive, - = skip), or leave it blank to count a rep every Time seconds. " +
         "Hold: holds for Time seconds, Sets times. Tick L/R to do the left side, then the right."),
       list,
       h("button", { class: "btn", onclick: () => { collect(); rows.push(blank()); draw(); fields[fields.length - 1].name.focus(); } }, "+ Add exercise")],
      [h("span", { class: "spacer" }), h("button", { class: "btn", onclick: () => this.closeSheet() }, "Cancel"),
       h("button", { class: "btn primary", onclick: save }, "Save")]);
  }

  // ---------- backup ----------
  exportBackup() {
    const blob = new Blob([JSON.stringify(store.makeBackup(this.cfg), null, 2)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: "stretch-timer-backup.json" });
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
        const { config, programs: raws } = store.readBackup(JSON.parse(await file.text()));
        if (raws) {
          const good = raws.filter((r) => {
            try {
              programs.fromRaw(r);
              return true;
            } catch {
              return false;
            }
          });
          const merged = store.loadCustomRaw().filter((r) => !good.some((g) => g.id === r.id)).concat(good);
          store.saveCustomRaw(merged);
        }
        if (config) {
          this.cfg = config;
          this.save();
          this.applyTheme();
          for (const key of ["sound", "voice", "ticks"]) $(`t${key[0].toUpperCase()}${key.slice(1)}`).checked = this.cfg[key];
        }
        this.closeSheet();
        this.setProgram(this.cfg.program);
        alert("Backup loaded.");
      } catch (e) {
        alert(e instanceof SyntaxError ? "That file isn't valid JSON." : e.message);
      }
    });
    input.click();
  }
}

function setText(id, text) {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
}

window.stretchTimer = new App();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
