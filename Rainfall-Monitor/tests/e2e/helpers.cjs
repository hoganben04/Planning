/* Shared helpers for the browser tests.

   The Environment Agency is never called. Every test installs a route that
   answers with readings built here, relative to the moment the test runs, so the
   suite is deterministic and does not depend on the weather, on the EA being up,
   or on this machine having any network at all. */
const { expect } = require('playwright/test');

const MEASURE = 'E9660-rainfall-tipping_bucket_raingauge-t-15_min-mm';
const LEVEL_MEASURE = 'L2404-level-stage-i-15_min-mASD';
const QUARTER = 15 * 60000;

/* The clock is frozen here for every test, and the payloads are built against
   the same moment.

   Not a nicety. Which readings fall inside "the last hour" depends on where now
   sits within the quarter-hour, so a suite that used the real clock passed or
   failed depending on what time it was run — three tests did exactly that. Seven
   minutes past the hour is chosen because it is a realistic moment: the 01:00
   reading has been published, the 01:15 one has not. */
const FIXED_NOW = Date.parse('2026-08-31T01:07:00Z');

/* The most recent quarter-hour boundary at or before now, which is where a real
   gauge's latest reading would sit. */
function lastSlot(now) {
  return Math.floor(now / QUARTER) * QUARTER;
}

/* `values` is oldest first and ends at the latest slot. The API answers newest
   first, which is the order the app has to cope with.

   The measure id carries the station id, and the app refuses readings belonging
   to a different station — correctly — so a payload has to be built for the
   station it is being served as. */
function measureFor(stationId, parameter) {
  return parameter === 'level'
    ? `${stationId}-level-stage-i-15_min-mASD`
    : `${stationId}-rainfall-tipping_bucket_raingauge-t-15_min-mm`;
}

function rainfallPayload(values, opts) {
  const o = typeof opts === 'number' ? { now: opts } : (opts || {});
  const end = lastSlot(o.now === undefined ? FIXED_NOW : o.now);
  const measure = o.measure || measureFor(o.station || 'E9660', o.parameter || 'rainfall');
  const items = values.map((value, i) => ({
    '@id': 'x',
    dateTime: new Date(end - (values.length - 1 - i) * QUARTER).toISOString(),
    measure,
    value
  })).reverse();
  return { meta: { limit: 500 }, items };
}

function levelPayload(values, opts) {
  const o = typeof opts === 'number' ? { now: opts } : (opts || {});
  return rainfallPayload(values, Object.assign({}, o, {
    parameter: 'level',
    station: o.station || 'L2404'
  }));
}

function stationPayload(overrides) {
  return {
    items: Object.assign({
      label: 'Adur at Beeding Bridge',
      riverName: 'River Adur',
      town: 'Upper Beeding',
      stageScale: {
        typicalRangeLow: '0.15',
        typicalRangeHigh: '2.10',
        maxOnRecord: { value: '3.44' }
      }
    }, overrides || {})
  };
}

/* Answer every EA request. `plan` maps a station id to either a payload or the
   string 'fail'. */
async function stubEa(page, plan) {
  await page.route('**://environment.data.gov.uk/**', async route => {
    const url = route.request().url();
    const match = url.match(/\/id\/stations\/([^/?]+)/);
    const id = match ? decodeURIComponent(match[1]).toUpperCase() : '';
    const entry = plan[id];

    if (!entry || entry === 'missing') {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }
    if (entry === 'fail') {
      await route.abort('failed');
      return;
    }
    const body = url.indexOf('/readings') >= 0
      ? entry.readings
      : (entry.station || { items: {} });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });
}

async function openApp(page) {
  /* Before the navigation, or the page reads the real clock on the way up.
     setFixedTime pins what Date reports without freezing timers, so the app's
     auto-refresh still behaves normally. */
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/index.html');
  await page.waitForFunction(() => !!window.rmApp, null, { timeout: 10000 });
  page.__errors = errors;
  return errors;
}

/* The app draws from cache first and then refreshes, so a test that asserts on
   fetched numbers has to wait for the check to finish. */
async function waitForCheck(page) {
  await expect(page.locator('.checked')).toContainText('checked', { timeout: 10000 });
  await expect(page.locator('[data-action="refresh"]')).toHaveText('Check now', { timeout: 10000 });
}

async function tileValue(page, label) {
  const tile = page.locator('.tile', { hasText: label }).first();
  return (await tile.locator('.tile-value').innerText()).trim();
}

module.exports = {
  MEASURE, LEVEL_MEASURE, QUARTER, FIXED_NOW, lastSlot, measureFor,
  rainfallPayload, levelPayload, stationPayload,
  stubEa, openApp, waitForCheck, tileValue
};
