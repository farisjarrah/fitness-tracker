# fitness-tracker
Calorie, run and climbing trackers. Saves data locally / personal iCloud. No ads, no tracking, no external dependencies — just static files you can host anywhere (or open straight from disk).

## What it is

One app with four tabs:

- **📊 Overview** — totals across all three tools plus a combined recent-activity feed.
- **🍎 Calorie** — foods + daily entries (calories, macros, time of day).
- **🏃 Run** — runs, shoes, distance/elevation/pace (km or mi), workout types.
- **🧗 Climb** — routes + climbs (grade, effort, scary, proficiency, setting).

Each tool keeps its own registry (foods / runs / shoes / routes) stored once, so renaming or
deleting an item updates everywhere it's used. Charts use month‑/year‑/custom ranges.

## Usage

Hosted on GitHub Pages: **https://farisjarrah.github.io/fitness-tracker/** . Or just save the folder and open `index.html` in a browser locally.

Even on GitHub Pages **no data is transmitted anywhere** — the page is pure static files.
You open your own data JSON from local/cloud storage of your choice; the app never sends it
anywhere.

> Unlike the older single-file trackers, this app is a small folder of static files
> (`index.html` + `css/` + `js/`). There is no build step — no npm, no frameworks. It works
> from `file://` and on GitHub Pages.

### Your data file

The default data filename is **`fitness-data.json`

**Open file → track → save file back.** Because browsers can't write to a folder by
themselves, the flow is: pick `fitness-data.json` when you open the app, make your entries,
then **Save backup file…** (☰ menu) to download the updated file and replace the old one
wherever you keep it.

**You can't lose progress either way.** As you track, the app auto-saves your latest session
on the device (in the browser's storage). Refresh, close the tab, or come back later — it
picks up where you left off, no prompts. The file you save is your cross-device backup.

### Saving on iPhone/iPad (iOS Safari)
Tap **Save file** and choose **Save to Files**. iOS Safari can't overwrite the file you
opened, so treat the save as a *backup copy*: if iOS offers it, pick **Replace** to keep a
single file; if it saves a new file instead (e.g. `fitness-data.json 2`), that's fine too —
once you have a backup, you can delete the older duplicate.

### Keeping one copy in sync across devices (iCloud / Google Drive)
If you store `fitness-data.json` in iCloud Drive (or Google Drive / Dropbox), every device
opens the *same* file, so everything stays in sync:

1. Save the file from the app into iCloud Drive on one device.
2. On another device open the app and pick that same file from iCloud Drive.

To make a file show up in the Files picker, open it once in the Files app so iCloud downloads
it, then always pick **Browse → iCloud Drive**, not "Recents".

Other filesystem integrations (Google Drive, etc.) probably work too, but are untested.

The **☰ menu** (top right) has: **Save backup file…** (download the JSON), **Open a data
file…** (load a different JSON, e.g. one saved on another device), and **New file**.

### Install as an app (PWA)
Works as a normal website, or install it to your home screen for a full app experience:
- **iPhone/iPad:** Share button → **Add to Home Screen**.
- **Android:** Chrome menu (⋮) → **Add to Home screen** or **Install app**.
- **Desktop:** install icon in the Chrome/Edge address bar (or menu → **Install...**).

The installed app opens full-screen with its own icon; the data flow is unchanged.

## Setting up GitHub Pages (once, 2 minutes)

1. Make sure the repo is **public** (free Pages only works on public repos).
2. The files `index.html`, `css/`, `js/`, `manifest.json`, `sw.js`, `icon.png` are already in
   the repo root.
3. Repo → **Settings → Pages → Branch = `main`**, folder **`/ (root)`** → **Save**.
4. Your app is live at `https://farisjarrah.github.io/fitness-tracker/`.
5. Later edits: push changes to `main`; Pages republishes in a minute or two.

## WARNING

This was vibecoded using the free OpenCode Big Pickle AI Model 09/2026.

## Credits

- Icon: "Running shoe" by Delapouite, from game-icons.net (CC BY 3.0).
- This app merges the previously separate
  [calorie-tracker](https://github.com/farisjarrah/calorie-tracker),
  [run-tracker](https://github.com/farisjarrah/run-tracker) and
  [climbing-route-tracker](https://github.com/farisjarrah/climbing-route-tracker) repos.

## Screenshots

