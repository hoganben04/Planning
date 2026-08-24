/* Ride mode in a real browser.

   The arithmetic is already covered in tests/ride.test.js, so these tests are
   about the things only a browser can be wrong about: that the marker actually
   moves, that it moves one way, that pause means pause, and that the arena is
   not being dragged about underneath the animation.

   Progress is read off the covered line's `stroke-dashoffset`, which counts down
   in metres from the length of the course. That is the number the animation
   itself sets, so if it moves, she can see it moving. */
const { test, expect } = require('playwright/test');
const H = require('./helpers.cjs');

async function enterRide(page, courseName) {
  await H.openApp(page);
  await H.openFirstCourse(page, courseName);
  await page.getByRole('button', { name: 'Ride', exact: true }).click();
  await page.waitForSelector('#arena [data-ride="marker"]');
}

/* How far she has left, in metres. */
async function remaining(page) {
  const v = await page.locator('#arena [data-ride="covered"]').getAttribute('stroke-dashoffset');
  return Number(v);
}

async function courseLength(page) {
  const v = await page.locator('#arena [data-ride="covered"]').getAttribute('pathLength');
  return Number(v);
}

async function markerTransform(page) {
  return page.locator('#arena [data-ride="marker"]').getAttribute('transform');
}

async function viewBox(page) {
  const box = await page.locator('#arena').getAttribute('viewBox');
  const [x, y, w, h] = box.split(' ').map(Number);
  return { x, y, w, h };
}

/* Set the scrub bar the way the browser does when she drags it. */
async function scrubTo(page, metres) {
  await page.locator('.ride__scrub').fill(String(metres));
  await page.waitForTimeout(80);
}

test('the ride starts at the beginning, with the whole course still ahead', async ({ page }) => {
  await enterRide(page);
  const L = await courseLength(page);
  expect(L).toBeGreaterThan(50);
  expect(await remaining(page)).toBeCloseTo(L, 1);
  await expect(page.locator('#readout')).toContainText('Coming to fence 1');
  await expect(page.locator('.ride__play')).toContainText('Ride');
  /* Every fence ring is drawn, and none of them is filled in yet. */
  await expect(page.locator('#arena [data-ride-fence]')).toHaveCount(7);
  expect(await page.locator('#arena [data-ride-fence][fill="none"]').count()).toBe(7);
  H.expectNoErrors(page);
});

test('pressing Ride moves the marker, and it only ever goes forward', async ({ page }) => {
  await enterRide(page);
  const before = await markerTransform(page);
  await page.locator('.ride__play').click();
  await expect(page.locator('.ride__play')).toContainText('Pause');

  const samples = [];
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(220);
    samples.push(await remaining(page));
  }
  for (let i = 1; i < samples.length; i++) {
    expect(samples[i], `sample ${i} of ${samples.join(', ')}`).toBeLessThanOrEqual(samples[i - 1]);
  }
  expect(samples[samples.length - 1]).toBeLessThan(samples[0] - 1);
  expect(await markerTransform(page)).not.toBe(before);
  H.expectNoErrors(page);
});

test('pause leaves her exactly where she was', async ({ page }) => {
  await enterRide(page);
  await page.locator('.ride__play').click();
  await page.waitForTimeout(400);
  await page.locator('.ride__play').click();
  await expect(page.locator('.ride__play')).toContainText('Ride');

  const stopped = await remaining(page);
  const where = await markerTransform(page);
  await page.waitForTimeout(500);
  expect(await remaining(page)).toBe(stopped);
  expect(await markerTransform(page)).toBe(where);
});

test('she counts the fences off as she jumps them', async ({ page }) => {
  await enterRide(page);
  await scrubTo(page, await courseLength(page));      /* all the way to the finish */
  expect(await remaining(page)).toBeCloseTo(0, 1);
  await expect(page.locator('#readout')).toContainText('clear round');
  expect(await page.locator('#arena [data-ride-fence][fill="none"]').count()).toBe(0);
});

test('it stops at the finish rather than running on out of the arena', async ({ page }) => {
  await enterRide(page);
  const L = await courseLength(page);
  await scrubTo(page, L - 4);
  await page.locator('.ride__play').click();
  await expect(page.locator('.ride__play')).toContainText('again', { timeout: 6000 });
  expect(await remaining(page)).toBeCloseTo(0, 1);
  /* And pressing it again starts the round over rather than sitting at the end. */
  await page.locator('.ride__play').click();
  await page.waitForTimeout(200);
  expect(await remaining(page)).toBeGreaterThan(L * 0.5);
});

