const { test, expect } = require('playwright/test');
const H = require('./helpers.cjs');

test('the library opens with the two example courses and no errors', async ({ page }) => {
  await H.openApp(page);
  await expect(page.locator('.coursecard')).toHaveCount(2);
  await expect(page.locator('.coursecard__name').first()).toBeVisible();
  await expect(page.getByText('First course')).toBeVisible();
  H.expectNoErrors(page);
});

test('the example course is clean, so a new user is not taught wrong', async ({ page }) => {
  await H.openApp(page);
  const course = await H.courseNamed(page, 'First course');
  const check = await page.evaluate(id => window.__bcb.check(id), course.id);
  expect(check.summary.errors).toBe(0);
  expect(check.summary.warnings).toBe(0);
  expect(check.summary.efforts).toBe(7);
  expect(check.summary.combinations).toBe(1);
});

test('the editor draws every fence and the ridden line', async ({ page }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  await expect(page.locator('#arena [data-jump]')).toHaveCount(7);
  await expect(page.locator('#arena [data-layer="track"] path').first()).toBeVisible();
  /* the arena is drawn to scale: the viewBox covers the arena plus a surround */
  const box = await page.locator('#arena').getAttribute('viewBox');
  const [x, y, w, hh] = box.split(' ').map(Number);
  expect(w).toBeGreaterThan(20);
  expect(hh).toBeGreaterThan(60);
  H.expectNoErrors(page);
});

test('the readout says what the course is', async ({ page }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  const readout = await page.locator('#readout').textContent();
  expect(readout).toMatch(/7 efforts/);
  expect(readout).toMatch(/My pony/);
  expect(readout).toMatch(/\d+m/);
});

test('tapping a fence opens it, and the distances either side are shown', async ({ page }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  await page.locator('#arena [data-jump]').nth(2).click();
  const panel = page.locator('.sheetpanel__body');
  await expect(panel).toContainText('Distances');
  await expect(panel).toContainText('Height');
  await expect(panel).toContainText('Which way round');
  /* The panel carries the detail once it is open, so the floating readout gets
     out of the way rather than covering the arena. */
  await expect(page.locator('.editor')).toHaveAttribute('data-panel', 'full');
  await expect(page.locator('#readout')).toBeHidden();
});

test('dragging a fence moves it and re-measures', async ({ page, hasTouch }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  const before = await H.courseNamed(page, 'First course');
  const first = before.jumps[0];

  const from = await H.clientOf(page, first.xM, first.yM);
  const to = await H.clientOf(page, first.xM + 5, first.yM + 3);
  await H.drag(page, from, to, hasTouch);

  const after = await H.courseNamed(page, 'First course');
  const moved = after.jumps.find(j => j.id === first.id);
  /* It lands near where it was dropped, but not necessarily exactly there: the
     snap pulls a fence onto a true stride distance from its neighbour, which is
     the whole point. So allow for that and assert the direction and rough size
     of the move instead. */
  const travelled = Math.hypot(moved.xM - first.xM, moved.yM - first.yM);
  const missedBy = Math.hypot(moved.xM - (first.xM + 5), moved.yM - (first.yM + 3));
  expect(travelled).toBeGreaterThan(3);
  expect(missedBy).toBeLessThan(3.5);
  H.expectNoErrors(page);
});

test('dropping a fence near a true distance snaps it exactly onto one', async ({ page, hasTouch }) => {
  await H.openApp(page);
  /* A clean two-fence course, so nothing else is competing for the snap. */
  const ids = await page.evaluate(() => {
    const store = window.__bcb.store;
    const C = window.bcbCourse;
    const course = store.addCourse({ name: 'Snap test', levelId: 'pc80' });
    course.jumps = [
      C.newJump({ type: 'vertical', xM: 10, yM: 12, heightCm: 75, number: 1 }),
      C.newJump({ type: 'vertical', xM: 10, yM: 40, heightCm: 75, number: 2 })
    ];
    store.saveCourse(course);
    return { course: course.id, a: course.jumps[0].id, b: course.jumps[1].id };
  });
  await page.goto(`/?test=1#/course/${ids.course}`);
  await page.waitForSelector('#arena [data-jump]');

  /* A large pony strides 3.2m, so a true four strides is 16.0m. Aim fence 2 at
     0.7m past that and it should be pulled back onto the true distance. */
  const from = await H.clientOf(page, 10, 40);
  const to = await H.clientOf(page, 10, 12 + 16.0 + 0.7);
  await H.drag(page, from, to, hasTouch);

  const check = await page.evaluate(id => window.__bcb.check(id), ids.course);
  const leg = check.legs.find(l => l.fromId === ids.a && l.toId === ids.b);
  expect(leg, 'the leg between the two fences').toBeTruthy();
  expect(leg.strides).toBe(4);
  expect(leg.verdict).toBe('true');
});

