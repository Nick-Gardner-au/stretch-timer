// Wood-block sounds synthesised with Web Audio, and voice through the browser's speech engine.
// iPhones only allow sound after a tap, so unlock() is called from the Start button.

import { phaseSeconds } from "./workout.js";

// name -> [fundamental Hz, volume, knocks]; "done" is a descending triple knock
const SOUNDS = {
  tick: [1900, 0.3, 1],
  phase0: [520, 0.85, 1],
  phase1: [780, 0.85, 1],
  phase2: [1040, 0.85, 1],
  phase3: [1400, 0.85, 1],
  rep: [900, 0.85, 1],
  go: [1200, 0.9, 2],
  rest: [440, 0.8, 2],
  prepare: [660, 0.7, 1],
  done: [0, 0.9, 3],
};

export class Player {
  constructor() {
    this.ctx = null;
    this.noise = null;
    // iPhones pause Web Audio ("interrupted") when speech plays or the app is backgrounded, and do
    // not always restart it. Any later tap or key press, and returning to the app, resumes it.
    for (const ev of ["pointerdown", "touchend", "keydown"]) document.addEventListener(ev, () => this.resume(), { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.resume();
    });
    // voices load after the page on most systems
    if (window.speechSynthesis) {
      this.pickVoice();
      speechSynthesis.addEventListener?.("voiceschanged", () => this.pickVoice());
    }
  }

  resume() {
    if (this.ctx && this.ctx.state !== "running" && this.ctx.state !== "closed") return this.ctx.resume().catch(() => {});
    return Promise.resolve();
  }

  unlock() {
    if (navigator.audioSession) {
      try {
        navigator.audioSession.type = "playback"; // play even with the iPhone's silent switch on
      } catch {
        // not supported
      }
    }
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.004);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      // A silent sound that never stops keeps the audio session open between knocks, so the phone
      // does not put audio to sleep during long holds.
      const keep = this.ctx.createBufferSource();
      keep.buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      keep.loop = true;
      keep.connect(this.ctx.destination);
      keep.start();
      this.ctx.addEventListener("statechange", () => {
        if (this.ctx.state === "interrupted" || this.ctx.state === "suspended") setTimeout(() => this.resume(), 300);
      });
    }
    this.resume();
    if (window.speechSynthesis) {
      // Speaking during the tap lets later speech play on iPhones. Clear anything stuck first; a
      // blank utterance can hang the queue on iOS, so use a real (silent) word.
      this.pickVoice();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("ready");
      u.volume = 0;
      if (this.voice) u.voice = this.voice;
      speechSynthesis.speak(u);
    }
  }

  // An English voice that is installed on the device: Australian, then British, then any English.
  pickVoice() {
    if (!window.speechSynthesis) return null;
    const voices = speechSynthesis.getVoices();
    const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
    const by = (re) => en.find((v) => re.test(v.lang) && v.localService) || en.find((v) => re.test(v.lang));
    this.voice = by(/AU/i) || by(/GB/i) || by(/US/i) || en.find((v) => v.localService) || en[0] || voices[0] || null;
    return this.voice;
  }

  // One knock: inharmonic partials with fast exponential decay, plus a short click.
  _knock(t, f, vol) {
    const ctx = this.ctx;
    [[1, 1, 38], [2.37, 0.45, 70], [3.93, 0.2, 110]].forEach(([ratio, amp, decay]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = f * ratio;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp * vol * 0.5, t + 0.0008);
      g.gain.setTargetAtTime(0, t + 0.0008, 1 / decay);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.35);
    });
    const click = ctx.createBufferSource();
    const cg = ctx.createGain();
    click.buffer = this.noise;
    cg.gain.value = 0.35 * vol;
    click.connect(cg).connect(this.master);
    click.start(t);
  }

  // Plays straight away when audio is running; otherwise restarts it first and plays if that is quick
  // (a late knock is worse than none).
  play(name) {
    if (!this.ctx) return;
    if (this.ctx.state === "running") return this._play(name);
    const asked = performance.now();
    this.resume().then(() => {
      if (this.ctx.state === "running" && performance.now() - asked < 300) this._play(name);
    });
  }

  _play(name) {
    const [freq, vol, knocks] = SOUNDS[name];
    const freqs = freq ? Array(knocks).fill(freq) : [1300, 980, 700];
    const t0 = this.ctx.currentTime + 0.005;
    freqs.forEach((f, i) => this._knock(t0 + i * 0.2, f, vol));
  }

  say(text) {
    if (!window.speechSynthesis) return;
    const synth = speechSynthesis;
    // iPhones sometimes leave speech "speaking" forever after the app was in the background;
    // nothing queued after that is heard. Clear it if one phrase has run implausibly long.
    if (synth.speaking && performance.now() - (this.speechStarted || 0) > 8000) synth.cancel();
    if (synth.paused) synth.resume();
    if (!this.voice) this.pickVoice();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    if (this.voice) {
      u.voice = this.voice;
      u.lang = this.voice.lang;
    } else u.lang = "en-AU";
    u.onstart = () => (this.speechStarted = performance.now());
    // speech can interrupt Web Audio on iPhones; restart it when speech ends
    u.onend = () => this.resume();
    u.onerror = (e) => {
      this.speechError = e.error;
      this.resume();
    };
    this.speechStarted = performance.now();
    synth.speak(u);
  }

  // For Settings → Test voice: speaks a phrase and reports what happened.
  testVoice() {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve("This browser has no speech engine.");
      const voices = speechSynthesis.getVoices();
      const voice = this.pickVoice();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("Voice test. One, two, three.");
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      let done = false;
      const finish = (msg) => {
        if (!done) {
          done = true;
          resolve(msg);
        }
      };
      const name = voice ? `${voice.name} (${voice.lang})` : "the default voice";
      u.onstart = () => finish(`Speaking with ${name}. ${voices.length} voices available.`);
      u.onerror = (e) => finish(`Speech failed (${e.error}). ${voices.length} voices available.`);
      setTimeout(() => finish(voices.length ? `No speech started after 4 s. ${voices.length} voices available.`
        : "No voices are installed or enabled on this device."), 4000);
      speechSynthesis.speak(u);
    });
  }
}

