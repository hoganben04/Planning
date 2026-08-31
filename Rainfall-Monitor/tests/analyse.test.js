/* Tests for the arithmetic and the judgement.

   The first block checks the app against the readings that prompted it being
   built, because those numbers were worked out by hand and are known to be right:
   5.65mm on the night of 31 August 2026, nearly all of it in half an hour, with a
   3.32mm quarter of an hour peaking at 13.28mm/h.

   Everything after that is the awkward cases — a gauge with holes in its record,
   a gauge that has gone quiet, a burst that straddles midnight — which are the
   cases where a warning app is either useful or dangerous. */

/* Set before anything touches a Date: dayBounds() asks the process what local
   midnight is, and a test of a British farm app should be asking in British
   time. */
process.env.TZ = 'Europe/London';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { rmReadings: R } = require('../app/lib/readings.js');
const { rmAnalyse: A } = require('../app/lib/analyse.js');
const T = require('../app/data/thresholds.js');

const MEASURE = 'E9660-rainfall-tipping_bucket_raingauge-t-15_min-mm';
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'e9660-today.json'), 'utf8')
);
const SERIES = R.normalise(FIXTURE, { stationId: 'E9660' });
/* A quarter of an hour after the last reading, so the feed counts as up to date. */
const NOW = Date.parse('2026-08-31T01:15:00Z');

/* Build a rainfall series from [minutesFromStart, mm] pairs. */
function build(startIso, pairs, opts) {
  const start = Date.parse(startIso);
  const o = opts || {};
  return R.normalise({
    items: pairs.map(([minutes, value]) => ({
      dateTime: new Date(start + minutes * 60000).toISOString(),
      measure: o.measure || MEASURE,
      value
    }))
  }, { stationId: 'E9660', periodLabel: o.periodLabel });
}

/* ---- The readings this app was built from -------------------------------- */

test('the whole record adds up to 5.65mm', () => {
  const total = A.windowSum(SERIES, Date.parse('2026-08-30T00:00:00Z'), NOW);
  assert.equal(total.mm, 5.65);
  assert.equal(total.count, 5);
});

test('the last hour holds 3.42mm of it, and the window is complete', () => {
  const hour = A.windowTotal(SERIES, NOW, 1);
  assert.equal(hour.mm, 3.42);
  assert.equal(hour.count, 4);
  assert.equal(hour.expected, 4);
  assert.equal(hour.coverage, 1);
});

test('the wettest quarter of an hour is 3.32mm, which is 13.28mm/h and reads as heavy', () => {
  const peak = A.peak(SERIES, NOW, 24);
  assert.equal(peak.value, 3.32);
  assert.equal(peak.mmPerHour, 13.28);
  assert.equal(peak.band.key, 'heavy');
  assert.equal(new Date(peak.t).toISOString(), '2026-08-31T00:15:00.000Z');
});

test('nothing here trips a threshold, so the verdict is quiet', () => {
  const verdict = A.assessRainfall(SERIES, NOW, T.RM_DEFAULT_THRESHOLDS);
  assert.equal(verdict.level, 'quiet');
  assert.deepEqual(verdict.reasons, []);
});

test('it stopped raining, and the app says when', () => {
  const spell = A.spell(SERIES, NOW);
  assert.equal(spell.raining, false);
  assert.equal(new Date(spell.lastWetT).toISOString(), '2026-08-31T00:45:00.000Z');
  assert.equal(spell.dryMinutes, 15);
});

/* ---- Coverage: the thing that makes a total trustworthy or not ----------- */

test('a total from a window with holes in it reports how much it actually had', () => {
  /* Six hours of window, one hour of readings. */
  const series = build('2026-08-31T00:00:00Z', [[0, 1], [15, 1], [30, 1], [45, 1]]);
  const six = A.windowTotal(series, Date.parse('2026-08-31T06:00:00Z'), 6);
  assert.equal(six.mm, 4);
  assert.equal(six.count, 4);
  assert.equal(six.expected, 24);
  assert.ok(six.coverage < A.GOOD_COVERAGE);
});

test('a thin window is flagged, and a full one is not', () => {
  const patchy = build('2026-08-31T00:00:00Z', [[0, 1], [15, 1]]);
  const rows = A.totals(patchy, Date.parse('2026-08-31T01:00:00Z'), [
    { hours: 1, label: 'in an hour', watchMm: 10, alertMm: 20 }
  ]);
  assert.equal(rows[0].thin, true);
  assert.equal(rows[0].missing, false);

  const full = build('2026-08-31T00:00:00Z', [[0, 1], [15, 1], [30, 1], [45, 1]]);
  const fullRows = A.totals(full, Date.parse('2026-08-31T01:00:00Z'), [
    { hours: 1, label: 'in an hour', watchMm: 10, alertMm: 20 }
  ]);
  assert.equal(fullRows[0].thin, false);
});

