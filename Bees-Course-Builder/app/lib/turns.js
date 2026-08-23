/* Bee's Course Builder — joining one fence to the next.

   A course plan is not a wiggly line through the fences. It is a straight
   approach to each fence, a straight getaway from it, and a sweeping turn in
   between — because that is how a horse is actually ridden, and because a turn
   has a smallest radius it can be balanced round.

   So each leg is solved as arc / straight / arc: leave the last fence on its own
   line, curve at a fixed radius, run straight, curve again, and arrive at the
   next fence square to it. There are four ways to do that (turn left or right at
   each end) and we take the shortest one that stays in the arena.

   This matters for honesty as much as for looks. Smoothing a spline through the
   fences produces hairpins tighter than any horse can turn, and then reports a
   course length — and therefore a time allowed — that nobody could achieve.

   Angles are in degrees clockwise, y points down the plan (see geometry.js).
   A turn direction of +1 is clockwise on the plan, -1 anticlockwise. */
(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./geometry.js') : root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (geomMod) {
  const G = geomMod.bcbGeom;
  const EPS = 1e-9;

  /* The centre of the circle you turn about, going in direction `h`, turning `s`. */
  function turnCentre(p, h, s, R) {
    return G.add(p, G.mul(G.rotate(G.norm(h), 90 * s), R));
  }

  /* How far round the circle from a to b, turning in direction s. Always positive. */
  function arcAngle(centre, a, b, s) {
    const va = G.sub(a, centre), vb = G.sub(b, centre);
    const raw = Math.atan2(vb.y, vb.x) - Math.atan2(va.y, va.x);
    let ang = s > 0 ? raw : -raw;
    while (ang < 0) ang += Math.PI * 2;
    while (ang >= Math.PI * 2) ang -= Math.PI * 2;
    return ang;
  }

  /* One arc/straight/arc candidate, or null if this pair of turns cannot be
     joined at this radius. */
  function candidate(p1, h1, p2, h2, R, s1, s2) {
    const c1 = turnCentre(p1, h1, s1, R);
    const c2 = turnCentre(p2, h2, s2, R);
    const v = G.sub(c2, c1);
    const D = G.len(v);
    let t1, t2, straight;

    if (s1 === s2) {
      /* Same-handed turns: the straight runs parallel to the line of centres. */
      if (D < EPS) { t1 = p1; t2 = p2; straight = 0; }
      else {
        const dir = G.norm(v);
        const off = G.mul(G.rotate(dir, 90 * s1), R);
        t1 = G.sub(c1, off);
        t2 = G.sub(c2, off);
        straight = D;
      }
    } else {
      /* Opposite-handed: an inside tangent, which only exists if the circles are
         far enough apart. */
      if (D < 2 * R - EPS) return null;
      const base = Math.atan2(v.y, v.x);
      const beta = Math.acos(Math.min(1, Math.max(-1, -2 * R / D)));
      let best = null;
      for (const sign of [1, -1]) {
        const phi = base - G.rad(90 * s1) + sign * beta;
        const dir = { x: Math.cos(phi), y: Math.sin(phi) };
        const a1 = G.sub(c1, G.mul(G.rotate(dir, 90 * s1), R));
        const a2 = G.sub(c2, G.mul(G.rotate(dir, 90 * s2), R));
        /* the straight must actually run forwards along `dir` */
        if (G.dot(G.sub(a2, a1), dir) < -EPS) continue;
        const total = R * arcAngle(c1, p1, a1, s1) + G.dist(a1, a2)
          + R * arcAngle(c2, a2, p2, s2);
        if (!best || total < best.total) best = { t1: a1, t2: a2, straight: G.dist(a1, a2), total };
      }
      if (!best) return null;
      t1 = best.t1; t2 = best.t2; straight = best.straight;
    }

    const a1 = arcAngle(c1, p1, t1, s1);
    const a2 = arcAngle(c2, t2, p2, s2);
    return {
      s1, s2, c1, c2, R, t1, t2, straight,
      arc1: a1, arc2: a2,
      length: R * a1 + straight + R * a2
    };
  }

  /* The shortest arc/straight/arc join, preferring one that stays in the arena. */
  function solve(p1, h1, p2, h2, R, bounds) {
    const options = [];
    for (const s1 of [1, -1]) {
      for (const s2 of [1, -1]) {
        const c = candidate(p1, h1, p2, h2, R, s1, s2);
        if (c) options.push(c);
      }
    }
    if (!options.length) return null;
    options.sort((a, b) => a.length - b.length);
    if (bounds) {
      const inside = options.find(c => withinBounds(sample(p1, h1, p2, h2, c), bounds));
      if (inside) return inside;
    }
    return options[0];
  }

  /* Walk a solved join into a polyline. */
  function sample(p1, h1, p2, h2, c, stepM) {
    const step = stepM || 1.2;
    const pts = [];
    const arcPoints = (centre, from, angle, s) => {
      const r = G.dist(centre, from);
      const start = Math.atan2(from.y - centre.y, from.x - centre.x);
      const n = Math.max(1, Math.ceil(r * angle / step));
      for (let i = 1; i <= n; i++) {
        const a = start + (s > 0 ? 1 : -1) * angle * (i / n);
        pts.push({ x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a) });
      }
    };
    pts.push({ x: p1.x, y: p1.y });
    if (c.arc1 > EPS) arcPoints(c.c1, p1, c.arc1, c.s1);
    if (c.straight > step) {
      const n = Math.ceil(c.straight / step);
      for (let i = 1; i < n; i++) {
        pts.push({
          x: c.t1.x + (c.t2.x - c.t1.x) * (i / n),
          y: c.t1.y + (c.t2.y - c.t1.y) * (i / n)
        });
      }
    }
    pts.push({ x: c.t2.x, y: c.t2.y });
    if (c.arc2 > EPS) arcPoints(c.c2, c.t2, c.arc2, c.s2);
    pts.push({ x: p2.x, y: p2.y });
    /* Arc sampling lands on the end point, so drop the duplicates it leaves
       behind — a repeated point has no direction, which breaks any tangent
       taken at the very end of the leg. */
    return dedupe(pts);
  }

  function dedupe(points, tol) {
    const t = tol == null ? 1e-6 : tol;
    const out = [];
    for (const p of points) {
      const last = out[out.length - 1];
      if (!last || Math.abs(last.x - p.x) > t || Math.abs(last.y - p.y) > t) out.push(p);
    }
    return out;
  }

  function withinBounds(points, b) {
    const m = b.marginM == null ? 0.5 : b.marginM;
    return points.every(p => p.x >= -m && p.y >= -m
      && p.x <= b.widthM + m && p.y <= b.lengthM + m);
  }

  /* Join two fence lines, shrinking the turn radius if nothing else fits. A leg
     that only works on a tighter turn than the horse likes is reported as such
     rather than silently drawn. */
  function joinLeg(p1, h1, p2, h2, wantedR, bounds) {
    const tries = [wantedR, wantedR * 0.8, wantedR * 0.65, wantedR * 0.5, 3.0];
    let fallback = null;
    for (const R of tries) {
      if (R < 2) break;
      const c = solve(p1, h1, p2, h2, R, bounds);
      if (!c) continue;
      const pts = sample(p1, h1, p2, h2, c);
      const ok = !bounds || withinBounds(pts, bounds);
      const result = {
        points: pts, length: c.length, radiusM: R,
        tight: R < wantedR - 0.01, outsideArena: !ok, solution: c
      };
      if (ok) return result;
      if (!fallback) fallback = result;
    }
    if (fallback) return fallback;
    /* Nothing worked — fall back to a straight line so the app never breaks. */
    return {
      points: [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }],
      length: G.dist(p1, p2), radiusM: null, tight: true, outsideArena: false,
      solution: null
    };
  }

  return { bcbTurns: { turnCentre, arcAngle, candidate, solve, sample, joinLeg, withinBounds, dedupe } };
});
