/* Tests for the course model, numbering and the whole-course check. */
const test = require('node:test');
const assert = require('node:assert');

const { bcbCourse: C } = require('../app/lib/course.js');
const { bcbStrides: S } = require('../app/lib/strides.js');
const { bcbRoute: R } = require('../app/lib/route.js');

const PONY = { name: 'Bramble', typeId: 'pony-large' };   /* 3.20m stride */
const HORSE = { name: 'Rufus', typeId: 'horse' };

function courseWith(jumps, over) {
  const c = C.newCourse(Object.assign({ name: 'Test', levelId: 'pc80' }, over || {}));
  c.jumps = jumps;
  return c;
}
function J(over) { return C.newJump(over); }
function codes(check) { return check.issues.map(i => i.code); }

test('new things come out with sensible defaults', () => {
  const c = C.newCourse();
  assert.strictEqual(c.arena.widthM, 20);
  assert.strictEqual(c.arena.lengthM, 60, 'defaults to her 20x60 school');
  assert.strictEqual(c.levelId, 'pc80');
  const h = C.newHorse({ name: 'Bramble' });
  assert.strictEqual(h.typeId, 'pony-large', 'defaults to a large pony');
  const j = C.newJump({ type: 'oxer-square' });
  assert.strictEqual(j.spreadCm, 100, 'a square oxer arrives with a spread');
  assert.ok(C.newJump().id !== C.newJump().id, 'ids are unique');
});

test('a double is two fences sharing a number, lettered A and B', () => {
  const c = courseWith([
    J({ xM: 10, yM: 10, number: 1 }),
    J({ xM: 10, yM: 20, number: 2, element: 'A' }),
    J({ xM: 10, yM: 26.4, number: 2, element: 'B' })
  ]);
  const groups = C.efforts(c);
  assert.strictEqual(groups.length, 2, 'three fences, two obstacles');
  assert.strictEqual(groups[1].kind, 'double');
  assert.deepStrictEqual(groups[1].elements.map(e => e.element), ['A', 'B']);
});

test('renumbering letters fences that sit within combination range', () => {
  const a = J({ xM: 10, yM: 8 });
  const b = J({ xM: 10, yM: 34 });       /* a long way on — its own obstacle */
  const cEl = J({ xM: 10, yM: 40.4 });   /* one pony stride past b */
  const course = courseWith([a, b, cEl]);
  const model = S.strideModel(PONY);
  const out = C.renumber(course, [a.id, b.id, cEl.id], model);
  const groups = C.efforts(out);
  assert.strictEqual(groups.length, 2, 'the close pair becomes one obstacle');
  assert.strictEqual(groups[0].number, 1);
  assert.strictEqual(groups[1].kind, 'double');
  assert.deepStrictEqual(groups[1].elements.map(e => e.element), ['A', 'B']);
});

test('renumbering never letters a lone fence', () => {
  const a = J({ xM: 6, yM: 10 });
  const b = J({ xM: 6, yM: 40 });
  const out = C.renumber(courseWith([a, b]), [a.id, b.id], S.strideModel(PONY));
  for (const j of out.jumps) assert.strictEqual(j.element, null);
  assert.deepStrictEqual(out.jumps.map(j => j.number), [1, 2]);
});

test('a treble stops at three elements', () => {
  const ids = [];
  const jumps = [];
  for (let i = 0; i < 4; i++) {
    const j = J({ xM: 10, yM: 8 + i * 6.4 });   /* all one stride apart */
    jumps.push(j); ids.push(j.id);
  }
  const out = C.renumber(courseWith(jumps), ids, S.strideModel(PONY));
  const groups = C.efforts(out);
  assert.strictEqual(groups[0].elements.length, 3, 'no more than a treble');
  assert.strictEqual(groups.length, 2, 'the fourth starts a new obstacle');
});

test('two close fences that are not numbered as one get flagged', () => {
  const c = courseWith([
    J({ xM: 10, yM: 15, number: 1 }),
    J({ xM: 10, yM: 21.4, number: 2 })     /* one pony stride — this is a double */
  ]);
  const chk = C.checkCourse(c, PONY, {});
  assert.ok(codes(chk).includes('combination-not-numbered'),
    'she should be told these are one obstacle');
});

test('elements of one obstacle set too far apart get flagged', () => {
  const c = courseWith([
    J({ xM: 10, yM: 10, number: 1, element: 'A' }),
    J({ xM: 10, yM: 25, number: 1, element: 'B' })   /* 15m — past the 12m limit */
  ]);
  assert.ok(codes(C.checkCourse(c, PONY, {})).includes('combination-too-far'));
});

test('a fence off the end of the arena is an error, close to the boards a warning', () => {
  const outside = courseWith([J({ xM: 10, yM: 62, number: 1 })]);
  assert.ok(codes(C.checkCourse(outside, PONY, {})).includes('fence-outside-arena'));

  const tight = courseWith([J({ xM: 1.2, yM: 30, number: 1, rotationDeg: 90 })]);
  const chk = C.checkCourse(tight, PONY, {});
  assert.ok(codes(chk).includes('boundary-clearance'));
  assert.ok(!codes(chk).includes('fence-outside-arena'), 'inside, just tight');
});

test('fences on top of each other are an error, but a combination is not', () => {
  const stacked = courseWith([
    J({ xM: 10, yM: 20, number: 1 }),
    J({ xM: 10.2, yM: 20.1, number: 2 })
  ]);
  assert.ok(codes(C.checkCourse(stacked, PONY, {})).includes('overlapping-fences'));

  /* Two elements of the same obstacle may legitimately sit close. */
  const combo = courseWith([
    J({ xM: 10, yM: 20, number: 1, element: 'A' }),
    J({ xM: 10.2, yM: 20.1, number: 1, element: 'B' })
  ]);
  assert.ok(!codes(C.checkCourse(combo, PONY, {})).includes('overlapping-fences'));
});

