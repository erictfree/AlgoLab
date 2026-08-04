// PRD §12 — the Degree 3 acceptance test.
//
// "The MVP does not satisfy this PRD unless it passes the following live scenario."
// All ten steps, in order, against the real page: real p5 canvas, real p5.sound
// analysis, real keyboard evaluation.
//
// The continuity assertions are the point. It is easy to build something where the
// code changes; the requirement is that the code changes while nothing else does.

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const TONE = fileURLToPath(new URL('../fixtures/test-tone.wav', import.meta.url));

const RINGS_EDITED = `patch("rings", ({ audio }) => {
  noFill();
  stroke(255, 120, 0);
  strokeWeight(9);
  circle(width / 2, height / 2, map(audio.bass, 0, 1, 60, width * 0.6));
});`;

const RINGS_SYNTAX_ERROR = `patch("rings", ({ audio }) => {
  this is not javascript (((
});`;

const RINGS_THROWS_ON_FIRST_FRAME = `patch("rings", ({ audio }) => {
  missingThing.boom();
});`;

/** Replace the whole editor buffer, then put the cursor inside a named patch block. */
async function setBufferAndCursor(page, buffer, cursorNeedle) {
  await page.evaluate(
    ([text, needle]) => {
      const ta = document.getElementById('code');
      ta.value = text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      const at = text.indexOf(needle);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = at + needle.length;
    },
    [buffer, cursorNeedle],
  );
}

const snapshot = (page) =>
  page.evaluate(() => {
    const R = window.Response;
    return {
      frameCount: window.frameCount,
      hostTime: R.host.time(),
      canvasId: document.querySelector('#stage canvas').dataset.probe,
      audioPosition: R.audio.status().position,
      audioPlaying: R.audio.status().playing,
      ringsVersion: R.registry.getPatch('rings')?.version ?? null,
      ringsSource: R.registry.getPatch('rings')?.source ?? '',
      ringsStatus: R.registry.getPatch('rings')?.status ?? null,
      washStatus: R.registry.getPatch('wash')?.status ?? null,
      orbitersTrail: R.stateStore.get('orbiters')?.trail?.length ?? 0,
      sceneOrder: R.registry.activeOrder(),
      messages: R.diagnostics.list().slice(0, 4).map((d) => `${d.level}: ${d.message}`),
    };
  });

