// P1 course-ready behavior in the real page: projection, panic, and import.

import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => window.Response.registry.activeOrder().length))
    .toBe(3);
}

test.describe('P-01..P-03 projection view', () => {
  test('opens a window that shows the canvas and no diagnostics', async ({ page, context }) => {
    await boot(page);

    // Put a real error in the performer's Messages panel first — the whole point of
    // P-01 is that this must not travel to the projector.
    await page.evaluate(() =>
      window.Response.evaluator.evaluate('patch("rings", ((( broken', { label: 'patch rings' }),
    );
    await expect(page.locator('#diagnostics-list')).toContainText('Syntax error');

    const [projector] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Open the audience projection window' }).click(),
    ]);

    await expect(projector.locator('#projection-canvas')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.Response.projection.isOpen())).toBe(true);

    const projectorText = await projector.locator('body').innerText();
    expect(projectorText).not.toContain('Syntax error');
    expect(projectorText).not.toContain('broken');
    expect(projectorText).not.toContain('rings v'); // canvas layout shows nothing at all

    // The canvas is actually receiving frames, not just present.
    const painted = await projector.evaluate(() => {
      const canvas = document.getElementById('projection-canvas');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let nonBlack = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 12 || data[i + 1] > 12 || data[i + 2] > 12) nonBlack++;
      }
      return nonBlack;
    });
    expect(painted).toBeGreaterThan(0);

    await projector.close();
  });

  test('P-02 code layout shows the last accepted block, not a failed one', async ({
    page,
    context,
  }) => {
    await boot(page);
    const [projector] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Open the audience projection window' }).click(),
    ]);
    await page.locator('#projection-layout').selectOption('code');

    // A successful evaluation through the editor's own path.
    await page.evaluate(() => {
      const ta = document.getElementById('code');
      ta.value = 'patch("rings", () => { circle(200, 200, 90); });';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      ta.selectionStart = ta.selectionEnd = 20;
    });
    await page.locator('#code').press('Control+Enter');
    await expect(projector.locator('#overlay')).toContainText('circle(200, 200, 90)');

    // Now a failed one — the audience must keep seeing the good block.
    await page.evaluate(() => {
      const ta = document.getElementById('code');
      ta.value = 'patch("rings", ((( totally broken';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      ta.selectionStart = ta.selectionEnd = 20;
    });
    await page.locator('#code').press('Control+Enter');
    await page.waitForTimeout(300);

    await expect(projector.locator('#overlay')).toContainText('circle(200, 200, 90)');
    await expect(projector.locator('#overlay')).not.toContainText('totally broken');

    // A revert is an evaluation too, so the overlay must follow it.
    await page.locator('details.panel', { hasText: 'History' }).locator('summary').click();
    await page.getByRole('button', { name: 'Make rings v1 active again' }).click();
    await expect(projector.locator('#overlay')).toContainText('map(audio.bass');

    await projector.close();
  });

  test('P-03 trace layout shows layer order and audio mappings', async ({ page, context }) => {
    await boot(page);
    const [projector] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Open the audience projection window' }).click(),
    ]);
    await page.locator('#projection-layout').selectOption('trace');

    const overlay = projector.locator('#overlay');
    await expect(overlay).toContainText('scene: tunnel');
    await expect(overlay).toContainText('wash v1');
    await expect(overlay).toContainText('orbiters v1');
    // The starter's rings maps audio.bass to its diameter; the trace should say so.
    await expect(overlay.locator('.trace-row', { hasText: 'rings' })).toContainText('bass');

    await projector.close();
  });
});

