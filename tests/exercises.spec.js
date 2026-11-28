// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Exercise grading', () => {
  test('every starter fails its check and every solution passes', async ({ page }) => {
    await page.goto('/');
    const rows = await page.evaluate(() => LESSONS.map(l => {
      const e = l.exercise;
      let sol = e.solution;
      // Lesson 12's solution is a snippet to splice in after the max loop.
      if (l.id === 12) sol = l.code.replace(/(loop\s+max_loop[^\n]*\n)/, '$1' + sol.split('\n').slice(2).join('\n') + '\n');
      const starter = gradeExercise(e, { code: l.code, answer: '' });
      const solved = e.answer !== undefined ? gradeExercise(e, { answer: String(e.answer) }) : gradeExercise(e, { code: sol });
      return { id: l.id, starter: starter?.pass, solved: solved?.pass, msg: solved?.msg };
    }));
    for (const r of rows) {
      expect(r.starter, `lesson ${r.id} starter should fail`).toBe(false);
      expect(r.solved, `lesson ${r.id} solution: ${r.msg}`).toBe(true);
    }
  });

  test('Check button fails the starter, passes the solution, ticks the tab', async ({ page }) => {
    await page.goto('/');
    await page.click('#check-btn');
    await expect(page.locator('#exercise-result')).toHaveClass('fail');
    await expect(page.locator('#exercise-result')).toContainText('expected 100');

    await page.evaluate(() => window.cmEditor.setValue(LESSONS[0].exercise.solution));
    await page.click('#check-btn');
    await expect(page.locator('#exercise-result')).toHaveClass('pass');
    await expect(page.locator('.tab-btn').first()).toHaveClass(/done/);
    await expect(page.locator('.lesson-progress')).toHaveText('1/16 done');
  });

  test('answer-type exercise takes a typed number', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn').nth(14).click();
    await expect(page.locator('#answer-wrap')).toBeVisible();
    await page.fill('#answer-input', '0x90');
    await page.press('#answer-input', 'Enter');
    await expect(page.locator('#exercise-result')).toHaveClass('fail');
    await page.fill('#answer-input', '0x91');
    await page.click('#check-btn');
    await expect(page.locator('#exercise-result')).toHaveClass('pass');
  });

  test('progress and last lesson survive a reload', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tab-btn').nth(14).click();
    await page.fill('#answer-input', '145');
    await page.click('#check-btn');
    await page.reload();
    await expect(page.locator('.tab-btn.active')).toContainText('15 · Shellcode');
    await expect(page.locator('.tab-btn').nth(14)).toHaveClass(/done/);
  });
});
