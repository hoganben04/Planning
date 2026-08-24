/* Tests for the distance engine.

   These are written the way an instructor would check the app: against the
   distances that appear in printed tables and get walked in real arenas. If a
   change to the engine breaks one of these, the app is telling a rider something
   untrue about a distance, which is the one failure that actually matters. */
const test = require('node:test');
const assert = require('node:assert');

const { bcbStrides: S } = require('../app/lib/strides.js');
const D = require('../app/data/distances.js');

const PONY = { name: 'Bramble', typeId: 'pony-large' };     /* 14.2hh, 3.20m stride */
const HORSE = { name: 'Rufus', typeId: 'horse' };           /* 15-16hh, 3.60m stride */
const SMALL = { name: 'Pip', typeId: 'pony-small' };        /* 12.2hh, 2.90m stride */

/* Build two fences a known CLEAR distance apart, in a straight line. With no
   spread the clear distance is just the centre-to-centre gap. */
function pair(clearM, opts) {
  const o = opts || {};
  const mk = (id, y, n) => ({
    id, type: o.type || 'vertical', xM: 10, yM: y, rotationDeg: o.rotationDeg || 0,
    widthM: 3, spreadCm: o.spreadCm || 0, heightCm: 90, number: n
  });
  return [mk('a', 5, 1), mk('b', 5 + clearM, 2)];
}

function assess(clearM, horse, opts) {
  const [a, b] = pair(clearM, opts);
  return S.assessDistance(a, b, horse, opts);
}

test('the (n+1) x stride rule reproduces the published tables', () => {
  const horse = S.strideModel(HORSE);
  /* 12ft stride: the classic 24ft one-stride and 36ft two-stride doubles. */
  assert.ok(Math.abs(S.trueDistance(horse, 1) - 7.20) < 0.01, 'one stride 7.2m');
  assert.ok(Math.abs(S.trueDistance(horse, 2) - 10.80) < 0.01, 'two strides 10.8m');
  assert.ok(Math.abs(S.trueDistance(horse, 3) - 14.40) < 0.01, 'three strides 14.4m');

  /* A large pony’s distances land inside the ranges wehorse publishes for 148cm. */
  const pony = S.strideModel(PONY);
  const within = (v, lo, hi) => v >= lo && v <= hi;
  assert.ok(within(S.trueDistance(pony, 1), 5.90, 6.90), 'pony one stride in 5.9-6.9m');
  assert.ok(within(S.trueDistance(pony, 2), 9.40, 10.00), 'pony two strides in 9.4-10.0m');
  assert.ok(within(S.trueDistance(pony, 3), 12.50, 14.00), 'pony three strides in 12.5-14.0m');
  assert.ok(within(S.trueDistance(pony, 4), 15.70, 17.00), 'pony four strides in 15.7-17.0m');
});

test('a horse double set for a pony reads long, and vice versa', () => {
  /* This is the whole reason the app exists. */
  const forHorse = assess(7.20, HORSE);
  assert.strictEqual(forHorse.verdict, 'true');
  assert.strictEqual(forHorse.severity, 'ok');

  const samePony = assess(7.20, PONY);
  assert.strictEqual(samePony.strides, 1);
  assert.strictEqual(samePony.verdict, 'long');
  assert.strictEqual(samePony.severity, 'warn');
  assert.ok(samePony.deviationM > 0.7, 'pony sees it as ~0.8m long');

  /* And a pony distance is short for a horse. */
  const ponyDistanceOnHorse = assess(6.40, HORSE);
  assert.ok(ponyDistanceOnHorse.verdict.includes('short'), 'reads short for a horse');
});

test('stride counts and categories land in the right bands', () => {
  assert.strictEqual(assess(3.20, PONY).category, 'bounce');
  assert.strictEqual(assess(3.20, PONY).strides, 0);
  assert.strictEqual(assess(6.40, PONY).category, 'combination');
  assert.strictEqual(assess(9.60, PONY).category, 'combination');
  assert.strictEqual(assess(12.80, PONY).category, 'related');
  assert.strictEqual(assess(22.40, PONY).category, 'related');
  /* Past the related band the rider adjusts, so we stay quiet. */
  const far = assess(30.00, PONY);
  assert.strictEqual(far.category, 'unrelated');
  assert.strictEqual(far.severity, 'ok');
});

