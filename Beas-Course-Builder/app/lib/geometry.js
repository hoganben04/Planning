/* Bea's Course Builder — geometry. Pure maths, no DOM, so the tests can run it
   straight in node.

   COORDINATES. Everything is in metres, measured from the arena's top-left
   corner, x to the right and y DOWNWARD — the same way SVG works, so nothing has
   to be flipped when it is drawn. Angles are in degrees, clockwise, and a fence
   at 0 degrees has its poles lying left-to-right and is jumped downward (+y). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TAU = Math.PI * 2;
  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;

  const pt = (x, y) => ({ x, y });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const len = a => Math.hypot(a.x, a.y);
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function norm(a) {
    const l = len(a);
    return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
  }

  /* Rotate a vector clockwise by `d` degrees (clockwise because y points down). */
  function rotate(a, d) {
    const t = rad(d), c = Math.cos(t), s = Math.sin(t);
    return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
  }

  function rotateAbout(p, centre, d) {
    return add(centre, rotate(sub(p, centre), d));
  }

  /* Bearing of a vector in degrees clockwise from "up the plan" is awkward; we use
     degrees clockwise from +x, which is what rotate() above agrees with. */
  const bearing = a => (deg(Math.atan2(a.y, a.x)) + 360) % 360;

  /* Smallest signed turn from bearing a to bearing b, in (-180, 180]. */
  function turnBetween(a, b) {
    let t = ((b - a + 540) % 360) - 180;
    return t === -180 ? 180 : t;
  }

  const clamp = (n, lo, hi) => n < lo ? lo : (n > hi ? hi : n);

  /* ---- Oriented bounding box -------------------------------------------------
     A fence is a box: `widthM` across the poles, `spreadM` deep, turned by
     `rotationDeg`, centred on (x, y). At 0 degrees the width runs along x and the
     spread along y, so the horse jumps it in the +y direction. */
  function box(centre, widthM, spreadM, rotationDeg) {
    return {
      centre,
      halfW: widthM / 2,
      halfD: Math.max(spreadM, 0) / 2,
      rotationDeg,
      /* unit vectors of the box's own axes, in arena space */
      axisW: rotate({ x: 1, y: 0 }, rotationDeg),
      axisD: rotate({ x: 0, y: 1 }, rotationDeg)
    };
  }

  function boxCorners(b) {
    const w = mul(b.axisW, b.halfW), d = mul(b.axisD, b.halfD);
    return [
      add(add(b.centre, mul(w, -1)), mul(d, -1)),
      add(add(b.centre, w), mul(d, -1)),
      add(add(b.centre, w), d),
      add(add(b.centre, mul(w, -1)), d)
    ];
  }

  /* How far from the box centre you leave the box, travelling along `dir`.
     This is the slab test, done in the box's own frame. It is what makes an
     angled fence correctly present more depth than its nominal spread: a 1.1m
     oxer turned 30 degrees to the line of travel is deeper than 1.1m to jump. */
  function rayBoxExit(b, dir) {
    const u = norm(dir);
    /* the ray direction expressed in box axes */
    const dw = dot(u, b.axisW);
    const dd = dot(u, b.axisD);
    const tw = Math.abs(dw) < 1e-9 ? Infinity : b.halfW / Math.abs(dw);
    const td = Math.abs(dd) < 1e-9 ? Infinity : b.halfD / Math.abs(dd);
    const t = Math.min(tw, td);
    return Number.isFinite(t) ? t : 0;
  }

  /* Do two fence boxes overlap? Separating-axis test on the four axes. */
  function boxesOverlap(a, b) {
    const axes = [a.axisW, a.axisD, b.axisW, b.axisD];
    const ca = boxCorners(a), cb = boxCorners(b);
    for (const ax of axes) {
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const p of ca) { const v = dot(p, ax); if (v < aMin) aMin = v; if (v > aMax) aMax = v; }
      for (const p of cb) { const v = dot(p, ax); if (v < bMin) bMin = v; if (v > bMax) bMax = v; }
      if (aMax < bMin - 1e-9 || bMax < aMin - 1e-9) return false;
    }
    return true;
  }

  /* Does any part of the box fall outside the arena, or within `margin` of it? */
  function boxClearance(b, arenaW, arenaL) {
    let worst = Infinity;
    for (const p of boxCorners(b)) {
      worst = Math.min(worst, p.x, p.y, arenaW - p.x, arenaL - p.y);
    }
    return worst; /* negative means it pokes outside */
  }

  /* ---- Polylines ------------------------------------------------------------ */
  function polylineLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
    return total;
  }

  function pointAtLength(points, s) {
    if (!points.length) return null;
    if (s <= 0) return { ...points[0], index: 0, t: 0 };
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      const d = dist(points[i - 1], points[i]);
      if (acc + d >= s) {
        const t = d < 1e-9 ? 0 : (s - acc) / d;
        return {
          x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
          index: i - 1, t
        };
      }
      acc += d;
    }
    const last = points[points.length - 1];
    return { ...last, index: points.length - 2, t: 1 };
  }

  function tangentAtLength(points, s) {
    const p = pointAtLength(points, s);
    if (!p) return { x: 1, y: 0 };
    const i = clamp(p.index, 0, points.length - 2);
    return norm(sub(points[i + 1], points[i]));
  }

  /* Closest point on a polyline, searching forward from arc length `fromS` so a
     track that passes the same spot twice still resolves in the right order. */
  function projectOnPolyline(points, p, fromS) {
    let acc = 0, best = null;
    const start = fromS || 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const ab = sub(b, a), l2 = dot(ab, ab);
      const t = l2 < 1e-9 ? 0 : clamp(dot(sub(p, a), ab) / l2, 0, 1);
      const q = add(a, mul(ab, t));
      const s = acc + Math.sqrt(l2) * t;
      acc += Math.sqrt(l2);
      if (s < start - 1e-6) continue;
      const d = dist(p, q);
      if (!best || d < best.distance) best = { x: q.x, y: q.y, s, distance: d, index: i - 1 };
    }
    if (best) return best;
    /* everything was behind `fromS` — fall back to the far end */
    const last = points[points.length - 1];
    return { x: last.x, y: last.y, s: polylineLength(points), distance: dist(p, last), index: points.length - 2 };
  }

  /* Catmull-Rom through the given points, sampled into a polyline. Used to round
     off a hand-placed track so it looks and measures like a ridden line. */
  function smoothPolyline(points, perSpan) {
    if (points.length < 3) return points.slice();
    const n = perSpan || 10;
    const out = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      for (let k = 1; k <= n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    return out;
  }

  /* Tightest bend anywhere on a polyline, as a radius in metres. A small radius
     means a turn the horse cannot balance round at canter. */
  function tightestRadius(points, windowM) {
    const w = windowM || 3;
    let tightest = Infinity;
    const total = polylineLength(points);
    for (let s = w; s <= total - w; s += w / 2) {
      const a = pointAtLength(points, s - w);
      const b = pointAtLength(points, s);
      const c = pointAtLength(points, s + w);
      const r = circumradius(a, b, c);
      if (r < tightest) tightest = r;
    }
    return tightest;
  }

  function circumradius(a, b, c) {
    const A = dist(b, c), B = dist(a, c), C = dist(a, b);
    const area = Math.abs(cross(sub(b, a), sub(c, a))) / 2;
    if (area < 1e-9) return Infinity;
    return (A * B * C) / (4 * area);
  }

  /* Where a polyline first crosses a line segment — used for the start and
     finish lines, so the timed length runs gate to gate, not end to end. */
  function polylineCrossesSegment(points, s1, s2, fromS) {
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const d = dist(a, b);
      const hit = segmentIntersect(a, b, s1, s2);
      if (hit && acc + hit.t * d >= (fromS || 0) - 1e-6) {
        return { x: hit.x, y: hit.y, s: acc + hit.t * d };
      }
      acc += d;
    }
    return null;
  }

  function segmentIntersect(p1, p2, p3, p4) {
    const r = sub(p2, p1), s = sub(p4, p3);
    const denom = cross(r, s);
    if (Math.abs(denom) < 1e-12) return null;
    const t = cross(sub(p3, p1), s) / denom;
    const u = cross(sub(p3, p1), r) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: p1.x + r.x * t, y: p1.y + r.y * t, t, u };
  }

  return {
    BCB_TAU: TAU,
    bcbGeom: {
      rad, deg, pt, add, sub, mul, dot, cross, len, dist, norm, rotate, rotateAbout,
      bearing, turnBetween, clamp,
      box, boxCorners, rayBoxExit, boxesOverlap, boxClearance,
      polylineLength, pointAtLength, tangentAtLength, projectOnPolyline,
      smoothPolyline, tightestRadius, circumradius,
      polylineCrossesSegment, segmentIntersect
    }
  };
});
