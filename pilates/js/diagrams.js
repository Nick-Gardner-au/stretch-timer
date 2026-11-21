// Simple side-view stick-figure diagrams, drawn as inline SVG from joint angles.
//
// A pose is { p: [x, y] pelvis, t: torso angle, c: spine curve, h: head angle,
//             a1/a2: [upper arm, forearm] angles, l1/l2: [thigh, shin] angles }.
// Angles are degrees, 0 = pointing right, 90 = pointing up. a1/l1 are the near limbs (solid),
// a2/l2 the far limbs (drawn lighter). The mat is the line at y = 100 in a 200 x 112 view box.

const LEN = { torso: 36, neck: 5, head: 7, upper: 16, fore: 15, thigh: 22, shin: 21 };
const rad = (d) => (d * Math.PI) / 180;
const step = ([x, y], angle, len) => [x + len * Math.cos(rad(angle)), y - len * Math.sin(rad(angle))];
const f = (n) => Math.round(n * 10) / 10;
const pt = ([x, y]) => `${f(x)} ${f(y)}`;

function joints(pose) {
  const P = pose.p;
  const S = step(P, pose.t, LEN.torso);
  const headAngle = pose.h ?? pose.t;
  const H = step(S, headAngle, LEN.neck + LEN.head);
  const limb = (from, angles, a, b) => {
    if (!angles) return null;
    const mid = step(from, angles[0], a);
    return [from, mid, step(mid, angles[1], b)];
  };
  return {
    P, S, H,
    a1: limb(S, pose.a1, LEN.upper, LEN.fore),
    a2: limb(S, pose.a2, LEN.upper, LEN.fore),
    l1: limb(P, pose.l1, LEN.thigh, LEN.shin),
    l2: limb(P, pose.l2, LEN.thigh, LEN.shin),
  };
}

function figure(pose, cls) {
  const j = joints(pose);
  const parts = [];
  const line = (pts, extra = "") => `<polyline class="${extra}" points="${pts.map(pt).join(" ")}"/>`;
  if (j.a2) parts.push(line(j.a2, "far"));
  if (j.l2) parts.push(line(j.l2, "far"));
  // spine: a quadratic curve bowed sideways by c (positive bows to the right of pelvis -> shoulder)
  const mx = (j.P[0] + j.S[0]) / 2, my = (j.P[1] + j.S[1]) / 2;
  const bow = (pose.c || 0) * LEN.torso * 0.45;
  const a = rad(pose.t - 90);
  const C = [mx + bow * Math.cos(a), my - bow * Math.sin(a)];
  parts.push(`<path d="M${pt(j.P)} Q${pt(C)} ${pt(j.S)}"/>`);
  const neck = step(j.S, pose.h ?? pose.t, LEN.neck);
  parts.push(`<line x1="${f(j.S[0])}" y1="${f(j.S[1])}" x2="${f(neck[0])}" y2="${f(neck[1])}"/>`);
  parts.push(`<circle cx="${f(j.H[0])}" cy="${f(j.H[1])}" r="${LEN.head}"/>`);
  if (j.l1) parts.push(line(j.l1));
  if (j.a1) parts.push(line(j.a1));
  return `<g class="${cls}">${parts.join("")}</g>`;
}

function arrow([x1, y1, x2, y2, bend = 0]) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend;
  // arrow head pointing along the curve's end tangent
  const tx = x2 - cx, ty = y2 - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl, uy = ty / tl;
  const s = 5;
  const h1 = [x2 - ux * s - uy * s * 0.6, y2 - uy * s + ux * s * 0.6];
  const h2 = [x2 - ux * s + uy * s * 0.6, y2 - uy * s - ux * s * 0.6];
  return `<path class="arrow" d="M${f(x1)} ${f(y1)} Q${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}"/>` +
    `<path class="arrow-head" d="M${pt(h1)} L${f(x2)} ${f(y2)} L${pt(h2)}"/>`;
}

// spec: { from: pose, to: pose (optional ghost / end position), arrows: [[x1,y1,x2,y2,bend]] }
export function diagramSVG(spec, title = "") {
  const body = [
    `<rect class="mat" x="8" y="100" width="184" height="5" rx="2.5"/>`,
    spec.to ? figure(spec.to, "fig ghost") : "",
    figure(spec.from, "fig"),
    ...(spec.arrows || []).map(arrow),
  ].join("");
  return `<svg class="diagram" viewBox="0 0 200 112" role="img" aria-label="${title.replace(/"/g, "&quot;")}">` +
    (title ? `<title>${title.replace(/</g, "&lt;")}</title>` : "") + body + "</svg>";
}

