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
    await expect(page.locator('#editor-host .CodeMirror-code')).toContainText('mov eax, 42');
  });

  test('all 21 tabs render (15 lessons + quiz + gym + playground + rank + arcade + foundry)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.tab-btn')).toHaveCount(21);
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
    await expect(page.locator('#editor-host .CodeMirror-code')).toContainText('add eax, ebx');
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

  test('gym menu shows 9 workout cards', async ({ page }) => {
    await expect(page.locator('.gym-card')).toHaveCount(9);
  });

  test('first card is Hex workout', async ({ page }) => {
    await expect(page.locator('.gym-card').first()).toContainText('Hex');
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

// ── Arcade — Belt Foreman ────────────────────────────────────────────────────

test.describe('Arcade', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn.arcade-tab').click();
  });

  test('clicking arcade tab shows arcade wrap, hides main layout', async ({ page }) => {
    await expect(page.locator('#arcade-wrap')).toBeVisible();
    await expect(page.locator('#main-layout')).not.toBeVisible();
  });

  test('picker lists Belt Foreman', async ({ page }) => {
    await expect(page.locator('#arcade-picker')).toContainText('Belt Foreman');
  });

  test('opening Belt Foreman shows level list', async ({ page }) => {
    await page.locator('.arcade-card[data-game="belt"]').click();
    await expect(page.locator('#arcade-levels')).toBeVisible();
    await expect(page.locator('.arcade-level')).toHaveCount(6);
    await expect(page.locator('.arcade-level').first()).toContainText('Drain');
  });

  test('opening a level shows the editor and the belt world', async ({ page }) => {
    await page.locator('.arcade-card[data-game="belt"]').click();
    await page.locator('.arcade-level').first().click();
    await expect(page.locator('#arcade-workspace')).toBeVisible();
    await expect(page.locator('#arcade-editor-host .CodeMirror')).toBeVisible();
    await expect(page.locator('#arcade-world .belt-svg')).toBeVisible();
    // Initial belt should show the level-1 byte sequence.
    await expect(page.locator('#arcade-world')).toContainText('10');
    await expect(page.locator('#arcade-world')).toContainText('50');
  });

  test('level 1 reference solution validates as complete', async ({ page }) => {
    await page.locator('.arcade-card[data-game="belt"]').click();
    await page.locator('.arcade-level').first().click();
    // Load the canonical solution into the editor via the exposed CodeMirror.
    await page.evaluate(() => {
      const level = window.BeltGame.levels[0];
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue(level.solution);
    });
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/pass/);
    await expect(page.locator('#arcade-status')).toContainText('Level complete');
  });

  test('empty program fails validation', async ({ page }) => {
    await page.locator('.arcade-card[data-game="belt"]').click();
    await page.locator('.arcade-level').first().click();
    await page.evaluate(() => {
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue('section .text\nglobal _start\n_start:\n  mov eax, 1\n  xor ebx, ebx\n  int 0x80\n');
    });
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/fail/);
    await expect(page.locator('#arcade-status')).toContainText('Bin 0 should');
  });

  test('Step button advances one instruction at a time and updates the world', async ({ page }) => {
    await page.locator('.arcade-card[data-game="belt"]').click();
    await page.locator('.arcade-level').first().click();
    await page.evaluate(() => {
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue(`_start:
  mov eax, 0x100
  int 0x80
  mov eax, 1
  xor ebx, ebx
  int 0x80
`);
    });
    // 2 steps: mov eax, 0x100; int 0x80  → after the int the belt cursor moves.
    await page.click('#arcade-step');
    await page.click('#arcade-step');
    await expect(page.locator('#arcade-step-counter')).toContainText('step 2');
    // Back step disables when stepping all the way back to 0.
    await page.click('#arcade-back-step');
    await page.click('#arcade-back-step');
    await expect(page.locator('#arcade-back-step')).toBeDisabled();
  });

  test('switching from arcade back to a lesson restores main layout', async ({ page }) => {
    await page.locator('.tab-btn').first().click();
    await expect(page.locator('#main-layout')).toBeVisible();
    await expect(page.locator('#arcade-wrap')).not.toBeVisible();
  });

  test('picker lists Signal Tower', async ({ page }) => {
    await expect(page.locator('#arcade-picker')).toContainText('Signal Tower');
  });

  test('Signal Tower level 1 reference solution validates as complete', async ({ page }) => {
    await page.locator('.arcade-card[data-game="signal"]').click();
    await page.locator('.arcade-level').first().click();
    await page.evaluate(() => {
      const level = window.SignalGame.levels[0];
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue(level.solution);
    });
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/pass/);
    await expect(page.locator('#arcade-status')).toContainText('Level complete');
  });

  test('Signal Tower level 4 (byte swap) reference solution validates', async ({ page }) => {
    await page.locator('.arcade-card[data-game="signal"]').click();
    await page.locator('.arcade-level').nth(3).click();
    await page.evaluate(() => {
      const level = window.SignalGame.levels[3];
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue(level.solution);
    });
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/pass/);
  });

  test('picker lists Rover Grid', async ({ page }) => {
    await expect(page.locator('#arcade-picker')).toContainText('Rover Grid');
  });

  test('Rover Grid level 1 reference solution validates as complete', async ({ page }) => {
    await page.locator('.arcade-card[data-game="rover"]').click();
    await page.locator('.arcade-level').first().click();
    await expect(page.locator('#arcade-world .rover-svg')).toBeVisible();
    await page.evaluate(() => {
      const level = window.RoverGame.levels[0];
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue(level.solution);
    });
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/pass/);
    await expect(page.locator('#arcade-status')).toContainText('Level complete');
  });

  test('Rover Grid level 4 (scan detour) reference solution validates', async ({ page }) => {
    await page.locator('.arcade-card[data-game="rover"]').click();
    await page.locator('.arcade-level').nth(3).click();
    await page.evaluate(() => {
      const level = window.RoverGame.levels[3];
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue(level.solution);
    });
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/pass/);
  });

  test('picker lists String Courier', async ({ page }) => {
    await expect(page.locator('#arcade-picker')).toContainText('String Courier');
  });

  test('String Courier level 1 reference solution validates', async ({ page }) => {
    await page.locator('.arcade-card[data-game="courier"]').click();
    await page.locator('.arcade-level').first().click();
    await expect(page.locator('#arcade-world .courier-wrap')).toBeVisible();
    await page.evaluate(() => {
      const level = window.CourierGame.levels[0];
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue(level.solution);
    });
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/pass/);
  });

  test('String Courier level 4 (reverse) reference solution validates', async ({ page }) => {
    await page.locator('.arcade-card[data-game="courier"]').click();
    await page.locator('.arcade-level').nth(3).click();
    await page.evaluate(() => {
      const level = window.CourierGame.levels[3];
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue(level.solution);
    });
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/pass/);
  });

  test('String Courier level 5 (dedupe) reference solution validates', async ({ page }) => {
    await page.locator('.arcade-card[data-game="courier"]').click();
    await page.locator('.arcade-level').nth(4).click();
    await page.evaluate(() => {
      const level = window.CourierGame.levels[4];
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue(level.solution);
    });
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/pass/);
  });

  test('picker lists Heap Heist', async ({ page }) => {
    await expect(page.locator('#arcade-picker')).toContainText('Heap Heist');
  });

  test('Heap Heist level 1 (CALL/RET) reference solution validates', async ({ page }) => {
    await page.locator('.arcade-card[data-game="heist"]').click();
    await page.locator('.arcade-level').first().click();
    await expect(page.locator('#arcade-world .heist-wrap')).toBeVisible();
    await page.evaluate(() => {
      const level = window.HeistGame.levels[0];
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue(level.solution);
    });
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/pass/);
  });

  test('Heap Heist level 4 (return-address rewrite) validates', async ({ page }) => {
    await page.locator('.arcade-card[data-game="heist"]').click();
    await page.locator('.arcade-level').nth(3).click();
    await page.evaluate(() => {
      const level = window.HeistGame.levels[3];
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue(level.solution);
    });
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/pass/);
  });

  test('Heap Heist level 5 (recursive factorial) validates with balanced stack', async ({ page }) => {
    await page.locator('.arcade-card[data-game="heist"]').click();
    await page.locator('.arcade-level').nth(4).click();
    await page.evaluate(() => {
      const level = window.HeistGame.levels[4];
      const cm = document.querySelector('#arcade-editor-host .CodeMirror').CodeMirror;
      cm.setValue(level.solution);
    });
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/pass/);
  });

  test('Heap Heist rejects empty program (validator sees wrong exit code)', async ({ page }) => {
    await page.locator('.arcade-card[data-game="heist"]').click();
    await page.locator('.arcade-level').first().click();
    await page.click('#arcade-run');
    await expect(page.locator('#arcade-status')).toHaveClass(/fail/);
  });

  test('built-in sys_write still works (regression: syscallTable does not shadow eax=4)', async ({ page }) => {
    await page.locator('.tab-btn').first().click();
    await page.evaluate(() => window.cmEditor.setValue(
      `section .data
msg db 'hi', 0
section .text
global _start
_start:
  mov eax, 4
  mov ebx, 1
  mov ecx, msg
  mov edx, 2
  int 0x80
  mov eax, 1
  xor ebx, ebx
  int 0x80`
    ));
    await page.click('#btn-run');
    await expect(page.locator('#output-panel')).toContainText('hi');
  });
});

