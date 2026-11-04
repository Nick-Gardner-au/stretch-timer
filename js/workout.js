// Workout data and tempo helpers (ported from stretchtimer/workout.py).
//
// EXERCISES: id -> {name, sets, reps, duration, type, default_tempo, rep_time, cue}
//   type          "dynamic" (reps, optionally with a 4-phase tempo) or "static" (timed hold)
//   duration      seconds for static holds, else null
//   default_tempo [eccentric, bottom pause, concentric, top pause] in seconds, or null (N/A).
//                 Entries may also be "X" (explosive, timed as 1s) or "-" (doesn't exist, skipped).
//   rep_time      seconds per rep when the tempo is N/A
// SEQUENCE: [exercise_id, side_label] in workout order.

export const PHASES = ["Eccentric", "Bottom pause", "Concentric", "Top pause"];
export const PHASE_PORTIONS = ["Lowering", "Pause at bottom", "Lifting", "Pause at top"];
export const TEMPO_SYMBOLS = ["X", "-"];

export function phaseSeconds(v) {
  if (v === "X") return 1;
  if (v === "-") return 0;
  return Number(v);
}

// "5150", or "10,0,10,0" when a part is over 9 seconds.
export function tempoCode(tempo) {
  if (!tempo) return "N/A";
  const parts = tempo.map(String);
  return parts.join(parts.every((p) => p.length === 1) ? "" : ",");
}

// Parse "4010", "X0-1" or "10,0,10,0"; blank or "N/A" gives null. Throws Error on bad input.
export function parseTempo(text) {
  text = String(text).trim().toUpperCase().replace(/\s+/g, "");
  if (text === "" || text === "N/A" || text === "NA") return null;
  const parts = text.includes(",") ? text.split(",") : [...text];
  if (parts.length !== 4) throw new Error(`Tempo '${text}' needs 4 parts, like 4010 or 10,0,10,0.`);
  const tempo = parts.map((p) => {
    if (TEMPO_SYMBOLS.includes(p)) return p;
    if (/^\d+$/.test(p) && Number(p) <= 60) return Number(p);
    throw new Error(`Tempo '${text}': '${p}' must be 0-60 seconds, X or -.`);
  });
  if (tempo.reduce((a, v) => a + phaseSeconds(v), 0) === 0)
    throw new Error(`Tempo '${text}' is all zeros; leave it blank to just count reps.`);
  return tempo;
}

export function validTempo(v) {
  return Array.isArray(v) && v.length === 4 &&
    v.every((x) => (Number.isInteger(x) && x >= 0 && x <= 60) || TEMPO_SYMBOLS.includes(x)) &&
    v.reduce((a, x) => a + phaseSeconds(x), 0) > 0;
}