test.describe('multiple copies of one patch', () => {
  test('the shelf adds copies and the scene strip removes them individually', async ({ page }) => {
    await boot(page);
    await expect
      .poll(() => page.evaluate(() => window.Response.registry.activeOrder()))
      .toEqual(['wash', 'rings', 'orbiters']);

    // "add" in the Patch shelf always makes another copy.
    await page.getByRole('button', { name: 'Add another copy of rings to the scene' }).click();
    await page.getByRole('button', { name: 'Add another copy of rings to the scene' }).click();
    await expect
      .poll(() => page.evaluate(() => window.Response.registry.activeOrder()))
      .toEqual(['wash', 'rings', 'orbiters', 'rings#2', 'rings#3']);

    // The shelf shows the count; the scene strip shows the individual copies.
    await expect(page.locator('[data-patch="rings"]')).toContainText('×3');
    await expect(page.locator('[data-instance="rings#2"]')).toBeVisible();

    // Each copy keeps its own state.
    const independent = await page.evaluate(() => {
      const s = window.Response.stateStore;
      return s.get('rings') !== s.get('rings#2') && s.get('rings#2') !== s.get('rings#3');
    });
    expect(independent).toBe(true);

    // Remove one specific copy from the middle.
    await page.getByRole('button', { name: 'Remove rings#2 from the scene' }).click();
    await expect
      .poll(() => page.evaluate(() => window.Response.registry.activeOrder()))
      .toEqual(['wash', 'rings', 'orbiters', 'rings#3']);
  });

  test('library patches insert, stack, and keep separate configs', async ({ page }) => {
    await boot(page);
    // Library patches sit in the Patch shelf, listed as available — no separate panel.
    await expect(page.locator('[data-available="ribbon"]')).toBeVisible();

    // The first press registers the patch...
    await page.getByRole('button', { name: /^Add ribbon —/ }).click();
    await expect.poll(() => page.evaluate(() => window.Response.registry.hasPatch('ribbon'))).toBe(true);

    // ...after which it is an ordinary shelf row, with a version and a "+" of its own.
    await expect(page.locator('[data-available="ribbon"]')).toHaveCount(0);
    await expect(page.locator('[data-patch="ribbon"]')).toContainText('v1');
    await page.getByRole('button', { name: 'Add another copy of ribbon to the scene' }).click();
    await expect
      .poll(() => page.evaluate(() => window.Response.registry.activeInstancesOf('ribbon').length))
      .toBe(2);

    // A third, configured differently, so the copies are distinguishable.
    await page.evaluate(() =>
      window.Response.evaluator.evaluate('add("ribbon", { y: 0.75, hue: 300 });', { label: 'test' }),
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.Response.registry.activeInstancesOf('ribbon').map((i) => i.config.hue ?? null),
        ),
      )
      .toEqual([null, null, 300]);

    // Replacing the patch changes all three; their states stay separate.
    await page.evaluate(() =>
      window.Response.evaluator.evaluate('patch("ribbon", ({ state }) => { state.touched = true; });', {
        label: 'patch ribbon',
      }),
    );
    await expect.poll(() => page.evaluate(() => window.Response.registry.getPatch('ribbon').version)).toBe(2);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const s = window.Response.stateStore;
          return ['ribbon', 'ribbon#2', 'ribbon#3'].every((id) => s.get(id)?.touched === true);
        }),
      )
      .toBe(true);
  });
});

test.describe('the tools overlay', () => {
  test('the canvas fills the window and the panel floats over it', async ({ page }) => {
    await boot(page);

    // The composition is the shape of the projection, not of a leftover column.
    const size = await page.evaluate(() => {
      const canvas = document.querySelector('#stage canvas');
      return { w: canvas.width, h: canvas.height, iw: window.innerWidth, ih: window.innerHeight };
    });
    expect(size.w).toBe(size.iw);
    expect(size.h).toBe(size.ih);

    // Slightly transparent, and blurred so it stays readable over moving visuals.
    const style = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('side'));
      return { background: cs.backgroundColor, backdrop: cs.backdropFilter };
    });
    expect(style.background).toMatch(/0\.78|0\.78\)/);
    expect(style.backdrop).toContain('blur');

    // "\" clears it off the canvas, and brings it back.
    await page.locator('#code').focus();
    await page.locator('#code').press('Escape');
    await page.keyboard.press('\\');
    await expect(page.locator('#side')).toHaveClass(/is-hidden/);
    await page.keyboard.press('\\');
    await expect(page.locator('#side')).not.toHaveClass(/is-hidden/);

    // Hiding the tools must not disturb the sketch — it is only a panel.
    expect(await page.evaluate(() => window.Response.registry.activeOrder())).toEqual([
      'wash',
      'rings',
      'orbiters',
    ]);
  });

  test('"\\" does nothing while the editor has focus', async ({ page }) => {
    await boot(page);
    await page.locator('#code').focus();
    await page.locator('#code').press('\\');
    await expect(page.locator('#side')).not.toHaveClass(/is-hidden/);
    expect(await page.locator('#code').inputValue()).toContain('\\');
  });
});

test.describe('S-06 / P-05 panic', () => {
  test('returns to the safe scene from the keyboard with no editor focus', async ({ page }) => {
    await boot(page);

    // The starter scene is designated safe at startup.
    await expect.poll(() => page.evaluate(() => window.Response.registry.safeSceneName())).toBe(
      'tunnel',
    );

    await page.evaluate(() => {
      window.Response.evaluator.evaluate(
        'patch("chaos", () => { circle(10, 10, 5); }); scene("wild", ["chaos"]); go("wild");',
        { label: 'buffer' },
      );
    });
    await expect
      .poll(() => page.evaluate(() => window.Response.registry.activeOrder()))
      .toEqual(['chaos']);

    // P-04: release editor focus, then a single key recovers.
    await page.locator('#code').focus();
    await page.locator('#code').press('Escape');
    await page.keyboard.press('0');

    await expect
      .poll(() => page.evaluate(() => window.Response.registry.activeOrder()))
      .toEqual(['wash', 'rings', 'orbiters']);
    await expect(page.locator('#diagnostics-list')).toContainText('Panic');
  });
});