test('a fence cannot be dragged out of the arena', async ({ page, hasTouch }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  const before = await H.courseNamed(page, 'First course');
  const first = before.jumps[0];
  const from = await H.clientOf(page, first.xM, first.yM);
  const to = await H.clientOf(page, -30, -30);
  await H.drag(page, from, to, hasTouch);
  const after = await H.courseNamed(page, 'First course');
  const moved = after.jumps.find(j => j.id === first.id);
  expect(moved.xM).toBeGreaterThanOrEqual(0);
  expect(moved.yM).toBeGreaterThanOrEqual(0);
  expect(moved.xM).toBeLessThanOrEqual(after.arena.widthM);
});

test('adding a jump from the palette puts it in the arena', async ({ page }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  await expect(page.locator('#arena [data-jump]')).toHaveCount(7);
  await page.locator('.chip', { hasText: 'Wall' }).first().click();
  await expect(page.locator('#arena [data-jump]')).toHaveCount(8);
  /* it arrives selected, with its own panel open */
  await expect(page.locator('.sheetpanel__body')).toContainText('Kind of fence');
});

test('the check panel lists the distances and the time allowed', async ({ page }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  await page.locator('.modebar .seg button', { hasText: 'Check' }).click();
  const panel = page.locator('.sheetpanel__body');
  await expect(panel).toContainText('time allowed');
  await expect(panel).toContainText('Every distance');
  await expect(panel).toContainText('Worked out for My pony');
  /* No errors and no warnings, but it does note that seven efforts is short for
     a PC80 course — which is the checker doing its job. */
  await expect(panel).toContainText('usually has 8 to 12');
  await expect(page.locator('.issue--error')).toHaveCount(0);
  await expect(page.locator('.issue--warn')).toHaveCount(0);
  /* one row per leg */
  await expect(page.locator('.legtable tbody tr')).toHaveCount(6);
});

test('a bad distance is reported as an error with a fix that works', async ({ page, hasTouch }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  const before = await H.courseNamed(page, 'First course');
  /* Shove fence 2 to a spot that falls between strides. */
  const f2 = before.jumps[1];
  const from = await H.clientOf(page, f2.xM, f2.yM);
  const to = await H.clientOf(page, f2.xM, f2.yM - 1.6);
  await H.drag(page, from, to, hasTouch);

  await page.locator('.modebar .seg button', { hasText: 'Check' }).click();
  const issues = page.locator('.issue');
  expect(await issues.count()).toBeGreaterThan(0);

  /* If the app offered a fix, taking it must make the distance true. */
  const fix = page.locator('.issue__fix').first();
  if (await fix.count()) {
    await fix.click();
    const course = await H.courseNamed(page, 'First course');
    const check = await page.evaluate(id => window.__bcb.check(id), course.id);
    const bad = check.legs.filter(l => l.severity === 'error');
    expect(bad.length).toBe(0);
  }
  H.expectNoErrors(page);
});

test('numbering the fences sets the route and makes a double', async ({ page }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  await page.locator('.modebar .seg button', { hasText: 'Number' }).click();
  await expect(page.locator('.sheetpanel__body')).toContainText('order you will jump them');

  await page.locator('.iconbtn', { hasText: 'number them down the arena' }).click();
  await expect(page.locator('.sheetpanel__body .row')).not.toHaveCount(0);
  await page.locator('.iconbtn', { hasText: 'Save this route' }).click();

  const course = await H.courseNamed(page, 'First course');
  const check = await page.evaluate(id => window.__bcb.check(id), course.id);
  expect(check.summary.efforts).toBe(7);
  /* the two fences a stride apart must have become one obstacle, A and B */
  const lettered = course.jumps.filter(j => j.element);
  expect(lettered.length).toBeGreaterThanOrEqual(2);
  expect(check.summary.obstacles).toBeLessThan(check.summary.efforts);
});