// ---------- the poses ----------
// Reusable building blocks (head to the left unless noted).
const supine = (o = {}) => ({ p: [112, 95], t: 180, a1: [0, 0], a2: [0, 0], l1: [0, 0], l2: [0, 0], ...o });
const prone = (o = {}) => ({ p: [112, 95], t: 180, a1: [180, 180], a2: [180, 180], l1: [0, 0], l2: [0, 0], ...o });
const seated = (o = {}) => ({ p: [80, 95], t: 90, a1: [0, 0], a2: [0, 0], l1: [0, 0], l2: [0, 0], ...o });
const overhead = (o = {}) => ({ p: [98, 58], t: 268, h: 180, a1: [0, 0], a2: [0, 0], l1: [180, 180], l2: [180, 180], ...o });
const ball = (o = {}) => ({ p: [128, 94], t: 125, c: -0.7, h: 60, a1: [-30, -42], a2: [-32, -44], l1: [58, -150], l2: [56, -152], ...o });
const rot = (pose, deg, dx = 0, dy = 0) => {
  const out = { ...pose, p: [pose.p[0] + dx, pose.p[1] + dy], t: pose.t + deg, h: (pose.h ?? pose.t) + deg };
  for (const k of ["a1", "a2", "l1", "l2"]) if (pose[k]) out[k] = pose[k].map((v) => v + deg);
  return out;
};

