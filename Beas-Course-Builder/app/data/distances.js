/* Bea’s Course Builder — stride and distance reference.

   THE ONE IDEA THAT MAKES THE MATHS WORK. A horse lands about half a stride
   beyond a fence and takes off about half a stride before the next one. So the
   allowance either side adds up to one whole stride, and the clear distance for
   n non-jumping strides is simply:

       distance = (n + 1) x stride length

   That is why a one-stride double for a 12ft-striding horse is the famous 24ft,
   and it is why the same double must come in to about 6.4m for a 14.2hh pony.
   Getting this wrong for ponies is the single most common fault in other apps.

   All the numbers below are coaching convention, not rules — rulebooks give
   legal ranges, not the distances riders actually build to. Treat every figure
   as a default Bea can change. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /* Stride lengths by type of horse. `allowanceM` is the take-off OR landing
     allowance on one side of a fence — half a stride, per the rule above. */
  const HORSE_TYPES = [
    { id: 'pony-small', name: 'Small pony', detail: 'up to 12.2hh (128cm)',
      maxHeightCm: 128, strideM: 2.90, allowanceM: 1.45, turnRadiusM: 5.0, sources: ['stride-pony'] },
    { id: 'pony-medium', name: 'Medium pony', detail: '12.2 to 13.2hh (138cm)',
      maxHeightCm: 138, strideM: 3.05, allowanceM: 1.53, turnRadiusM: 5.5, sources: ['stride-pony'] },
    { id: 'pony-large', name: 'Large pony', detail: '13.2 to 14.2hh (148cm)',
      maxHeightCm: 148, strideM: 3.20, allowanceM: 1.60, turnRadiusM: 6.0, sources: ['stride-pony'] },
    { id: 'horse', name: 'Horse', detail: '15hh to 16.2hh',
      maxHeightCm: 168, strideM: 3.60, allowanceM: 1.80, turnRadiusM: 8.0, sources: ['stride-horse'] },
    { id: 'horse-large', name: 'Big horse', detail: '17hh and over, or a long-striding warmblood',
      maxHeightCm: 200, strideM: 3.80, allowanceM: 1.90, turnRadiusM: 9.0, sources: ['stride-horse'] }
  ];

  const DEFAULT_HORSE_TYPE = 'pony-large';

  /* How far off a true distance before it is worth saying something, as a
     fraction of the horse’s own stride. The largest an error can ever be is half
     a stride, so anything past 0.30 really is stuck between two stride numbers. */
  const TOLERANCE = {
    true: 0.06,        /* within this, call it true */
    slight: 0.15,      /* a touch long or short — nothing to worry about */
    noticeable: 0.30,  /* she will feel this and must ride for it */
    /* beyond `noticeable` the distance falls between strides — the warning that
       matters most, because it is the one that causes a stop or a flattened jump */
    paceM: 0.90        /* one human walking pace, for pacing a distance out on foot */
  };

  /* A gap smaller than this cannot be jumped as two fences at all. */
  const MIN_GAP_M = 2.40;

  /* Where the stride bands sit. Below `combinationMax` fences are elements of one
     numbered obstacle; up to `relatedMax` strides they are a related distance she
     must ride accurately; beyond that she can adjust and we stay quiet. */
  /* Sources disagree on where a "related" distance stops mattering: one says three
     to eight strides, another says fewer than six. We take six, deliberately.
     Past six strides in a home arena she has room to adjust her canter, and
     calling a 30m approach an error would just teach her to ignore the warnings. */
  const BANDS = {
    bounceStrides: 0,
    combinationMaxStrides: 2,
    relatedMaxStrides: 6
  };

  /* FEI: elements of a combination must be 7.00-12.00m apart. Worth knowing
     because pony distances fall UNDER the 7.00m minimum, so a one-stride double
     at an affiliated show will be built longer than the one in her school. */
  const COMBINATION_LEGAL = { minM: 7.00, maxM: 12.00, source: 'fei-combination' };

  /* Ground pole spacings. These are a different quantity from fence-to-fence
     distances — do not mix them up. Values from Pony Magazine by pony height. */
  const POLE_SPACING = {
    'pony-small': { walkM: [0.70, 0.80], trotM: [0.80, 0.90], canterM: [1.80, 2.00] },
    'pony-medium': { walkM: [0.75, 0.85], trotM: [0.90, 1.00], canterM: [2.00, 2.20] },
    'pony-large': { walkM: [0.80, 0.90], trotM: [1.00, 1.10], canterM: [2.10, 2.40] },
    'horse': { walkM: [0.80, 0.90], trotM: [1.20, 1.30], canterM: [2.70, 3.00] },
    'horse-large': { walkM: [0.85, 0.95], trotM: [1.25, 1.40], canterM: [2.90, 3.20] },
    note: 'Trot and walk spacings are from Pony Magazine. Many coaches set canter '
      + 'poles longer than the pony figures given here — closer to a full canter '
      + 'stride. Start at the short end and open it up if your pony feels cramped.',
    sources: ['poles-pony', 'poles-general']
  };

  /* A bounce has no stride between the fences: the horse lands and goes again.
     Roughly one stride length, a little shorter for a green or tired horse. */
  function bounceRange(strideM) {
    return [round2(strideM * 0.88), round2(strideM * 1.08)];
  }

  /* A placing pole in front of a fence, to meet a good take-off spot. */
  const PLACING_POLE = {
    trotM: [1.80, 2.70],
    canterM: [2.70, 3.20],
    sources: ['poles-general']
  };

  function round2(n) { return Math.round(n * 100) / 100; }

  function horseType(id) { return HORSE_TYPES.find(h => h.id === id) || null; }

  /* Pick a sensible type from a height in centimetres. */
  function typeForHeight(heightCm) {
    for (const t of HORSE_TYPES) if (heightCm <= t.maxHeightCm) return t;
    return HORSE_TYPES[HORSE_TYPES.length - 1];
  }

  /* The distance a rider would build for n non-jumping strides. */
  function trueDistance(strideM, strides) { return round2((strides + 1) * strideM); }

  /* A whole reference table, used by the Reference screen and the print sheet. */
  function distanceTable(strideM, maxStrides) {
    const rows = [];
    for (let n = 0; n <= (maxStrides || 6); n++) {
      rows.push({ strides: n, metres: trueDistance(strideM, n) });
    }
    return rows;
  }

  return {
    BCB_HORSE_TYPES: HORSE_TYPES,
    BCB_DEFAULT_HORSE_TYPE: DEFAULT_HORSE_TYPE,
    BCB_TOLERANCE: TOLERANCE,
    BCB_MIN_GAP_M: MIN_GAP_M,
    BCB_BANDS: BANDS,
    BCB_COMBINATION_LEGAL: COMBINATION_LEGAL,
    BCB_POLE_SPACING: POLE_SPACING,
    BCB_PLACING_POLE: PLACING_POLE,
    bcbHorseType: horseType,
    bcbTypeForHeight: typeForHeight,
    bcbBounceRange: bounceRange,
    bcbTrueDistance: trueDistance,
    bcbDistanceTable: distanceTable
  };
});