test('no readings at all gives a null total, never a zero', () => {
  /* Zero would read as "it did not rain", which is a different and much more
     dangerous claim than "we do not know". */
  const nothing = R.normalise({ items: [] }, { stationId: 'E9660' });
  const row = A.totals(nothing, NOW, [{ hours: 1, label: 'in an hour', watchMm: 10, alertMm: 20 }])[0];
  assert.equal(row.mm, null);
  assert.equal(row.missing, true);
  assert.equal(row.level, 'quiet');
});

test('a run of real zeros is a dry spell, and is not confused with a gap', () => {
  const dry = build('2026-08-31T00:00:00Z', [[0, 0], [15, 0], [30, 0], [45, 0]]);
  const row = A.totals(dry, Date.parse('2026-08-31T01:00:00Z'),
    [{ hours: 1, label: 'in an hour', watchMm: 10, alertMm: 20 }])[0];
  assert.equal(row.mm, 0);
  assert.equal(row.missing, false);
  assert.equal(row.thin, false);
  assert.equal(A.spell(dry, Date.parse('2026-08-31T01:00:00Z')).dryThroughout, true);
});

test('consecutive windows do not double-count the reading on the seam', () => {
  /* One reading, two adjacent windows: it must land in exactly one of them. */
  const series = build('2026-08-31T00:00:00Z', [[0, 5]]);
  const first = A.windowSum(series, Date.parse('2026-08-30T23:00:00Z'), Date.parse('2026-08-31T00:00:00Z'));
  const second = A.windowSum(series, Date.parse('2026-08-31T00:00:00Z'), Date.parse('2026-08-31T01:00:00Z'));
  assert.equal((first.count === 1) !== (second.count === 1), true, 'exactly one window holds it');
  assert.equal((first.mm || 0) + (second.mm || 0), 5);
});

/* ---- Thresholds --------------------------------------------------------- */

test('passing the watch mark warns, and passing the alert mark warns harder', () => {
  const rule = { hours: 1, label: 'in an hour', watchMm: 10, alertMm: 20 };
  assert.equal(A.totalLevel(9.9, rule), 'quiet');
  assert.equal(A.totalLevel(10, rule), 'watch');
  assert.equal(A.totalLevel(19.9, rule), 'watch');
  assert.equal(A.totalLevel(20, rule), 'alert');
});

test('the verdict says which window went, and by what mark', () => {
  /* 24mm in an hour: past the 20mm alert. */
  const series = build('2026-08-31T00:00:00Z', [[0, 6], [15, 6], [30, 6], [45, 6]]);
  const verdict = A.assessRainfall(series, Date.parse('2026-08-31T01:00:00Z'), T.RM_DEFAULT_THRESHOLDS);
  assert.equal(verdict.level, 'alert');
  assert.ok(verdict.reasons.some(r => r.level === 'alert' && /in an hour/.test(r.text)));
  assert.ok(verdict.reasons.some(r => /20mm mark/.test(r.text)));
});

test('a threshold left blank never fires', () => {
  const rule = { hours: 1, label: 'in an hour', watchMm: null, alertMm: null };
  assert.equal(A.totalLevel(500, rule), 'quiet');
});

/* ---- A gauge that has gone quiet ---------------------------------------- */

test('a gauge that has stopped reporting is itself a warning, but only a watch', () => {
  /* It cannot be an alert: silence is a reason to distrust the screen, not a
     reason to expect water. */
  const stale = Date.parse('2026-08-31T12:00:00Z');
  const verdict = A.assessRainfall(SERIES, stale, T.RM_DEFAULT_THRESHOLDS);
  assert.equal(verdict.level, 'watch');
  assert.ok(verdict.reasons.some(r => /nothing from this gauge/.test(r.text)));
  assert.equal(verdict.freshness.key, 'stale');
});

test('freshness bands read as up to date, running late, then out of date', () => {
  const t = Date.parse('2026-08-31T01:00:00Z');
  assert.equal(A.freshness(t, t + 10 * 60000).key, 'fresh');
  assert.equal(A.freshness(t, t + 90 * 60000).key, 'late');
  assert.equal(A.freshness(t, t + 5 * 3600000).key, 'stale');
  assert.equal(A.freshness(null, t).key, 'none');
});

