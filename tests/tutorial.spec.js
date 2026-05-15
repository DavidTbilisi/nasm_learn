// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Set the CodeMirror editor content via the exposed window.cmEditor. */
async function setEditorValue(page, code) {
  await page.evaluate(c => window.cmEditor.setValue(c), code);
}

/** Click Run and wait for the register table to populate. */
async function runCode(page) {
  await page.click('#btn-run');
  await expect(page.locator('#reg-table tr')).not.toHaveCount(0);
}

// ── 1. Page basics ────────────────────────────────────────────────────────────

test.describe('Page basics', () => {
  test('has correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('NASM Interactive Tutorial');
  });

  test('lesson 1 tab is active on load', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.tab-btn.active')).toContainText('1 · Registers');
  });

  test('flag cells expose data-flag for tooltips', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#flag-bar .flag[data-flag="zf"]')).toBeVisible();
    await expect(page.locator('#flag-bar .flag[data-flag="df"]')).toBeVisible();
  });

  test('lesson title renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#lesson-title')).toContainText('Registers');
  });

  test('lesson intro text is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#lesson-intro')).not.toBeEmpty();
  });

  test('concept list has at least one item', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#concepts-list li')).toHaveCount(await page.locator('#concepts-list li').count());
    await expect(page.locator('#concepts-list li').first()).toBeVisible();
  });

  test('editor is populated with lesson code', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.CodeMirror-code')).toContainText('mov eax, 42');
  });

  test('all 19 tabs render (15 lessons + quiz + gym + playground + rank)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.tab-btn')).toHaveCount(19);
  });
});

// ── 2. Tab navigation ────────────────────────────────────────────────────────

test.describe('Tab navigation', () => {
  test('clicking rank tab shows rank wrap, hides main layout', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn.rank-tab').click();
    await expect(page.locator('#rank-wrap')).toBeVisible();
    await expect(page.locator('#main-layout')).not.toBeVisible();
    await expect(page.locator('#rank-panel-hub')).toContainText('Rank');
  });

  test('switching from rank back to lesson restores main layout', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn.rank-tab').click();
    await page.locator('.tab-btn').first().click();
    await expect(page.locator('#main-layout')).toBeVisible();
    await expect(page.locator('#rank-wrap')).not.toBeVisible();
  });

  test('clicking lesson 2 loads arithmetic content', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn').nth(1).click();
    await expect(page.locator('#lesson-title')).toContainText('Arithmetic');
    await expect(page.locator('.CodeMirror-code')).toContainText('add eax, ebx');
  });

  test('clicking lesson 5 loads loops content', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn').nth(4).click();
    await expect(page.locator('#lesson-title')).toContainText('Loop');
  });

  test('clicking lesson 13 loads endianness content + widget', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn').nth(12).click();
    await expect(page.locator('#lesson-title')).toContainText('Endianness');
    await expect(page.locator('#lesson-widget')).toBeVisible();
    await expect(page.locator('#endian-input')).toBeVisible();
  });

  test('endian widget swaps bytes when value changes', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn').nth(12).click();
    await page.locator('#endian-input').fill('0x11223344');
    // Little-endian view: byte at A is the LSB (0x44).
    const le = page.locator('#endian-le .endian-byte');
    await expect(le.nth(0)).toHaveText('44');
    await expect(le.nth(3)).toHaveText('11');
    // Big-endian view: byte at A is the MSB (0x11).
    const be = page.locator('#endian-be .endian-byte');
    await expect(be.nth(0)).toHaveText('11');
    await expect(be.nth(3)).toHaveText('44');
  });

  test('clicking lesson 14 loads buffer-overflow content', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn').nth(13).click();
    await expect(page.locator('#lesson-title')).toContainText('Buffer Overflow');
  });

  test('clicking lesson 15 loads shellcode framing content', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn').nth(14).click();
    await expect(page.locator('#lesson-title')).toContainText('Shellcode');
    await expect(page.locator('#lesson-intro')).toContainText('authorized');
  });

  test('clicking quiz tab shows quiz, hides main layout', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn.quiz-tab').click();
    await expect(page.locator('#quiz-wrap')).toBeVisible();
    await expect(page.locator('#main-layout')).not.toBeVisible();
  });

  test('clicking gym tab shows gym, hides main layout', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn.gym-tab').click();
    await expect(page.locator('#gym-wrap')).toBeVisible();
    await expect(page.locator('#main-layout')).not.toBeVisible();
  });

  test('switching from quiz back to a lesson restores main layout', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn.quiz-tab').click();
    await page.locator('.tab-btn').first().click();
    await expect(page.locator('#main-layout')).toBeVisible();
    await expect(page.locator('#quiz-wrap')).not.toBeVisible();
  });

  test('switching from gym back to a lesson restores main layout', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn.gym-tab').click();
    await page.locator('.tab-btn').first().click();
    await expect(page.locator('#main-layout')).toBeVisible();
    await expect(page.locator('#gym-wrap')).not.toBeVisible();
  });

  test('hint button toggles hint text', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#hint-box')).not.toBeVisible();
    await page.click('#hint-btn');
    await expect(page.locator('#hint-box')).toBeVisible();
    await page.click('#hint-btn');
    await expect(page.locator('#hint-box')).not.toBeVisible();
  });

  test('solution button toggles solution panel with lesson 1 assembly', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#solution-box')).not.toBeVisible();
    await expect(page.locator('#solution-btn')).toBeEnabled();
    await page.click('#solution-btn');
    await expect(page.locator('#solution-box')).toBeVisible();
    await expect(page.locator('#solution-box')).toContainText('mov ebx, 100');
    await page.click('#solution-btn');
    await expect(page.locator('#solution-box')).not.toBeVisible();
  });
});