// Nick Program 2 (Sept 2026)
export const EXERCISES = {
  "1": {
    "name": "Roll down against wall",
    "sets": 1,
    "reps": 10,
    "duration": null,
    "type": "dynamic",
    "default_tempo": [
      5,
      1,
      5,
      0
    ],
    "rep_time": null,
    "cue": "Peel off the wall one vertebra at a time; soft knees."
  },
  "2": {
    "name": "Standing shoulder / leg stretch",
    "sets": 1,
    "reps": 10,
    "duration": null,
    "type": "dynamic",
    "default_tempo": [
      2,
      0,
      2,
      0
    ],
    "rep_time": null,
    "cue": "Hands on a table, bend and straighten the legs, keep the spine long."
  },
  "3": {
    "name": "Flex - Point",
    "sets": 1,
    "reps": 10,
    "duration": null,
    "type": "dynamic",
    "default_tempo": [
      1,
      0,
      1,
      0
    ],
    "rep_time": null,
    "cue": "Band over the toes, top knee straight, full ankle range."
  },
  "4": {
    "name": "Kicks",
    "sets": 1,
    "reps": 10,
    "duration": null,
    "type": "dynamic",
    "default_tempo": [
      1,
      0,
      1,
      0
    ],
    "rep_time": null,
    "cue": "Bottom leg stays straight and still as you kick."
  },
  "5": {
    "name": "Leg semi circles",
    "sets": 1,
    "reps": 5,
    "duration": null,
    "type": "dynamic",
    "default_tempo": null,
    "rep_time": 6,
    "cue": "Standing hip still, no rolling. Constant speed."
  },
  "6": {
    "name": "Thoracic opener",
    "sets": 1,
    "reps": 10,
    "duration": null,
    "type": "dynamic",
    "default_tempo": [
      2,
      1,
      2,
      0
    ],
    "rep_time": null,
    "cue": "Roller behind shoulder blades, ribcage leads, head follows."
  },
  "7": {
    "name": "Kneeling spine twist - Thread the needle",
    "sets": 1,
    "reps": 5,
    "duration": null,
    "type": "dynamic",
    "default_tempo": [
      3,
      1,
      3,
      0
    ],
    "rep_time": null,
    "cue": "Alternate with open book between sessions. Hips still."
  },
  "8": {
    "name": "Side lying thoracic rotation (open book)",
    "sets": 1,
    "reps": 5,
    "duration": null,
    "type": "dynamic",
    "default_tempo": [
      3,
      1,
      3,
      0
    ],
    "rep_time": null,
    "cue": "Alternate with thread the needle. Follow the hand with your head."
  },
  "9": {
    "name": "Cat stretches",
    "sets": 1,
    "reps": 10,
    "duration": null,
    "type": "dynamic",
    "default_tempo": [
      2,
      1,
      2,
      1
    ],
    "rep_time": null,
    "cue": "Move smoothly between dish and round, keep the core on."
  },
  "10": {
    "name": "Active lunges prep flex",
    "sets": 1,
    "reps": 10,
    "duration": null,
    "type": "dynamic",
    "default_tempo": [
      2,
      0,
      2,
      0
    ],
    "rep_time": null,
    "cue": "Back knee further back; hips don't pass the back knee."
  },
  "11": {
    "name": "Kneeling hip adductor stretch",
    "sets": 1,
    "reps": 10,
    "duration": null,
    "type": "dynamic",
    "default_tempo": [
      2,
      1,
      2,
      0
    ],
    "rep_time": null,
    "cue": "Tailbone back to lengthen the spine."
  },
  "12": {
    "name": "Sitting butterfly stretch",
    "sets": 1,
    "reps": 1,
    "duration": 10,
    "type": "static",
    "default_tempo": null,
    "rep_time": null,
    "cue": "Elbows press the knees towards the floor."
  },
  "13": {
    "name": "Semi-straddle side",
    "sets": 2,
    "reps": 1,
    "duration": 30,
    "type": "static",
    "default_tempo": null,
    "rep_time": null,
    "cue": "Even on the sit bones, reach up and over."
  },
  "14": {
    "name": "Wall straddle advanced",
    "sets": 1,
    "reps": 1,
    "duration": 60,
    "type": "static",
    "default_tempo": null,
    "rep_time": null,
    "cue": "Bottom flat, legs level, relax into it."
  },
  "15": {
    "name": "Pilates cobra / spine extension",
    "sets": 1,
    "reps": 5,
    "duration": null,
    "type": "dynamic",
    "default_tempo": [
      2,
      1,
      3,
      0
    ],
    "rep_time": null,
    "cue": "Roll up only as far as comfortable."
  },
  "16": {
    "name": "Child's pose rest position",
    "sets": 1,
    "reps": 1,
    "duration": 10,
    "type": "static",
    "default_tempo": null,
    "rep_time": null,
    "cue": "Breathe into the back and sides of the ribcage."
  },
  "17": {
    "name": "Hamstring reaches",
    "sets": 1,
    "reps": 10,
    "duration": null,
    "type": "dynamic",
    "default_tempo": [
      2,
      0,
      2,
      0
    ],
    "rep_time": null,
    "cue": "Both legs straight, hips square. Optional leg lifts + calf raises."
  }
};

export const SEQUENCE = [[1, ""], [2, ""], [3, "Left"], [3, "Right"], [4, "Left"], [4, "Right"], [5, "Left · forwards"], [5, "Left · reverse"], [5, "Right · forwards"], [5, "Right · reverse"], [6, ""], [7, "Left"], [7, "Right"], [8, "Left"], [8, "Right"], [9, ""], [10, "Left"], [10, "Right"], [11, "Left"], [11, "Right"], [12, ""], [13, "Left"], [13, "Right"], [14, ""], [15, ""], [16, ""], [17, "Left"], [17, "Right"]];