test('Next and Back step from fence to fence, and the caption follows', async ({ page }) => {
  await enterRide(page);
  const settle = async () => page.waitForTimeout(1000);

  await page.getByRole('button', { name: 'On to the next fence' }).click();
  await settle();
  await expect(page.locator('#readout')).toContainText('1 → 2');

  await page.getByRole('button', { name: 'On to the next fence' }).click();
  await settle();
  await expect(page.locator('#readout')).toContainText('2 → 3');
  const atThree = await remaining(page);

  await page.getByRole('button', { name: 'Back to the fence before' }).click();
  await settle();
  await expect(page.locator('#readout')).toContainText('1 → 2');
  expect(await remaining(page)).toBeGreaterThan(atThree);
  H.expectNoErrors(page);
});

test('the scrub bar puts her where she asks, and the readout says where that is', async ({ page }) => {
  await enterRide(page);
  const L = await courseLength(page);
  await scrubTo(page, Math.round(L / 2));
  expect(await remaining(page)).toBeCloseTo(L - Math.round(L / 2), 0);
  const caption = await page.locator('#readout').textContent();
  expect(caption).toMatch(/\d+ → \d|Coming to fence|clear round|to the finish/);
  expect(await page.locator('.ride__clock').textContent()).toMatch(/\d+\.\ds \/ \d+s/);
});

test('zoom follows her round, and going back shows the whole arena again', async ({ page }) => {
  await enterRide(page);
  const whole = await viewBox(page);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.locator('.ride__play').click();
  await page.waitForTimeout(400);
  const near = await viewBox(page);
  expect(near.h).toBeLessThan(whole.h / 2);
  /* and it is centred on her, not on the arena */
  const marker = await markerTransform(page);
  const [mx, my] = marker.match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
  expect(mx).toBeGreaterThanOrEqual(near.x - 0.5);
  expect(mx).toBeLessThanOrEqual(near.x + near.w + 0.5);
  expect(my).toBeGreaterThanOrEqual(near.y - 0.5);
  expect(my).toBeLessThanOrEqual(near.y + near.h + 0.5);

  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.waitForTimeout(200);
  const back = await viewBox(page);
  expect(back.h).toBeCloseTo(whole.h, 1);
  expect(back.w).toBeCloseTo(whole.w, 1);
  H.expectNoErrors(page);
});

test('half speed takes longer to cover the same ground', async ({ page }) => {
  await enterRide(page);
  const L = await courseLength(page);

  await page.locator('.ride__play').click();
  await page.waitForTimeout(600);
  await page.locator('.ride__play').click();
  const atFull = L - await remaining(page);

  await scrubTo(page, 0);
  await page.getByRole('button', { name: '½×' }).click();
  await page.locator('.ride__play').click();
  await page.waitForTimeout(600);
  await page.locator('.ride__play').click();
  const atHalf = L - await remaining(page);

  expect(atHalf).toBeLessThan(atFull * 0.75);
});

test('the sound is off until she asks for it', async ({ page }) => {
  await enterRide(page);
  const button = page.getByRole('button', { name: /^Sound/ });
  await expect(button).toContainText('Sound off');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect(button).toContainText('Sound on');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.ride__play').click();
  await page.waitForTimeout(400);
  H.expectNoErrors(page);
});

test('the arena cannot be dragged about while she is riding', async ({ page, hasTouch }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  const before = await H.jumpAt(page, 0, 0);
  await page.getByRole('button', { name: 'Ride', exact: true }).click();
  await page.waitForSelector('#arena [data-ride="marker"]');

  const from = await H.clientOf(page, before.xM, before.yM);
  await H.drag(page, from, { x: from.x + 70, y: from.y + 40 }, hasTouch);

  const after = await H.jumpAt(page, 0, 0);
  expect(after.xM).toBe(before.xM);
  expect(after.yM).toBe(before.yM);
  H.expectNoErrors(page);
});

test('with nothing numbered it says so and points at Number mode', async ({ page }) => {
  await H.openApp(page);
  await page.getByRole('button', { name: '+ New' }).click();
  await page.getByRole('textbox', { name: 'New course' }).fill('Nothing numbered');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForSelector('.modebar');

  await page.getByRole('button', { name: 'Ride', exact: true }).click();
  await expect(page.locator('.sheetpanel__body')).toContainText('Nothing to ride yet');
  await expect(page.locator('#arena [data-ride="marker"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Number the fences' }).click();
  await expect(page.locator('.sheetpanel__body')).toContainText('Tap the fences on the arena');
  H.expectNoErrors(page);
});

test('leaving Ride mode puts the arena back the way it was', async ({ page }) => {
  await enterRide(page);
  const whole = await viewBox(page);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.locator('.ride__play').click();
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('#arena [data-ride="marker"]')).toHaveCount(0);
  const after = await viewBox(page);
  expect(after.w).toBeCloseTo(whole.w, 1);
  expect(after.h).toBeCloseTo(whole.h, 1);
  /* and the fences are draggable again */
  await expect(page.locator('#arena [data-jump]')).toHaveCount(7);
  H.expectNoErrors(page);
});