const NUMBERS = { 1: "one", 2: "two", 3: "three" };

// Maps engine cues to sounds and voice, honouring the Sound / Voice / Ticks toggles.
export class Announcer {
  constructor(getCfg, getProgram, player) {
    this.getCfg = getCfg;
    this.getProgram = getProgram;
    this.player = player;
  }

  sound(name) {
    if (this.getCfg().sound) this.player.play(name);
  }

  tick() {
    const cfg = this.getCfg();
    if (cfg.sound && cfg.ticks) this.player.play("tick");
  }

  say(text) {
    const cfg = this.getCfg();
    if (cfg.sound && cfg.voice) this.player.say(text);
  }

  cue(event, seg, remaining) {
    if (event === "finished") {
      this.sound("done");
      this.say("Workout complete. Well done.");
      return;
    }
    if (event === "second") {
      if (["prepare", "rest", "setrest"].includes(seg.kind) && NUMBERS[remaining]) {
        this.sound("tick");
        this.say(NUMBERS[remaining]);
      } else this.tick();
      return;
    }
    const prog = this.getProgram();
    switch (seg.kind) {
      case "prepare":
        this.sound("prepare");
        this.say(prog.kind === "timer" || prog.kind === "tempo" ? "Prepare" : `Prepare. ${prog.shortTitle(seg.step)}`);
        break;
      case "phase":
        this.sound(`phase${seg.phase}`);
        if (this.firstPhase(prog, seg)) this.say(String(seg.rep));
        break;
      case "rep":
        this.sound("rep");
        this.say(String(seg.rep));
        break;
      case "hold":
        this.sound("go");
        this.say(prog.holdWord + (seg.sets > 1 ? `, ${prog.setWord} ${seg.set}` : ""));
        break;
      case "setrest":
        this.sound("rest");
        this.say("Rest");
        break;
      case "rest":
        this.sound("rest");
        if (seg.step + 1 < prog.sequence.length) this.say(`Rest. Next, ${prog.shortTitle(seg.step + 1)}`);
        break;
    }
  }

  firstPhase(prog, seg) {
    const tempo = prog.tempoFor(this.getCfg(), prog.sequence[seg.step][0]) || [];
    const first = tempo.findIndex((d) => phaseSeconds(d) > 0);
    return seg.phase === (first < 0 ? 0 : first);
  }
}