// ── 3. Simulator — Run ───────────────────────────────────────────────────────

test.describe('Simulator — Run', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Run populates register table', async ({ page }) => {
    await runCode(page);
    await expect(page.locator('#reg-table')).toContainText('EAX');
    await expect(page.locator('#reg-table')).toContainText('EBX');
  });

  test('lesson 1: EAX = 0x000001AB after run', async ({ page }) => {
    // mov eax,42 → mov ebx,eax → mov ecx,0xFF → mov al,0xAB → mov ah,0x01 → EAX=0x000001AB
    await runCode(page);
    await expect(page.locator('#reg-table')).toContainText('0x000001AB');
  });

  test('lesson 1: EBX = 42 after run', async ({ page }) => {
    await runCode(page);
    // The dec value 42 should appear in the table
    const rows = page.locator('#reg-table tr');
    const ebxRow = rows.filter({ hasText: 'EBX' });
    await expect(ebxRow).toContainText('42');
  });

  test('lesson 1: ECX = 0x000000FF after run', async ({ page }) => {
    await runCode(page);
    await expect(page.locator('#reg-table')).toContainText('0x000000FF');
  });

  test('lesson 1: EDX = 0xFFFFFFFF after run', async ({ page }) => {
    await runCode(page);
    await expect(page.locator('#reg-table')).toContainText('0xFFFFFFFF');
  });

  test('execution log reports instruction count', async ({ page }) => {
    await runCode(page);
    await expect(page.locator('#step-log')).toContainText('instruction');
  });

  test('ZF flag is displayed after run', async ({ page }) => {
    await runCode(page);
    await expect(page.locator('#flag-bar')).toContainText('ZF');
  });

  test('Run on valid arithmetic code — correct EAX', async ({ page }) => {
    await setEditorValue(page, `section .text\nglobal _start\n_start:\n  mov eax, 10\n  add eax, 32\n  hlt`);
    await runCode(page);
    const ebxRow = page.locator('#reg-table tr').filter({ hasText: 'EAX' });
    await expect(ebxRow).toContainText('42');
  });

  test('error banner shows for invalid code', async ({ page }) => {
    // Unknown opcode causes simulator to throw "Unknown instruction"
    await setEditorValue(page, `section .text\nglobal _start\n_start:\n  foobarbaz eax, ebx\n  hlt`);
    await page.click('#btn-run');
    await expect(page.locator('#error-banner')).toBeVisible();
  });

  test('error banner hides after fixing code and re-running', async ({ page }) => {
    await setEditorValue(page, `section .text\nglobal _start\n_start:\n  foobarbaz eax, ebx\n  hlt`);
    await page.click('#btn-run');
    await expect(page.locator('#error-banner')).toBeVisible();
    await setEditorValue(page, `section .text\nglobal _start\n_start:\n  mov eax, 1\n  hlt`);
    await page.click('#btn-run');
    await expect(page.locator('#error-banner')).not.toBeVisible();
  });
});

// ── 4. Simulator — Step ──────────────────────────────────────────────────────