test('an empty gauge is called out rather than shown as quiet', () => {
  const nothing = R.normalise({ items: [] }, { stationId: 'E9660' });
  const verdict = A.assessRainfall(nothing, NOW, T.RM_DEFAULT_THRESHOLDS);
  assert.equal(verdict.level, 'watch');
  assert.ok(verdict.reasons.some(r => /no readings at all/.test(r.text)));
});

/* ---- Midnight, which is where the query that started this went wrong ---- */

test('a burst either side of midnight is split by local midnight, not by UTC', () => {
  /* 21:00 to 03:00 British Summer Time, an hour ahead of UTC. Rain of 1mm every
     quarter of an hour throughout: 4mm an hour, six hours, 24mm — of which
     exactly three hours fell yesterday and three hours today. */
  const series = build('2026-08-30T20:00:00Z',
    Array.from({ length: 24 }, (unused, i) => [i * 15, 1]));
  const now = Date.parse('2026-08-31T02:00:00Z');
  const day = A.dayBounds(now);
  /* Local midnight on 31 August 2026 is 23:00Z on the 30th. */
  assert.equal(new Date(day.start).toISOString(), '2026-08-30T23:00:00.000Z');
  const today = A.dayTotal(series, day.start, Math.min(now, day.end));
  assert.equal(today.mm, 12);
  assert.equal(today.count, 12);
});

test('the rolling window is unaffected by midnight, which is the point of using one', () => {
  const series = build('2026-08-30T22:00:00Z',
    Array.from({ length: 16 }, (unused, i) => [i * 15, 1]));
  /* Four hours of rain straddling midnight; the last six hours holds all of it. */
  const six = A.windowTotal(series, Date.parse('2026-08-31T02:00:00Z'), 6);
  assert.equal(six.mm, 16);
});

/* ---- Rates and words --------------------------------------------------- */

test('an accumulation becomes the rate it implies', () => {
  assert.equal(A.ratePerHour(3.32, 15), 13.28);
  assert.equal(A.ratePerHour(1, 60), 1);
  assert.equal(A.ratePerHour(0, 15), 0);
  assert.equal(A.ratePerHour(null, 15), null);
});

test('an hourly gauge is not read as though it were a 15-minute one', () => {
  const hourly = build('2026-08-31T00:00:00Z', [[0, 4], [60, 4], [120, 4]],
    { measure: 'E9660-rainfall-tipping_bucket_raingauge-t-hourly-mm' });
  assert.equal(hourly.periodMinutes, 60);
  const three = A.windowTotal(hourly, Date.parse('2026-08-31T03:00:00Z'), 3);
  assert.equal(three.mm, 12);
  assert.equal(three.expected, 3, 'three hours of an hourly gauge is three readings');
  assert.equal(three.coverage, 1);
  assert.equal(A.current(hourly).mmPerHour, 4);
});

test('intensity bands run from dry to torrential', () => {
  assert.equal(T.rmIntensityBand(0).key, 'dry');
  assert.equal(T.rmIntensityBand(1).key, 'light');
  assert.equal(T.rmIntensityBand(5).key, 'moderate');
  assert.equal(T.rmIntensityBand(13.28).key, 'heavy');
  assert.equal(T.rmIntensityBand(60).key, 'torrential');
});

test('ages are written the way a person would say them', () => {
  assert.equal(A.formatMinutes(15), '15 min');
  assert.equal(A.formatMinutes(90), '1h 30m');
  assert.equal(A.formatMinutes(120), '2h');
  assert.equal(A.formatMinutes(1440), 'a day');
  assert.equal(A.formatMinutes(2880), '2 days');
});

/* ---- River levels ------------------------------------------------------ */

const LEVEL_MEASURE = 'L2404-level-stage-i-15_min-mASD';

function levelSeries(values) {
  const start = Date.parse('2026-08-31T00:00:00Z');
  return R.normalise({
    items: values.map((value, i) => ({
      dateTime: new Date(start + i * 15 * 60000).toISOString(),
      measure: LEVEL_MEASURE,
      value
    }))
  }, { stationId: 'L2404' });
}

test('a level series reports where the river is and which way it is going', () => {
  const series = levelSeries([0.50, 0.55, 0.62, 0.70, 0.80]);
  const now = Date.parse('2026-08-31T01:00:00Z');
  const s = A.levelSummary(series, now);
  assert.equal(s.value, 0.8);
  assert.equal(s.change1h, 0.3);
  assert.equal(s.trend, 'rising');
  assert.equal(s.ratePerHour, 0.3);
});

