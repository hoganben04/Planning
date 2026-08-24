/* The app was renamed from "Bee's" to "Bea's" after it had already shipped, so
   this checks the rename was genuinely cosmetic: the new name is visible, and
   anything she saved under the old build is still there. */
const { test, expect } = require('playwright/test');
const H = require('./helpers.cjs');

test('the app shows the corrected name', async ({ page }) => {
  await H.openApp(page);
  await expect(page).toHaveTitle(/Bea's Course Builder/);
  await expect(page.locator('.topbar__title')).toContainText("Bea's Course Builder");
  const manifest = await page.evaluate(async () => {
    const r = await fetch('./manifest.webmanifest');
    return await r.json();
  });
  expect(manifest.name).toBe("Bea's Course Builder");
  expect(manifest.short_name).toBe("Bea's Courses");
});

test('a course saved under the old name is still there after it', async ({ page }) => {
  /* Write a course into storage exactly as the shipped build did, under the key
     the shipped build used, then load the app fresh and look for it. If the
     rename had touched the storage key this would come back empty. */
  await page.goto('/?test=1');
  await page.waitForFunction(() => !!window.__bcb);
  /* Saving is debounced, so wait for the first write to land before editing it. */
  await page.waitForFunction(() => !!localStorage.getItem('bcb.db.v1'), null, { timeout: 5000 });

  await page.evaluate(() => {
    const before = JSON.parse(localStorage.getItem('bcb.db.v1'));
    before.app = 'bees-course-builder';           /* the old identifier */
    before.courses.unshift({
      id: 'crs_from_before', name: 'Saved before the rename',
      arena: { widthM: 20, lengthM: 60, name: '20 x 60m', indoor: false },
      levelId: 'pc80', horseId: before.horses[0] && before.horses[0].id,
      jumps: [{ id: 'j1', type: 'vertical', xM: 10, yM: 15, rotationDeg: 0,
                direction: 1, widthM: 3, spreadCm: 0, heightCm: 75, number: 1,
                element: null, filler: 'none', locked: false }],
      route: { mode: 'auto', points: [], startLine: null, finishLine: null },
      notes: '', createdAt: '2026-08-24T06:00:00.000Z', updatedAt: '2026-08-24T06:00:00.000Z'
    });
    localStorage.setItem('bcb.db.v1', JSON.stringify(before));
  });

  await page.reload();
  await page.waitForFunction(() => !!window.__bcb);
  await expect(page.getByText('Saved before the rename')).toBeVisible();

  /* And it still opens and measures, rather than merely appearing in the list. */
  await page.locator('.coursecard__name', { hasText: 'Saved before the rename' }).click();
  await expect(page.locator('#arena [data-jump]')).toHaveCount(1);
});

test('a backup exported under the old name still imports', async ({ page }) => {
  await H.openApp(page);
  const imported = await page.evaluate(() => {
    const oldBackup = JSON.stringify({
      app: 'bees-course-builder', schemaVersion: 1, exported: '2026-08-24T06:00:00.000Z',
      settings: {}, horses: [{ id: 'h_old', name: 'Bramble', typeId: 'pony-large' }],
      courses: [{ id: 'c_old', name: 'From an old backup', jumps: [] }]
    });
    const store = window.bcbStore.createStore({ storage: null });
    store.importJson(oldBackup, 'replace');
    return {
      courses: store.db.courses.map(c => c.name),
      horses: store.db.horses.map(h => h.name)
    };
  });
  expect(imported.courses).toContain('From an old backup');
  expect(imported.horses).toContain('Bramble');
});

test('the printed course sheet carries the corrected name', async ({ page }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  await page.locator('.iconbtn--primary', { hasText: 'Share' }).click();
  await page.locator('.row', { hasText: 'Print a course sheet' }).click();
  await page.waitForTimeout(300);
  await expect(page.locator('#sheet')).toContainText("Bea's Course Builder");
});

test('the landing page carries the corrected name', async ({ page }) => {
  await page.goto('/about.html');
  await expect(page).toHaveTitle(/Bea's Course Builder/);
  await expect(page.locator('h1')).toHaveText("Bea's Course Builder");
});
