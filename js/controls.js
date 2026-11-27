// Pieces shared by the three apps: the Sound section of Settings and the "up next" instructions
// shown during a transition.

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

// Heading and three switches. Changes apply at once (also during a workout); onChange(key, on).
export function soundSection(cfg, onChange, player = null) {
  const row = (key, label) => {
    const box = el("input", { type: "checkbox" });
    box.checked = Boolean(cfg[key]);
    box.addEventListener("change", () => onChange(key, box.checked));
    return el("label", { class: "form-row" }, el("span", {}, label), box);
  };
  const items = [
    el("h2", {}, "SOUND"),
    row("sound", "Sound"),
    row("voice", "Voice (counts and exercise names)"),
    row("ticks", "Tick every second"),
  ];
  if (player) {
    const status = el("p", { class: "hint" }, "Voice needs Sound and Voice on, and a voice installed on the device.");
    const btn = el("button", { class: "btn" }, "Test voice");
    btn.addEventListener("click", async () => {
      player.unlock();
      status.textContent = "Testing…";
      status.textContent = await player.testVoice();
    });
    items.push(el("div", { class: "row-btns" }, btn), status);
  }
  return items;
}

// Fills the "up next" panel: numbered steps, or a single line when there is only a cue.
// The text shrinks (down to 11px) until every step fits the panel.
export function fillNextSteps(box, steps) {
  const list = (steps || []).filter(Boolean);
  if (list.length > 1) box.replaceChildren(el("ol", {}, ...list.map((s) => el("li", {}, s))));
  else box.replaceChildren(el("p", {}, list[0] || ""));
  box.style.fontSize = "";
  requestAnimationFrame(() => {
    let size = parseFloat(getComputedStyle(box).fontSize);
    while (box.scrollHeight > box.clientHeight + 1 && size > 11) {
      size -= 1;
      box.style.fontSize = `${size}px`;
    }
  });
}
