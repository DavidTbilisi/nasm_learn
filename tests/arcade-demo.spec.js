// Records a video per arcade level showing:
//   open level → reveal hint → reveal solution → load solution → step a few
//   times → run → verify pass.
//
//   npx playwright test tests/arcade-demo.spec.js
//
// Videos land in test-results/arcade-demo-*/video.webm (one folder per level).

const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 1280, height: 800 },
  video: { mode: 'on', size: { width: 1280, height: 800 } },
});

test.describe.configure({ mode: 'serial' });

const PAUSE_SHORT = 400;
const PAUSE_MED   = 800;
const PAUSE_LONG  = 1400;

async function playLevel(page, gameId, levelIdx, gameVar) {
  test.setTimeout(45_000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Open Arcade tab
  await page.locator('.tab-btn').filter({ hasText: 'Arcade' }).click();
  await page.waitForTimeout(PAUSE_MED);

  await page.locator(`.arcade-card[data-game="${gameId}"]`).click();
  await page.waitForTimeout(PAUSE_MED);

  await page.locator('.arcade-level').nth(levelIdx).click();
  await page.waitForTimeout(PAUSE_MED);

  // Reveal hint then solution for viewer context
  await page.click('#arcade-hint-btn');
  await page.waitForTimeout(PAUSE_MED);
  await page.click('#arcade-solution-btn');
  // Make sure the solution is actually framed in the recorded viewport.
  await page.locator('#arcade-solution').scrollIntoViewIfNeeded();
  await page.waitForTimeout(PAUSE_LONG + 600);

  // Load solution into the editor
  await page.evaluate(({ gameVar, idx }) => {
    const lvl = window[gameVar].levels[idx];
    const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
    cm.setValue(lvl.solution);
  }, { gameVar, idx: levelIdx });
  await page.waitForTimeout(PAUSE_MED);

  // Show stepping behavior — a few presses to demonstrate world update + line highlight
  for (let i = 0; i < 4; i++) {
    await page.click('#arcade-step');
    await page.waitForTimeout(PAUSE_SHORT);
  }
  await page.waitForTimeout(PAUSE_MED);

  // Run to completion
  await page.click('#arcade-run');
  await expect(page.locator('#arcade-status')).toHaveClass(/pass/, { timeout: 8000 });
  await page.waitForTimeout(PAUSE_LONG);
}

const BELT    = ['drain', 'split', 'sum', 'max', 'avg', 'route'];
const SIGNAL  = ['bitgate', 'header', 'parity', 'bswap', 'clamp', 'chdiff'];
const ROVER   = ['walk', 'lturn', 'pick', 'detour', 'coords'];
const COURIER = ['forward', 'route', 'classify', 'reverse', 'dedupe'];
const HEIST   = ['call', 'cdecl', 'chain', 'rewrite', 'fact'];

for (const [i, id] of BELT.entries()) {
  test(`belt — ${i + 1} · ${id}`, async ({ page }) => {
    await playLevel(page, 'belt', i, 'BeltGame');
  });
}

for (const [i, id] of SIGNAL.entries()) {
  test(`signal — ${i + 1} · ${id}`, async ({ page }) => {
    await playLevel(page, 'signal', i, 'SignalGame');
  });
}

for (const [i, id] of ROVER.entries()) {
  test(`rover — ${i + 1} · ${id}`, async ({ page }) => {
    await playLevel(page, 'rover', i, 'RoverGame');
  });
}

for (const [i, id] of COURIER.entries()) {
  test(`courier — ${i + 1} · ${id}`, async ({ page }) => {
    await playLevel(page, 'courier', i, 'CourierGame');
  });
}

for (const [i, id] of HEIST.entries()) {
  test(`heist — ${i + 1} · ${id}`, async ({ page }) => {
    await playLevel(page, 'heist', i, 'HeistGame');
  });
}
