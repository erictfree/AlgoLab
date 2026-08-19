# AlgoLab

AlgoLab is a browser-based instrument and teaching environment for **live-coding
audio-reactive visuals with JavaScript and p5.js**. Music continues playing and the
canvas continues drawing while you edit the code that creates the image.

It was created for **AET 350C — _Visuals in the Loop: Reactive Systems for
Algorave_**, but it can also be used as a standalone introduction to creative coding,
object-oriented programming, higher-order functions, audio analysis, and shaders.

## What you do in AlgoLab

You create **patches** and arrange them into a **scene**:

```js
const pulse = {
  speed: 2,

  draw({ time, audio }) {
    const size = 120 + sin(time * this.speed) * 60 + audio.bass * 140;
    circle(width / 2, height / 2, size);
  },
};

const scene = [
  pulse,
  plasma,
];

go(scene);
```

- A **patch** is an ordinary JavaScript object, function, or class instance that can
  draw. It may have properties, helper methods, state, and lifecycle methods.
- A **scene** is an ordered array of patches. Earlier patches draw first; later
  patches can draw over or post-process their output.
- The **draw context** is the object passed to a patch on every frame. It contains
  values such as `time`, `dt`, normalized `audio`, persistent `state`, the canvas,
  and keyboard controls.
- **Live evaluation** replaces a patch or scene while the host loop keeps running.
  Put the cursor in a cell and press `Cmd/Ctrl+Enter`. Use
  `Cmd/Ctrl+Shift+Enter` to evaluate the complete editor.

AlgoLab owns p5.js `setup()` and `draw()` so students can focus on the behavior of
their objects. A syntax error never replaces the working version. A patch that fails
on its first rendered frame rolls back to the last version that worked.

### Main features

- Audio files, microphone, or line input with normalized bass, mid, treble, level,
  waveform, and beat/onset data
- Ordinary JavaScript objects, functions, classes, closures, factories, and arrow
  functions as live visual material
- Scene arrays with multiple independent copies of one patch
- A patch library with visual, diagnostic, utility, and shader examples
- A fluent `ShaderChain` for post-processing previously drawn output
- Folded cells, syntax highlighting, smart indentation, comments, and live evaluation
- Named performances, safe-state recovery, version history, project import/export,
  fullscreen, and a separate audience projection window
- Local persistence: source and named performances remain in that browser after a
  refresh

There is no application bundle or compilation step. AlgoLab is `index.html`, plain
ES modules, CSS, and a vendored copy of p5.js. A small Node server provides the HTTP
origin that browser modules require.

---

## Installation — beginner path

Use this path if you are new to Git, Node.js, or terminal commands.

### 1. Install Node.js