test('Degree 3: visual logic is replaceable while everything else stays alive', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // ---- Steps 1 & 2: a scene is rendering, and music is playing ------------------
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.locator('#audio-file').setInputFiles(TONE);
  await expect(page.locator('#start-overlay')).toBeHidden({ timeout: 15_000 });
  await page.evaluate(() => window.Response.audio.setLoop(true));

  // Tag the canvas so we can prove later it is the very same element (R-01).
  await page.evaluate(() => {
    document.querySelector('#stage canvas').dataset.probe = 'original';
  });

  await expect
    .poll(() => page.evaluate(() => window.Response.registry.activeOrder()))
    .toEqual(['wash', 'rings', 'orbiters']);
  await expect
    .poll(() => page.evaluate(() => window.Response.audio.status().playing))
    .toBe(true);

  // ---- Step 3: let `orbiters` accumulate visible state for ten seconds ----------
  await page.waitForTimeout(10_000);
  const before = await snapshot(page);
  expect(before.orbitersTrail).toBeGreaterThan(100);
  expect(before.frameCount).toBeGreaterThan(300);
  expect(before.audioPosition).toBeGreaterThan(0);

  // ---- Steps 4 & 5: edit rings, evaluate, and lose nothing ----------------------
  const buffer = await page.locator('#code').inputValue();
  const edited = buffer.replace(
    /patch\("rings"[\s\S]*?\n\}\);/,
    RINGS_EDITED,
  );
  await setBufferAndCursor(page, edited, 'stroke(255, 120, 0)');
  await page.locator('#code').press('Control+Enter');

  await expect.poll(() => page.evaluate(() => window.Response.registry.getPatch('rings').version)).toBe(2);
  const afterEdit = await snapshot(page);

  expect(afterEdit.ringsSource).toContain('stroke(255, 120, 0)');
  expect(afterEdit.canvasId).toBe('original'); // no page reload, same canvas
  expect(afterEdit.frameCount).toBeGreaterThan(before.frameCount); // frameCount never reset
  expect(afterEdit.hostTime).toBeGreaterThan(before.hostTime); // host time never reset
  expect(afterEdit.audioPosition).toBeGreaterThan(before.audioPosition); // track never restarted
  expect(afterEdit.audioPlaying).toBe(true);
  expect(afterEdit.orbitersTrail).toBeGreaterThanOrEqual(before.orbitersTrail); // state kept
  expect(afterEdit.messages[0]).toBe('success: rings v2 active');

  // ---- Steps 6 & 7: a syntax error leaves the working version on stage ----------
  await setBufferAndCursor(page, edited.replace(RINGS_EDITED, RINGS_SYNTAX_ERROR), 'not javascript');
  await page.locator('#code').press('Control+Enter');
  await page.waitForTimeout(400);

  const afterSyntaxError = await snapshot(page);
  expect(afterSyntaxError.ringsVersion).toBe(2); // untouched
  expect(afterSyntaxError.ringsSource).toContain('stroke(255, 120, 0)'); // still v2's code
  expect(afterSyntaxError.canvasId).toBe('original');
  expect(afterSyntaxError.audioPlaying).toBe(true);
  expect(afterSyntaxError.messages[0]).toContain('Syntax error');

  // The diagnostic belongs to the performer, and stays out of the canvas (§10.5).
  await expect(page.locator('#diagnostics-list')).toContainText('Syntax error');
  await expect(page.locator('#stage')).not.toContainText('Syntax error');

  // ---- Steps 8 & 9: code that throws on frame one rolls itself back ------------
  await setBufferAndCursor(
    page,
    edited.replace(RINGS_EDITED, RINGS_THROWS_ON_FIRST_FRAME),
    'missingThing',
  );
  await page.locator('#code').press('Control+Enter');
  await expect
    .poll(() => page.evaluate(() => window.Response.diagnostics.latest()?.message ?? ''))
    .toContain('rolled back');

  const afterRollback = await snapshot(page);
  expect(afterRollback.ringsVersion).toBe(2); // restored
  expect(afterRollback.ringsSource).toContain('stroke(255, 120, 0)');
  expect(afterRollback.washStatus).toBe('ok'); // the rest of the scene is unharmed
  expect(afterRollback.audioPlaying).toBe(true); // the music continues
  expect(afterRollback.audioPosition).toBeGreaterThan(afterSyntaxError.audioPosition);
  expect(afterRollback.orbitersTrail).toBeGreaterThan(0);
  expect(afterRollback.canvasId).toBe('original');

  // ---- Step 10: reorder the scene, then revert rings to an earlier version ------
  await page.getByRole('button', { name: 'Move rings later (drawn over)' }).click();
  await expect
    .poll(() => page.evaluate(() => window.Response.registry.activeOrder()))
    .toEqual(['wash', 'orbiters', 'rings']);

  await page.locator('details.panel', { hasText: 'History' }).locator('summary').click();
  await page.getByRole('button', { name: 'Make rings v1 active again' }).click();

  await expect
    .poll(() => page.evaluate(() => window.Response.registry.getPatch('rings').source))
    .toContain('map(audio.bass, 0, 1, 40, width * 0.8)'); // the starter's original rings

  const final = await snapshot(page);
  expect(final.ringsStatus).toBe('ok');
  expect(final.sceneOrder).toEqual(['wash', 'orbiters', 'rings']);
  expect(final.canvasId).toBe('original');
  expect(final.audioPlaying).toBe(true);
  expect(final.frameCount).toBeGreaterThan(afterRollback.frameCount);

  // Nothing anywhere in the run may have escaped a boundary and hit the page.
  expect(pageErrors).toEqual([]);
});

test('D-01: source, patches, and scene order survive a refresh', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.Response.registry.activeOrder().length)).toBe(3);

  await page.evaluate(() => {
    const ta = document.getElementById('code');
    ta.value = ta.value + '\n\npatch("marker", () => { circle(10, 10, 5); });\n';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    window.Response.evaluator.evaluate(ta.value, { label: 'buffer' });
  });
  await expect.poll(() => page.evaluate(() => window.Response.registry.hasPatch('marker'))).toBe(true);
  await page.evaluate(() => window.Response.registry.reorderActiveScene('rings', 0));
  await page.waitForTimeout(900); // let the debounced save land

  await page.reload();
  await expect.poll(() => page.evaluate(() => window.Response.registry.hasPatch('marker'))).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.Response.registry.activeOrder()[0]))
    .toBe('rings');
});
