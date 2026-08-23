/* Bee's Course Builder — arena presets.

   Sizes are the ones people actually ride in. The FEI competition minimums are
   included only so the app can say "this is a schooling arena, not a competition
   one" rather than pretending a 20x40 school breaks a rule.

   `usable` is how close to the fence line it is sensible to build. You cannot
   jump a fence set hard against the boards, so the app keeps a margin. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ARENAS = [
    { id: '20x40', name: '20 x 40m', widthM: 20, lengthM: 40, indoor: false,
      note: 'Small dressage arena — the most common home school. Tight for a full '
        + 'course, but plenty for grids and a short route.' },
    { id: '20x60', name: '20 x 60m', widthM: 20, lengthM: 60, indoor: false,
      note: 'Large dressage arena. Room for a proper course down the long sides.' },
    { id: '20x30', name: '20 x 30m', widthM: 20, lengthM: 30, indoor: true,
      note: 'Small indoor school. Grids and single fences.' },
    { id: '25x50', name: '25 x 50m', widthM: 25, lengthM: 50, indoor: false,
      note: 'A generous private arena.' },
    { id: '30x60', name: '30 x 60m', widthM: 30, lengthM: 60, indoor: false,
      note: 'Typical jumping training arena — comfortably holds 8 to 10 fences.' },
    { id: '40x80', name: '40 x 80m', widthM: 40, lengthM: 80, indoor: false,
      note: 'Competition-sized outdoor arena.' },
    { id: '45x90', name: '45 x 90m', widthM: 45, lengthM: 90, indoor: false,
      note: 'Large outdoor competition arena.' },
    { id: '60x90', name: '60 x 90m', widthM: 60, lengthM: 90, indoor: false,
      note: 'Full international-sized grass or all-weather arena.' }
  ];

  const DEFAULT_ARENA_ID = '20x60';

  /* How much room to leave off the fence line when building. */
  const MARGINS = {
    edgeM: 3.0,          /* do not place a fence closer than this to the boards */
    runInM: 6.0,         /* straight approach a fence wants in front of it */
    landingM: 6.0,       /* room to land and get straight again */
    cornerM: 5.0         /* fences this close to a corner are awkward to ride */
  };

  /* FEI competition minimums, for context only — never used to fail a home arena. */
  const COMPETITION_MIN = {
    indoor: { areaM2: 1200, shortSideM: 25 },
    outdoor: { areaM2: 4000, shortSideM: 50 },
    source: 'fei-arena'
  };

  function arena(id) { return ARENAS.find(a => a.id === id) || null; }

  /* Is this arena big enough that competition rules are even relevant? */
  function isCompetitionSize(widthM, lengthM, indoor) {
    const min = indoor ? COMPETITION_MIN.indoor : COMPETITION_MIN.outdoor;
    return widthM * lengthM >= min.areaM2 && Math.min(widthM, lengthM) >= min.shortSideM;
  }

  return {
    BCB_ARENAS: ARENAS,
    BCB_DEFAULT_ARENA: DEFAULT_ARENA_ID,
    BCB_MARGINS: MARGINS,
    BCB_COMPETITION_MIN: COMPETITION_MIN,
    bcbArena: arena,
    bcbIsCompetitionSize: isCompetitionSize
  };
});