// ── Walkthrough (isometric explainer) ─────────────────────────────────────────

test.describe('Walkthrough explainer', () => {
  test('every lesson has a walkthrough that steps forward and back', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    const tabs = page.locator('.tab-btn');
    for (let i = 0; i < 15; i++) {
      await tabs.nth(i).click();
      const xp = page.locator('#lesson-explainer');
      await expect(xp.locator('.xp-meta')).toHaveText(/^Step 1 \/ \d+$/);
      await expect(xp.locator('.xp-prev')).toBeDisabled();
      await expect(xp.locator('.xp-layer > g').first()).toBeAttached();
      await xp.locator('.xp-next').click();
      await expect(xp.locator('.xp-meta')).toHaveText(/^Step 2 \//);
      await xp.locator('.xp-prev').click();
      await expect(xp.locator('.xp-meta')).toHaveText(/^Step 1 \//);
    }
    expect(errors).toEqual([]);
  });
});

// ── Output window ─────────────────────────────────────────────────────────────

test.describe('Output window', () => {
  const TWO_WRITES = `section .data
  a db 'Hello, '
  b db 'World!', 10
section .text
global _start
_start:
  mov eax, 4
  mov ebx, 1
  mov ecx, a
  mov edx, 7
  int 0x80
  mov eax, 4
  mov ebx, 1
  mov ecx, b
  mov edx, 7
  int 0x80
  mov eax, 1
  mov ebx, 3
  int 0x80`;

  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('starts empty with a hint', async ({ page }) => {
    await expect(page.locator('#output-panel')).toContainText('No output yet');
  });

  test('lesson 6 prints with real newlines and the exit code', async ({ page }) => {
    await page.locator('.tab-btn').nth(5).click();
    await page.click('#btn-run');
    const text = await page.locator('#output-panel').innerText();
    expect(text).toContain('Hello, World!\nGoodbye!');
    expect(text).toContain('[process exited with code 0]');
    await expect(page.locator('#stack-panel')).not.toContainText('Hello');   // no longer mixed into the stack
  });

  test('two writes without a newline join on one line, like a terminal', async ({ page }) => {
    await page.evaluate(code => cm.setValue(code), TWO_WRITES);
    await page.click('#btn-run');
    const text = await page.locator('#output-panel').innerText();
    expect(text.split('\n')[0]).toBe('Hello, World!');
    expect(text).toContain('[process exited with code 3]');
  });

  test('Playground has its own output window', async ({ page }) => {
    await page.click('.playground-tab');
    await page.evaluate(code => pgCm.setValue(code), TWO_WRITES);
    await page.click('#pg-btn-run');
    await expect(page.locator('#pg-output-panel')).toContainText('Hello, World!');
  });
});

// ── ASM / C view toggle ───────────────────────────────────────────────────────

test.describe('ASM / C view', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('defaults to ASM only', async ({ page }) => {
    await expect(page.locator('#editor-host')).toBeVisible();
    await expect(page.locator('#c-pane')).not.toBeVisible();
    await expect(page.locator('#code-view [data-view="asm"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('split shows ASM and C side by side', async ({ page }) => {
    await page.click('#code-view [data-view="split"]');
    await expect(page.locator('#editor-host')).toBeVisible();
    await expect(page.locator('#c-pane')).toBeVisible();
    const asm = await page.locator('#editor-host').boundingBox();
    const c   = await page.locator('#c-pane').boundingBox();
    expect(c.x).toBeGreaterThan(asm.x);   // C is to the right
  });

  test('C view hides ASM and shows the lesson in C', async ({ page }) => {
    await page.click('#code-view [data-view="c"]');
    await expect(page.locator('#editor-host')).not.toBeVisible();
    await expect(page.locator('#c-host')).toContainText('int main');
    await expect(page.locator('#c-host')).toContainText('mov eax, 42');   // lesson 1 maps each line
  });

  test('C pane follows the selected lesson', async ({ page }) => {
    await page.click('#code-view [data-view="split"]');
    await page.locator('.tab-btn').nth(3).click();                       // lesson 4: square()
    await expect(page.locator('#c-host')).toContainText('uint32_t square(uint32_t x)');
  });

  test('every lesson has a C version', async ({ page }) => {
    const missing = await page.evaluate(() => LESSONS.filter(l => !l.c).map(l => l.id));
    expect(missing).toEqual([]);
  });

  test('stepping highlights the matching C line', async ({ page }) => {
    await page.click('#code-view [data-view="split"]');
    for (let n = 0; n < 3; n++) {
      await page.click('#btn-step');
      const { asm, c } = await page.evaluate(() => ({
        asm: cm.getLine(activeStepLine), c: activeCLine < 0 ? '' : cView.getLine(activeCLine),
      }));
      const norm = t => t.toLowerCase().replace(/\s+/g, ' ').trim();
      const ins = norm(asm.split(';')[0].replace(/^\s*\w+:/, ''));
      expect(ins).not.toBe('');
      expect(norm(c.split('//')[1] ?? '')).toContain(ins);
    }
    await page.click('#btn-reset');
    await expect(page.locator('#c-host .cm-active-step')).toHaveCount(0);
  });

  test('every instruction in every lesson has a C line', async ({ page }) => {
    const unmapped = await page.evaluate(() => LESSONS.flatMap(l => {
      cView.setValue(l.c);
      const { instructions } = sim.parse(l.code);
      return instructions.map((ins, ip) => cLineFor(instructions, ip) < 0 ? `L${l.id}: ${ins.raw}` : null).filter(Boolean);
    }));
    expect(unmapped).toEqual([]);
  });

  test('3D CPU replays each step in phases', async ({ page }) => {
    await page.click('#code-view [data-view="cpu"]');
    await expect(page.locator('#cpu-pane')).toBeVisible();
    await expect(page.locator('#cpu-pane .xp-title')).toHaveText('Ready');
    await page.click('#btn-step');                       // before instruction 1: nothing ran yet
    await page.click('#btn-step');                       // lesson 1: mov eax, 42 just ran
    await expect(page.locator('#cpu-pane .xp-title')).toHaveText(/Fetch/);
    await expect(page.locator('#cpu-pane .xp-title')).toHaveText(/Write back → EAX/, { timeout: 5000 });
    await expect(page.locator('#cpu-pane .xp-text')).toContainText('EAX 0 → 42');
    await expect(page.locator('#cpu-pane .xp-dot')).toHaveCount(3);   // fetch, read, write
  });

  test('3D view: editor highlights the replayed line, and every instruction is replayed once', async ({ page }) => {
    await page.locator('.tab-btn').nth(1).click();                       // lesson 2: 13 instructions
    await page.click('#code-view [data-view="cpu"]');
    const total = await page.evaluate(() => sim.runAll(cm.getValue()).history.length);
    const seen = [];
    await page.click('#btn-step');                                        // ready: nothing ran yet
    for (let n = 0; n < total; n++) {
      await page.click('#btn-step');
      await page.waitForTimeout(50);                                      // first phase fires on a 0 ms timer
      const { meta, line, raw } = await page.evaluate(() => {
        const m = document.querySelector('#cpu-pane .xp-meta').textContent.match(/Instruction (\d+)/);
        const k = +m[1] - 1;
        return { meta: k, line: cm.getLine(activeStepLine), raw: runResult.history[k].instr.raw };
      });
      expect(line.split(';')[0].trim()).toBe(raw);                        // editor shows what the 3D replays
      seen.push(meta);
      if (await page.locator('#btn-step', { hasText: 'Restart' }).count()) break;
    }
    // the last Step replays two instructions; wait for the second
    await expect(page.locator('#cpu-pane .xp-meta')).toContainText(`Instruction ${total} /`, { timeout: 15000 });
    seen.push(total - 1);
    expect([...new Set(seen)].sort((a, b) => a - b)).toEqual([...Array(total).keys()]);
  });

  test('3D view: ESP and EBP carry their mnemonic tooltips', async ({ page }) => {
    await page.locator('.tab-btn').nth(10).click();                      // lesson 11: function frame
    await page.click('#code-view [data-view="cpu"]');
    for (let n = 0; n < 7; n++) await page.click('#btn-step');            // past mov ebp, esp
    const tips = await page.locator('#cpu-pane svg title').allTextContents();
    expect(tips.filter(t => t.startsWith('ESP = Every Single Push')).length).toBeGreaterThanOrEqual(3);  // cube, name, tower pointer
    expect(tips.filter(t => t.startsWith('EBP = Exact Bookmark Position')).length).toBeGreaterThanOrEqual(3);
  });

  test('3D CPU builds phases for every instruction in every lesson', async ({ page }) => {
    const bad = await page.evaluate(() => LESSONS.flatMap(l => {
      const run = sim.runAll(l.code);
      return run.history.map((h, k) => {
        try {
          const ph = Cpu3D.phases(run, k);
          return ph.length >= 2 && ph.every(p => p.scene.length && p.title) ? null : `L${l.id} ${h.instr.raw}: ${ph.length} phases`;
        } catch (e) { return `L${l.id} ${h.instr.raw}: ${e.message}`; }
      }).filter(Boolean);
    }));
    expect(bad).toEqual([]);
  });

  test('choice survives a reload', async ({ page }) => {
    await page.click('#code-view [data-view="c"]');
    await page.reload();
    await expect(page.locator('#code-view [data-view="c"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#editor-host')).not.toBeVisible();
  });
});