test('duplicate numbers are an error', () => {
  const c = courseWith([
    J({ xM: 6, yM: 12, number: 1 }),
    J({ xM: 14, yM: 40, number: 1 })
  ]);
  assert.ok(codes(C.checkCourse(c, PONY, {})).includes('duplicate-number'));
});

test('a fence above the level height is flagged', () => {
  const c = courseWith([J({ xM: 10, yM: 20, number: 1, heightCm: 110 })], { levelId: 'pc80' });
  assert.ok(codes(C.checkCourse(c, PONY, {})).includes('height-above-level'));
});

test('the kit check knows what she has to carry out', () => {
  const c = courseWith([
    J({ type: 'vertical', xM: 6, yM: 12, number: 1 }),
    J({ type: 'oxer-square', xM: 6, yM: 30, number: 2 }),
    J({ type: 'wall', xM: 14, yM: 45, number: 3 })
  ]);
  const need = C.kitNeeded(c.jumps);
  /* vertical 1 pair + square oxer 2 pairs + wall 1 pair = 4 pairs of wings */
  assert.strictEqual(need.wings, 4);
  assert.strictEqual(need.walls, 1);

  const short = C.checkCourse(c, PONY, { kit: { wings: 2, poles: 20, walls: 1 } });
  assert.ok(codes(short).includes('kit-short'));
  assert.strictEqual(short.kit.short[0].item, 'wings');

  const enough = C.checkCourse(c, PONY, { kit: { wings: 6, poles: 20, walls: 2 } });
  assert.ok(!codes(enough).includes('kit-short'));
});

test('the same course is checked differently for a pony and a horse', () => {
  /* A true horse one-stride double, set as a numbered combination. */
  const c = courseWith([
    J({ xM: 10, yM: 15, number: 1, element: 'A' }),
    J({ xM: 10, yM: 22.2, number: 1, element: 'B' })
  ]);
  const forHorse = C.checkCourse(c, HORSE, {});
  const forPony = C.checkCourse(c, PONY, {});
  const horseLeg = forHorse.legs[0];
  const ponyLeg = forPony.legs[0];
  assert.strictEqual(horseLeg.verdict, 'true');
  assert.ok(ponyLeg.verdict.includes('long'), 'the pony finds the same double long');
  assert.ok(forPony.issues.some(i => i.code === 'distance-off'));
  assert.ok(!forHorse.issues.some(i => i.code === 'distance-off'));
});

test('the time allowed comes from the track and the level speed', () => {
  const timing = R.timeAllowed(400, 325);
  assert.strictEqual(timing.seconds, 74, '400m at 325 m/min');
  assert.strictEqual(timing.limitSeconds, 148, 'the limit is twice the time allowed');
  /* And it rounds up, never down — a part second still counts. */
  assert.strictEqual(R.timeAllowed(325, 325).seconds, 60);
  assert.strictEqual(R.timeAllowed(325.5, 325).seconds, 61);
});

test('an empty course checks cleanly rather than throwing', () => {
  const chk = C.checkCourse(courseWith([]), PONY, {});
  assert.strictEqual(chk.summary.fences, 0);
  assert.strictEqual(chk.legs.length, 0);
  assert.strictEqual(chk.route.lengthM, 0);
  assert.ok(Array.isArray(chk.issues));
});

test('a course with no horse still checks, using a sensible default stride', () => {
  const c = courseWith([J({ xM: 10, yM: 15, number: 1 }), J({ xM: 10, yM: 35, number: 2 })]);
  const chk = C.checkCourse(c, null, {});
  assert.ok(chk.summary.strideM > 2 && chk.summary.strideM < 4);
  assert.strictEqual(chk.legs.length, 1);
});

test('ground poles are not counted as jumping efforts', () => {
  const c = courseWith([
    J({ type: 'vertical', xM: 10, yM: 15, number: 1 }),
    J({ type: 'ground-pole', xM: 10, yM: 25 }),
    J({ type: 'trot-poles', xM: 10, yM: 30 })
  ]);
  const chk = C.checkCourse(c, PONY, {});
  assert.strictEqual(chk.summary.fences, 1);
  assert.strictEqual(chk.summary.efforts, 1);
});

test('the track respects the turn radius and stays inside the arena', () => {
  /* Fences facing opposite ways would hairpin if the track were just smoothed. */
  const c = courseWith([
    J({ xM: 6, yM: 12, number: 1 }),
    J({ xM: 6, yM: 30, number: 2 }),
    J({ xM: 14, yM: 45, rotationDeg: 180, number: 3 }),
    J({ xM: 14, yM: 20, rotationDeg: 180, number: 4 })
  ]);
  const chk = C.checkCourse(c, PONY, {});
  const pts = chk.route.points;
  assert.ok(pts.length > 10);
  for (const p of pts) {
    assert.ok(p.x >= -1.5 && p.x <= 21.5, `x in arena: ${p.x}`);
    assert.ok(p.y >= -1.5 && p.y <= 61.5, `y in arena: ${p.y}`);
  }
  /* Fence order along the track must be increasing. */
  const ss = chk.route.fenceAt.map(f => f.s);
  for (let i = 1; i < ss.length; i++) assert.ok(ss[i] > ss[i - 1], 'fences run forward');
});