Install **Node.js 20 or newer** from [nodejs.org](https://nodejs.org/). Choose an LTS
installer when the site offers one and accept its normal defaults. Node includes the
`npm` command used by this project.

After installation, quit and reopen Terminal on macOS/Linux or PowerShell on Windows.
Check that both commands are available:

```sh
node --version
npm --version
```

The first command should report version 20 or higher. If either command says it was
not found, restart the terminal. If that does not help, reinstall Node and make sure
the installer is allowed to add Node to your system path.

### 2. Download and unpack AlgoLab

Open the [AlgoLab repository](https://github.com/erictfree/AlgoLab), choose
**Code → Download ZIP**, and unzip the download somewhere you can find again, such as
Documents.

The unzipped folder should contain `package.json`, `index.html`, `src`, `starter`, and
`vendor`. Do not work from inside the ZIP archive itself.

### 3. Open a terminal in the project folder

The terminal must be inside the folder containing `package.json`.

On macOS, one easy approach is to type `cd `, including the space, drag the AlgoLab
folder from Finder into the Terminal window, and press Return:

```sh
cd /path/to/AlgoLab
```

On Windows, open the folder in File Explorer, click the address bar, type
`powershell`, and press Enter.

Confirm that you are in the correct place:

```sh
npm run
```

The output should list scripts including `dev`, `test`, and `test:e2e`.

### 4. Install the development dependencies

Run:

```sh
npm ci
```

This installs the exact dependency versions recorded in `package-lock.json`. The
visual application itself does not download libraries at runtime; these packages are
primarily the automated test tools.

### 5. Start AlgoLab

Run:

```sh
npm run dev
```

Leave that terminal window open. It should print an address similar to:

```text
http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) in Chrome or another modern
browser. Do **not** double-click `index.html`: a `file://` page cannot load the ES
modules correctly.

### 6. Complete the first-run screen

Choose one of the three starting modes:

- **choose audio file** keeps the selected audio file in the browser and begins audio
  analysis;
- **use microphone** asks for browser permission and can also use a connected line
  input selected in the Audio panel;
- **enter with silence** starts the visuals without an audio source.

Browser autoplay rules require this first click. AlgoLab does not upload the selected
audio file.

### 7. Try one live edit

The starter contains only the `Plasma` class instance and this scene:

```js
const scene = [
  plasma,
];

go(scene);
```

Open the Plasma cell, change its public `speed` or `motion` property, put the cursor
inside that cell, and press `Cmd+Enter` on macOS or `Ctrl+Enter` on Windows/Linux.
The canvas should change without reloading the page or restarting the music.

To add another patch:

1. Open the tools drawer with the `☰` button or `\` key.
2. Open **Library** and choose **Install source** for a patch.
3. Choose **Add to scene**. The button changes to **Added — run scene** immediately.
4. Evaluate the opened scene cell with `Cmd/Ctrl+Enter`.
5. The patch becomes Active and then Running after it renders successfully.

### 8. Stop the server

Return to the terminal running AlgoLab and press `Ctrl+C`. This stops only the local
server. Your automatically saved source and named performances remain in that
browser's local storage.

---

## Installation — intermediate path

Use this path if you are comfortable with Git and want to modify or contribute to the
repository.

### 1. Clone the repository

```sh
git clone https://github.com/erictfree/AlgoLab.git
cd AlgoLab
```

If you plan to contribute through your own GitHub account, fork the repository first
and clone your fork instead.

### 2. Install exact dependencies

```sh
npm ci
```

Use `npm ci` after pulling changes to reproduce the lockfile exactly. Use
`npm install <package>` only when intentionally changing project dependencies.

### 3. Create a working branch

```sh
git switch -c feature/my-change
```

### 4. Run the development server

```sh
npm run dev
```

`predev` rebuilds the generated community patch catalog before the server starts.
The server intentionally sends `Cache-Control: no-store`, so a browser refresh reads
the latest local files.

To use another port on macOS/Linux:

```sh
PORT=4173 npm run dev
```

In PowerShell:

```powershell
$env:PORT=4173
npm run dev
```

### 5. Run the checks

```sh
npm test
```

The unit suite covers evaluation, rollback, state, scene instances, audio analysis,
source parsing, persistence, and view-model behavior.

Install the test browser once, then run the end-to-end suite:

```sh
npx playwright install chromium
npm run test:e2e
```

The browser suite exercises the actual editor, patch lifecycle, named performances,
safe recovery, projection window, import confirmation, audio transport, and live
WebGL path.

For longer stability checks:

```sh
npm run test:soak
```

The default soak runs for three minutes. A longer run can be selected on macOS/Linux:

```sh
SOAK_MINUTES=30 npm run test:soak
```

### 6. Add a community patch

Place one JavaScript source file in `community-patches/` using the metadata and source
format described in the [Instructional Manual](docs/INSTRUCTIONAL_MANUAL.md). Running
`npm run dev` or `npm test` rebuilds `src/generated/communityPatches.js` automatically.

Do not edit the generated file by hand.

---

## First-use concepts and controls

### Source is the composition model

Installing a library patch adds its source to the editor. Adding it to a scene edits
the scene array. Neither action secretly composes a second model behind the code.
`Cmd/Ctrl+Enter` evaluates the selected patch or scene and moves that source state into
the running model.

The useful lifecycle is:

```text
Available → Installed → Added to scene source → Active → Running
```

### Named performances

A named performance stores the complete working source, active scene, live parameters,
audio-analysis settings, and view settings in the current browser. Audio files remain
separate.

Choose **＋ New performance** or press `Cmd/Ctrl+Alt+N` to return the working project
to the Plasma-only starter. This does not delete existing named performances. AlgoLab
asks for confirmation because unsaved working edits are replaced.

Use **Export** when a project must move to another browser or computer. Browser local
storage is convenient, but it is not a substitute for exported files or source
control.

### Essential commands

| Command | Action |
| --- | --- |
| `Cmd/Ctrl+Enter` | Evaluate the current cell or statement |
| `Cmd/Ctrl+Shift+Enter` | Evaluate the complete editor |
| `Cmd/Ctrl+/` | Comment or uncomment selected lines |
| `Cmd/Ctrl+Alt+N` | Start a new Plasma performance after confirmation |
| `Esc` | Release editor focus so performance keys work |
| `Space` | Play or pause audio |
| `\` | Show or hide tools |
| `r` | Show or hide the installed-patch reference |
| `e` | Show or hide code |
| `f` | Enter or leave fullscreen |
| `p` | Open the audience projection window |
| `0` | Restore the complete safe state |
| `?` | Show every key command |

---

## Troubleshooting installation and startup

### `npm` or `node` is not recognized

Install Node.js 20 or newer, then completely close and reopen the terminal. Verify
with `node --version` and `npm --version`.

### `npm` cannot find `package.json`

The terminal is in the wrong folder. Change into the AlgoLab folder—the one containing
`package.json`—and run the command again. On macOS/Linux, `pwd` shows the current
folder. In PowerShell, use `Get-Location`.

### The page is blank or the console reports module/CORS errors

Make sure the address begins with `http://localhost`, not `file://`. Start the project
with `npm run dev` and use the URL printed by the server.

### Port 5173 is already in use

Another copy of the server may already be running. Use that copy, stop it with
`Ctrl+C`, or select a different port using the commands in the intermediate setup.

### The browser shows old source after a restart

AlgoLab automatically restores the working source saved in that browser. Use
**＋ New performance** to begin again while keeping named performances, or use
**Project → reset** for the equivalent project-level reset.

### A patch was added but is not drawing

**Add to scene** changes source; it does not run the scene automatically. When the
button says **Added — run scene**, evaluate the opened scene cell with
`Cmd/Ctrl+Enter`.

### Audio does not play

- Use the first-run screen or audio-file button so the browser receives a user gesture.
- If the transport says **Play**, click it. When it says **Pause**, audio is currently
  playing.
- Try another `.mp3`, `.wav`, `.m4a`, or `.ogg` file.
- For a microphone, allow browser permission and check the input device in the Audio
  panel.
- Use **enter with silence** to separate an audio problem from a visual-code problem.

### End-to-end tests cannot find Chromium

Run:

```sh
npx playwright install chromium
```

Then retry `npm run test:e2e`.

---

## Repository guide

| Location | Purpose |
| --- | --- |
| [Instructional Manual](docs/INSTRUCTIONAL_MANUAL.md) | Curriculum from a first patch to a live audio-reactive set |
| [Student API](docs/API.md) | Patch, context, scene, shader, and editor APIs students use |
| [Architecture](docs/ARCHITECTURE.md) | Runtime design, safety boundaries, and implementation rationale |
| `starter/starter.js` | Plasma-only starter project and complete class/shader example |
| `starter/library.js` | Built-in teaching patches and shader examples |
| `src/main.js` | Application assembly, performance controls, and the p5.js host loop |
| `src/host/evaluator.js` | Atomic live JavaScript evaluation and binding retention |
| `src/app/controller.js` | Read-only view model and safe/runtime checkpoints |
| `community-patches/` | One source file per contributed patch |
| `tests/` | Unit, browser, fixture, and soak tests |

## Project scope

The implemented core includes a persistent canvas and host loop, audio-file playback
and p5.sound analysis, shared normalized audio snapshots, block evaluation, ordinary
JavaScript object discovery, atomic replacement, persistent per-instance state, scene
arrays, syntax rejection, first-frame rollback, version history, local persistence,
microphone input, projection layouts, safe checkpoints, and project portability.

Several copies of one patch can appear in a scene as independent instances such as
`laserFan`, `laserFan#2`, and `laserFan#3`. Class patches can own offscreen WebGL
buffers and shaders with deterministic cleanup.

Not currently built: Web MIDI, crossfades, stronger runtime isolation, collaborative
rooms, language adapters, and performance recording/replay.

## Security warning

AlgoLab runs evaluated JavaScript with `new Function`. That is intentional, and it is
**not a security sandbox**. Error boundaries cannot stop an infinite loop, and code
such as `while (true)` can freeze the tab. Run only code you wrote or received from a
trusted instructor or collaborator. See the [Architecture documentation](docs/ARCHITECTURE.md)
for the complete trust boundary.