test.describe('D-02 / D-03 project portability', () => {
  test('exports a readable project file', async ({ page }) => {
    await boot(page);
    // The panel ships collapsed; a performer opens it before reaching the button.
    await page.locator('details.panel', { hasText: 'Project & performance' }).locator('summary').click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export this project as JSON' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^response-project-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('import requires an explicit confirmation and can be cancelled', async ({ page }) => {
    await boot(page);

    const project = JSON.stringify({
      format: 'response-project',
      schema: 1,
      source: ['patch("imported", () => { circle(50, 50, 20); });'],
      scenes: [{ name: 'main', order: ['imported'] }],
      activeScene: 'main',
      params: [],
    });

    await page.locator('#import-file').setInputFiles({
      name: 'someone-elses.json',
      mimeType: 'application/json',
      buffer: Buffer.from(project),
    });

    // The dialog must show the actual code, and warn that this is not a sandbox.
    const dialog = page.locator('.dialog-backdrop');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('someone-elses.json');
    await expect(dialog.locator('.dialog-preview')).toContainText('patch("imported"');
    await expect(dialog.locator('.dialog-warning')).toContainText('not a');

    // Cancelling must change nothing.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.Response.registry.hasPatch('imported'))).toBe(false);

    // Confirming runs it.
    await page.locator('#import-file').setInputFiles({
      name: 'someone-elses.json',
      mimeType: 'application/json',
      buffer: Buffer.from(project),
    });
    await dialog.getByRole('button', { name: 'Import and run' }).click();
    await expect
      .poll(() => page.evaluate(() => window.Response.registry.hasPatch('imported')))
      .toBe(true);
  });

  test('reset goes back to the starter without reloading the page', async ({ page }) => {
    await boot(page);
    await page.locator('details.panel', { hasText: 'Project & performance' }).locator('summary').click();

    // Make a mess: a new patch, extra copies, a wrecked scene, accumulated state.
    await page.evaluate(() =>
      window.Response.evaluator.evaluate(
        'patch("mess", () => { circle(5, 5, 5); }); add("rings"); add("rings");',
        { label: 'test' },
      ),
    );
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      document.querySelector('#stage canvas').dataset.probe = 'original';
    });
    const before = await page.evaluate(() => ({
      frameCount: window.frameCount,
      hostTime: window.Response.host.time(),
      patches: window.Response.registry.listPatches().length,
    }));
    expect(before.patches).toBe(4);

    await page.getByRole('button', { name: 'Discard everything and go back to the starter project' }).click();
    const dialog = page.locator('.dialog-backdrop');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.dialog-warning')).toContainText('no undo');

    // Cancelling changes nothing.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(await page.evaluate(() => window.Response.registry.hasPatch('mess'))).toBe(true);

    await page.getByRole('button', { name: 'Discard everything and go back to the starter project' }).click();
    await dialog.getByRole('button', { name: 'Reset to starter' }).click();

    await expect
      .poll(() => page.evaluate(() => window.Response.registry.activeOrder()))
      .toEqual(['wash', 'rings', 'orbiters']);

    const after = await page.evaluate(() => ({
      hasMess: window.Response.registry.hasPatch('mess'),
      stateKeys: window.Response.stateStore.names().sort(),
      source: document.getElementById('code').value,
      safeScene: window.Response.registry.safeSceneName(),
      sameCanvas: document.querySelector('#stage canvas')?.dataset.probe === 'original',
      frameCount: window.frameCount,
      hostTime: window.Response.host.time(),
    }));

    expect(after.hasMess).toBe(false);
    expect(after.stateKeys).toEqual(['orbiters', 'rings', 'wash']);
    expect(after.source).toContain('RESPONSE — starter scene');
    expect(after.safeScene).not.toBe(null);
    // The point of doing this in place rather than reloading: the canvas and the
    // clock are the same ones. Nothing the audience is looking at restarted.
    expect(after.sameCanvas).toBe(true);
    expect(after.frameCount).toBeGreaterThan(before.frameCount);
    expect(after.hostTime).toBeGreaterThan(before.hostTime);
  });

  test('a file that is not a project is refused before any confirmation', async ({ page }) => {
    await boot(page);
    await page.locator('#import-file').setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"just":"some json"}'),
    });

    await expect(page.locator('.dialog-backdrop')).toBeHidden();
    await expect(page.locator('#diagnostics-list')).toContainText('Not a Response project');
  });
});

test.describe('D-05 offline course bundle', () => {
  test('loads with every non-local request blocked', async ({ page }) => {
    const external = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('http://localhost:5173/') || url.startsWith('data:')) return route.continue();
      external.push(url);
      return route.abort();
    });

    await boot(page);
    // p5, p5.sound, the modules, and the starter all came from the vendored build.
    expect(external).toEqual([]);
    expect(await page.evaluate(() => window.p5.VERSION)).toBe('1.11.3');
  });
});