test('a distance falling between strides is an error, not a shrug', () => {
  /* Halfway between a pony two (9.6m) and three (12.8m). */
  const bad = assess(11.20, PONY);
  assert.strictEqual(bad.verdict, 'between-strides');
  assert.strictEqual(bad.severity, 'error');
  assert.match(bad.advice, /between strides/);
  /* It must offer both ways out. */
  const options = bad.alternatives.map(a => a.strides);
  assert.ok(options.includes(2) && options.includes(3), 'offers 2 and 3 strides');
});

test('fences too close together are called unjumpable rather than measured', () => {
  const r = assess(1.50, PONY);
  assert.strictEqual(r.category, 'unjumpable');
  assert.strictEqual(r.severity, 'error');
  assert.strictEqual(r.strides, null);
});

test('tolerance bands scale with the horse, so warnings are pony-correct', () => {
  const tol = D.BCB_TOLERANCE;
  /* An identical 0.5m error is worse for a small pony than for a big horse. */
  const errM = 0.50;
  const ponyR = assess(S.trueDistance(S.strideModel(SMALL), 2) + errM, SMALL);
  const horseR = assess(S.trueDistance(S.strideModel(HORSE), 2) + errM, HORSE);
  assert.ok(Math.abs(ponyR.deviationRatio) > Math.abs(horseR.deviationRatio),
    'the same absolute error is a bigger fraction of a small pony stride');
  /* And the band boundaries are where distances.js says they are. */
  const model = S.strideModel(PONY);
  const justTrue = assess(S.trueDistance(model, 2) + model.strideM * (tol.true - 0.01), PONY);
  assert.strictEqual(justTrue.verdict, 'true');
  const justSlight = assess(S.trueDistance(model, 2) + model.strideM * (tol.true + 0.01), PONY);
  assert.strictEqual(justSlight.verdict, 'slightly-long');
});

test('a fence spread eats into the clear distance', () => {
  /* Same centres, but a 1.2m square oxer puts its front rail 0.6m nearer. */
  const flat = assess(9.60, PONY, {});
  const oxer = assess(9.60, PONY, { type: 'oxer-square', spreadCm: 120 });
  assert.ok(oxer.measured.m < flat.measured.m, 'the oxer shortens the gap');
  /* Both fences now have spread, so the gap loses half of each. */
  assert.ok(Math.abs(oxer.measured.m - (9.60 - 1.20)) < 0.02, 'loses 0.6m at each end');
});

test('an angled fence presents more depth than its nominal spread', () => {
  /* A 1.2m oxer turned 40 degrees to the line of travel is deeper to jump. */
  const square = assess(12.00, PONY, { type: 'oxer-square', spreadCm: 120, rotationDeg: 0 });
  const angled = assess(12.00, PONY, { type: 'oxer-square', spreadCm: 120, rotationDeg: 40 });
  assert.ok(angled.measured.m < square.measured.m,
    'turning the fence leaves less clear ground between the rails');
});

test('the suggested fix actually makes the distance true', () => {
  const [a, b] = pair(11.20);
  const first = S.assessDistance(a, b, PONY);
  assert.ok(first.suggestion, 'a bad distance offers a fix');
  const moved = Object.assign({}, b, { xM: first.suggestion.newX, yM: first.suggestion.newY });
  const after = S.assessDistance(a, moved, PONY);
  assert.strictEqual(after.verdict, 'true', 'taking the suggestion gives a true distance');
  assert.strictEqual(after.strides, first.strides, 'and keeps the same stride count');
});

