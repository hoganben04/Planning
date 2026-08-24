/* Tests for packing a course into a link. The compression and clipboard bits
   need a browser, but the packing is pure and it is where the bugs would be. */
const test = require('node:test');
const assert = require('node:assert');

const { bcbShare: Share } = require('../app/lib/share.js');
const { bcbCourse: C } = require('../app/lib/course.js');

test('a course survives being packed and unpacked', () => {
  const course = C.newCourse({ name: 'Sunday 80cm', levelId: 'pc80', notes: 'Top school' });
  course.jumps = [
    C.newJump({ type: 'oxer-square', xM: 14.25, yM: 30.5, rotationDeg: 180, heightCm: 80, spreadCm: 100, number: 3, element: 'A' }),
    C.newJump({ type: 'wall', xM: 4.5, yM: 12, heightCm: 75, number: 1 })
  ];
  const back = Share.unpack(Share.pack(course));
  assert.strictEqual(back.name, 'Sunday 80cm');
  assert.strictEqual(back.levelId, 'pc80');
  assert.strictEqual(back.notes, 'Top school');
  assert.strictEqual(back.arena.widthM, 20);
  assert.strictEqual(back.arena.lengthM, 60);
  assert.strictEqual(back.jumps.length, 2);
  const oxer = back.jumps[0];
  assert.strictEqual(oxer.type, 'oxer-square');
  assert.strictEqual(oxer.xM, 14.25, 'position survives to the centimetre');
  assert.strictEqual(oxer.yM, 30.5);
  assert.strictEqual(oxer.rotationDeg, 180);
  assert.strictEqual(oxer.spreadCm, 100);
  assert.strictEqual(oxer.number, 3);
  assert.strictEqual(oxer.element, 'A');
  assert.strictEqual(back.jumps[1].element, null);
});

test('every fence type has a place in the link format', () => {
  const jumps = require('../app/data/jumps.js');
  for (const spec of jumps.BCB_JUMPS) {
    assert.ok(Share.TYPES.includes(spec.id),
      `${spec.id} is missing from the share codec, so it would arrive as an upright`);
  }
});

test('the packed form is small enough to send in a message', () => {
  const course = C.newCourse({ name: 'Twelve fence course' });
  course.jumps = [];
  for (let i = 0; i < 12; i++) {
    course.jumps.push(C.newJump({ type: 'oxer-ascending', xM: 5 + i, yM: 5 + i * 4, number: i + 1 }));
  }
  const packed = JSON.stringify(Share.pack(course));
  assert.ok(packed.length < 1500, `packed to ${packed.length} characters`);
});

test('an unknown fence index arrives as an upright rather than breaking', () => {
  const back = Share.unpack({ v: 1, n: 'Odd', a: [200, 600], j: [[99, 500, 500, 0, 300, 0, 70, 1, 0]] });
  assert.strictEqual(back.jumps[0].type, 'vertical');
});

test('base64url has no characters that would break a URL', async () => {
  const course = C.newCourse({ name: 'Link test ~!@#' });
  course.jumps = [C.newJump({ xM: 3.33, yM: 44.44, number: 1 })];
  const hash = await Share.courseToHash(course);
  assert.ok(/^c1[zp][A-Za-z0-9_-]*$/.test(hash), `hash was ${hash.slice(0, 20)}...`);
  const back = await Share.hashToCourse(hash);
  assert.strictEqual(back.name, 'Link test ~!@#');
  assert.strictEqual(back.jumps[0].xM, 3.33);
});

test('a corrupt link is rejected cleanly', async () => {
  await assert.rejects(() => Share.hashToCourse('nonsense'), /not one of ours/);
  await assert.rejects(() => Share.hashToCourse('c1p!!!!'), /damaged/);
  await assert.rejects(() => Share.hashToCourse('c1pbm90anNvbg'), /damaged/);
});

test('a file name is made safe without losing the course name', () => {
  assert.strictEqual(Share.safeName('Sunday 80cm', 'png'), 'Sunday-80cm.png');
  assert.strictEqual(Share.safeName('../../etc/passwd', 'json'), 'etcpasswd.json');
  assert.strictEqual(Share.safeName('', 'json'), 'course.json');
});
