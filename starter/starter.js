// The starter project — what a student sees on first run.
//
// PRD §15 sets the bar this file has to clear: 80% of students make their first
// successful live replacement within 15 minutes using only this file and its inline
// comments. So the comments here are the documentation, not decoration.
//
// It is exported as a string because it is *source*, not modules. The editor loads it,
// the evaluator compiles it, and the student rewrites it while it runs.

export const STARTER_SOURCE = `// RESPONSE — starter scene
//
// This is ordinary p5.js. background(), circle(), map(), noise(), push()/pop(),
// arrays and objects all work exactly as you already know them.
//
// The one new idea: you do not write setup() or draw(). The host owns those, and
// keeps them running. You write named PATCHES, and the host calls them every frame.
// That is why you can rewrite this file mid-song without the canvas going blank.
//
// TRY THIS FIRST: put your cursor inside the "rings" block below, change 255 to
// something like color(255, 120, 0), and press Cmd/Ctrl+Enter. The circles change.
// The music keeps playing. The trails keep their history. Nothing reloads.

// ---------------------------------------------------------------------------
// wash — a translucent background. Drawn first, so it fades whatever came before
// instead of erasing it. This is why the other patches leave trails.
// ---------------------------------------------------------------------------
patch("wash", ({ audio }) => {
  noStroke();
  // Lower alpha = longer trails. Try 6, then try 60.
  fill(8, 8, 12, map(audio.level, 0, 1, 40, 14));
  rect(0, 0, width, height);
});

// ---------------------------------------------------------------------------
// rings — the simplest useful patch: one function, given the audio for this frame.
//
// audio.bass, audio.mid, audio.treble and audio.level are all 0..1, already
// smoothed and auto-gained, so map() behaves the same on a quiet track and a loud
// one. The raw p5.sound numbers are still there under audio.raw if you want them.
// ---------------------------------------------------------------------------
patch("rings", ({ audio }) => {
  const diameter = map(audio.bass, 0, 1, 40, width * 0.8);

  noFill();
  stroke(255);
  strokeWeight(3);
  circle(width / 2, height / 2, diameter);
});

// ---------------------------------------------------------------------------
// orbiters — a patch with STATE.
//
// state() runs once, ever, for the name "orbiters". Re-evaluating this block gives
// the patch new code but hands it back the same state object, so the trail array
// survives your edit. That is the whole point of the system: change the logic,
// keep the history.
//
// Try it: let the trail build up for ten seconds, then change the stroke colour
// below and evaluate. The trail does not restart.
//
// If you want it to restart, say so explicitly:  resetPatch("orbiters")
// ---------------------------------------------------------------------------
patch("orbiters", {
  state: () => ({ angle: 0, trail: [] }),

  draw({ audio, state, dt }) {
    // dt is seconds since the last frame, so motion is the same speed at 30fps
    // and 60fps. It is capped after a stall, so a hiccup never teleports things.
    state.angle += dt * map(audio.treble, 0, 1, 0.2, 2.4);

    const radius = map(audio.bass, 0, 1, 80, 280);
    const x = width / 2 + cos(state.angle) * radius;
    const y = height / 2 + sin(state.angle) * radius;

    state.trail.push({ x, y });
    // Always bound your arrays. An unbounded trail is a slow memory leak, and it
    // will find you thirty minutes into a set.
    if (state.trail.length > 220) state.trail.shift();

    noFill();
    stroke(120, 200, 255, 90);
    strokeWeight(1);
    beginShape();
    for (const point of state.trail) vertex(point.x, point.y);
    endShape();

    noStroke();
    fill(255);
    circle(x, y, 12 + audio.mid * 40);
  },
});

// ---------------------------------------------------------------------------
// A scene is an ordered list of patch names. Order is layer order: first is drawn
// underneath. Re-evaluating a scene changes the composition without touching the
// patches themselves or their state.
//
// Try: swap two names below and evaluate this block.
// ---------------------------------------------------------------------------
scene("tunnel", ["wash", "rings", "orbiters"]);
go("tunnel");
`;