export const DIAGRAMS = {
  hundred: {
    from: supine({ t: 160, h: 150, a1: [4, 4], a2: [2, 2], l1: [40, 40], l2: [38, 38] }),
    to: supine({ t: 160, h: 150, a1: [-8, -8], a2: [-10, -10], l1: [40, 40], l2: [38, 38] }),
    arrows: [[138, 74, 138, 86, 0], [138, 86, 138, 74, 0]],
  },
  rollup: {
    from: supine({ a1: [180, 180], a2: [180, 180] }),
    to: seated({ p: [96, 95], t: 48, c: 0.6, h: 20, a1: [8, 4], a2: [6, 2] }),
    arrows: [[62, 80, 98, 46, -18]],
  },
  rollover: {
    from: supine({ l1: [80, 80], l2: [78, 78] }),
    to: overhead({ p: [112, 60] }),
    arrows: [[128, 38, 84, 52, 18]],
  },
  legcircle: {
    from: supine({ l1: [88, 88], l2: [0, 0] }),
    to: supine({ l1: [72, 72], l2: [0, 0] }),
    arrows: [[118, 46, 136, 54, -14], [136, 54, 120, 44, -14]],
  },
  rollingball: {
    from: ball(),
    to: rot(ball(), 62, -46, -8),
    arrows: [[104, 50, 66, 62, 14]],
  },
  singleleg: {
    from: supine({ t: 160, h: 150, a1: [-30, 40], a2: [-28, 38], l1: [120, -20], l2: [30, 30] }),
    to: supine({ t: 160, h: 150, a1: [-30, 40], a2: [-28, 38], l1: [30, 30], l2: [120, -20] }),
    arrows: [[150, 70, 128, 78, 6]],
  },
  doubleleg: {
    from: supine({ t: 160, h: 150, a1: [-20, 30], a2: [-22, 28], l1: [118, -18], l2: [116, -20] }),
    to: supine({ t: 160, h: 150, a1: [160, 160], a2: [158, 158], l1: [32, 32], l2: [30, 30] }),
    arrows: [[88, 52, 60, 62, -8], [130, 62, 160, 66, 8]],
  },
  spinestretch: {
    from: seated({ a1: [0, 0], a2: [2, 2] }),
    to: seated({ t: 50, c: 0.7, h: 10, a1: [-10, -12], a2: [-8, -10] }),
    arrows: [[86, 42, 114, 60, -10]],
  },
  openrocker: {
    from: { p: [124, 93], t: 118, h: 100, a1: [52, 52], a2: [50, 50], l1: [60, 60], l2: [58, 58] },
    to: rot({ p: [124, 93], t: 118, h: 100, a1: [52, 52], a2: [50, 50], l1: [60, 60], l2: [58, 58] }, 60, -44, -2),
    arrows: [[110, 46, 66, 60, 16]],
  },
  corkscrew: {
    from: supine({ l1: [90, 90], l2: [88, 88] }),
    to: supine({ l1: [70, 70], l2: [68, 68] }),
    arrows: [[106, 44, 132, 52, -16], [132, 52, 110, 42, -16]],
  },
  saw: {
    from: seated({ a1: [0, 0], a2: [180, 180] }),
    to: seated({ t: 45, c: 0.6, h: 10, a1: [-15, -15], a2: [150, 140] }),
    arrows: [[84, 40, 116, 62, -10]],
  },
  swan: {
    from: prone({ t: 150, h: 155, a1: [215, 300], a2: [217, 302], l1: [2, 2], l2: [0, 0] }),
    to: rot(prone({ t: 152, h: 160, a1: [145, 145], a2: [143, 143], l1: [6, 6], l2: [4, 4] }), 28, 0, -6),
    arrows: [[64, 50, 54, 82, -10], [150, 96, 160, 62, -10]],
  },
  singlekick: {
    from: prone({ t: 162, h: 168, a1: [262, 180], a2: [264, 180], l1: [2, 120], l2: [0, 0] }),
    to: prone({ t: 162, h: 168, a1: [262, 180], a2: [264, 180], l1: [2, 2], l2: [0, 120] }),
    arrows: [[146, 66, 132, 80, -6]],
  },
  doublekick: {
    from: prone({ h: 180, a1: [30, -15], a2: [32, -13], l1: [2, 125], l2: [0, 123] }),
    to: prone({ t: 158, h: 160, a1: [-12, -12], a2: [-10, -10], l1: [6, 6], l2: [4, 4] }),
    arrows: [[132, 62, 150, 86, 8]],
  },
  neckpull: {
    from: supine({ a1: [150, 250], a2: [148, 252] }),
    to: seated({ p: [96, 95], t: 50, c: 0.6, h: 25, a1: [96, 200], a2: [94, 202] }),
    arrows: [[62, 80, 96, 46, -18]],
  },
  scissors: {
    from: { p: [100, 58], t: 250, h: 180, a1: [0, 75], a2: [2, 77], l1: [120, 120], l2: [40, 40] },
    to: { p: [100, 58], t: 250, h: 180, a1: [0, 75], a2: [2, 77], l1: [40, 40], l2: [120, 120] },
    arrows: [[82, 30, 122, 26, -12]],
  },
  bicycle: {
    from: { p: [100, 58], t: 250, h: 180, a1: [0, 75], a2: [2, 77], l1: [130, 40], l2: [40, 40] },
    to: { p: [100, 58], t: 250, h: 180, a1: [0, 75], a2: [2, 77], l1: [60, 60], l2: [150, 210] },
    arrows: [[86, 18, 126, 24, -14], [126, 24, 92, 36, -14]],
  },
  bridge: {
    from: { p: [112, 74], t: 212, h: 180, a1: [-30, 70], a2: [-28, 72], l1: [-28, -88], l2: [80, 80] },
    to: { p: [112, 74], t: 212, h: 180, a1: [-30, 70], a2: [-28, 72], l1: [-28, -88], l2: [14, 14] },
    arrows: [[124, 32, 150, 64, -12]],
  },
  spinetwist: {
    from: seated({ a1: [0, 0], a2: [180, 180] }),
    to: seated({ a1: [30, 30], a2: [210, 210] }),
    arrows: [[60, 52, 100, 52, 10]],
  },
  jackknife: {
    from: supine({ l1: [80, 80], l2: [78, 78] }),
    to: { p: [94, 56], t: 268, h: 180, a1: [0, 0], a2: [2, 2], l1: [92, 92], l2: [90, 90] },
    arrows: [[132, 40, 100, 16, 14]],
  },
  sidekick: {
    from: { p: [112, 95], t: 165, h: 150, a1: [255, 100], a2: [-50, 0], l1: [-2, -2], l2: [0, 0] },
    to: { p: [112, 95], t: 165, h: 150, a1: [255, 100], a2: [-50, 0], l1: [24, 24], l2: [0, 0] },
    arrows: [[150, 92, 152, 74, -6], [152, 74, 150, 92, -6]],
  },
  teaser: {
    from: supine({ a1: [180, 180], a2: [180, 180] }),
    to: { p: [100, 93], t: 122, h: 112, a1: [42, 42], a2: [40, 40], l1: [44, 44], l2: [42, 42] },
    arrows: [[62, 82, 72, 50, -12], [150, 94, 140, 66, 12]],
  },
  hiptwist: {
    from: { p: [100, 93], t: 132, h: 110, a1: [238, 238], a2: [240, 240], l1: [52, 52], l2: [50, 50] },
    to: { p: [100, 93], t: 132, h: 110, a1: [238, 238], a2: [240, 240], l1: [28, 28], l2: [26, 26] },
    arrows: [[124, 48, 140, 70, -14], [140, 70, 122, 52, -14]],
  },
  swimming: {
    from: prone({ t: 172, h: 172, a1: [190, 190], a2: [172, 172], l1: [-2, -2], l2: [12, 12] }),
    to: prone({ t: 172, h: 172, a1: [172, 172], a2: [190, 190], l1: [12, 12], l2: [-2, -2] }),
    arrows: [[30, 78, 30, 92, 0], [30, 92, 30, 78, 0], [168, 80, 168, 94, 0], [168, 94, 168, 80, 0]],
  },
  legpullfront: {
    from: { p: [104, 80], t: 158, h: 160, a1: [270, 270], a2: [268, 268], l1: [-21, -21], l2: [-23, -23] },
    to: { p: [104, 80], t: 158, h: 160, a1: [270, 270], a2: [268, 268], l1: [4, 4], l2: [-23, -23] },
    arrows: [[146, 92, 150, 72, -6]],
  },
  legpullback: {
    from: { p: [104, 80], t: 158, h: 140, a1: [270, 270], a2: [268, 268], l1: [-21, -21], l2: [-23, -23] },
    to: { p: [104, 80], t: 158, h: 140, a1: [270, 270], a2: [268, 268], l1: [60, 60], l2: [-23, -23] },
    arrows: [[146, 90, 136, 50, 10]],
  },
  kneelingkick: {
    from: { p: [104, 62], t: 150, h: 150, a1: [260, 260], a2: [100, 200], l1: [270, 0], l2: [2, 2] },
    to: { p: [104, 62], t: 150, h: 150, a1: [260, 260], a2: [100, 200], l1: [270, 0], l2: [-10, -10] },
    arrows: [[132, 54, 150, 64, -6], [150, 64, 132, 58, -6]],
  },
  sidebend: {
    from: { p: [100, 90], t: 141, c: 0.5, h: 150, a1: [270, 270], a2: [-30, -10], l1: [-10, -10], l2: [-11, -11] },
    to: { p: [102, 79], t: 158, h: 150, a1: [270, 270], a2: [140, 160], l1: [-21, -21], l2: [-23, -23] },
    arrows: [[100, 96, 104, 74, 8]],
  },
  boomerang: {
    from: seated({ a1: [270, 0], a2: [268, 0] }),
    to: overhead({ p: [84, 60], a1: [0, 0], a2: [2, 2] }),
    arrows: [[132, 88, 100, 26, 30]],
  },
  seal: {
    from: ball({ a1: [-45, -45], a2: [-47, -47], l1: [62, -140], l2: [60, -142] }),
    to: rot(ball({ a1: [-45, -45], a2: [-47, -47], l1: [62, -140], l2: [60, -142] }), 62, -46, -8),
    arrows: [[104, 50, 66, 62, 14]],
  },
  crab: {
    from: ball({ p: [74, 94] }),
    to: { p: [140, 76], t: 200, c: 0.4, h: 230, a1: [-10, -10], a2: [-12, -12], l1: [265, 0], l2: [263, 2] },
    arrows: [[64, 46, 112, 64, -16]],
  },
  rocking: {
    from: prone({ t: 145, h: 150, a1: [9, 9], a2: [7, 7], l1: [30, 135], l2: [28, 133] }),
    to: rot(prone({ t: 145, h: 150, a1: [9, 9], a2: [7, 7], l1: [30, 135], l2: [28, 133] }), 22, 0, -2),
    arrows: [[60, 54, 64, 80, -8], [64, 80, 60, 54, -8]],
  },
  controlbalance: {
    from: overhead({ p: [100, 58], a1: [170, 200], a2: [172, 202], l1: [90, 90], l2: [182, 182] }),
    to: overhead({ p: [100, 58], a1: [170, 200], a2: [172, 202], l1: [182, 182], l2: [90, 90] }),
    arrows: [[108, 18, 64, 50, 16]],
  },
  pushup: {
    from: { p: [46, 57], t: 90, h: 90, a1: [95, 92], a2: [93, 90], l1: [-90, -90], l2: [-88, -88] },
    to: { p: [124, 86], t: 166, h: 168, a1: [300, 245], a2: [298, 243], l1: [-14, -14], l2: [-16, -16] },
    arrows: [[60, 16, 82, 66, -20]],
  },
};
