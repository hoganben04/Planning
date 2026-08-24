/* Shared helpers for the browser tests.

   Drags go through the Chrome DevTools Protocol rather than Playwright’s
   dragTo(), because dragTo synthesises mouse events and the app listens for
   pointer events with capture — which is exactly the code most likely to be
   wrong, so it is the code the tests should exercise. */
const { expect } = require('playwright/test');

async function openApp(page, hash) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/?test=1${hash ? '#' + hash : ''}`);
  await page.waitForFunction(() => !!window.__bcb, null, { timeout: 10000 });
  page.__errors = errors;
  return errors;
}

async function openFirstCourse(page, name) {
  await page.locator('.coursecard__name', { hasText: name || 'First course' }).click();
  await page.waitForSelector('#arena [data-jump]');
}

/* Where a point in the arena, in metres, currently sits on screen. */
async function clientOf(page, xM, yM) {
  return page.evaluate(([x, y]) => window.__bcb.toClient(x, y), [xM, yM]);
}

async function touchDrag(page, from, to, steps = 24) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }]
  });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 }]
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(120);
}

async function mouseDrag(page, from, to, steps = 20) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }
  await page.mouse.up();
  await page.waitForTimeout(120);
}

async function jumpAt(page, courseIndex, jumpIndex) {
  return page.evaluate(([c, j]) => {
    const course = window.__bcb.state().courses[c];
    return course.jumps[j];
  }, [courseIndex, jumpIndex]);
}

async function courseNamed(page, name) {
  return page.evaluate(n => window.__bcb.state().courses.find(c => c.name === n), name);
}

function expectNoErrors(page) {
  const real = (page.__errors || []).filter(e => !/favicon|manifest/i.test(e));
  expect(real, `console errors: ${real.join(' | ')}`).toEqual([]);
}

/* Touch where the device has it, mouse otherwise, so both real input paths get
   exercised rather than only the one the test runner happens to support. */
async function drag(page, from, to, hasTouch) {
  return hasTouch ? touchDrag(page, from, to) : mouseDrag(page, from, to);
}

module.exports = { openApp, openFirstCourse, clientOf, touchDrag, mouseDrag, drag, jumpAt, courseNamed, expectNoErrors };