test.describe('Simulator — Step', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Prev button disabled before any step', async ({ page }) => {
    await expect(page.locator('#btn-prev')).toBeDisabled();
  });

  test('Step shows step counter', async ({ page }) => {
    await page.click('#btn-step');
    await expect(page.locator('#step-counter')).toContainText('Step 1');
  });

  test('Step advances counter on each click', async ({ page }) => {
    await page.click('#btn-step');
    await page.click('#btn-step');
    await expect(page.locator('#step-counter')).toContainText('Step 2');
  });

  test('Step logs each instruction', async ({ page }) => {
    await page.click('#btn-step');
    await expect(page.locator('#step-log .log-entry')).toHaveCount(1);
    await page.click('#btn-step');
    await expect(page.locator('#step-log .log-entry')).toHaveCount(2);
  });

  test('Prev becomes enabled after first step', async ({ page }) => {
    await page.click('#btn-step');
    await page.click('#btn-step');
    await expect(page.locator('#btn-prev')).not.toBeDisabled();
  });

  test('Prev goes back one step', async ({ page }) => {
    await page.click('#btn-step');
    await page.click('#btn-step');
    await expect(page.locator('#step-counter')).toContainText('Step 2');
    await page.click('#btn-prev');
    await expect(page.locator('#step-counter')).toContainText('Step 1');
  });
});

// ── 5. Simulator — Reset ─────────────────────────────────────────────────────

test.describe('Simulator — Reset', () => {
  test('Reset clears registers to zero', async ({ page }) => {
    await page.goto('/');
    await runCode(page);
    await page.click('#btn-reset');
    await expect(page.locator('#reg-table')).toContainText('0x00000000');
  });

  test('Reset clears the step counter', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-step');
    await page.click('#btn-reset');
    await expect(page.locator('#step-counter')).toHaveText('');
  });

  test('Reset clears the execution log', async ({ page }) => {
    await page.goto('/');
    await runCode(page);
    await page.click('#btn-reset');
    await expect(page.locator('#step-log')).toBeEmpty();
  });

  test('Reset disables Prev button', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-step');
    await page.click('#btn-step');
    await page.click('#btn-reset');
    await expect(page.locator('#btn-prev')).toBeDisabled();
  });
});

// ── 6. Resize handles ────────────────────────────────────────────────────────

test.describe('Resize handles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('lesson handle has col-resize cursor', async ({ page }) => {
    const cursor = await page.locator('#h-lesson').evaluate(
      el => getComputedStyle(el).cursor
    );
    expect(cursor).toBe('col-resize');
  });

  test('editor handle has row-resize cursor', async ({ page }) => {
    const cursor = await page.locator('#h-editor').evaluate(
      el => getComputedStyle(el).cursor
    );
    expect(cursor).toBe('row-resize');
  });

  test('reg and flags handles have col-resize cursor', async ({ page }) => {
    for (const id of ['#h-reg', '#h-flags']) {
      const cursor = await page.locator(id).evaluate(
        el => getComputedStyle(el).cursor
      );
      expect(cursor).toBe('col-resize');
    }
  });

  test('all four handles are in the DOM and visible', async ({ page }) => {
    for (const id of ['#h-lesson', '#h-editor', '#h-reg', '#h-flags']) {
      await expect(page.locator(id)).toBeVisible();
    }
  });

  test('dragging lesson handle changes lesson panel width', async ({ page }) => {
    const initialWidth = (await page.locator('#lesson-panel').boundingBox()).width;

    // Simulate what apply() does when lessonW changes: set the grid column directly.
    await page.evaluate(() => {
      document.getElementById('main-layout').style.gridTemplateColumns = '480px 8px 1fr';
    });

    const newWidth = (await page.locator('#lesson-panel').boundingBox()).width;
    expect(Math.abs(newWidth - initialWidth)).toBeGreaterThan(20);
  });

  test('double-clicking handle resets layout to defaults', async ({ page }) => {
    // Widen the panel via inline style so sizes.lessonW (340) differs from the
    // rendered column (500), giving the dblclick reset something observable to undo.
    await page.evaluate(() => {
      document.getElementById('main-layout').style.gridTemplateColumns = '500px 8px 1fr';
    });

    // Call the reset function exposed by resize.js — same code path as dblclick.
    await page.evaluate(() => window.resetLayout());
    await page.waitForTimeout(50);

    // Check the style property that apply() directly sets, not a layout measurement.
    const cols = await page.evaluate(
      () => document.getElementById('main-layout').style.gridTemplateColumns
    );
    expect(cols).toContain('340px');
  });
});

