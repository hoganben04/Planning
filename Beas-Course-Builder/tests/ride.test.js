/* Tests for Ride mode.

   The whole point of keeping the ride's state a pure function of "how far round
   she is" is that it can be checked here, with fabricated timestamps, instead of
   by watching an animation and hoping. */
const test = require('node:test');
const assert = require('node:assert');

const { bcbRide: Ride } = require('../app/lib/ride.js');
const { bcbCourse: C } = require('../app/lib/course.js');
const { bcbStrides: S } = require('../app/lib/strides.js');
const { bcbStore: ST } = require('../app/lib/store.js');

const PONY = { name: 'Bramble', typeId: 'pony-large' };   /* 3.20m stride */

/* The example course, which every distance in is a true one — so the stride
   marks should land on tidy numbers. */
function seeded() {
  const store = ST.createStore({ storage: null });
  ST.seed(store);
  const course = store.db.courses.find(c => c.name === 'First course');
  const horse = store.activeHorse();
  return { course, horse, check: C.checkCourse(course, horse, store.db.settings) };
}

test('a ride is built from what the check already worked out', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  assert.ok(ride.rideable);
  assert.strictEqual(ride.fences.length, check.route.fenceAt.length);
  assert.ok(ride.lengthM > 50, 'it has a length');
  assert.ok(Math.abs(ride.speedMps - check.timing.speedMpm / 60) < 1e-9);
  /* the fences are in the order she jumps them, and spread along the track */
  const ss = ride.fences.map(f => f.s);
  for (let i = 1; i < ss.length; i++) assert.ok(ss[i] > ss[i - 1], 'fences run forward');
  assert.deepStrictEqual(ride.fences.map(f => f.label), ['1', '2', '3', '4', '5A', '5B', '6']);
});

test('an empty course is not rideable, and says so rather than throwing', () => {
  const course = C.newCourse({ name: 'Empty' });
  const check = C.checkCourse(course, PONY, {});
  const ride = Ride.buildRide(check, PONY);
  assert.strictEqual(ride.rideable, false);
  const state = Ride.rideStateAt(ride, 0);
  assert.match(state.caption, /Nothing to ride/);
});

test('there is a beat for every fence and every stride', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  const fenceBeats = ride.marks.filter(m => m.kind === 'fence');
  assert.strictEqual(fenceBeats.length, ride.fences.length);

  /* Each related leg contributes one beat per stride. */
  for (let i = 0; i < ride.legs.length; i++) {
    const leg = ride.legs[i];
    if (leg.strides == null || leg.strides < 1) continue;
    const beats = ride.marks.filter(m => m.kind === 'stride' && m.legIndex === i);
    assert.ok(beats.length <= leg.strides,
      `leg ${i} has ${beats.length} beats for ${leg.strides} strides`);
    assert.ok(beats.length >= leg.strides - 1,
      `leg ${i} lost too many beats: ${beats.length} for ${leg.strides}`);
  }
  /* And they are in order, which the metronome relies on. */
  for (let i = 1; i < ride.marks.length; i++) {
    assert.ok(ride.marks[i].s >= ride.marks[i - 1].s, 'beats are in order');
  }
});

test('the stride beats land one stride length apart', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  const model = S.strideModel(horse);
  for (let i = 0; i < ride.legs.length; i++) {
    const beats = ride.marks.filter(m => m.kind === 'stride' && m.legIndex === i)
      .map(m => m.s).sort((a, b) => a - b);
    for (let k = 1; k < beats.length; k++) {
      assert.ok(Math.abs((beats[k] - beats[k - 1]) - model.strideM) < 0.02,
        `gap ${(beats[k] - beats[k - 1]).toFixed(2)} should be one stride (${model.strideM})`);
    }
  }
});

test('a bounce gets no beat between its two elements', () => {
  const course = C.newCourse({ name: 'Bounce', levelId: 'pc80' });
  const model = S.strideModel(PONY);
  course.jumps = [
    C.newJump({ xM: 10, yM: 15, number: 1 }),
    C.newJump({ xM: 10, yM: 15 + model.strideM, number: 2 })   /* a bounce apart */
  ];
  const check = C.checkCourse(course, PONY, {});
  const ride = Ride.buildRide(check, PONY);
  assert.strictEqual(ride.legs[0].strides, 0, 'the engine calls it a bounce');
  const between = ride.marks.filter(m => m.kind === 'stride' && m.legIndex === 0);
  assert.strictEqual(between.length, 0, 'a bounce has no stride in it');
});

