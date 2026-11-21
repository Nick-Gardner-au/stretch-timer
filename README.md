# Stretch Timer for iPhone (web app)

This folder is the phone version of Stretch Timer. It has the same programs, interval timer, tempo timer, custom programs, sounds and voice as the desktop app.

It's a *web app* (PWA): you put these files on a free website once, then add the site to your iPhone home screen. It then opens full-screen with its own icon like a normal app, and it works offline.

## 1. Put it online with GitHub Pages (free, about 5 minutes)

1. Sign up for a free account at [github.com](https://github.com) if you don't have one.
2. Click **+** (top right) → **New repository**.
   - Repository name: `stretch-timer`
   - Choose **Public**. A free account can only publish public repositories, so anyone with the link can see the files, including your program.
   - Click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Open this `pwa` folder in the Files app on your computer and select **everything inside it**: `index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, and the `js`, `fonts`, `icons` and `pilates` folders. Drag them all onto the upload page. Upload the *contents*, not the `pwa` folder itself. Then click **Commit changes**.
5. Go to the repository's **Settings** → **Pages**. Under *Build and deployment*, set **Source** to *Deploy from a branch*, choose **main** and **/ (root)**, then click **Save**.
6. Wait about a minute and refresh that page. It shows your site's address, which looks like:
   `https://YOUR-USERNAME.github.io/stretch-timer/`

Check that the address opens in a browser on your computer. You should see the timer.

**If you'd rather keep it private:** Cloudflare Pages (free) lets you upload the folder directly without a public repository. Sign up at [pages.cloudflare.com](https://pages.cloudflare.com), choose **Create → Pages → Upload assets**, and drag in this folder.

## 2. Add it to your iPhone home screen

1. On your iPhone, open the site's address in **Safari**.
2. Tap the **Share** button (the square with an arrow) → **Add to Home Screen** → **Add**.
3. Open **Stretch Timer** from the new home screen icon. Always open it from the icon, not from Safari.

It now runs full-screen and works offline. Your settings and custom programs are saved on the phone.

## 3. Using it on the iPhone

- **Sound starts with your first tap of Start.** iPhones don't allow sound until you tap something.
- **Silent switch:** on iOS 17 and later, the app plays sound even when the ring/silent switch is set to silent. On older iOS versions, turn silent mode off to hear it.
- **Screen stays on while the timer runs.** This needs iOS 18.4 or later when opened from the home screen. On older iOS versions, set *Settings → Display & Brightness → Auto-Lock* to a longer time while you work out.
- **Leaving the app:** if you switch apps or lock the phone, iOS pauses the app and there's no sound. The timer keeps time, though. When you come back, it jumps to where the workout should be now.
- **Program menu:** tap the program name at the top to switch between Nick Program 2, Interval timer, Tempo timer and your custom programs, or to enter a new custom program.
- **Backup:** *Settings → Backup → Export* saves your settings and custom programs to a file. Use *Import* to load them on another phone, or to load the desktop app's `~/.config/stretch-timer/programs.json`.

## Updating the app later

1. Change the files.
2. In `sw.js`, raise the version number on the `VERSION` line, for example from `stretch-timer-v1` to `stretch-timer-v2`.
3. Upload the changed files to the repository again, the same way as before (**Add file → Upload files**).

The phone downloads the new version in the background. It shows up the **second** time you open the app after the upload. Your settings and custom programs are kept.

## Testing on your computer

```bash
python3 -m http.server 8765 --directory pwa
```

Then open http://localhost:8765 for the app, or http://localhost:8765/tests.html to run the 14 engine tests in the browser.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css` | The page and its look |
| `js/workout.js` | Nick Program 2's exercises and tempo helpers |
| `js/programs.js` | The interval timer, tempo timer and custom programs |
| `js/engine.js` | The timer: builds the segments and keeps time from the clock |
| `js/sound.js` | Wood-block sounds (Web Audio) and voice (speech synthesis) |
| `js/store.js` | Saving settings, custom programs and backups on the phone |
| `js/app.js` | The screen, program menu, Settings and custom program editor |
| `sw.js`, `manifest.webmanifest`, `icons/` | What makes it installable and work offline |
| `fonts/` | Bebas Neue, the timer font (SIL Open Font License, see `fonts/LICENSE.txt`) |
| `tests.html` | Browser tests for the engine. It isn't needed on the phone, but uploading it does no harm. |

---

# Pilates Mat (the `pilates` folder)

A second app in the same site that guides you through the 34 original Pilates mat exercises, in the order Joseph Pilates published them in *Return to Life Through Contrology* (1945). It uses the Stretch Timer's timer engine and wood-block sounds, so it is uploaded alongside the Stretch Timer files rather than on its own.

## Opening it

After uploading, it is at `https://YOUR-USERNAME.github.io/stretch-timer/pilates/`. Open that address in Safari and use **Share → Add to Home Screen**. It gets its own icon and works offline, separately from Stretch Timer.

## What it does

1. **Workout length:** tap the title at the top (or Settings) to choose 15, 25 or 45 minutes.
   - 15 min: the 10 fundamental exercises.
   - 25 min: adds the intermediate exercises (21 in total).
   - 45 min: all 34.
   - Repetitions and the time between exercises are adjusted so the workout fits the length. Settings → Exercises → *All 34 every time* keeps every exercise in every length with fewer repetitions (15 minutes then runs about 17 minutes).
2. **Pace:** Slow, Standard or Brisk breathing. Slower breathing gives fewer repetitions in the same time.
3. **Breath tempo counter:** each repetition is timed as breathe in · pause · breathe out · pause, shown in the four coloured cells with a different wood-block sound for each part. The Hundred is always 10 breaths of 5 counts in and 5 counts out, with a tick for each arm pump. Voice counts the repetitions; Settings → *Speak breath cues* also says "Breathe in" and "Breathe out".
4. **Diagrams:** each exercise has a stick-figure diagram. White is the start position, yellow is where you move to, and blue arrows show the direction. Tap the diagram for step-by-step instructions, the breathing pattern, focus and cautions.
5. **Library:** all 34 exercises with diagrams. From an exercise's page you can exclude it from your workouts (for example, for an injury) or jump to it.
6. **Progress:** sessions this week, day streak, total sessions and time, a 5-week calendar (green = complete, dark green = partial), recent sessions, and how many times you have completed each exercise. A session is saved as you go, so closing the app mid-workout keeps what you did. Sessions shorter than 1 minute with no finished exercise are not saved.
7. **Backup:** Settings → Backup → *Export* saves your settings and history to a file; *Import* loads it on another phone.

Controls work as in Stretch Timer: ◀ ▶ and the list jump between exercises (the session continues), ■ Stop ends the session.

## Testing on your computer

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765/pilates/ for the app, or http://localhost:8765/pilates/tests.html to run its 10 tests.

## Files

| File | What it is |
|---|---|
| `pilates/index.html`, `pilates/pilates.css` | The page; it also uses the Stretch Timer's `styles.css` and font |
| `pilates/js/data.js` | The 34 exercises: level, repetitions, breath tempo, steps and cautions |
| `pilates/js/diagrams.js` | The stick-figure diagrams |
| `pilates/js/plan.js` | Fits the workout to 15, 25 or 45 minutes and builds the timed segments |
| `pilates/js/store.js` | Settings, workout history and progress figures |
| `pilates/js/app.js` | The screen, Settings, Library and Progress |
| `pilates/sw.js`, `pilates/manifest.webmanifest`, `pilates/icons/` | Installable and offline. Raise `VERSION` in `pilates/sw.js` when you change its files. |
| `pilates/tests.html` | Browser tests |

The instructions and cautions are short coaching notes. Seek medical advice before starting if you have an injury, osteoporosis or are pregnant; the advanced exercises load the neck and spine.
