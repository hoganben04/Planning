/* The app has to work in a field with no signal, so this is the test that
   matters most after the distance maths. */
const { test, expect } = require('playwright/test');
const H = require('./helpers.cjs');

test('the app opens and works with the network off', async ({ page }) => {
  await H.openApp(page);

  /* Wait for the worker to actually be in charge, not merely registered. Going
     offline before it controls the page tests nothing. */
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return !!navigator.serviceWorker.controller;
  }, null, { timeout: 15000 });

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names[0]);
    return (await cache.keys()).length;
  });
  expect(cached, 'files precached').toBeGreaterThan(20);

  await page.context().setOffline(true);
  const response = await page.reload();
  expect(response.status()).toBe(200);
  await page.waitForFunction(() => !!window.__bcb);
  await expect(page.locator('.coursecard')).toHaveCount(2);

  /* And the editor, which is where she will actually be. */
  await page.locator('.coursecard__name', { hasText: 'First course' }).click();
  await expect(page.locator('#arena [data-jump]')).toHaveCount(7);
  await page.context().setOffline(false);
});

test('a course saved offline is still there afterwards', async ({ page }) => {
  await H.openApp(page);
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return !!navigator.serviceWorker.controller;
  }, null, { timeout: 15000 });

  await page.context().setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!window.__bcb);
  await page.locator('.coursecard__name', { hasText: 'First course' }).click();
  await page.waitForSelector('#arena [data-jump]');
  await page.locator('.chip', { hasText: 'Wall' }).first().click();
  await expect(page.locator('#arena [data-jump]')).toHaveCount(8);

  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => !!window.__bcb);
  const course = await H.courseNamed(page, 'First course');
  expect(course.jumps.length).toBe(8);
  await page.context().setOffline(false);
});