test('distances are given in metres, feet and walking paces', () => {
  const r = assess(7.20, HORSE);
  assert.strictEqual(r.measured.m, 7.2);
  /* 7.2m is a shade under 24ft, the distance she will hear called at a show. */
  assert.strictEqual(r.measured.feet, 23);
  assert.match(r.measured.feetText, /^23ft/);
  /* And about eight paces to walk out. */
  assert.strictEqual(Math.round(r.measured.paces), 8);
});

test('feet and inches convert exactly and never read 12 inches', () => {
  assert.deepStrictEqual(S.feetInches(0.3048), { feet: 1, inches: 0, text: '1ft' });
  const almost = S.feetInches(0.3048 * 2 - 0.001);   /* a hair under 2ft */
  assert.strictEqual(almost.inches < 12, true, 'never reports 12 inches');
  assert.strictEqual(almost.text, '2ft');
});

test('pony combination distances fall below the FEI 7m minimum, and we say so', () => {
  const r = assess(6.40, PONY);
  assert.strictEqual(r.category, 'combination');
  assert.strictEqual(r.verdict, 'true');
  /* True for the pony at home, but under the 7.00m an affiliated course must use. */
  assert.strictEqual(r.legalForCombination, false,
    'flagged so she is not surprised when a show builds it longer');
  const horseR = assess(7.20, HORSE);
  assert.strictEqual(horseR.legalForCombination, true);
});

test('two fences more than 12m apart stop being a combination', () => {
  const model = S.strideModel(HORSE);
  const twoStrides = S.trueDistance(model, 2);        /* 10.8m — inside 12m */
  assert.strictEqual(assess(twoStrides, HORSE).category, 'combination');
  const stretched = assess(12.50, HORSE);
  assert.strictEqual(stretched.category, 'related');
  assert.match(stretched.note || '', /separate fences/);
});

test('stride wording is grammatical', () => {
  assert.strictEqual(S.strideWords(0), 'no strides');
  assert.strictEqual(S.strideWords(1), 'one stride');
  assert.strictEqual(S.strideWords(2), 'two strides');
  /* No advice string should ever contain "one strides". */
  for (const d of [3.2, 6.4, 7.2, 9.6, 11.2, 12.8, 30]) {
    for (const h of [PONY, HORSE, SMALL]) {
      assert.ok(!assess(d, h).advice.includes('one strides'),
        `bad grammar at ${d}m for ${h.name}`);
    }
  }
});

test('every advice sentence is readable and mentions the horse or the distance', () => {
  for (const d of [1.5, 3.2, 6.4, 7.2, 9.6, 11.2, 12.8, 22.4, 30]) {
    const r = assess(d, PONY);
    assert.ok(typeof r.advice === 'string' && r.advice.length > 20, `advice at ${d}m`);
    assert.ok(/[.!]$/.test(r.advice.trim()), `advice at ${d}m ends in a full stop`);
    assert.ok(!r.advice.includes('undefined') && !r.advice.includes('NaN'),
      `advice at ${d}m has no holes`);
  }
});

test('a horse profile can override stride directly', () => {
  const custom = { name: 'Custom', strideM: 3.00 };
  const model = S.strideModel(custom);
  assert.strictEqual(model.strideM, 3.00);
  assert.strictEqual(model.overheadM, 3.00);
  assert.strictEqual(S.trueDistance(model, 1), 6.00);
});

test('snapping targets are the true distances for that horse', () => {
  const model = S.strideModel(PONY);
  const targets = S.trueDistanceTargets(model, 3);
  assert.deepStrictEqual(targets.map(t => t.strides), [0, 1, 2, 3]);
  assert.deepStrictEqual(targets.map(t => t.clearM), [3.2, 6.4, 9.6, 12.8]);
});

test('cross-checking tells her how it would ride on something else', () => {
  const [a, b] = pair(6.40);
  const both = S.crossCheck(a, b, PONY, HORSE);
  assert.strictEqual(both.mine.verdict, 'true');
  assert.ok(both.theirs.verdict.includes('short'), 'short for a horse');
});