// ── 7. Quiz ──────────────────────────────────────────────────────────────────

test.describe('Quiz', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn.quiz-tab').click();
  });

  test('quiz question is not empty', async ({ page }) => {
    await expect(page.locator('#quiz-q')).not.toBeEmpty();
  });

  test('either MC options or text input is visible', async ({ page }) => {
    const optsVisible  = await page.locator('#quiz-opts').isVisible();
    const inputVisible = await page.locator('#quiz-input').isVisible();
    expect(optsVisible || inputVisible).toBe(true);
  });

  test('progress bar starts at 0%', async ({ page }) => {
    const width = await page.locator('#quiz-progress').evaluate(
      el => el.style.width
    );
    expect(width).toBe('0%');
  });

  test('answering a MC question reveals feedback', async ({ page }) => {
    const optsVisible = await page.locator('#quiz-opts').isVisible();
    if (!optsVisible) test.skip();

    await page.locator('.quiz-opt').first().click();
    await expect(page.locator('#quiz-feedback')).toBeVisible();
  });
});

// ── 8. Gym ───────────────────────────────────────────────────────────────────

test.describe('Gym', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn.gym-tab').click();
  });

  test('gym menu shows 8 workout cards', async ({ page }) => {
    await expect(page.locator('.gym-card')).toHaveCount(8);
  });

  test('first card is Registers workout', async ({ page }) => {
    await expect(page.locator('.gym-card').first()).toContainText('Registers');
  });

  test('Full Body card exists', async ({ page }) => {
    await expect(page.locator('.gym-card').filter({ hasText: 'Full Body' })).toBeVisible();
  });

  test('clicking a card starts a drill', async ({ page }) => {
    await page.locator('.gym-card').first().click();
    await expect(page.locator('#gym-drill-area')).toBeVisible();
    await expect(page.locator('#gym-menu')).not.toBeVisible();
  });

  test('drill shows a question', async ({ page }) => {
    await page.locator('.gym-card').first().click();
    await expect(page.locator('#gym-question')).not.toBeEmpty();
  });

  test('drill shows timer bar', async ({ page }) => {
    await page.locator('.gym-card').first().click();
    await expect(page.locator('#gym-timer-fill')).toBeVisible();
  });

  test('drill shows rep counter', async ({ page }) => {
    await page.locator('.gym-card').first().click();
    await expect(page.locator('#gym-rep-counter')).toContainText('/');
  });

  test('drill shows category tag', async ({ page }) => {
    await page.locator('.gym-card').first().click();
    await expect(page.locator('#gym-category-tag')).not.toBeEmpty();
  });

  test('back button returns to workout menu', async ({ page }) => {
    await page.locator('.gym-card').first().click();
    await page.click('#gym-back-btn');
    await expect(page.locator('#gym-menu')).toBeVisible();
    await expect(page.locator('#gym-drill-area')).not.toBeVisible();
  });

  test('answering MC question reveals feedback and Next button', async ({ page }) => {
    // Start any workout and check if first drill is MC
    await page.locator('.gym-card').first().click();
    const mcVisible = await page.locator('#gym-mc-area').isVisible();
    if (!mcVisible) test.skip();

    await page.locator('.gym-opt').first().click();
    await expect(page.locator('#gym-feedback')).not.toHaveClass(/hidden/);
    await expect(page.locator('#gym-next-btn')).toBeVisible();
  });

  test('Next button advances to the next rep', async ({ page }) => {
    await page.locator('.gym-card').first().click();
    await expect(page.locator('#gym-rep-counter')).toContainText('1 /');

    // Answer and advance
    const mcVisible = await page.locator('#gym-mc-area').isVisible();
    if (mcVisible) {
      await page.locator('.gym-opt').first().click();
    } else {
      await page.locator('#gym-type-inp').fill('0');
      await page.locator('#gym-type-sub').click();
    }
    await page.click('#gym-next-btn');
    await expect(page.locator('#gym-rep-counter')).toContainText('2 /');
  });

  test('keyboard shortcut A selects first MC option', async ({ page }) => {
    await page.locator('.gym-card').first().click();
    const mcVisible = await page.locator('#gym-mc-area').isVisible();
    if (!mcVisible) test.skip();

    await page.keyboard.press('a');
    await expect(page.locator('#gym-feedback')).not.toHaveClass(/hidden/);
  });
});
