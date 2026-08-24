/* Bea’s Course Builder — the obstacle catalogue.

   Each entry says what a fence is, what it takes to build it, and how it should
   be drawn from above. `kit` is counted in the units a rider actually owns:
   `wings` is PAIRS of wings or standards, everything else is individual items.

   `landing` and `takeoff` are multipliers on the base take-off/landing allowance
   in distances.js. A wide fence throws the horse further out on landing and
   needs backing off a little on the approach, which is why an oxer at the same
   measured distance rides differently from an upright.

   FEI note: a descending oxer (front pole higher than the back) is prohibited
   because it deceives the horse's eye, so it is deliberately not offered here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const JUMPS = [
    { id: 'crosspoles', name: 'Cross poles', short: 'Cross', category: 'fence',
      group: 'Uprights', hasSpread: false, defaultSpreadCm: 0, defaultWidthM: 3.0,
      landing: 0.9, takeoff: 0.9, colour: '#7C5CD3',
      kit: { wings: 1, poles: 2 },
      draw: 'crosspoles',
      note: 'Two crossed poles, lowest in the middle. Encourages a straight, central jump.' },

    { id: 'vertical', name: 'Vertical', short: 'Vert', category: 'fence',
      group: 'Uprights', hasSpread: false, defaultSpreadCm: 0, defaultWidthM: 3.0,
      landing: 1.0, takeoff: 1.0, colour: '#2E7BC4',
      kit: { wings: 1, poles: 2 },
      draw: 'vertical',
      note: 'A single plane of poles. Narrow to jump, so it asks for accuracy.' },

    { id: 'planks', name: 'Planks', short: 'Planks', category: 'fence',
      group: 'Uprights', hasSpread: false, defaultSpreadCm: 0, defaultWidthM: 3.0,
      landing: 1.0, takeoff: 1.05, colour: '#C8562F',
      kit: { wings: 1, poles: 1, planks: 1 },
      draw: 'planks',
      note: 'Solid boards. Looks bolder than a pole, so ride forward to it.' },

    { id: 'gate', name: 'Gate', short: 'Gate', category: 'fence',
      group: 'Uprights', hasSpread: false, defaultSpreadCm: 0, defaultWidthM: 3.0,
      landing: 1.0, takeoff: 1.05, colour: '#8A6A3E',
      kit: { wings: 1, poles: 1, gates: 1 },
      draw: 'gate',
      note: 'A gate hung between the wings. Another airy, upright question.' },

    { id: 'wall', name: 'Wall', short: 'Wall', category: 'fence',
      group: 'Uprights', hasSpread: false, defaultSpreadCm: 30, defaultWidthM: 2.4,
      landing: 1.0, takeoff: 1.0, colour: '#9E4A4A',
      kit: { wings: 1, walls: 1, poles: 1 },
      draw: 'wall',
      note: 'Solid blocks. Most horses read a wall well because they can see it clearly.' },

    { id: 'oxer-ascending', name: 'Ascending oxer', short: 'Asc oxer', category: 'fence',
      group: 'Spreads', hasSpread: true, defaultSpreadCm: 90, defaultWidthM: 3.0,
      landing: 1.15, takeoff: 1.05, colour: '#2A9D6E',
      kit: { wings: 2, poles: 3 },
      draw: 'oxer',
      note: 'Back pole higher than the front. The most inviting spread — it '
        + 'encourages the horse to stretch across it.' },

    { id: 'oxer-square', name: 'Square oxer', short: 'Sq oxer', category: 'fence',
      group: 'Spreads', hasSpread: true, defaultSpreadCm: 100, defaultWidthM: 3.0,
      landing: 1.2, takeoff: 1.1, colour: '#1F8A5F',
      kit: { wings: 2, poles: 4 },
      draw: 'oxer-square',
      note: 'Front and back poles level. A true test of width — needs a real jump.' },

    { id: 'oxer-swedish', name: 'Swedish oxer', short: 'Swedish', category: 'fence',
      group: 'Spreads', hasSpread: true, defaultSpreadCm: 90, defaultWidthM: 3.0,
      landing: 1.15, takeoff: 1.1, colour: '#3FA98A',
      kit: { wings: 2, poles: 4 },
      draw: 'oxer-swedish',
      note: 'Poles slanting opposite ways, making an X seen from the front.' },

    { id: 'triple-bar', name: 'Triple bar', short: 'Triple', category: 'fence',
      group: 'Spreads', hasSpread: true, defaultSpreadCm: 120, defaultWidthM: 3.0,
      landing: 1.3, takeoff: 1.1, colour: '#177A55',
      kit: { wings: 3, poles: 3 },
      draw: 'triple-bar',
      note: 'Three rails climbing in height. Inviting for its size, but wide — '
        + 'the landing is a long way out.' },

    { id: 'liverpool', name: 'Liverpool', short: 'Liverpool', category: 'fence',
      group: 'Water', hasSpread: true, defaultSpreadCm: 90, defaultWidthM: 3.0,
      landing: 1.15, takeoff: 1.15, colour: '#1E6FA8',
      kit: { wings: 2, poles: 3, trays: 1 },
      draw: 'liverpool',
      note: 'A water tray under a vertical or oxer. Often the spookiest fence on '
        + 'the course — show it to your horse at home first.' },

    { id: 'water', name: 'Open water', short: 'Water', category: 'fence',
      group: 'Water', hasSpread: true, defaultSpreadCm: 250, maxSpreadCm: 400,
      defaultWidthM: 4.0, landing: 1.4, takeoff: 1.2, colour: '#1B6FB5',
      kit: { trays: 1 },
      draw: 'water',
      note: 'Open water with no pole to jump. The FEI caps the spread at 4.00m.' },

    /* ---- Ground work. These are not fences and are not counted as efforts. ---- */
    { id: 'ground-pole', name: 'Ground pole', short: 'Pole', category: 'pole',
      group: 'Pole work', hasSpread: false, defaultSpreadCm: 0, defaultWidthM: 3.0,
      landing: 0, takeoff: 0, colour: '#8A8F98',
      kit: { poles: 1 },
      draw: 'ground-pole',
      note: 'A pole flat on the ground. Use several in a row for trotting poles.' },

    { id: 'placing-pole', name: 'Placing pole', short: 'Placing', category: 'pole',
      group: 'Pole work', hasSpread: false, defaultSpreadCm: 0, defaultWidthM: 3.0,
      landing: 0, takeoff: 0, colour: '#C79A2E',
      kit: { poles: 1 },
      draw: 'placing-pole',
      note: 'Set in front of a fence to meet the right take-off spot. Roughly '
        + '1.8-2.7m out from a cross pole for a trot approach.' },

    { id: 'raised-pole', name: 'Raised pole', short: 'Raised', category: 'pole',
      group: 'Pole work', hasSpread: false, defaultSpreadCm: 0, defaultWidthM: 3.0,
      landing: 0, takeoff: 0, colour: '#A8823C',
      kit: { poles: 1, wings: 1 },
      draw: 'raised-pole',
      note: 'A pole lifted at one or both ends. Asks for more lift than a flat pole.' }
  ];

  /* Fillers sit under or in front of a fence rather than being a fence of their
     own. They change nothing about the distance but a lot about how bold it looks. */
  const FILLERS = [
    { id: 'none', name: 'No filler' },
    { id: 'brush', name: 'Brush' },
    { id: 'flowerbox', name: 'Flower box' },
    { id: 'rustic', name: 'Rustic filler' },
    { id: 'panel', name: 'Painted panel' },
    { id: 'barrels', name: 'Barrels' },
    { id: 'tray', name: 'Water tray' }
  ];

  /* Default palette for fence poles, so a course is easy to read at a glance and
     she can colour-code her own jumps to match what she owns. */
  const COLOURS = [
    { id: 'blue', name: 'Blue', hex: '#2E7BC4' },
    { id: 'red', name: 'Red', hex: '#C7453F' },
    { id: 'green', name: 'Green', hex: '#2A9D6E' },
    { id: 'yellow', name: 'Yellow', hex: '#E0A82E' },
    { id: 'purple', name: 'Purple', hex: '#7C5CD3' },
    { id: 'pink', name: 'Pink', hex: '#D9639B' },
    { id: 'white', name: 'White', hex: '#E9ECF1' },
    { id: 'natural', name: 'Natural', hex: '#B08A5A' }
  ];

  function jump(id) { return JUMPS.find(j => j.id === id) || null; }
  function jumpGroups() {
    const order = [];
    const byGroup = new Map();
    for (const j of JUMPS) {
      if (!byGroup.has(j.group)) { byGroup.set(j.group, []); order.push(j.group); }
      byGroup.get(j.group).push(j);
    }
    return order.map(name => ({ name, jumps: byGroup.get(name) }));
  }
  function isFence(id) { const j = jump(id); return !!j && j.category === 'fence'; }

  return {
    BCB_JUMPS: JUMPS,
    BCB_FILLERS: FILLERS,
    BCB_COLOURS: COLOURS,
    bcbJump: jump,
    bcbJumpGroups: jumpGroups,
    bcbIsFence: isFence
  };
});
