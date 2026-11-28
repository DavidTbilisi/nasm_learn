// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');

const PROG = `section .data
    msg db 'Hi', 0

section .text
global _start
_start:
    mov eax, 1
    mov ebx, 2
    mov byte [msg], 'Y'
    mov ecx, 3
    hlt`;

async function load(page, code) {
  await page.goto('/');
  await page.evaluate(c => window.cmEditor.setValue(c), code);
}

const gutterLine = (page, n) => page.locator('#editor-host .CodeMirror-linenumber', { hasText: new RegExp(`^${n}$`) });

test.describe('Breakpoints', () => {
  test('Run stops before a marked line, Run again continues to the end', async ({ page }) => {
    await load(page, PROG);
    await gutterLine(page, 9).click();               // mov byte [msg], 'Y'
    await expect(page.locator('#editor-host .bp-marker')).toHaveCount(1);

    await page.click('#btn-run');
    await expect(page.locator('#step-counter')).toHaveText('Step 3 / 5');
    expect(await page.evaluate(() => window.cmEditor.lineInfo(8).bgClass)).toContain('cm-active-step');
    await expect(page.locator('#step-log')).toContainText('breakpoint, line 9');

    await page.click('#btn-run');
    await expect(page.locator('#step-counter')).toHaveText('Step 5 / 5');
    await expect(page.locator('#reg-table')).toContainText('0x00000003');
  });

  test('clicking the marker again removes it', async ({ page }) => {
    await load(page, PROG);
    await gutterLine(page, 9).click();
    await gutterLine(page, 9).click();
    await expect(page.locator('#editor-host .bp-marker')).toHaveCount(0);
    await page.click('#btn-run');
    await expect(page.locator('#step-counter')).toHaveText('Step 5 / 5');
  });
});

test.describe('Memory window', () => {
  test('shows .data bytes with their label and highlights the byte a step changed', async ({ page }) => {
    await load(page, PROG);
    await expect(page.locator('#mem-panel')).toContainText('Run or Step');
    await page.click('#btn-run');
    const row = page.locator('#mem-panel .mem-row').first();
    await expect(row).toContainText('0x4000');
    await expect(row).toContainText('msg');
    await expect(row.locator('.mem-byte')).toHaveText(['59', '69', '00', '00', '00', '00', '00', '00']);   // 'Y' 'i' NUL
    await expect(row.locator('.mem-byte.changed')).toHaveCount(0);   // last step (hlt) changed nothing

    await page.click('#btn-reset');
    for (let i = 0; i < 4; i++) await page.click('#btn-step');      // show state after the store ran
    await expect(page.locator('#mem-panel .mem-byte.changed')).toHaveText('59');
  });
});

test.describe('New instructions in the browser', () => {
  test('3D view builds phases for movzx/movsx/adc/sbb/leave/enter/setcc/cmovcc/jecxz', async ({ page }) => {
    await page.goto('/');
    const n = await page.evaluate(() => {
      const code = `section .text
_start:
    mov eax, -5
    movzx ebx, al
    movsx ecx, al
    add eax, 10
    adc edx, 0
    sbb edx, 0
    enter 8, 0
    leave
    cmp ebx, ecx
    setl al
    cmovg esi, ebx
    xor ecx, ecx
    jecxz done
    nop
done:
    hlt`;
      const run = new NASMSimulator().runAll(code);
      if (run.history.some(h => h.error)) throw new Error(run.history.find(h => h.error).error);
      run.history.forEach((_, k) => Cpu3D.phases(run, k));
      return run.history.length;
    });
    expect(n).toBe(14);   // jecxz skips the nop
  });
});

test.describe('Playground debugger', () => {
  test('breakpoints and memory window work in the Playground too', async ({ page }) => {
    await page.goto('/');
    await page.click('.playground-tab');
    await page.locator('#pg-editor-host .CodeMirror-linenumber', { hasText: /^8$/ }).click();   // add eax, ebx
    await page.click('#pg-btn-run');
    await expect(page.locator('#pg-step-counter')).toHaveText('Step 3 / 6');
    await expect(page.locator('#pg-step-log')).toContainText('breakpoint, line 8');
    await expect(page.locator('#pg-mem-panel')).toContainText('Run or Step');   // snippet has an empty .data
  });
});

test.describe('64-bit mode', () => {
  test('lesson 16 runs as x86-64: 16 registers, syscall output, 8-byte stack slots', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn').nth(15).click();
    await expect(page.locator('#lesson-title')).toContainText('x86-64');
    await expect(page.locator('#reg-table tr')).toHaveCount(16);       // blank state already 64-bit

    await page.click('#btn-run');
    await expect(page.locator('#output-panel')).toContainText('Hi from x86-64');
    await expect(page.locator('#output-panel')).toContainText('exited with code 0');
    const row = name => page.locator('#reg-table tr', { has: page.locator('.reg-name', { hasText: new RegExp(`^${name}$`) }) });
    await expect(row('RBX')).toContainText('0xFFFFFFFFFFFF0002');
    await expect(row('R12')).toContainText('0x000000000000002A');

    // Step into add3: the return address sits in one 8-byte slot below 0x2000.
    await page.click('#btn-reset');
    for (let i = 0; i < 9; i++) await page.click('#btn-step');   // shows state before lea rax, [rdi+rsi]
    await expect(page.locator('#stack-panel')).toContainText('0x1FF8');
    await expect(page.locator('#stack-panel')).toContainText('← RSP');
  });

  test('3D view shows a 32-bit-only notice for a bits 64 program', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn').nth(15).click();
    await page.click('#code-view [data-view="cpu"]');
    await page.click('#btn-step');
    await page.click('#btn-step');
    await expect(page.locator('#cpu-pane .xp-title')).toHaveText('32-bit only');
  });

  test('int 0x80 in 64-bit code explains the syscall gate', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.cmEditor.setValue('bits 64\nsection .text\n_start:\n    mov eax, 1\n    int 0x80'));
    await page.click('#btn-run');
    await expect(page.locator('#error-banner')).toContainText('use syscall');
  });
});
