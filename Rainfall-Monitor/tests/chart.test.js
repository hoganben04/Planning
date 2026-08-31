/* Tests for the drawing.

   A chart cannot be checked by eye in a test suite, so these check the two
   things that actually go wrong: a number that is not a number ending up in the
   SVG, and the gaps in the record being drawn as though they were dry. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { rmReadings: R } = require('../app/lib/readings.js');
const { rmChart: C } = require('../app/lib/chart.js');

const MEASURE = 'E9660-rainfall-tipping_bucket_raingauge-t-15_min-mm';
const SERIES = R.normalise(
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'e9660-today.json'), 'utf8')),
  { stationId: 'E9660' }
);
const NOW = Date.parse('2026-08-31T01:15:00Z');

function count(svg, cls) {
  return (svg.match(new RegExp(`class="${cls}"`, 'g')) || []).length;
}

test('the axis top is a round number above the peak', () => {
  assert.equal(C.niceMax(3.32, 1), 4);
  assert.equal(C.niceMax(17, 1), 20);
  assert.equal(C.niceMax(0.2, 1), 1, 'a quiet day still gets a 1mm axis, not a 0.2mm one');
  assert.equal(C.niceMax(0, 1), 1);
  assert.equal(C.niceMax(45, 1), 50);
});

test('a bar is drawn for every reading with rain in it, and none for the dry ones', () => {
  const svg = C.bars(SERIES, { from: NOW - 6 * 3600000, to: NOW });
  /* Five readings, all above zero. */
  assert.equal(count(svg, 'rm-bar'), 5);
});

test('the gaps in the record are drawn, because blank looks exactly like dry', () => {
  const svg = C.bars(SERIES, { from: NOW - 6 * 3600000, to: NOW });
  /* Six hours is 24 quarter-hours; five have readings. */
  assert.equal(count(svg, 'rm-gap'), 19);
});

test('no NaN, undefined or null ever reaches the SVG', () => {
  const svg = C.bars(SERIES, { from: NOW - 24 * 3600000, to: NOW, rateLineMmPerHour: 20 });
  assert.ok(svg.indexOf('NaN') < 0, 'NaN in the markup');
  assert.ok(svg.indexOf('undefined') < 0, 'undefined in the markup');
  assert.ok(svg.indexOf('null') < 0, 'null in the markup');
});

test('an empty gauge draws a message rather than an empty grid', () => {
  const nothing = R.normalise({ items: [] }, { stationId: 'E9660' });
  const svg = C.bars(nothing, { from: NOW - 3600000, to: NOW });
  assert.match(svg, /No readings/);
  assert.equal(count(svg, 'rm-bar'), 0);
});

test('readings outside the window are not drawn', () => {
  const svg = C.bars(SERIES, {
    from: Date.parse('2026-08-31T00:30:00Z'),
    to: Date.parse('2026-08-31T01:15:00Z')
  });
  /* Only the 00:30, 00:45 and 01:00 readings overlap this window. */
  assert.equal(count(svg, 'rm-bar'), 3);
});

test('the threshold line is only drawn when it fits on the axis', () => {
  const quiet = C.bars(SERIES, { from: NOW - 3600000, to: NOW, rateLineMmPerHour: 200 });
  assert.equal(count(quiet, 'rm-threshold'), 0, '200mm/h is off the top of a 4mm axis');
  const shown = C.bars(SERIES, { from: NOW - 3600000, to: NOW, rateLineMmPerHour: 4 });
  assert.ok(count(shown, 'rm-threshold') > 0);
});

test('a level chart draws the line, the normal range and the marks', () => {
  const series = R.normalise({
    items: [0.5, 0.7, 0.9, 1.2].map((value, i) => ({
      dateTime: new Date(NOW - (3 - i) * 900000).toISOString(),
      measure: 'L2404-level-stage-i-15_min-mASD',
      value
    }))
  }, { stationId: 'L2404' });
  const svg = C.line(series, {
    from: NOW - 6 * 3600000, to: NOW,
    typicalRangeLow: 0.2, typicalRangeHigh: 1.0, watchM: 1.1, alertM: 1.4
  });
  assert.equal(count(svg, 'rm-band'), 1);
  assert.match(svg, /<polyline class="rm-line"/);
  assert.ok(svg.indexOf('NaN') < 0);
  /* A level axis does not start at zero, so the baseline must not be labelled 0. */
  const baselineLabel = svg.match(/text-anchor="end">([^<]*)<\/text>/g) || [];
  assert.ok(baselineLabel.length >= 2);
});

