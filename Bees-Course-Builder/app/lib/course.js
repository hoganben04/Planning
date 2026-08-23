/* Bee's Course Builder — the course itself, and checking it over.

   `checkCourse` is the app's second job after measuring distances: read the whole
   course the way an instructor would walk it, and say what needs attention.

   Everything here is advice, not law. The rulebooks were unreachable when this
   was written (see data/sources.js), so the wording is deliberately "worth
   checking" rather than "against the rules" wherever the figure behind it is
   not certain. Pure functions, no DOM. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./geometry.js') : root,
    typeof require === 'function' ? require('./strides.js') : root,
    typeof require === 'function' ? require('./route.js') : root,
    typeof require === 'function' ? require('../data/levels.js') : root,
    typeof require === 'function' ? require('../data/jumps.js') : root,
    typeof require === 'function' ? require('../data/arenas.js') : root,
    typeof require === 'function' ? require('../data/distances.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (geomMod, strideMod, routeMod, levelMod, jumpMod, arenaMod, distMod) {
  const G = geomMod.bcbGeom;
  const S = strideMod.bcbStrides;
  const R = routeMod.bcbRoute;
  const MARGINS = arenaMod.BCB_MARGINS;
  const LEGAL = distMod.BCB_COMBINATION_LEGAL;

  /* ---- Making things ------------------------------------------------------- */
  let seq = 0;
  function id(prefix) {
    seq += 1;
    return `${prefix}_${Math.abs(hash(prefix + seq + ':' + seq * 2654435761)).toString(36)}${seq.toString(36)}`;
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h;
  }

  function newHorse(over) {
    return Object.assign({
      id: id('horse'), name: '', typeId: 'pony-large', breed: '',
      heightCm: 148, strideM: null, takeoffM: null, landingM: null,
      turnRadiusM: null, colour: '#7C5CD3', notes: ''
    }, over || {});
  }

  function newJump(over) {
    const spec = jumpMod.bcbJump((over && over.type) || 'vertical');
    return Object.assign({
      id: id('jump'), type: 'vertical',
      xM: 10, yM: 10, rotationDeg: 0, direction: 1,
      widthM: spec ? spec.defaultWidthM : 3.0,
      spreadCm: spec ? spec.defaultSpreadCm : 0,
      heightCm: 70,
      number: null, element: null,
      colour: null, filler: 'none', label: '', locked: false
    }, over || {});
  }

  function newCourse(over) {
    const arena = arenaMod.bcbArena(arenaMod.BCB_DEFAULT_ARENA);
    return Object.assign({
      id: id('course'), name: '',
      arena: { widthM: arena.widthM, lengthM: arena.lengthM, name: arena.name, indoor: arena.indoor },
      levelId: levelMod.BCB_DEFAULT_LEVEL,
      horseId: null,
      speedMpm: null,
      jumps: [],
      route: { mode: 'auto', points: [], startLine: null, finishLine: null },
      notes: '', createdAt: nowIso(), updatedAt: nowIso()
    }, over || {});
  }

  function nowIso() { return new Date().toISOString(); }

  /* ---- Numbering ----------------------------------------------------------- */
  /* Fences grouped into obstacles: a double or treble is simply two or three
     fences sharing a number, lettered A, B and C — exactly how a course plan
     writes it. */
  function efforts(course) {
    const byNumber = new Map();
    for (const j of course.jumps || []) {
      if (j.number == null) continue;
      if (!byNumber.has(j.number)) byNumber.set(j.number, []);
      byNumber.get(j.number).push(j);
    }
    const out = [];
    for (const [number, elements] of [...byNumber.entries()].sort((a, b) => a[0] - b[0])) {
      elements.sort((a, b) => String(a.element || '').localeCompare(String(b.element || '')));
      out.push({
        number, elements,
        kind: elements.length === 1 ? 'single' : (elements.length === 2 ? 'double' : 'treble'),
        biggestHeightCm: Math.max(...elements.map(e => e.heightCm || 0))
      });
    }
    return out;
  }

  /* Renumber from a list of jump ids in jumping order, lettering anything that
     sits within combination range of the fence before it. */
  function renumber(course, orderedIds, model) {
    const byId = new Map((course.jumps || []).map(j => [j.id, j]));
    const jumps = (course.jumps || []).map(j => Object.assign({}, j, { number: null, element: null }));
    const out = new Map(jumps.map(j => [j.id, j]));
    let number = 0;
    let group = [];

    const flush = () => {
      if (!group.length) return;
      if (group.length === 1) { group[0].element = null; }
      else group.forEach((j, i) => { j.element = 'ABC'[i] || String(i + 1); });
      group = [];
    };

    for (const jid of orderedIds) {
      const j = out.get(jid);
      const original = byId.get(jid);
      if (!j || !original) continue;
      const prev = group[group.length - 1];
      const joinsPrevious = prev
        && group.length < 3
        && withinCombination(byId.get(prev.id), original, model);
      if (joinsPrevious) {
        j.number = number;
        group.push(j);
      } else {
        flush();
        number += 1;
        j.number = number;
        group = [j];
      }
    }
    flush();
    return Object.assign({}, course, { jumps, updatedAt: nowIso() });
  }

  function withinCombination(a, b, model) {
    const gap = S.measureGap(a, b).clearM;
    const m = model || S.strideModel(null);
    const twoStrides = S.trueDistance(m, 2);
    return gap > 0 && gap <= Math.max(LEGAL.maxM, twoStrides + m.strideM * 0.4);
  }

  /* ---- Checking the course ------------------------------------------------- */
  function checkCourse(course, horse, settings) {
    const opts = settings || {};
    const model = S.strideModel(horse);
    const level = levelMod.bcbLevel(course.levelId) || null;
    const arena = course.arena || { widthM: 20, lengthM: 60 };
    const issues = [];
    const add = (code, severity, message, jumpIds, fix) =>
      issues.push({ code, severity, message, jumpIds: jumpIds || [], fix: fix || null });

    const fences = (course.jumps || []).filter(j => jumpMod.bcbIsFence(j.type));
    const poles = (course.jumps || []).filter(j => !jumpMod.bcbIsFence(j.type));
    const groups = efforts(course);
    const numbered = R.jumpingOrder(course.jumps || []);

    /* -- The track -- */
    const auto = R.autoRoute(course, model, arena);
    const usingAuto = !course.route || course.route.mode !== 'manual'
      || !(course.route.points && course.route.points.length > 1);
    const points = usingAuto ? auto.points : course.route.points;
    const lengthM = usingAuto ? (auto.lengthM || 0) : R.routeLength(points);
    const speed = course.speedMpm || (level && level.speedMpm) || 325;
    const timing = R.timeAllowed(lengthM, speed);
    const fenceAt = usingAuto ? auto.fenceAt : R.fencePositions(points, course.jumps || []);

    /* -- Distances between consecutive fences, measured along the track -- */
    const legs = [];
    for (let i = 1; i < fenceAt.length; i++) {
      const from = fenceAt[i - 1], to = fenceAt[i];
      const a = from.jump, b = to.jump;
      const assessment = S.assessDistance(a, b, horse, {
        track: points, sA: from.s, sB: to.s, paceM: opts.paceM
      });
      const sameObstacle = a.number === b.number;
      legs.push(Object.assign(assessment, { sameObstacle }));

      if (assessment.severity === 'error') {
        add(assessment.category === 'unjumpable' ? 'distance-unjumpable' : 'distance-between-strides',
          'error', assessment.advice, [a.id, b.id], assessment.suggestion);
      } else if (assessment.severity === 'warn') {
        add('distance-off', 'warn', assessment.advice, [a.id, b.id], assessment.suggestion);
      }

      /* Two fences close together but facing different ways cannot be ridden as
         a combination and leave no room to turn either. It is the one course
         fault that has no fix except moving a fence. */
      const facing = Math.abs(G.turnBetween(
        G.bearing(R.jumpNormal(a)), G.bearing(R.jumpNormal(b))));
      /* Judged on the straight-line gap, not the distance round the track: when
         two fences face opposite ways the track has to loop right around, so the
         along-track figure is long and would hide the very fault we are after. */
      const straightGap = S.measureGap(a, b).clearM;
      const closeOnTheGround = straightGap > 0
        && straightGap <= S.trueDistance(model, 2) + model.strideM * 0.4;
      if (closeOnTheGround && facing >= 45) {
        add('too-close-to-turn', 'error',
          `Fences ${assessment.fromLabel} and ${assessment.toLabel} are only `
          + `${assessment.measured.metresText} apart but face ${Math.round(facing)} degrees `
          + `apart, so there is no room to turn between them and they cannot be jumped as `
          + `a combination. One of them has to move.`, [a.id, b.id]);
      }

      /* Two fences a stride or two apart are one obstacle, and should be
         numbered as one. Worth learning before she gets to a show. */
      if (!sameObstacle && facing < 45
        && (assessment.category === 'combination' || assessment.category === 'bounce')) {
        add('combination-not-numbered', 'warn',
          `Fences ${assessment.fromLabel} and ${assessment.toLabel} are only `
          + `${assessment.measured.metresText} apart, which makes them one obstacle — `
          + `a ${assessment.category === 'bounce' ? 'bounce' : 'combination'}. `
          + `Number them ${assessment.fromLabel}A and ${assessment.fromLabel}B.`,
          [a.id, b.id]);
      }
      if (sameObstacle && assessment.gap.clearM > LEGAL.maxM) {
        add('combination-too-far', 'warn',
          `Fence ${a.number}'s elements are ${assessment.measured.metresText} apart. `
          + `Beyond ${LEGAL.maxM.toFixed(2)}m they count as two separate fences.`,
          [a.id, b.id]);
      }
    }

    /* -- Numbering -- */
    const seen = new Map();
    for (const j of numbered) {
      const key = `${j.number}${j.element || ''}`;
      if (seen.has(key)) {
        add('duplicate-number', 'error',
          `Two fences are both numbered ${key}. Give one of them its own number.`,
          [seen.get(key), j.id]);
      } else seen.set(key, j.id);
    }
    for (const g of groups) {
      if (g.elements.length > 1 && g.elements.some(e => !e.element)) {
        add('element-not-lettered', 'warn',
          `Fence ${g.number} has ${g.elements.length} elements, so they need lettering `
          + `A, B${g.elements.length > 2 ? ' and C' : ''}.`,
          g.elements.map(e => e.id));
      }
      if (g.elements.length === 1 && g.elements[0].element) {
        add('element-without-siblings', 'warn',
          `Fence ${g.number}${g.elements[0].element} is lettered as part of a combination `
          + `but stands on its own.`, [g.elements[0].id]);
      }
    }
    const numbers = groups.map(g => g.number);
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1) {
        add('numbering-gap', 'note',
          `The fences are numbered ${numbers.join(', ')} — there is a gap. Renumbering `
          + `will tidy it up.`, []);
        break;
      }
    }
    const unnumbered = fences.filter(j => j.number == null);
    if (unnumbered.length) {
      add('not-in-the-round', 'note',
        `${unnumbered.length} ${unnumbered.length === 1 ? 'fence is' : 'fences are'} not `
        + `numbered, so ${unnumbered.length === 1 ? 'it is' : 'they are'} not part of the round.`,
        unnumbered.map(j => j.id));
    }

    /* -- Does it fit, and is it safe to ride? -- */
    for (const j of course.jumps || []) {
      const box = S.footprintBox(j);
      const clear = G.boxClearance(box, arena.widthM, arena.lengthM);
      if (clear < 0) {
        add('fence-outside-arena', 'error',
          `${describe(j)} sticks out past the arena fence.`, [j.id]);
      } else if (clear < MARGINS.edgeM && jumpMod.bcbIsFence(j.type)) {
        add('boundary-clearance', 'warn',
          `${describe(j)} is only ${clear.toFixed(1)}m from the boards — there is not much `
          + `room to land and get straight. Aim for at least ${MARGINS.edgeM}m.`, [j.id]);
      }
    }
    for (let i = 0; i < (course.jumps || []).length; i++) {
      for (let k = i + 1; k < course.jumps.length; k++) {
        const a = course.jumps[i], b = course.jumps[k];
        if (a.number != null && a.number === b.number) continue;
        if (G.boxesOverlap(S.footprintBox(a), S.footprintBox(b))) {
          add('overlapping-fences', 'error',
            `${describe(a)} and ${describe(b)} are on top of each other.`, [a.id, b.id]);
        }
      }
    }

    /* -- Room to land. A fence needs ground beyond it as much as in front of it:
          landing three metres from the boards is how a pony gets hurt, and it is
          the check a beginner is least likely to think of. -- */
    for (const j of numbered) {
      const n = R.jumpNormal(j);
      const box = S.fenceBox(j);
      const backOfFence = G.add(box.centre, G.mul(n, G.rayBoxExit(box, n)));
      const room = roomAhead(backOfFence, n, arena);
      if (room < MARGINS.landingM) {
        add('landing-room-short', room < 3 ? 'error' : 'warn',
          `${describe(j)} leaves only ${room.toFixed(1)}m to land in before the boards. `
          + `Aim for ${MARGINS.landingM}m so she can land and get straight. Turn the fence `
          + `round, or move it away from the fence line.`, [j.id]);
      }
    }

    /* -- Turns -- */
    const turn = R.turnCheck(points, model);
    if (turn && turn.tooTight) {
      add('turn-too-tight', 'warn',
        `The tightest turn on the track is about ${turn.tightestRadiusM}m across, and `
        + `${model.name} wants nearer ${turn.wantedRadiusM}m to stay balanced at canter. `
        + `Either spread the fences out or plan to come back to trot.`, []);
    }
    if (auto.legs) {
      for (const leg of auto.legs) {
        if (leg.outsideArena) {
          add('turn-outside-arena', 'warn',
            `The turn between these two fences cannot be ridden inside the arena at a `
            + `sensible radius. Move one of them.`, [leg.fromId, leg.toId]);
        }
      }
    }

    /* -- The start and finish -- */
    if (numbered.length) {
      if (auto.startFromFenceM != null && auto.startFromFenceM < 6) {
        add('run-in-too-short', 'warn',
          `There is only ${auto.startFromFenceM}m from the start line to fence 1. Six `
          + `metres is the usual minimum, and more gives a better canter.`, [numbered[0].id]);
      }
      if (auto.cramped) {
        add('arena-cramped', 'note',
          `This arena is tight for a course this size — the start and finish lines have `
          + `been pulled in to fit.`, []);
      }
    }

    /* -- Heights and spreads against the level -- */
    if (level) {
      const maxH = level.maxHeightCm || level.heightCm;
      for (const j of fences) {
        if ((j.heightCm || 0) > maxH) {
          add('height-above-level', 'warn',
            `${describe(j)} is ${(j.heightCm / 100).toFixed(2)}m, above the `
            + `${(maxH / 100).toFixed(2)}m this level builds to.`, [j.id]);
        }
        const spec = jumpMod.bcbJump(j.type);
        const maxSpread = spec && spec.id === 'triple-bar' ? level.tripleBarCm : level.spreadCm;
        if (spec && spec.hasSpread && maxSpread && (j.spreadCm || 0) > maxSpread) {
          add('spread-above-level', 'note',
            `${describe(j)} is ${(j.spreadCm / 100).toFixed(2)}m wide, more than the `
            + `${(maxSpread / 100).toFixed(2)}m we have down for this level. That figure `
            + `is our own estimate — check your schedule.`, [j.id]);
        }
      }
      const effortCount = numbered.length;
      if (effortCount && level.efforts) {
        if (effortCount < level.efforts[0]) {
          add('few-efforts', 'note',
            `${effortCount} jumping efforts. A ${level.name} course usually has `
            + `${level.efforts[0]} to ${level.efforts[1]}.`, []);
        } else if (effortCount > level.efforts[1]) {
          add('many-efforts', 'note',
            `${effortCount} jumping efforts — more than the ${level.efforts[1]} a `
            + `${level.name} course usually has.`, []);
        }
      }
      const combos = groups.filter(g => g.elements.length > 1).length;
      if (level.minCombos && combos < level.minCombos && numbered.length >= 6) {
        add('too-few-combinations', 'note',
          `A ${level.name} course usually has at least ${level.minCombos} `
          + `${level.minCombos === 1 ? 'combination' : 'combinations'}; this one has `
          + `${combos}.`, []);
      }
    }

    /* -- Course length: the FEI caps it at 60m per obstacle -- */
    if (groups.length && lengthM > groups.length * 60) {
      add('course-too-long', 'note',
        `The track is ${Math.round(lengthM)}m for ${groups.length} obstacles. The usual `
        + `cap is 60m an obstacle, so ${groups.length * 60}m here — the route may be `
        + `wandering more than it needs to.`, []);
    }

    /* -- Has she got the jumps to build it? -- */
    const kit = kitNeeded(course.jumps || []);
    const owned = opts.kit || null;
    const kitShort = [];
    if (owned) {
      for (const key of Object.keys(kit)) {
        const have = owned[key];
        if (have != null && kit[key] > have) {
          kitShort.push({ item: key, need: kit[key], have });
        }
      }
      if (kitShort.length) {
        add('kit-short', 'warn',
          'You have not got enough kit for this one: '
          + kitShort.map(k => `${k.need} ${kitLabel(k.item, k.need)} (you have ${k.have})`).join(', ')
          + '.', []);
      }
    }

    const counts = { error: 0, warn: 0, note: 0, ok: 0 };
    for (const i of issues) counts[i.severity] = (counts[i.severity] || 0) + 1;

    return {
      efforts: groups,
      legs,
      poles: poles.length,
      route: {
        points, lengthM: Math.round(lengthM * 10) / 10, mode: usingAuto ? 'auto' : 'manual',
        startLine: usingAuto ? auto.startLine : course.route.startLine,
        finishLine: usingAuto ? auto.finishLine : course.route.finishLine,
        fenceAt, legs: auto.legs || [], turn
      },
      timing,
      issues,
      kit: { needed: kit, owned, short: kitShort },
      summary: {
        fences: fences.length,
        poles: poles.length,
        obstacles: groups.length,
        efforts: numbered.length,
        combinations: groups.filter(g => g.elements.length > 1).length,
        biggestHeightCm: fences.length ? Math.max(...fences.map(f => f.heightCm || 0)) : 0,
        lengthM: Math.round(lengthM),
        timeAllowed: timing.text,
        errors: counts.error || 0,
        warnings: counts.warn || 0,
        notes: counts.note || 0,
        horseName: model.name,
        strideM: model.strideM,
        levelName: level ? level.name : 'No level set'
      }
    };
  }

  /* How much arena there is ahead of a point, travelling in a direction. */
  function roomAhead(p, dir, arena) {
    const u = G.norm(dir);
    let best = Infinity;
    if (u.x > 1e-6) best = Math.min(best, (arena.widthM - p.x) / u.x);
    if (u.x < -1e-6) best = Math.min(best, (0 - p.x) / u.x);
    if (u.y > 1e-6) best = Math.min(best, (arena.lengthM - p.y) / u.y);
    if (u.y < -1e-6) best = Math.min(best, (0 - p.y) / u.y);
    return Math.max(0, Number.isFinite(best) ? best : 0);
  }

  /* What it takes to build this course, in things a rider owns. */
  function kitNeeded(jumps) {
    const total = { wings: 0, poles: 0, walls: 0, planks: 0, gates: 0, trays: 0, fillers: 0 };
    for (const j of jumps) {
      const spec = jumpMod.bcbJump(j.type);
      if (!spec) continue;
      for (const key of Object.keys(spec.kit)) {
        total[key] = (total[key] || 0) + spec.kit[key];
      }
      if (j.filler && j.filler !== 'none') total.fillers += 1;
    }
    return total;
  }

  function kitLabel(item, n) {
    const one = { wings: 'pair of wings', poles: 'pole', walls: 'wall', planks: 'set of planks',
      gates: 'gate', trays: 'water tray', fillers: 'filler' }[item] || item;
    if (n === 1) return one;
    return { wings: 'pairs of wings', poles: 'poles', walls: 'walls', planks: 'sets of planks',
      gates: 'gates', trays: 'water trays', fillers: 'fillers' }[item] || item;
  }

  function describe(j) {
    const spec = jumpMod.bcbJump(j.type);
    const name = spec ? spec.name : 'Fence';
    if (j.number == null) return `An unnumbered ${name.toLowerCase()}`;
    return `Fence ${j.number}${j.element || ''} (${name.toLowerCase()})`;
  }

  return {
    bcbCourse: {
      id, newHorse, newJump, newCourse, nowIso,
      efforts, renumber, withinCombination,
      checkCourse, kitNeeded, kitLabel, describe, roomAhead
    }
  };
});
