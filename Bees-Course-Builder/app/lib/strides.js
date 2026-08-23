/* Bee's Course Builder — the distance engine.

   Pure maths, no DOM. This is the part of the app that has to be right, so it is
   written to be read and checked by a person who knows more about horses than
   about code, and every step is unit-tested in tests/strides.test.js.

   THE RULE IT ALL RESTS ON. A horse lands about half a stride beyond a fence and
   takes off about half a stride before the next one, so the allowance either side
   adds up to one whole stride:

       true distance for n strides = (n + 1) x stride length

   For a 12ft (3.6m) horse stride that gives the familiar 24ft one-stride double.
   For a 14.2hh pony striding 3.2m it gives 6.4m — nearly a metre shorter. Set a
   pony a horse's double and she meets the second element wrong. That difference
   is the whole reason this app exists.

   Everything is measured as CLEAR distance: from the back rail of one fence to
   the front rail of the next, along the line she will actually ride. That is how
   a distance is walked, and it is why a wide oxer eats into the gap. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./geometry.js') : root,
    typeof require === 'function' ? require('../data/distances.js') : root,
    typeof require === 'function' ? require('../data/jumps.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (geomMod, distMod, jumpMod) {
  const G = geomMod.bcbGeom;
  const TOL = distMod.BCB_TOLERANCE;
  const BANDS = distMod.BCB_BANDS;
  const LEGAL = distMod.BCB_COMBINATION_LEGAL;
  const MIN_GAP = distMod.BCB_MIN_GAP_M;
  const horseType = distMod.bcbHorseType;
  const jumpType = jumpMod.bcbJump;

  const STRIDE_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six',
    'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

  /* ---- The horse ------------------------------------------------------------
     A horse profile need only carry a stride length; everything else falls out.
     If she has measured her pony's take-off and landing, those override. */
  function strideModel(horse) {
    const type = horse && horse.typeId ? horseType(horse.typeId) : null;
    const strideM = (horse && horse.strideM) || (type && type.strideM) || 3.20;
    const half = strideM / 2;
    const takeoffM = (horse && horse.takeoffM) || half;
    const landingM = (horse && horse.landingM) || half;
    return {
      strideM,
      takeoffM,
      landingM,
      overheadM: takeoffM + landingM,
      turnRadiusM: (horse && horse.turnRadiusM) || (type && type.turnRadiusM) || 6.0,
      name: (horse && horse.name) || 'this horse'
    };
  }

  function trueDistance(model, strides) {
    return model.overheadM + strides * model.strideM;
  }

  /* ---- Units ----------------------------------------------------------------
     She will hear "twenty-four foot" at shows and will set the jumps out by
     walking, so every distance is offered three ways. */
  function feetInches(metres) {
    const totalIn = metres / 0.0254;
    let ft = Math.floor(totalIn / 12);
    let inch = Math.round(totalIn - ft * 12);
    if (inch === 12) { ft += 1; inch = 0; }
    return { feet: ft, inches: inch, text: inch ? `${ft}ft ${inch}in` : `${ft}ft` };
  }

  function paces(metres, paceM) {
    const p = metres / (paceM || TOL.paceM);
    return { paces: p, text: `${Math.round(p)} paces` };
  }

  function measurement(metres, paceM) {
    const fi = feetInches(metres);
    const pc = paces(metres, paceM);
    return {
      m: Math.round(metres * 100) / 100,
      metresText: `${(Math.round(metres * 10) / 10).toFixed(1)}m`,
      feet: fi.feet, inches: fi.inches, feetText: fi.text,
      paces: Math.round(pc.paces * 10) / 10, pacesText: pc.text
    };
  }

  /* ---- One fence as a box --------------------------------------------------- */
  function fenceBox(jump) {
    const spec = jumpType(jump.type);
    const spreadM = (jump.spreadCm != null ? jump.spreadCm : (spec ? spec.defaultSpreadCm : 0)) / 100;
    const widthM = jump.widthM || (spec ? spec.defaultWidthM : 3.0);
    return G.box({ x: jump.xM, y: jump.yM }, widthM, spreadM, jump.rotationDeg || 0);
  }

  /* ---- The gap between two fences -------------------------------------------
     `clearM` is back rail to front rail along the line of travel. The ray-box
     exit test means an oxer set at an angle to the line correctly presents more
     depth than its nominal spread — which is exactly what it feels like to ride. */
  function measureGap(a, b, opts) {
    const o = opts || {};
    const boxA = fenceBox(a), boxB = fenceBox(b);
    const centreM = G.dist(boxA.centre, boxB.centre);

    /* Direction of travel. On a route we use the tangents where the track passes
       each fence, so a dogleg is measured round the bend rather than across it. */
    let dirOut = G.norm(G.sub(boxB.centre, boxA.centre));
    let dirIn = dirOut;
    let pathM = null;
    let turnDeg = 0;

    if (o.track && o.track.length > 1 && o.sA != null && o.sB != null) {
      pathM = Math.abs(o.sB - o.sA);
      const tA = G.tangentAtLength(o.track, o.sA);
      const tB = G.tangentAtLength(o.track, o.sB);
      if (G.len(tA) > 1e-6) dirOut = tA;
      if (G.len(tB) > 1e-6) dirIn = tB;
      turnDeg = G.turnBetween(G.bearing(dirOut), G.bearing(dirIn));
    }

    const backOfA = G.rayBoxExit(boxA, dirOut);
    const frontOfB = G.rayBoxExit(boxB, G.mul(dirIn, -1));
    const along = pathM != null ? pathM : centreM;
    const clearM = along - backOfA - frontOfB;

    /* How far fence B sits to the side of A's jumping line — the dogleg. */
    const jumpLineA = G.rotate({ x: 0, y: 1 }, a.rotationDeg || 0);
    const offsetM = G.cross(jumpLineA, G.sub(boxB.centre, boxA.centre));

    return {
      centreM: round2(centreM),
      pathM: pathM == null ? null : round2(pathM),
      clearM: round2(clearM),
      travelBearing: G.bearing(dirOut),
      turnDeg: Math.round(turnDeg),
      turning: Math.abs(turnDeg) > 20,
      offsetM: round2(offsetM),
      onTrack: pathM != null
    };
  }

  /* ---- The assessment -------------------------------------------------------
     Given two fences and a horse, how does that distance ride? */
  function assessDistance(a, b, horse, opts) {
    const o = opts || {};
    const model = strideModel(horse);
    const gap = measureGap(a, b, o);
    const clearM = gap.clearM;
    const paceM = o.paceM || TOL.paceM;

    const labelA = fenceLabel(a), labelB = fenceLabel(b);
    const base = {
      fromId: a.id, toId: b.id, fromLabel: labelA, toLabel: labelB,
      measured: measurement(clearM, paceM),
      gap,
      horseName: model.name,
      strideM: model.strideM
    };

    /* Too close to be two fences at all. */
    if (clearM < Math.max(MIN_GAP, model.overheadM * 0.8)) {
      return Object.assign(base, {
        category: 'unjumpable', strides: null, strideWords: null,
        trueM: null, deviationM: null, deviationRatio: null,
        verdict: 'too-close', severity: 'error',
        alternatives: [], suggestion: null,
        advice: `Fences ${labelA} and ${labelB} are only ${fmt(clearM)} apart — too `
          + `close to be a distance. Either move one, or make them a combination.`
      });
    }

    const nReal = (clearM - model.overheadM) / model.strideM;
    const strides = Math.max(0, Math.round(nReal));
    const trueM = trueDistance(model, strides);
    const deviationM = clearM - trueM;
    const ratio = deviationM / model.strideM;
    const absRatio = Math.abs(ratio);

    /* Which band of the course is this? */
    let category;
    let note = null;
    if (strides === BANDS.bounceStrides) {
      category = 'bounce';
    } else if (strides <= BANDS.combinationMaxStrides && clearM <= LEGAL.maxM) {
      category = 'combination';
    } else if (strides <= BANDS.combinationMaxStrides) {
      category = 'related';
      note = `Over ${LEGAL.maxM.toFixed(2)}m apart, so at an affiliated show these `
        + `count as two separate fences rather than a combination.`;
    } else if (strides <= BANDS.relatedMaxStrides) {
      category = 'related';
    } else {
      category = 'unrelated';
    }

    /* On a long approach the number of strides is her choice, not a fault, so we
       report the distance and say nothing about the deviation. */
    if (category === 'unrelated') {
      return Object.assign(base, {
        category, strides, strideWords: words(strides),
        trueM: round2(trueM), deviationM: round2(deviationM),
        deviationRatio: round3(ratio),
        verdict: 'unrelated', severity: 'ok',
        alternatives: [], suggestion: null, note,
        advice: `${fmt(clearM)} from fence ${labelA} to fence ${labelB} — a long way, so `
          + `ride it in whatever rhythm suits. About ${strideWords(strides)}.`
      });
    }

    const verdict = verdictFor(absRatio, ratio);
    const severity = severityFor(verdict, category);
    const alternatives = neighbours(model, strides, clearM);
    const suggestion = suggestFix(a, b, gap, model, strides, deviationM);

    return Object.assign(base, {
      category, strides, strideWords: words(strides),
      trueM: round2(trueM),
      trueMeasured: measurement(trueM, paceM),
      deviationM: round2(deviationM),
      deviationRatio: round3(ratio),
      deviationPaces: round2(deviationM / paceM),
      verdict, severity, alternatives, suggestion, note,
      legalForCombination: category === 'combination' || category === 'bounce'
        ? clearM >= LEGAL.minM && clearM <= LEGAL.maxM
        : null,
      advice: adviceFor({ model, labelA, labelB, category, strides, clearM,
        trueM, deviationM, verdict, alternatives, note, paceM })
    });
  }

  function verdictFor(absRatio, ratio) {
    if (absRatio <= TOL.true) return 'true';
    const longShort = ratio > 0 ? 'long' : 'short';
    if (absRatio <= TOL.slight) return 'slightly-' + longShort;
    if (absRatio <= TOL.noticeable) return longShort;
    return 'between-strides';
  }

  function severityFor(verdict, category) {
    if (verdict === 'true') return 'ok';
    if (verdict.startsWith('slightly-')) return 'note';
    if (verdict === 'between-strides') return category === 'bounce' ? 'warn' : 'error';
    return 'warn';
  }

  /* The two stride counts either side, so she can see both ways out. */
  function neighbours(model, strides, clearM) {
    const out = [];
    for (const n of [strides - 1, strides, strides + 1]) {
      if (n < 0) continue;
      const t = trueDistance(model, n);
      out.push({ strides: n, trueM: round2(t), deviationM: round2(clearM - t) });
    }
    return out;
  }

  /* Where to move the second fence to make the distance true — the one-tap fix. */
  function suggestFix(a, b, gap, model, strides, deviationM) {
    if (Math.abs(deviationM) < 0.05) return null;
    const dir = G.norm(G.sub({ x: b.xM, y: b.yM }, { x: a.xM, y: a.yM }));
    return {
      moveJumpId: b.id,
      alongTravelM: round2(-deviationM),
      toStrides: strides,
      newX: round2(b.xM - dir.x * deviationM),
      newY: round2(b.yM - dir.y * deviationM),
      text: deviationM > 0
        ? `Bring fence ${fenceLabel(b)} ${fmt(Math.abs(deviationM))} closer for a true ${strideWords(strides)}.`
        : `Move fence ${fenceLabel(b)} ${fmt(Math.abs(deviationM))} further out for a true ${strideWords(strides)}.`
    };
  }

  /* ---- Wording -------------------------------------------------------------- */
  function adviceFor(c) {
    const { model, labelA, labelB, category, strides, clearM, deviationM,
      verdict, alternatives, note, paceM } = c;
    const who = model.name;
    const gapText = fmt(clearM);
    const strideText = strideWords(strides);
    const off = Math.abs(deviationM);
    const offText = `${fmt(off)} (about ${(off / paceM).toFixed(1)} paces)`;
    let s;

    if (category === 'bounce') {
      s = verdict === 'true'
        ? `${gapText} — a bounce. ${who} lands and goes straight again, no stride in between.`
        : `${gapText} is ${verdict.includes('long') ? 'long' : 'short'} for a bounce at `
          + `${who}'s ${fmt(model.strideM)} stride. A bounce wants about ${fmt(model.strideM)}.`;
    } else if (verdict === 'true') {
      s = `${gapText} — a true ${strideText} for ${who}. Ride it in an even rhythm.`;
    } else if (verdict === 'between-strides') {
      const lo = alternatives.find(x => x.strides === strides - 1);
      const hi = alternatives.find(x => x.strides === strides + 1);
      s = `${gapText} falls between strides for ${who} — too ${deviationM > 0 ? 'long' : 'short'} `
        + `for ${strideText}`;
      if (deviationM > 0 && hi) s += ` and ${fmt(Math.abs(hi.deviationM))} short of ${strideWords(hi.strides)}`;
      if (deviationM < 0 && lo) s += ` and ${fmt(Math.abs(lo.deviationM))} beyond ${strideWords(lo.strides)}`;
      s += `. This is the one to fix: move a fence rather than ask her to guess.`;
    } else if (verdict.startsWith('slightly-')) {
      s = `${gapText} — ${strideText}, a touch ${verdict.endsWith('long') ? 'long' : 'short'} `
        + `(${offText}). Nothing to worry about.`;
    } else {
      s = verdict === 'long'
        ? `${gapText} — ${strideText} but ${offText} long. ${who} will need to go `
          + `forward from fence ${labelA} to make it.`
        : `${gapText} — ${strideText} but ${offText} short. Steady on landing from `
          + `fence ${labelA} and wait for fence ${labelB}.`;
    }
    if (note) s += ' ' + note;
    return s;
  }

  function words(n) { return STRIDE_WORDS[n] != null ? STRIDE_WORDS[n] : String(n); }
  /* "one stride" but "two strides" — worth getting right, she will read this a lot. */
  function strideWords(n) { return `${words(n)} ${n === 1 ? 'stride' : 'strides'}`; }
  function fenceLabel(j) {
    if (j.number == null) return j.label || 'an unnumbered fence';
    return j.element ? `${j.number}${j.element}` : String(j.number);
  }
  function fmt(m) { return `${(Math.round(m * 10) / 10).toFixed(1)}m`; }
  function round2(n) { return Math.round(n * 100) / 100; }
  function round3(n) { return Math.round(n * 1000) / 1000; }

  /* ---- Would it ride differently on something else? ------------------------
     "A true two for your pony, but a stride short for a 16hh horse" is exactly
     the lesson she needs when copying a course out of a magazine. */
  function crossCheck(a, b, horseA, horseB, opts) {
    return {
      mine: assessDistance(a, b, horseA, opts),
      theirs: assessDistance(a, b, horseB, opts)
    };
  }

  /* Where to put a fence so it sits at a true distance — drives the snapping. */
  function trueDistanceTargets(model, maxStrides) {
    const out = [];
    for (let n = 0; n <= (maxStrides == null ? 5 : maxStrides); n++) {
      out.push({ strides: n, clearM: round2(trueDistance(model, n)) });
    }
    return out;
  }

  return {
    bcbStrides: {
      strideModel, trueDistance, trueDistanceTargets,
      fenceBox, measureGap, assessDistance, crossCheck,
      measurement, feetInches, paces,
      fenceLabel, words, strideWords, verdictFor, severityFor
    }
  };
});
