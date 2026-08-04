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
