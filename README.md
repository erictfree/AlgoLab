# AlgoLab

AlgoLab is a browser-based instrument for live-coding audio-reactive visuals with
JavaScript and p5.js. The canvas, audio analysis, clock, and working scene keep
running while you replace visual code.

AlgoLab was created by **Eric Freeman** at the
[Department of Arts and Entertainment Technologies](https://aet.utexas.edu/) at
**The University of Texas at Austin**. It is an open-source project for visualists,
creative coders, performers, and the live-coding community.

## How it works

A **patch** is a JavaScript function, object, or class instance that draws. A
**scene** is an array of patches in layer order.

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

activate(scene);
```

Put the cursor in a patch or scene and press `Cmd/Ctrl+Enter`. AlgoLab evaluates
that unit without restarting the host. Syntax, evaluation, and first-frame errors
leave the last working version running.

AlgoLab includes:

- file, microphone, and line-input audio analysis;
- normalized level, bass, mid, treble, beat, spectrum, and waveform data;
- function, object, class, factory, closure, and inline patches;
- ordered scenes with independent state for each patch occurrence;
- a source-based patch library and community patch catalog;
- GPU post-processing through `ShaderChain` and custom WebGL patches;
- version history, Safe State, named performances, and project import/export;
- fullscreen, projected code, and a separate audience window;
- beta peer-to-peer canvas sharing through `StreamRoom` objects.

## Install and run

### Requirements

- Node.js 20 or newer
- A current desktop browser; Chrome is used for automated browser tests

Install Node from [nodejs.org](https://nodejs.org/) if needed. Then confirm it is
available:

```sh
node --version
npm --version
```

### Download

Use **Code → Download ZIP** on the
[GitHub repository](https://github.com/erictfree/AlgoLab), then unzip it. Or clone
the repository:

```sh
git clone https://github.com/erictfree/AlgoLab.git
cd AlgoLab
```

If you downloaded the ZIP, open a terminal in the unzipped folder that contains
`package.json`.

### Start

```sh
npm ci
npm run dev
```

Keep the terminal open and visit [http://localhost:5173](http://localhost:5173).
Do not open `index.html` directly; the application must run from an HTTP server.

Choose an audio file, microphone, or silence. The file picker accepts MP3, WAV,
OGG, M4A, and AAC files; codec support still depends on the browser. A click is
required before audio can start because browsers block autoplay.

To stop the server, press `Ctrl+C` in the terminal. Working source and named
performances remain in that browser. Export projects that need to move to another
browser or computer.

## First edit

The starter scene contains a transparent ASCII layer followed by Plasma:

```js
const scene = [
  asciiNoise,
  plasma,
];

activate(scene);
```

Open `asciiNoise` and change `cellSize`, `density`, or `hue`; or open `plasma`
and change `speed` or `motion`. Press `Cmd/Ctrl+Enter` in that cell. The image
should change without a page reload.

To add a built-in patch:

1. Open tools with `☰` or `\`.
2. In **Library**, select **Install source**.
3. Select **Add to scene**.
4. Evaluate the opened scene with `Cmd/Ctrl+Enter`.

The Library uses four distinct states:

```text
Available → Installed → Active → Running
```

Installing adds editable source. Adding to scene edits the scene array. The scene
becomes active only after evaluation.

To write a patch, hover in the far-left gutter beside a folded cell and select the
subtle `+`. Enter a JavaScript name. AlgoLab inserts an object patch and places the
cursor in `draw()`.

## Main commands

| Command | Action |
| --- | --- |
| `Cmd/Ctrl+Enter` | Evaluate the current cell or statement |
| `Cmd/Ctrl+Shift+Enter` | Evaluate the complete editor |
| `Cmd/Ctrl+/` | Toggle one comment layer |
| `Cmd/Ctrl+Option/Alt+T` | Tidy the current cell |
| `Cmd/Ctrl+Alt+N` | Start a new performance from the default scene |
| `Esc` | Release editor focus |
| `Space` | Play or pause audio |
| `\` | Show or hide tools |
| `r` | Show or hide the installed-patch reference |
| `e` | Show or hide code |
| `f` | Enter or leave fullscreen |
| `p` | Open the audience window |
| `0` | Restore Safe State |
| `?` | Show all commands |

## Troubleshooting

### `node` or `npm` is not found

Install Node.js 20 or newer, close the terminal, and open it again.

### `npm` cannot find `package.json`

Change into the AlgoLab folder before running the command.

### The page is blank or reports module/CORS errors

Use the URL printed by `npm run dev`, not a `file://` address.

### Port 5173 is already in use

Use the existing server, stop it with `Ctrl+C`, or run `PORT=4173 npm run dev` on
macOS/Linux. In PowerShell, run `$env:PORT=4173` first.

### A patch is installed but does not draw

Add it to the scene, then evaluate the scene cell.

### Old source returns after a restart

AlgoLab restores the working project saved in that browser. Use **New performance**
for the default ASCII Noise + Plasma scene, or import another project.

### Audio does not start

Choose a source on the first-run screen, allow microphone access if applicable, and
check whether the transport says **Play**. Enter with silence to test visuals alone.

## Documentation

| Document | Use it for |
| --- | --- |
| [Guide](docs/GUIDE.md) | Patches, scenes, audio, shaders, networking, and recovery |
| [API](docs/API.md) | Context fields, lifecycle, identity, commands, and exact behavior |
| [Networking (beta)](docs/NETWORKING.md) | Publishing, receiving, local testing, and deployment |
| [Architecture](docs/ARCHITECTURE.md) | Runtime design and implementation invariants |
| [Product](docs/PRODUCT.md) | Purpose, principles, scope, and limits |
| [Contributing](CONTRIBUTING.md) | Development setup and contribution rules |
| [Security](SECURITY.md) | Trust boundary and vulnerability reporting |

## Development

```sh
npm ci
npm run dev
npm test
npx playwright install chromium  # once
npm run test:e2e
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing the runtime or submitting a
community patch.

## Security

AlgoLab evaluates trusted JavaScript with `new Function`; it is not a sandbox. Code
can access browser globals, consume unbounded resources, or freeze the tab. Run only
source you trust. See [SECURITY.md](SECURITY.md).
