/* Does the app actually work in a browser?

   The unit tests prove the arithmetic. These prove the thing a person opens: the
   readings arrive, the card says the right words, a threshold going produces a
   red card rather than a console error, and a failed fetch leaves the last known
   numbers on screen instead of blanking them.

   The Environment Agency is stubbed in every test — see helpers.cjs. */
const { test, expect } = require('playwright/test');
const H = require('./helpers.cjs');

test('the gauge it ships with loads, and the readings appear', async ({ page }) => {
  /* The night that prompted this app: 2.23mm then 3.32mm, then it stopped. */
  await H.stubEa(page, {
    E9660: { readings: H.rainfallPayload([0, 0, 2.23, 3.32, 0.02, 0.07, 0.01]) }
  });
  const errors = await H.openApp(page);
  await H.waitForCheck(page);

  const card = page.locator('.card').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.card-name')).toHaveText('E9660');
  await expect(card.locator('.card-sub')).toContainText('rain gauge');

  /* 5.65mm in total, and the app is asked for it in a window that holds it all. */
  await expect(card.locator('.tile', { hasText: 'in 6 hours' }).locator('.tile-value'))
    .toContainText('5.7');

  await expect(card.locator('.peak')).toContainText('3.32mm');
  await expect(card.locator('.peak')).toContainText('13.3mm/h');
  await expect(card.locator('.peak')).toContainText('heavy');
  await expect(card.locator('.now')).toContainText('Dry');
  await expect(card.locator('.pill-quiet').first()).toHaveText('Nothing doing');

  /* Five bars, and the rest of the window drawn as gaps rather than as dry. */
  expect(await card.locator('.rm-bar').count()).toBe(5);
  expect(await card.locator('.rm-gap').count()).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('a wet quarter of an hour reads as raining now', async ({ page }) => {
  await H.stubEa(page, { E9660: { readings: H.rainfallPayload([0, 0, 1.2, 2.4]) } });
  await H.openApp(page);
  await H.waitForCheck(page);
  await expect(page.locator('.now')).toContainText('Raining');
  await expect(page.locator('.now')).toContainText('9.6mm/h');
});

test('an hour past the alert mark turns the card red and says which mark went', async ({ page }) => {
  /* 6mm every quarter of an hour is 24mm in the hour, past the 20mm default. */
  await H.stubEa(page, { E9660: { readings: H.rainfallPayload([0, 0, 6, 6, 6, 6]) } });
  const errors = await H.openApp(page);
  await H.waitForCheck(page);

  const card = page.locator('.card').first();
  await expect(card).toHaveClass(/card-alert/);
  await expect(card.locator('.pill-alert').first()).toHaveText('Go and look');
  await expect(card.locator('.reason-alert').first()).toContainText('in an hour');
  await expect(card.locator('.reason-alert').first()).toContainText('20mm mark');
  /* And the same warning is summarised at the top of the screen. */
  await expect(page.locator('.topbar .pill-alert')).toHaveText('Go and look');
  expect(errors).toEqual([]);
});

test('changing a mark re-judges what is already on screen', async ({ page }) => {
  await H.stubEa(page, { E9660: { readings: H.rainfallPayload([0, 0, 3, 3, 3, 3]) } });
  await H.openApp(page);
  await H.waitForCheck(page);
  /* 12mm in the hour: past the 10mm watch, short of the 20mm alert. */
  await expect(page.locator('.card').first()).toHaveClass(/card-watch/);

  await page.locator('[data-action="settings"]').click();
  const watch = page.locator('input[data-field="watchMm"][data-index="0"]');
  await watch.fill('15');
  await watch.blur();

  /* No refetch: the same readings, judged against the new mark. */
  await expect(page.locator('.card').first()).toHaveClass(/card-quiet/);
  await expect(page.locator('.reason')).toHaveCount(0);
});

test('a gauge that has gone quiet says so rather than looking dry', async ({ page }) => {
  /* Readings that stop eight hours before the frozen now. */
  const stale = H.rainfallPayload([1, 1, 1, 1], { now: H.FIXED_NOW - 8 * 3600000 });
  await H.stubEa(page, { E9660: { readings: stale } });
  await H.openApp(page);
  await H.waitForCheck(page);

  const card = page.locator('.card').first();
  await expect(card).toHaveClass(/card-watch/);
  await expect(card.locator('.reason-watch').first()).toContainText('nothing from this gauge');
  await expect(card.locator('.card-status .pill-watch, .card-status .pill-alert').last())
    .toContainText('out of date');
});

test('a total worked out from a patchy window says how patchy', async ({ page }) => {
  /* One hour of readings, judged over 24. */
  await H.stubEa(page, { E9660: { readings: H.rainfallPayload([1, 1, 1, 1]) } });
  await H.openApp(page);
  await H.waitForCheck(page);
  const day = page.locator('.tile', { hasText: 'in 24 hours' });
  await expect(day.locator('.tile-note')).toContainText('% of the window');
});

test('when the Environment Agency cannot be reached, the last known readings stay on screen', async ({ page }) => {
  await H.stubEa(page, { E9660: { readings: H.rainfallPayload([0, 0, 2.23, 3.32]) } });
  await H.openApp(page);
  await H.waitForCheck(page);
  await expect(page.locator('.tile', { hasText: 'in 6 hours' }).locator('.tile-value'))
    .toContainText('5.5');

  /* Now take the EA away and reload: the numbers must survive, with their age. */
  await page.unrouteAll();
  await H.stubEa(page, { E9660: 'fail' });
  await page.reload();
  await page.waitForFunction(() => !!window.rmApp);

  const card = page.locator('.card').first();
  await expect(card.locator('.error')).toContainText('Could not reach the Environment Agency');
  await expect(card.locator('.error')).toContainText('Showing what was saved');
  await expect(card.locator('.tile', { hasText: 'in 6 hours' }).locator('.tile-value'))
    .toContainText('5.5');
});

test('a station id the Environment Agency does not have is reported as such', async ({ page }) => {
  await H.stubEa(page, { E9660: 'missing' });
  await H.openApp(page);
  await H.waitForCheck(page);
  await expect(page.locator('.card .error')).toContainText('no station with that id');
});

test('a gauge can be named, added and removed, and it is remembered', async ({ page }) => {
  await H.stubEa(page, {
    E9660: { readings: H.rainfallPayload([0, 1, 2]) },
    '52203': { readings: H.rainfallPayload([0, 0, 0.4], { station: '52203' }) }
  });
  await H.openApp(page);
  await H.waitForCheck(page);

  await page.locator('[data-action="settings"]').click();
  await page.locator('input[data-field="label"][data-index="0"]').fill('Top field');
  await page.locator('#add-id').fill('52203');
  await page.locator('[data-action="add-station"]').click();
  await H.waitForCheck(page);

  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.card-name').first()).toHaveText('Top field');

  /* Reload: both the name and the second gauge come back. */
  await page.reload();
  await page.waitForFunction(() => !!window.rmApp);
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.card-name').first()).toHaveText('Top field');

  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-action="remove-station"][data-index="1"]').click();
  await expect(page.locator('.card')).toHaveCount(1);
});

test('a rubbish station id is refused rather than added', async ({ page }) => {
  await H.stubEa(page, { E9660: { readings: H.rainfallPayload([0, 1]) } });
  await H.openApp(page);
  await H.waitForCheck(page);
  await page.locator('[data-action="settings"]').click();
  await page.locator('#add-id').fill('not a station!!');
  await page.locator('[data-action="add-station"]').click();
  await expect(page.locator('#add-id')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.card')).toHaveCount(1);
});

test('a river level gauge shows its height, its trend and its normal range', async ({ page }) => {
  await H.stubEa(page, {
    E9660: { readings: H.rainfallPayload([0, 0, 1]) },
    L2404: {
      readings: H.levelPayload([0.50, 0.58, 0.66, 0.74, 0.84]),
      station: H.stationPayload()
    }
  });
  await H.openApp(page);
  await H.waitForCheck(page);

  await page.locator('[data-action="settings"]').click();
  await page.locator('#add-id').fill('L2404');
  await page.locator('#add-kind').selectOption('level');
  await page.locator('[data-action="add-station"]').click();
  await H.waitForCheck(page);

  const card = page.locator('.card[data-kind="level"]');
  await expect(card).toBeVisible();
  await expect(card.locator('.card-name')).toHaveText('Adur at Beeding Bridge');
  await expect(card.locator('.now')).toContainText('0.84m');
  await expect(card.locator('.now')).toContainText('rising');
  await expect(card.locator('.soft').first()).toContainText('0.15m to 2.10m');
  await expect(card.locator('.rm-line')).toHaveCount(1);
  await expect(card.locator('.rm-band')).toHaveCount(1);
});

test('a level mark can be set, and it warns', async ({ page }) => {
  await H.stubEa(page, {
    E9660: { readings: H.rainfallPayload([0, 0, 1]) },
    L2404: {
      readings: H.levelPayload([1.20, 1.20, 1.20, 1.20]),
      station: H.stationPayload()
    }
  });
  await H.openApp(page);
  await H.waitForCheck(page);
  await page.locator('[data-action="settings"]').click();
  await page.locator('#add-id').fill('L2404');
  await page.locator('#add-kind').selectOption('level');
  await page.locator('[data-action="add-station"]').click();
  await H.waitForCheck(page);

  /* The settings panel is still open from adding the gauge, so the marks for it
     are already on screen. */
  const alert = page.locator('input[data-field="alertM"][data-index="1"]');
  await alert.fill('1.0');
  await alert.blur();
  const card = page.locator('.card[data-kind="level"]');
  await expect(card).toHaveClass(/card-alert/);
  await expect(card.locator('.reason-alert')).toContainText('1.00m mark');
});

test('the chart window can be changed, and it is remembered', async ({ page }) => {
  await H.stubEa(page, { E9660: { readings: H.rainfallPayload([0, 0, 1, 2, 3]) } });
  await H.openApp(page);
  await H.waitForCheck(page);

  const sixHour = page.locator('.chip[data-hours="6"]');
  await expect(page.locator('.chip[data-hours="24"]')).toHaveAttribute('aria-pressed', 'true');
  await sixHour.click();
  await expect(page.locator('.chip[data-hours="6"]')).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await page.waitForFunction(() => !!window.rmApp);
  await expect(page.locator('.chip[data-hours="6"]')).toHaveAttribute('aria-pressed', 'true');
});

test('nothing is sent anywhere except the Environment Agency', async ({ page }) => {
  /* The whole privacy claim in the README rests on this. */
  const other = [];
  await page.route('**', route => {
    const url = route.request().url();
    if (!/127\.0\.0\.1|localhost|environment\.data\.gov\.uk/.test(url)) other.push(url);
    return route.continue();
  });
  await H.stubEa(page, { E9660: { readings: H.rainfallPayload([0, 1]) } });
  await H.openApp(page);
  await H.waitForCheck(page);
  expect(other).toEqual([]);
});

test('the page says plainly that it is not a flood warning', async ({ page }) => {
  await H.stubEa(page, { E9660: { readings: H.rainfallPayload([0, 1]) } });
  await H.openApp(page);
  await expect(page.locator('.credit')).toContainText('not a flood warning');
  await expect(page.locator('.credit a[href*="check-for-flooding"]')).toBeVisible();
  await expect(page.locator('.credit')).toContainText('Open Government Licence');
});