test('the state tells her where she is, and it only moves forward', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);

  const start = Ride.rideStateAt(ride, 0);
  assert.strictEqual(start.beforeFirst, true);
  assert.strictEqual(start.jumpedCount, 0);
  assert.match(start.caption, /Coming to fence 1/);

  const end = Ride.rideStateAt(ride, ride.lengthM);
  assert.strictEqual(end.atEnd, true);
  assert.strictEqual(end.jumpedCount, ride.fences.length, 'every fence is behind her');
  assert.match(end.caption, /clear round/);

  /* Walking round, the count of fences jumped never goes down. */
  let last = 0;
  for (let s = 0; s <= ride.lengthM; s += 1.5) {
    const st = Ride.rideStateAt(ride, s);
    assert.ok(st.jumpedCount >= last, 'fences jumped never decreases');
    last = st.jumpedCount;
    assert.ok(st.progress >= 0 && st.progress <= 1);
  }
});

test('just past a fence she is on that fence’s leg, with the distance to come', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  const secondFence = ride.fences[1];
  const st = Ride.rideStateAt(ride, secondFence.s + 0.3);
  assert.strictEqual(st.legIndex, 1);
  assert.strictEqual(st.leg.fromLabel, '2');
  assert.strictEqual(st.leg.toLabel, '3');
  assert.match(st.caption, /^2 → 3 · /);
  assert.match(st.caption, /\d+\.\d+m/);
});

test('the caption counts the strides off as she goes', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  /* the first leg of the example is a true four strides */
  const leg0 = ride.legs[0];
  const beats = ride.marks.filter(m => m.kind === 'stride' && m.legIndex === 0)
    .sort((a, b) => a.s - b.s);
  assert.ok(beats.length >= 2, 'the first leg has strides to count');
  const afterFirst = Ride.rideStateAt(ride, beats[0].s + 0.1);
  assert.match(afterFirst.caption, new RegExp(`stride 1 of ${leg0.strides}`));
  const afterSecond = Ride.rideStateAt(ride, beats[1].s + 0.1);
  assert.match(afterSecond.caption, new RegExp(`stride 2 of ${leg0.strides}`));
});

test('positions and headings come off the real track', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  const mid = Ride.rideStateAt(ride, ride.lengthM / 2);
  /* inside the arena, and pointing somewhere sensible */
  assert.ok(mid.x >= -2 && mid.x <= 22, `x was ${mid.x}`);
  assert.ok(mid.y >= -2 && mid.y <= 62, `y was ${mid.y}`);
  assert.ok(Number.isFinite(mid.angle));
  /* at a fence, the marker should be on that fence */
  const f = ride.fences[2];
  const at = Ride.rideStateAt(ride, f.s);
  assert.ok(Math.hypot(at.x - f.x, at.y - f.y) < 0.5, 'the marker is at the fence');
});

test('seeking past either end clamps instead of running off', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  assert.strictEqual(Ride.rideStateAt(ride, -50).s, 0);
  assert.strictEqual(Ride.rideStateAt(ride, ride.lengthM + 500).s, ride.lengthM);
});

/* ---- the driver, advanced by hand ---------------------------------------- */
test('played at the class speed it arrives in the time allowed', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  const d = Ride.createDriver(ride);

  d.play(0);
  /* one second at the class speed covers exactly the class speed in metres */
  d.tick(1000);
  assert.ok(Math.abs(d.s - ride.speedMps) < 1e-6, `after 1s expected ${ride.speedMps}m, got ${d.s}`);

  /* and the whole course takes the time the sheet promises */
  d.seek(0); d.play(0);
  const wholeCourseMs = (ride.lengthM / ride.speedMps) * 1000;
  d.tick(wholeCourseMs);
  assert.ok(d.finished, 'it reaches the end');
  assert.ok(Math.abs(wholeCourseMs / 1000 - ride.timeAllowedS) < 1.5,
    `${(wholeCourseMs / 1000).toFixed(1)}s should be about the ${ride.timeAllowedS}s allowed`);
});

