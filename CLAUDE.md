# Project notes

Training: three web apps (PWA) plus a Linux desktop wrapper.

1. `index.html`: home screen. `timer.html` + `js/`: Stretch Timer. `pilates/`: Pilates Mat. `mobility/`: Mobility.
2. Shared code: `js/engine.js` (timer), `js/sound.js` (sounds, voice), `js/apps.js` (app switcher), `js/controls.js` (Settings sound section, up-next steps), `js/sync.js` (GitHub gist sync of Pilates/Mobility history and Mobility levels), `styles.css`.
   Session records need string `id` and ISO `start`/`end`; Mobility level states carry `updated` (ms) so sync keeps the latest change, and `reconcileStored()` rebuilds counts from checked-in sessions (`results`, `levels`, `toProgress`) so check-ins from every device count. Record deletions with `recordDeleted` (via the stores' `deleteSession`/`clearHistory`).
3. `desktop/`: Electron app, Linux only (AppImage, .deb). `npm run dist` builds; bump `version` in `desktop/package.json`.
4. When changing web files, raise `VERSION` in the matching `sw.js` (root, `pilates/`, `mobility/`) and list new files there.
5. Tests: `python3 -m http.server 8765`, then `tests.html`, `pilates/tests.html`, `mobility/tests.html`.
6. Australian English and metric units in all text.

## Equipment available for exercises

New or changed exercises may use any of these (and bodyweight):

1. Yoga blocks (4)
2. Yoga strap
3. Ankle weights, 2 kg
4. Broomstick (dowel)
5. Squat board, adjustable angle (slant board)
6. Sliding pads (2)
7. Kettlebells, pairs: 6, 8, 12, 16 and 20 kg
8. Foam roller
9. Hamstring stretch tool: two wooden rods joined by a fabric loop; sitting with legs straight, the feet go in the loop and the hands hold the rods to draw the torso forward
10. Lacrosse ball
11. Resistance bands, various thicknesses