test('a flat level series still gets a usable axis rather than dividing by zero', () => {
  const series = R.normalise({
    items: [1.0, 1.0, 1.0].map((value, i) => ({
      dateTime: new Date(NOW - (2 - i) * 900000).toISOString(),
      measure: 'L2404-level-stage-i-15_min-mASD',
      value
    }))
  }, { stationId: 'L2404' });
  const svg = C.line(series, { from: NOW - 3600000, to: NOW });
  assert.ok(svg.indexOf('NaN') < 0);
  assert.match(svg, /<polyline/);
});

test('a hostile station name cannot break out of the SVG', () => {
  const svg = C.bars(SERIES, {
    from: NOW - 3600000, to: NOW,
    title: '</svg><script>alert(1)</script>'
  });
  assert.ok(svg.indexOf('<script>') < 0);
  assert.match(svg, /&lt;script&gt;/);
});

test('the unit is on the top axis label, not floating over it', () => {
  /* It used to be a separate line of text at the same place as the number, which
     rendered as "mm" printed on top of "4". */
  const svg = C.bars(SERIES, { from: NOW - 3600000, to: NOW });
  assert.match(svg, />4mm</);
  assert.equal((svg.match(/>mm</g) || []).length, 0);
});

test('the gaps are drawn below the baseline, not on it', () => {
  /* On the baseline, a long run of gaps reads as a dashed axis. */
  const svg = C.bars(SERIES, { from: NOW - 6 * 3600000, to: NOW });
  const gap = svg.match(/<rect class="rm-gap" x="[\d.]+" y="([\d.]+)"/);
  const baseline = svg.match(/<line class="rm-baseline" x1="[\d.]+" y1="([\d.]+)"/);
  assert.ok(gap && baseline);
  assert.ok(Number(gap[1]) > Number(baseline[1]), 'gap markers sit under the baseline');
});

test('a level axis is labelled in metres, not in the EA datum', () => {
  const series = R.normalise({
    items: [0.5, 0.9].map((value, i) => ({
      dateTime: new Date(NOW - (1 - i) * 900000).toISOString(),
      measure: 'L2404-level-stage-i-15_min-mASD',
      value
    }))
  }, { stationId: 'L2404' });
  const svg = C.line(series, { from: NOW - 3600000, to: NOW, unit: 'm' });
  assert.ok(svg.indexOf('mASD') < 0);
  assert.match(svg, /m</);
  assert.match(svg, /<circle class="rm-dot"/);
});

test('the chart keeps its aspect ratio so the axis text is not stretched', () => {
  const svg = C.bars(SERIES, { from: NOW - 3600000, to: NOW });
  assert.ok(svg.indexOf('preserveAspectRatio') < 0);
  assert.match(svg, /viewBox="0 0 720 200"/);
});

test('a five-day window does not draw thousands of gap markers', () => {
  /* 120 hours of 15-minute slots is 480; the loop is capped so a wider window
     cannot turn into a megabyte of markup on a phone. */
  const svg = C.bars(SERIES, { from: NOW - 120 * 3600000, to: NOW });
  assert.ok(count(svg, 'rm-gap') <= 480);
  assert.ok(svg.length < 60000, `chart markup was ${svg.length} bytes`);
});

test('the threshold line is never flush with the top of the axis', () => {
  /* From a live screenshot: a 4.14mm peak rounds the axis to 5, and a 20mm/h
     mark is 5mm over a quarter of an hour, so the line landed exactly on the
     frame and read as the chart's own border. */
  const series = R.normalise({
    items: [0.2, 4.14, 1.1].map((value, i) => ({
      dateTime: new Date(NOW - (2 - i) * 900000).toISOString(),
      measure: MEASURE,
      value
    }))
  }, { stationId: 'E9660' });
  const svg = C.bars(series, { from: NOW - 24 * 3600000, to: NOW, rateLineMmPerHour: 20 });
  const axisTop = svg.match(/text-anchor="end">([\d.]+)mm</);
  assert.ok(axisTop, 'the axis is labelled');
  assert.ok(Number(axisTop[1]) > 5, `axis top was ${axisTop[1]}, leaving no room above the mark`);
  assert.match(svg, /class="rm-threshold"/);
});

test('a quiet day keeps its sensitive axis rather than making room for a distant mark', () => {
  /* The other side of it: flattening a 0.3mm day onto a 6mm axis to accommodate
     a threshold nowhere near being met would hide the only data there is. */
  const series = R.normalise({
    items: [0.1, 0.3, 0.2].map((value, i) => ({
      dateTime: new Date(NOW - (2 - i) * 900000).toISOString(),
      measure: MEASURE,
      value
    }))
  }, { stationId: 'E9660' });
  const svg = C.bars(series, { from: NOW - 6 * 3600000, to: NOW, rateLineMmPerHour: 20 });
  assert.match(svg, /text-anchor="end">1mm</);
  assert.equal((svg.match(/class="rm-threshold"/g) || []).length, 0);
});