test('a river coming up fast is a warning even with no marks set', () => {
  const series = levelSeries([0.50, 0.60, 0.75, 0.90, 1.10]);
  const verdict = A.assessLevel(series, Date.parse('2026-08-31T01:00:00Z'), {});
  assert.equal(verdict.level, 'alert');
  assert.ok(verdict.reasons.some(r => /rising/.test(r.text)));
});

test('a steady river with marks set below it warns on height', () => {
  const series = levelSeries([1.20, 1.20, 1.20, 1.20, 1.20]);
  const verdict = A.assessLevel(series, Date.parse('2026-08-31T01:00:00Z'),
    { watchM: 1.0, alertM: 1.5 });
  assert.equal(verdict.level, 'watch');
  assert.ok(verdict.reasons.some(r => /1\.00m mark/.test(r.text)));
});

test('a falling river with no marks is quiet', () => {
  const series = levelSeries([1.20, 1.10, 1.00, 0.92, 0.85]);
  const verdict = A.assessLevel(series, Date.parse('2026-08-31T01:00:00Z'), {});
  assert.equal(verdict.level, 'quiet');
  assert.equal(verdict.summary.trend, 'falling');
});

test('levels are never added up', () => {
  /* Summing levels would be meaningless, so the level path must not go anywhere
     near the rainfall totals. This is a guard against a future refactor. */
  const series = levelSeries([1.0, 1.0, 1.0]);
  const verdict = A.assessLevel(series, Date.parse('2026-08-31T00:45:00Z'), {});
  assert.equal(verdict.totals, undefined);
  assert.equal(verdict.kind, 'level');
});

test('a series that claims not to be empty but holds nothing is a shrug, not a crash', () => {
  /* Exactly the shape a cache or a stub can hand over. Everything downstream of
     spell() reads `.t` off the latest reading, so this must not throw. */
  const broken = { empty: false, readings: [], periodMinutes: 15, periodLabel: 'start' };
  assert.equal(A.spell(broken, NOW).known, false);
  assert.equal(A.current(broken), null);
  assert.equal(A.peak(broken, NOW, 24), null);
  assert.equal(A.levelSummary(broken, NOW), null);
  const verdict = A.assessRainfall(broken, NOW, T.RM_DEFAULT_THRESHOLDS);
  assert.equal(verdict.level, 'watch');
  assert.ok(verdict.reasons.some(r => /no readings at all/.test(r.text)));
});

test('a reading whose period runs up to now is counted straight away', () => {
  /* The bug this pins: bracketing windows on the MIDPOINT of a period put the
     newest reading's midpoint in the future, so it dropped out of every total for
     up to seven and a half minutes. During a cloudburst that is the one reading
     somebody is refreshing the screen to see. */
  /* 00:50, so the newest reading — covering 00:45 to 01:00 — is a period still
     in progress. Its midpoint, 00:52:30, is in the future. */
  const now = Date.parse('2026-08-31T00:50:00Z');
  const series = build('2026-08-31T00:00:00Z', [[0, 1], [15, 1], [30, 1], [45, 6]]);
  const hour = A.windowTotal(series, now, 1);
  assert.equal(hour.count, 4);
  assert.equal(hour.mm, 9, 'the reading whose period is still running counts now, not in 2 minutes');
  assert.equal(A.peak(series, now, 24).value, 6, 'and it can be the peak');
});

test('a reading whose period has not started yet is not counted', () => {
  const now = Date.parse('2026-08-31T00:45:00Z');
  const series = build('2026-08-31T00:00:00Z', [[0, 1], [15, 1], [30, 1], [45, 6]]);
  const hour = A.windowTotal(series, now, 1);
  assert.equal(hour.count, 3);
  assert.equal(hour.mm, 3);
});

test('the day boundary still holds with the window bracketed on the period start', () => {
  /* Local midnight on 31 August 2026 is 23:00Z on the 30th, so the reading
     covering 22:45Z to 23:00Z belongs to the 30th and the next one to the 31st. */
  const series = build('2026-08-30T22:45:00Z', [[0, 5], [15, 7]]);
  const now = Date.parse('2026-08-31T00:00:00Z');
  const day = A.dayBounds(now);
  const today = A.dayTotal(series, day.start, Math.min(now, day.end));
  assert.equal(today.mm, 7);
  assert.equal(today.count, 1);
});