test('changing the horse changes every distance', async ({ page }) => {
  await H.openApp(page);
  /* Add a horse with a much longer stride, and point the course at it. */
  const id = await page.evaluate(() => {
    const store = window.__bcb.store;
    const horse = store.addHorse({ name: 'Big Rufus', typeId: 'horse-large' });
    const course = store.db.courses.find(c => c.name === 'First course');
    course.horseId = horse.id;
    store.touchCourse(course);
    return course.id;
  });
  const forHorse = await page.evaluate(i => window.__bcb.check(i), id);
  expect(forHorse.summary.horseName).toBe('Big Rufus');
  expect(forHorse.summary.strideM).toBeGreaterThan(3.5);
  /* Distances that were true for a 3.2m pony stride cannot all be true for 3.8m. */
  const stillTrue = forHorse.legs.filter(l => l.verdict === 'true').length;
  expect(stillTrue).toBeLessThan(forHorse.legs.length);
});

test('a course survives a reload', async ({ page }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  await page.locator('.chip', { hasText: 'Gate' }).first().click();
  await expect(page.locator('#arena [data-jump]')).toHaveCount(8);
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => !!window.__bcb);
  const course = await H.courseNamed(page, 'First course');
  expect(course.jumps.length).toBe(8);
});

test('the reference screen shows the stride table and says where numbers came from', async ({ page }) => {
  await H.openApp(page, '/reference');
  const view = page.locator('#view');
  await expect(view).toContainText('True distances for');
  await expect(view).toContainText('Pole work');
  await expect(view).toContainText('Class heights');
  await expect(view).toContainText('could not reach the British Showjumping');
  await expect(view).toContainText('Not established');
  H.expectNoErrors(page);
});

test('the distance calculator converts paces to strides', async ({ page }) => {
  await H.openApp(page, '/reference');
  const input = page.locator('input[type="number"]').first();
  await input.fill('9.6');
  /* 9.6m is a true two strides for a 3.2m pony stride. */
  await expect(page.locator('#view')).toContainText('two strides');
  await expect(page.locator('#view')).toContainText('true one');
});

test('a horse can be edited and the stride table follows', async ({ page }) => {
  await H.openApp(page, '/horses');
  await page.locator('.row').first().click();
  await expect(page.locator('#view')).toContainText('Canter stride');
  await expect(page.locator('#view')).toContainText('True distances for this stride');
  const before = await page.locator('.legtable tbody tr').nth(1).textContent();
  /* the canter stride stepper — nudging it must move every distance in the table */
  await page.locator('.stepper button', { hasText: '+' }).first().click();
  await page.locator('.stepper button', { hasText: '+' }).first().click();
  const after = await page.locator('.legtable tbody tr').nth(1).textContent();
  expect(after).not.toBe(before);
});

test('the settings screen carries the kit list', async ({ page }) => {
  await H.openApp(page, '/settings');
  const view = page.locator('#view');
  await expect(view).toContainText('My jumps');
  await expect(view).toContainText('Pairs of wings');
  await expect(view).toContainText('Your walking pace');
  await expect(view).toContainText('Add this to your home screen');
  H.expectNoErrors(page);
});

test('a course shared as a link can be opened and saved', async ({ page }) => {
  await H.openApp(page);
  const hash = await page.evaluate(async () => {
    const store = window.__bcb.store;
    const course = store.db.courses.find(c => c.name === 'First course');
    return await window.bcbShare.courseToHash(course);
  });
  await page.goto(`/?test=1#/open/${hash}`);
  await page.waitForFunction(() => !!window.__bcb);
  await expect(page.locator('#view')).toContainText('First course');
  await expect(page.locator('#view')).toContainText('jumping efforts');
  await page.locator('.iconbtn', { hasText: 'Save it to my courses' }).click();
  await page.waitForSelector('#arena [data-jump]');
  const state = await page.evaluate(() => window.__bcb.state());
  expect(state.courses.filter(c => c.name === 'First course').length).toBe(2);
});

test('the printable course sheet has the plan, the fences and the distances', async ({ page }) => {
  await H.openApp(page);
  await H.openFirstCourse(page);
  await page.evaluate(() => {
    const store = window.__bcb.store;
    const course = store.db.courses.find(c => c.name === 'First course');
    const check = window.__bcb.check(course.id);
    /* the editor builds this when Print is chosen */
    document.querySelector('.iconbtn--primary').click();
  });
  await page.locator('.row', { hasText: 'Print a course sheet' }).click();
  await page.waitForTimeout(300);
  const sheet = page.locator('#sheet');
  await expect(sheet).toContainText('First course');
  await expect(sheet).toContainText('The fences');
  await expect(sheet).toContainText('The distances');
  await expect(sheet).toContainText('Time allowed');
  await expect(sheet).toContainText('Walk them and check');
  /* and in print media the app is hidden and the sheet is not */
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#app')).toBeHidden();
  await expect(sheet).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
});
