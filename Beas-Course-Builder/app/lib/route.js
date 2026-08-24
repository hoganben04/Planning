/* Bea's Course Builder — the ridden line.

   The track is the line she will actually ride, and it matters for two reasons:
   it is what the distances are measured along (a dogleg is measured round the
   bend, not across it), and its length is what the time allowed is worked out
   from.

   Pure maths, no DOM. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./geometry.js') : root,
    typeof require === 'function' ? require('./strides.js') : root,
    typeof require === 'function' ? require('./turns.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (geomMod, strideMod, turnMod) {
  const G = geomMod.bcbGeom;
  const S = strideMod.bcbStrides;
  const T = turnMod.bcbTurns;

  /* The direction a fence is jumped in: down the plan at 0 degrees, flipped if
     she rides it the other way. */
  function jumpDirection(jump) {
    return G.rotate({ x: 0, y: 1 }, jump.rotationDeg || 0);
  }

  function jumpNormal(jump) {
    const d = jumpDirection(jump);
    return (jump.direction === -1) ? G.mul(d, -1) : d;
  }

  /* Fences in the order she jumps them: by number, then A before B before C.
     Ground poles and anything unnumbered are not part of the round. */
  function jumpingOrder(jumps) {
    return jumps
      .filter(j => j.number != null)
      .slice()
      .sort((a, b) => (a.number - b.number)
        || String(a.element || '').localeCompare(String(b.element || '')));
  }

  /* Build a track through the fences.

     Each fence gets a straight approach and a straight getaway along its own
     line, so the horse meets it square. Between one fence's getaway and the
     next fence's approach we solve a proper arc/straight/arc turn (see
     turns.js) at the horse's own turning radius. That is what stops the track
     doubling back through an impossible hairpin when two fences face opposite
     ways, and it means the length — and so the time allowed — is one a horse
     could actually achieve. */
  function autoRoute(course, model, arena) {
    const order = jumpingOrder(course.jumps || []);
    const empty = { points: [], order: [], fenceAt: [], legs: [], startLine: null, finishLine: null };
    if (!order.length) return empty;

    const stride = (model && model.strideM) || 3.2;
    const wantedR = (model && model.turnRadiusM) || 6;
    const approachM = Math.max(stride * 1.5, 4.5);
    const landingM = Math.max(stride * 1.2, 4.0);
    const bounds = arena ? { widthM: arena.widthM, lengthM: arena.lengthM, marginM: 1.0 } : null;

    /* Append points while keeping a running arc length, so we know exactly where
       each fence sits along the track rather than having to search for it. */
    const points = [];
    let length = 0;
    function push(p) {
      const last = points[points.length - 1];
      if (last && G.dist(last, p) < 1e-6) return;
      if (last) length += G.dist(last, p);
      points.push({ x: p.x, y: p.y });
    }

    const fenceAt = [];
    const legs = [];
    const centreOf = j => ({ x: j.xM, y: j.yM });

    /* Start gate, pulled in if it would fall outside the arena. */
    const firstN = jumpNormal(order[0]);
    const firstApproach = G.sub(centreOf(order[0]), G.mul(firstN, approachM));
    const gateOut = gateRoom(firstApproach, G.mul(firstN, -1), bounds, 8.0);
    const startPoint = G.sub(firstApproach, G.mul(firstN, gateOut));

    push(startPoint);
    push(firstApproach);

    for (let i = 0; i < order.length; i++) {
      const j = order[i];
      const n = jumpNormal(j);
      const centre = centreOf(j);

      push(centre);
      fenceAt.push({ id: j.id, jump: j, s: length, x: centre.x, y: centre.y });

      const next = order[i + 1];
      if (!next) continue;

      /* Elements of a combination are a stride or two apart, which is closer
         than the approach and getaway straights we would otherwise draw. Trying
         to turn between them sends the track off on an absurd loop, so anything
         inside combination range is ridden straight through — which is what
         actually happens on a double or a treble. */
      const nn = jumpNormal(next);
      const gap = S.measureGap(j, next).clearM;
      /* ...but only when the two fences actually face the same way. Two fences a
         stride apart pointing in opposite directions cannot be ridden straight
         through OR turned between; that is a fault in the course, and course.js
         reports it rather than us drawing a nonsense loop here. */
      const sameWay = Math.abs(G.turnBetween(G.bearing(n), G.bearing(nn))) < 45;
      if (gap > 0 && gap <= stride * 2.8 && sameWay) continue;
      const landing = G.add(centre, G.mul(n, landingM));
      const nextApproach = G.sub(centreOf(next), G.mul(nn, approachM));
      push(landing);
      const leg = T.joinLeg(landing, n, nextApproach, nn, wantedR, bounds);
      for (const p of leg.points.slice(1)) push(p);
      legs.push({
        fromId: j.id, toId: next.id, radiusM: leg.radiusM,
        tight: leg.tight, outsideArena: leg.outsideArena, lengthM: round1(leg.length)
      });
    }

    const lastJ = order[order.length - 1];
    const lastN = jumpNormal(lastJ);
    const lastLanding = G.add(centreOf(lastJ), G.mul(lastN, landingM));
    push(lastLanding);
    const gateIn = gateRoom(lastLanding, lastN, bounds, 8.0);
    const finishPoint = G.add(lastLanding, G.mul(lastN, gateIn));
    push(finishPoint);

    return {
      points,
      order: order.map(j => j.id),
      fenceAt,
      legs,
      lengthM: round1(length),
      startLine: gateLine(startPoint, firstN, 8),
      finishLine: gateLine(finishPoint, lastN, 8),
      startFromFenceM: round1(approachM + gateOut),
      finishFromFenceM: round1(landingM + gateIn),
      cramped: gateOut < 8 || gateIn < 8
    };
  }

  /* How far we can go from `p` along `dir` before running out of arena. Keeps the
     start and finish lines inside the school rather than out in the hedge. */
  function gateRoom(p, dir, bounds, wanted) {
    if (!bounds) return wanted;
    const m = 1.0;
    const u = G.norm(dir);
    let room = wanted;
    for (let d = wanted; d >= 1; d -= 0.5) {
      const q = G.add(p, G.mul(u, d));
      if (q.x >= m && q.y >= m && q.x <= bounds.widthM - m && q.y <= bounds.lengthM - m) {
        room = d; break;
      }
      room = 1;
    }
    return room;
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  /* A start or finish line: a segment across the track, 8m wide. */
  function gateLine(centre, dir, width) {
    const across = G.rotate(G.norm(dir), 90);
    const half = (width || 8) / 2;
    return {
      x1: centre.x - across.x * half, y1: centre.y - across.y * half,
      x2: centre.x + across.x * half, y2: centre.y + across.y * half,
      cx: centre.x, cy: centre.y
    };
  }

  /* Where each fence sits along the track, as an arc length. Constrained to run
     forward, so a track that passes the same fence twice still resolves in the
     order she jumps it. */
  function fencePositions(points, jumps) {
    const order = jumpingOrder(jumps);
    const out = [];
    let from = 0;
    for (const j of order) {
      const p = G.projectOnPolyline(points, { x: j.xM, y: j.yM }, from);
      out.push({ id: j.id, jump: j, s: p.s, x: p.x, y: p.y, offTrackM: p.distance });
      from = p.s;
    }
    return out;
  }

  function routeLength(points) {
    return points && points.length > 1 ? G.polylineLength(points) : 0;
  }

  /* Time allowed, from the class speed in metres per minute. The time limit is
     twice the time allowed, which is the usual convention. */
  function timeAllowed(lengthM, speedMpm) {
    const speed = speedMpm || 325;
    const seconds = Math.ceil(lengthM / speed * 60);
    return {
      lengthM: Math.round(lengthM),
      speedMpm: speed,
      seconds,
      limitSeconds: seconds * 2,
      text: formatTime(seconds),
      limitText: formatTime(seconds * 2)
    };
  }

  function formatTime(s) {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  }

  /* Direction chevrons along the track, for the drawing. */
  function directionMarks(points, everyM) {
    const step = everyM || 7;
    const total = routeLength(points);
    const marks = [];
    for (let s = step; s < total; s += step) {
      const p = G.pointAtLength(points, s);
      const t = G.tangentAtLength(points, s);
      marks.push({ x: p.x, y: p.y, angle: G.bearing(t) });
    }
    return marks;
  }

  /* Stride pips along a leg, so she can see the strides she is counting. */
  function stridePips(points, sFrom, sTo, strideM) {
    const pips = [];
    let n = 1;
    for (let s = sFrom + strideM; s < sTo - strideM * 0.4; s += strideM) {
      const p = G.pointAtLength(points, s);
      pips.push({ x: p.x, y: p.y, n: n++ });
    }
    return pips;
  }

  /* The tightest turn on the track, and whether the horse can balance round it. */
  function turnCheck(points, model) {
    if (!points || points.length < 4) return null;
    const radius = G.tightestRadius(points, 3);
    const wanted = (model && model.turnRadiusM) || 6;
    return {
      tightestRadiusM: Math.round(radius * 10) / 10,
      wantedRadiusM: wanted,
      tooTight: radius < wanted * 0.75
    };
  }

  return {
    bcbRoute: {
      jumpDirection, jumpNormal, jumpingOrder, autoRoute, gateLine,
      fencePositions, routeLength, timeAllowed, formatTime, gateRoom,
      directionMarks, stridePips, turnCheck
    }
  };
});