test('it stops at the finish rather than running on', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  const d = Ride.createDriver(ride);
  d.play(0);
  d.tick(10 * 60 * 1000);          /* ten minutes later */
  assert.strictEqual(d.s, ride.lengthM);
  assert.strictEqual(d.playing, false, 'and it stopped playing');
});

test('pause holds it still, and play carries on from there', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  const d = Ride.createDriver(ride);
  d.play(0);
  d.tick(2000);
  const where = d.s;
  d.pause();
  d.tick(9000);                    /* time passes while paused */
  assert.strictEqual(d.s, where, 'paused means paused');
  d.play(9000);
  d.tick(10000);
  assert.ok(Math.abs(d.s - (where + ride.speedMps)) < 1e-6, 'carries on from where it stopped');
});

test('half speed takes twice as long', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  const d = Ride.createDriver(ride);
  d.setRate(0.5, 0);
  d.play(0);
  d.tick(2000);
  assert.ok(Math.abs(d.s - ride.speedMps) < 1e-6, 'two seconds at half speed = one second of ground');
});

test('pressing play at the finish starts the round again', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  const d = Ride.createDriver(ride);
  d.seek(ride.lengthM);
  assert.ok(d.finished);
  d.play(0);
  assert.strictEqual(d.s, 0, 'back to the start rather than stuck at the end');
});

test('Next and Back step from fence to fence', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  const d = Ride.createDriver(ride);

  const firstFence = ride.fences[0].s;
  d.stepTo(d.nextFenceS(), 0, 500);
  d.tick(500);
  assert.ok(Math.abs(d.s - firstFence) < 1e-6, 'lands on fence 1');
  assert.strictEqual(d.stepping, false, 'and the step is finished');

  d.stepTo(d.nextFenceS(), 500, 500);
  d.tick(1000);
  assert.ok(Math.abs(d.s - ride.fences[1].s) < 1e-6, 'then fence 2');

  d.stepTo(d.prevFenceS(), 1000, 500);
  d.tick(1500);
  assert.ok(Math.abs(d.s - ride.fences[0].s) < 1e-6, 'and back to fence 1');
});

test('a step eases rather than jumping, and is the same length whatever the distance', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  const d = Ride.createDriver(ride);
  d.stepTo(ride.fences[3].s, 0, 600);
  const quarter = d.tick(150);
  const half = d.tick(300);
  const done = d.tick(600);
  assert.ok(quarter > 0 && quarter < half && half < done, 'it moves through, not in one jump');
  assert.ok(Math.abs(done - ride.fences[3].s) < 1e-6, 'and arrives exactly');
  /* the ease is symmetric, so halfway in time is halfway in distance */
  assert.ok(Math.abs(half - ride.fences[3].s / 2) < 0.5, 'halfway through time is about halfway along');
});

test('scrubbing while playing keeps playing from the new spot', () => {
  const { check, horse } = seeded();
  const ride = Ride.buildRide(check, horse);
  const d = Ride.createDriver(ride);
  d.play(0);
  d.tick(1000);
  d.seek(40, 1000);
  assert.strictEqual(d.s, 40);
  assert.strictEqual(d.playing, true);
  /* And it carries on from there rather than adding on the time already ridden. */
  assert.ok(Math.abs(d.tick(2000) - (40 + ride.speedMps)) < 1e-9,
    'a second after the scrub she is one second further on');
});

test('the metronome is silent until asked, and needs no browser to construct', () => {
  const m = Ride.createMetronome();
  assert.strictEqual(m.enabled, false, 'sound is off until she turns it on');
  /* node has no AudioContext, so this must fail gracefully rather than throw */
  assert.strictEqual(m.supported, false);
  assert.strictEqual(m.enable(), false);
  assert.doesNotThrow(() => m.cancel());
  const { check, horse } = seeded();
  assert.strictEqual(m.schedule(Ride.buildRide(check, horse), 0, 1), 0);
});
