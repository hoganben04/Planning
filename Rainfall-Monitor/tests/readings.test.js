/* Tests for the layer that reads the Environment Agency's answers.

   These are written against the shapes the API actually produces, including the
   awkward ones. The reason they matter is that every bug in this file comes out
   the same way at the other end: a total that is quietly too low, on a screen
   somebody is using to decide whether to go and look at a ditch. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { rmReadings: R } = require('../app/lib/readings.js');

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'e9660-today.json'), 'utf8')
);
const MEASURE = 'E9660-rainfall-tipping_bucket_raingauge-t-15_min-mm';

test('a measure id is taken apart correctly', () => {
  const m = R.parseMeasureId(MEASURE);
  assert.equal(m.stationId, 'E9660');
  assert.equal(m.parameter, 'rainfall');
  assert.equal(m.qualifier, 'tipping_bucket_raingauge');
  assert.equal(m.valueType, 't');
  assert.equal(m.periodMinutes, 15);
  assert.equal(m.unit, 'mm');
});

test('a full measure URL parses the same as a bare id', () => {
  const url = 'http://environment.data.gov.uk/flood-monitoring/id/measures/' + MEASURE;
  assert.deepEqual(R.parseMeasureId(url), R.parseMeasureId(MEASURE));
});

test('a level measure parses, hyphenated qualifier and all', () => {
  const m = R.parseMeasureId('L2404-level-stage-i-15_min-mASD');
  assert.equal(m.parameter, 'level');
  assert.equal(m.unit, 'mASD');
  assert.equal(m.periodMinutes, 15);
});

test('the readings that started this app come through intact and in order', () => {
  const series = R.normalise(FIXTURE, { stationId: 'E9660' });
  assert.equal(series.stationId, 'E9660');
  assert.equal(series.parameter, 'rainfall');
  assert.equal(series.unit, 'mm');
  assert.equal(series.periodMinutes, 15);
  assert.equal(series.readings.length, 5);
  /* The API answers newest first; the series must come out oldest first. */
  assert.deepEqual(
    series.readings.map(r => new Date(r.t).toISOString()),
    ['2026-08-31T00:00:00.000Z', '2026-08-31T00:15:00.000Z', '2026-08-31T00:30:00.000Z',
      '2026-08-31T00:45:00.000Z', '2026-08-31T01:00:00.000Z']
  );
  assert.deepEqual(series.readings.map(r => r.value), [2.23, 3.32, 0.02, 0.07, 0.01]);
});

test('one reading arrives as a bare object rather than an array', () => {
  /* JSON-LD collapses a single-item list, and a chart with nothing on it is the
     symptom if this is not handled. */
  const payload = {
    items: { dateTime: '2026-08-31T00:15:00Z', measure: MEASURE, value: 3.32 }
  };
  const series = R.normalise(payload, { stationId: 'E9660' });
  assert.equal(series.readings.length, 1);
  assert.equal(series.readings[0].value, 3.32);
});

test('values arrive as strings and as arrays', () => {
  const payload = {
    items: [
      { dateTime: '2026-08-31T00:00:00Z', measure: MEASURE, value: '2.23' },
      /* Two readings for one timestamp: take the larger, because a dropped tip
         reads as too little and never as too much. */
      { dateTime: '2026-08-31T00:15:00Z', measure: MEASURE, value: [3.32, 3.10] }
    ]
  };
  const series = R.normalise(payload, { stationId: 'E9660' });
  assert.deepEqual(series.readings.map(r => r.value), [2.23, 3.32]);
});

test('the ways a gauge says "no reading" are thrown out, not added up', () => {
  const payload = {
    items: [
      { dateTime: '2026-08-31T00:00:00Z', measure: MEASURE, value: -99 },
      { dateTime: '2026-08-31T00:15:00Z', measure: MEASURE, value: 9999 },
      { dateTime: '2026-08-31T00:30:00Z', measure: MEASURE, value: 'n/a' },
      { dateTime: 'not a date', measure: MEASURE, value: 1 },
      { dateTime: '2026-08-31T00:45:00Z', measure: MEASURE, value: 0.5 }
    ]
  };
  const series = R.normalise(payload, { stationId: 'E9660' });
  assert.deepEqual(series.readings.map(r => r.value), [0.5]);
  assert.equal(series.rejected.implausible, 2);
  assert.equal(series.rejected.noValue, 1);
  assert.equal(series.rejected.noTime, 1);
});

