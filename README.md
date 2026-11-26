# Training: Stretch Timer, Pilates Mat and Mobility (web app)

This folder is one installable app with three parts. Opening the site shows a home screen to choose from:

1. **Stretch Timer**: Nick Program 2, interval timer, tempo timer and custom programs (`timer.html`).
2. **Pilates Mat**: the 34 original mat exercises (`pilates/`).
3. **Mobility**: progressive hip, spine and hamstring sessions (`mobility/`).

Tap the title at the top of any app to switch to another app or go back to **All apps**. On a wide screen (desktop browser, tablet in landscape, desktop app) the apps use a two-column layout with a large timer. If a workout is running, the app asks before leaving it. Each app keeps its own settings and history. The home screen marks the last app used and shows progress for Pilates and Mobility.

It's a *web app* (PWA): you put these files on a free website once, then add the site to your iPhone home screen. It then opens full-screen with its own icon like a normal app, and it works offline: the first visit stores all three apps on the phone.

## 1. Put it online with GitHub Pages (free, about 5 minutes)

1. Sign up for a free account at [github.com](https://github.com) if you don't have one.
2. Click **+** (top right) → **New repository**.
   - Repository name: `stretch-timer`
   - Choose **Public**. A free account can only publish public repositories, so anyone with the link can see the files, including your program.
   - Click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Open this `pwa` folder in the Files app on your computer and select **everything inside it**: `index.html`, `timer.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, and the `js`, `fonts`, `icons`, `pilates` and `mobility` folders. Drag them all onto the upload page. Upload the *contents*, not the `pwa` folder itself. Then click **Commit changes**.
5. Go to the repository's **Settings** → **Pages**. Under *Build and deployment*, set **Source** to *Deploy from a branch*, choose **main** and **/ (root)**, then click **Save**.
6. Wait about a minute and refresh that page. It shows your site's address, which looks like:
   `https://YOUR-USERNAME.github.io/stretch-timer/`

Check that the address opens in a browser on your computer. You should see the home screen with the three apps.

**If you'd rather keep it private:** Cloudflare Pages (free) lets you upload the folder directly without a public repository. Sign up at [pages.cloudflare.com](https://pages.cloudflare.com), choose **Create → Pages → Upload assets**, and drag in this folder.

## 2. Add it to your iPhone home screen

1. On your iPhone, open the site's address in **Safari**.
2. Tap the **Share** button (the square with an arrow) → **Add to Home Screen** → **Add**.
3. Open **Training** from the new home screen icon. Always open it from the icon, not from Safari.

It now runs full-screen and works offline. Your settings and custom programs are saved on the phone.

## 3. Using it on the iPhone

- **Sound starts with your first tap of Start.** iPhones don't allow sound until you tap something.
- **Silent switch:** on iOS 17 and later, the app plays sound even when the ring/silent switch is set to silent. On older iOS versions, turn silent mode off to hear it.
- **Screen stays on while the timer runs.** This needs iOS 18.4 or later when opened from the home screen. On older iOS versions, set *Settings → Display & Brightness → Auto-Lock* to a longer time while you work out.
- **Leaving the app:** if you switch apps or lock the phone, iOS pauses the app and there's no sound. The timer keeps time, though. When you come back, it jumps to where the workout should be now.
- **Sound, voice and ticks:** in Settings, under Sound. Settings can be opened during a workout to change these; the other settings are available once the workout is stopped.
- **Between exercises:** during the rest before a new exercise, the screen shows that exercise (marked *Up next*) and its instructions.
- **Program menu:** tap the program name at the top to switch between Nick Program 2, Interval timer, Tempo timer and your custom programs, or to enter a new custom program.
- **Backup:** *Settings → Backup → Export* saves your settings and custom programs to a file. Use *Import* to load them on another phone, or to load the desktop app's `~/.config/stretch-timer/programs.json`.

## Updating the app later

1. Change the files.
2. In `sw.js`, raise the version number on the `VERSION` line, for example from `stretch-timer-v1` to `stretch-timer-v2`.
3. Upload the changed files to the repository again, the same way as before (**Add file → Upload files**).

The phone downloads the new version in the background. It shows up the **second** time you open the app after the upload. Your settings and custom programs are kept.

## Testing on your computer

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765 for the home screen, http://localhost:8765/timer.html for the Stretch Timer, or http://localhost:8765/tests.html to run the 14 engine tests in the browser.

## Files

| File | What it is |
|---|---|
| `index.html` | The home screen for choosing an app |
| `js/apps.js` | The list of apps and the *switch app* entries in each app's title menu |
| `timer.html`, `styles.css` | The Stretch Timer page, and the look shared by all three apps |
| `js/workout.js` | Nick Program 2's exercises and tempo helpers |
| `js/programs.js` | The interval timer, tempo timer and custom programs |
| `js/engine.js` | The timer: builds the segments and keeps time from the clock |
| `js/sound.js` | Wood-block sounds (Web Audio) and voice (speech synthesis) |
| `js/store.js` | Saving settings, custom programs and backups on the phone |
| `js/app.js` | The screen, program menu, Settings and custom program editor |
| `sw.js`, `manifest.webmanifest`, `icons/` | What makes the combined app installable and work offline. Its cache lists every file of all three apps, so add new files there too. |
| `fonts/` | Bebas Neue, the timer font (SIL Open Font License, see `fonts/LICENSE.txt`) |
| `tests.html` | Browser tests for the engine. It isn't needed on the phone, but uploading it does no harm. |

---

# Pilates Mat (the `pilates` folder)

A second app in the same site that guides you through the 34 original Pilates mat exercises, in the order Joseph Pilates published them in *Return to Life Through Contrology* (1945). It uses the Stretch Timer's timer engine and wood-block sounds, so it is uploaded alongside the Stretch Timer files rather than on its own.

## Opening it

After uploading, it is at `https://YOUR-USERNAME.github.io/stretch-timer/pilates/`. It is also on the **Training** home screen. To install it as a separate icon instead, open that address in Safari and use **Share → Add to Home Screen**; it then works offline on its own, but switching to another app opens it with a browser bar.

## What it does

1. **Workout length:** tap the title at the top (or Settings) to choose 15, 25 or 45 minutes.
   - 15 min: the 10 fundamental exercises.
   - 25 min: adds the intermediate exercises (21 in total).
   - 45 min: all 34.
   - Repetitions and the time between exercises are adjusted so the workout fits the length. Settings → Exercises → *All 34 every time* keeps every exercise in every length with fewer repetitions (15 minutes then runs about 17 minutes).
2. **Pace:** Slow, Standard or Brisk breathing. Slower breathing gives fewer repetitions in the same time.
3. **Breath tempo counter:** each repetition is timed as breathe in · pause · breathe out · pause, shown in the four coloured cells with a different wood-block sound for each part. The Hundred is always 10 breaths of 5 counts in and 5 counts out, with a tick for each arm pump. Voice counts the repetitions; Settings → *Speak breath cues* also says "Breathe in" and "Breathe out".
4. **Photos:** each exercise shows four photos of Joseph Pilates performing it, numbered 1–4 in sequence, from the *Return to Life* poster (© Pilates Guild, used with permission). Tap the photos for step-by-step instructions, the breathing pattern, focus and cautions. During the transition before each exercise its steps are shown on screen.
5. **Library:** Settings → Library: all 34 exercises with photos. From an exercise's page you can exclude it from your workouts (for example, for an injury) or jump to it.
6. **Progress:** sessions this week, day streak, total sessions and time, a 5-week calendar (green = complete, dark green = partial), recent sessions, and how many times you have completed each exercise. A session is saved as you go, so closing the app mid-workout keeps what you did. Sessions shorter than 1 minute with no finished exercise are not saved.
7. **Backup:** Settings → Backup → *Export* saves your settings and history to a file; *Import* loads it on another phone.

Controls work as in Stretch Timer: ◀ ▶ and the list jump between exercises (the session continues), ■ Stop ends the session.

## Testing on your computer

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765/pilates/ for the app, or http://localhost:8765/pilates/tests.html to run its 11 tests.

## Files

| File | What it is |
|---|---|
| `pilates/index.html`, `pilates/pilates.css` | The page; it also uses the Stretch Timer's `styles.css` and font |
| `pilates/js/data.js` | The 34 exercises: level, repetitions, breath tempo, steps and cautions |
| `pilates/img/` | One 2×2 photo card per exercise, cropped from the *Return to Life* poster |
| `pilates/js/plan.js` | Fits the workout to 15, 25 or 45 minutes and builds the timed segments |
| `pilates/js/store.js` | Settings, workout history and progress figures |
| `pilates/js/app.js` | The screen, Settings, Library and Progress |
| `pilates/sw.js`, `pilates/manifest.webmanifest`, `pilates/icons/` | Installable and offline. Raise `VERSION` in `pilates/sw.js` when you change its files. |
| `pilates/tests.html` | Browser tests |

The instructions and cautions are short coaching notes. Seek medical advice before starting if you have an injury, osteoporosis or are pregnant; the advanced exercises load the neck and spine.

---

# Mobility (the `mobility` folder)

A third app in the same site: guided hip, spine and hamstring mobility sessions that get harder as you meet benchmarks. Exercises are drawn from yoga, Pilates and rehabilitation exercise. It uses the Stretch Timer's timer engine, wood-block sounds and styles, so it is uploaded alongside the Stretch Timer files.

## Opening it

After uploading, it is at `https://YOUR-USERNAME.github.io/stretch-timer/mobility/`. It is also on the **Training** home screen. To install it as a separate icon instead, open that address in Safari and use **Share → Add to Home Screen**.

## What it does

1. **12 movement tracks**, each a ladder of 4 levels:

   | Region | Tracks |
   |---|---|
   | Hip | Flexion, extension, abduction (adductor length), adduction (inner-thigh strength), external rotation, internal rotation |
   | Spine | Flexion, extension, lateral flexion, rotation |
   | Hamstrings | Active and loaded (nerve glide → Nordic lowers), length (strap stretch → half splits) |

2. **Sessions:** tap the title at the top (or Settings) to choose *Full* (all 12 tracks, about 18 minutes at level 1), *Hips* or *Spine + Hamstrings*. Each track contributes the exercise at your current level. One-sided exercises run left, then right.
3. **Benchmarks:** every exercise has a benchmark shown on the main screen, for example *"Straight leg reaches 80° or more with the other leg flat, 45 s each side."* Tap the card for steps and cautions.
4. **Check-in and progression:** at the end of a session (or after **■ Stop** if any exercise was finished), mark each exercise:
   - **Met:** benchmark achieved at the full dose. Meeting it in 3 sessions in a row moves the track up a level (Settings → Progression: 2, 3 or 4 sessions). At level 4 it marks the track *mastered*.
   - **Not yet:** the count starts again at this level.
   - **Too hard:** pain, or it could not be done with control. The track steps back a level.
   Choose **Later** to check in from Progress afterwards (most recent session only).
5. **Library:** Settings → Library: all 48 exercises by track, with their source (yoga, Pilates or rehab). From an exercise's page you can choose that level manually, or exclude the whole track from sessions (for example, for an injury).
6. **Progress:** mobility score (levels gained across all tracks; 100% = every track mastered at level 4), sessions this week, day streak, level ups, a ladder for every track, and recent sessions.
7. **Backup:** Settings → Backup → *Export* saves settings, levels and history to a file; *Import* loads it on another phone. *Reset levels* returns every track to level 1.

## Testing on your computer

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765/mobility/ for the app, or http://localhost:8765/mobility/tests.html to run its 13 tests.

## Files

| File | What it is |
|---|---|
| `mobility/index.html`, `mobility/mobility.css` | The page; it also uses the Stretch Timer's `styles.css` and font |
| `mobility/js/data.js` | The 12 tracks and 48 exercises: source, dose, steps, benchmark and caution |
| `mobility/js/plan.js` | Builds a session from your levels and turns it into timed segments |
| `mobility/js/store.js` | Settings, levels, the progression rules, history and progress figures |
| `mobility/js/app.js` | The screen, check-in, Settings, Library and Progress |
| `mobility/sw.js`, `mobility/manifest.webmanifest`, `mobility/icons/` | Installable and offline. Raise `VERSION` in `mobility/sw.js` when you change its files. |
| `mobility/tests.html` | Browser tests |

Stretch to mild tension, never pain. Stop any exercise that causes sharp, pinching or nerve-like pain and mark it *Too hard*. Seek medical advice before starting if you have an injury, recent surgery, osteoporosis or hypermobility, or are pregnant.

---

# Desktop app (the `desktop` folder)

The same three apps (home screen, Stretch Timer, Pilates Mat and Mobility) as a Linux desktop app. It opens in its own window, works offline and keeps its own settings and history (separate from the phone).

## Installing

Use either file from a build (see below):

1. **AppImage** (any distribution): `chmod +x Training-1.0.3.AppImage`, then run `./Training-1.0.3.AppImage`. To add it to the applications menu, use a tool such as AppImageLauncher or Gear Lever.
2. **.deb** (Debian, Ubuntu, Mint, Pop!_OS): `sudo apt install ~/Downloads/training-desktop_1.0.3_amd64.deb` (use the folder the file is in; the path must start with `./`, `~/` or `/`). Training then appears in the applications menu. Remove it with `sudo apt remove training-desktop`.

The .deb installs an AppArmor profile (`/etc/apparmor.d/training-desktop`) that Ubuntu 23.10 and later need before Electron apps can start; removing the package removes it.

If the AppImage does not start on Ubuntu 22.04 or later, install FUSE 2 with `sudo apt install libfuse2` (Ubuntu 24.04: `libfuse2t64`). On Ubuntu 23.10 and later it also needs to be started with `--no-sandbox`, because the AppArmor profile only covers the installed .deb; prefer the .deb there.

## Getting a build

1. On github.com, open **Actions → Desktop app → Run workflow**. When it finishes (about 5 minutes), download `training-linux` under **Artifacts**.
2. Or push a tag such as `desktop-v1.0.0` to publish the files on a Releases page.
3. Or build it yourself (below).

## Using it

1. **Apps** menu: All apps (Ctrl+0), Stretch Timer (Ctrl+1), Pilates Mat (Ctrl+2), Mobility (Ctrl+3). It asks before leaving a running workout. The title menu inside each app switches apps as on the phone.
2. **Full screen:** press F11 (or **View → Full Screen**); F11 or Shift+Esc leaves it. In a wide window or full screen the apps switch to a two-column layout, with the exercise and controls on the left and the large timer on the right, and everything scales to the screen size (designed for 1600 × 900, enlarged on bigger screens). Ctrl+= and Ctrl+- make it larger or smaller; **View → Normal size** resets. The window size, full screen and zoom are remembered. Press Alt to show the menu bar.
3. Space starts and pauses, the ◀ ▶ arrow keys move between exercises, Esc stops.
4. Backups: Export on the phone and Import on the desktop (or the other way round) to move history and levels across.
5. Voice cues use the system speech engine. If there is no voice, install it with `sudo apt install speech-dispatcher espeak-ng`.

## Building it yourself

Needs [Node.js](https://nodejs.org) 20 or later.

```bash
cd desktop
npm install
npm start            # run it
npm run dist         # AppImage and .deb in desktop/dist
```

`npm start` and `npm run dist` copy the web app from the repository root into `desktop/web` first, so changes to the phone app are picked up by the next desktop build.

| File | What it is |
|---|---|
| `desktop/main.js` | Opens the window, serves the bundled web app and builds the Apps menu |
| `desktop/scripts/copy-web.js` | Copies the web app into `desktop/web` before running or building |
| `desktop/package.json` | Electron and package settings |
| `desktop/build/icon.png` | App icon |
| `.github/workflows/desktop.yml` | Builds the AppImage and .deb on GitHub |
