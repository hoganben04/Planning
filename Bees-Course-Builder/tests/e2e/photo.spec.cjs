/* Photos of horses. The shrinking needs a real browser (canvas), so it is tested
   here rather than in node. */
const { test, expect } = require('playwright/test');
const H = require('./helpers.cjs');

/* A deliberately awkward source image: big, and not square, so the crop and the
   downscale both have work to do. */
async function pickAPhoto(page, { width = 1600, height = 1000 } = {}) {
  const dataUri = await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const grad = x.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#8A6A46'); grad.addColorStop(1, '#F3E7D3');
    x.fillStyle = grad; x.fillRect(0, 0, w, h);
    x.fillStyle = '#D6337E';
    x.beginPath(); x.arc(w / 2, h / 2, Math.min(w, h) / 3, 0, Math.PI * 2); x.fill();
    return c.toDataURL('image/png');
  }, [width, height]);

  const buffer = Buffer.from(dataUri.split(',')[1], 'base64');
  await page.locator('#horse-photo-input').setInputFiles({
    name: 'pony.png', mimeType: 'image/png', buffer
  });
  return buffer.length;
}

test('a photo can be added to a horse, and is shrunk to fit storage', async ({ page }) => {
  await H.openApp(page, '/horses');
  await page.locator('.row').first().click();
  await expect(page.locator('#view')).toContainText('Add a photo');

  const originalBytes = await pickAPhoto(page);
  await expect(page.locator('.photorow img.avatar')).toBeVisible({ timeout: 10000 });

  const horse = await page.evaluate(() => window.__bcb.state().horses[0]);
  expect(horse.photo).toMatch(/^data:image\/jpeg;base64,/);

  /* It must be far smaller than the original, and inside the cap, or one photo
     would eat the whole storage budget. */
  const kept = await page.evaluate(p => window.bcbPhoto.byteLength(p), horse.photo);
  expect(kept).toBeLessThan(120 * 1024);
  expect(kept).toBeLessThan(originalBytes);

  /* And square, at or under the maximum edge. */
  const dims = await page.evaluate(src => new Promise(res => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.src = src;
  }), horse.photo);
  expect(dims.w).toBe(dims.h);
  expect(dims.w).toBeLessThanOrEqual(480);
});

test('the photo shows on the horses list and survives a reload', async ({ page }) => {
  await H.openApp(page, '/horses');
  await page.locator('.row').first().click();
  await pickAPhoto(page);
  await expect(page.locator('.photorow img.avatar')).toBeVisible({ timeout: 10000 });

  await page.waitForTimeout(500);
  await page.goto('/?test=1#/horses');
  await page.waitForFunction(() => !!window.__bcb);
  await expect(page.locator('.rowlist img.avatar').first()).toBeVisible();

  await page.reload();
  await page.waitForFunction(() => !!window.__bcb);
  const horse = await page.evaluate(() => window.__bcb.state().horses[0]);
  expect(horse.photo).toMatch(/^data:image\/jpeg/);
});

test('a horse with no photo gets a letter disc, not a gap', async ({ page }) => {
  await H.openApp(page, '/horses');
  await expect(page.locator('.rowlist .avatar--letter').first()).toBeVisible();
  const letter = await page.locator('.rowlist .avatar--letter').first().textContent();
  expect(letter).toBe('M');   /* "My pony" */
});

test('a photo can be removed again', async ({ page }) => {
  await H.openApp(page, '/horses');
  await page.locator('.row').first().click();
  await pickAPhoto(page);
  await expect(page.locator('.photorow img.avatar')).toBeVisible({ timeout: 10000 });
  await page.locator('.iconbtn', { hasText: 'Remove' }).click();
  await page.locator('.modal__actions button', { hasText: 'Remove' }).click();
  await expect(page.locator('.photorow .avatar--letter')).toBeVisible();
  const horse = await page.evaluate(() => window.__bcb.state().horses[0]);
  expect(horse.photo).toBeNull();
});

test('a photo goes into the backup and comes back out', async ({ page }) => {
  await H.openApp(page, '/horses');
  await page.locator('.row').first().click();
  await pickAPhoto(page);
  await expect(page.locator('.photorow img.avatar')).toBeVisible({ timeout: 10000 });

  const json = await page.evaluate(() => window.__bcb.store.exportJson());
  expect(json).toContain('data:image/jpeg;base64,');

  /* A fresh start, then load the backup: the photo should return. */
  const restored = await page.evaluate(text => {
    const store = window.bcbStore.createStore({ storage: null });
    store.importJson(text, 'replace');
    return store.db.horses[0].photo;
  }, json);
  expect(restored).toMatch(/^data:image\/jpeg;base64,/);
});

test('a rogue photo in a backup is dropped rather than trusted', async ({ page }) => {
  await H.openApp(page);
  const result = await page.evaluate(() => {
    const S = window.bcbStore;
    const nasty = S.repairHorse({ name: 'Nasty', photo: 'javascript:alert(1)' });
    const huge = S.repairHorse({ name: 'Huge', photo: 'data:image/png;base64,' + 'A'.repeat(500 * 1024) });
    const fine = S.repairHorse({ name: 'Fine', photo: 'data:image/jpeg;base64,AAAA' });
    return { nasty: nasty.photo, huge: huge.photo, fine: fine.photo };
  });
  expect(result.nasty).toBeNull();
  expect(result.huge).toBeNull();
  expect(result.fine).toBe('data:image/jpeg;base64,AAAA');
});