test('a genuine zero is kept, because dry is not the same as unknown', () => {
  const payload = {
    items: [{ dateTime: '2026-08-31T00:00:00Z', measure: MEASURE, value: 0 }]
  };
  const series = R.normalise(payload, { stationId: 'E9660' });
  assert.equal(series.readings.length, 1);
  assert.equal(series.readings[0].value, 0);
  assert.equal(series.empty, false);
});

test('nothing at all is reported as empty rather than as a dry spell', () => {
  const series = R.normalise({ items: [] }, { stationId: 'E9660' });
  assert.equal(series.empty, true);
  assert.equal(series.readings.length, 0);
});

test('a reading for another station is refused', () => {
  const payload = {
    items: [{
      dateTime: '2026-08-31T00:00:00Z',
      measure: '52203-rainfall-tipping_bucket_raingauge-t-15_min-mm',
      value: 5
    }]
  };
  const series = R.normalise(payload, { stationId: 'E9660' });
  assert.equal(series.readings.length, 0);
  assert.equal(series.rejected.wrongStation, 1);
});

test('a duplicated timestamp is counted once, and the later payload wins', () => {
  const first = { items: [{ dateTime: '2026-08-31T00:00:00Z', measure: MEASURE, value: 1 }] };
  const second = { items: [{ dateTime: '2026-08-31T00:00:00Z', measure: MEASURE, value: 2 }] };
  const series = R.normalise([first, second], { stationId: 'E9660' });
  assert.equal(series.readings.length, 1);
  assert.equal(series.readings[0].value, 2);
});

test('the period a reading covers depends on which end the timestamp is', () => {
  const t = Date.parse('2026-08-31T00:15:00Z');
  const start = R.coverage(t, 15, 'start');
  assert.equal(new Date(start.from).toISOString(), '2026-08-31T00:15:00.000Z');
  assert.equal(new Date(start.to).toISOString(), '2026-08-31T00:30:00.000Z');
  assert.equal(new Date(start.mid).toISOString(), '2026-08-31T00:22:30.000Z');

  const end = R.coverage(t, 15, 'end');
  assert.equal(new Date(end.from).toISOString(), '2026-08-31T00:00:00.000Z');
  assert.equal(new Date(end.to).toISOString(), '2026-08-31T00:15:00.000Z');
});

test('merging a fresh fetch over a cached one keeps the history and takes the new values', () => {
  const older = R.normalise({
    items: [
      { dateTime: '2026-08-30T23:45:00Z', measure: MEASURE, value: 1.1 },
      { dateTime: '2026-08-31T00:00:00Z', measure: MEASURE, value: 9 }
    ]
  }, { stationId: 'E9660' });
  const newer = R.normalise(FIXTURE, { stationId: 'E9660' });
  const merged = R.merge(older, newer);
  assert.equal(merged.readings.length, 6);
  assert.equal(merged.readings[0].value, 1.1, 'the cached history is kept');
  assert.equal(merged.readings[1].value, 2.23, 'the EA revision wins over the cached value');
});

test('merging with nothing on one side returns the other side', () => {
  const series = R.normalise(FIXTURE, { stationId: 'E9660' });
  const nothing = R.normalise({ items: [] }, { stationId: 'E9660' });
  assert.equal(R.merge(nothing, series).readings.length, 5);
  assert.equal(R.merge(series, nothing).readings.length, 5);
});

test('trimming drops old readings so a phone cache cannot grow for ever', () => {
  const series = R.normalise(FIXTURE, { stationId: 'E9660' });
  const trimmed = R.trim(series, Date.parse('2026-08-31T00:30:00Z'));
  assert.equal(trimmed.readings.length, 3);
  assert.equal(trimmed.empty, false);
  assert.equal(R.trim(series, Date.parse('2027-01-01T00:00:00Z')).empty, true);
});

test('latest is the newest reading, whatever order it arrived in', () => {
  const series = R.normalise(FIXTURE, { stationId: 'E9660' });
  assert.equal(R.latest(series).value, 0.01);
  assert.equal(R.latest(R.normalise({ items: [] }, {})), null);
});
