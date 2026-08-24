/* Bea’s Course Builder — riding the course.

   Press Ride and a marker travels the track so she can learn the route before she
   jumps it. Almost nothing new has to be worked out: checkCourse already returns
   the track as a polyline in metres and every fence's exact distance along it, so
   a ride is one number — how far round she is — turned into a picture.

   Everything above the audio section is a pure function of that number. That is
   deliberate: it means the interesting part can be tested in node with fabricated
   timestamps instead of by watching an animation and hoping. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./geometry.js') : root,
    typeof require === 'function' ? require('./strides.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (geomMod, strideMod) {
  const G = geomMod.bcbGeom;
  const S = strideMod.bcbStrides;

  /* ---- Where the hoofbeats fall ---------------------------------------------
     A horse lands about half a stride beyond a fence, then takes n strides, and
     the last of those landings IS the take-off for the next fence. So the beats
     between fence A and fence B sit at

         s(A) + landing + k x stride,   k = 1..n

     and the nth lands exactly where she leaves the ground again. A bounce has no
     beat between the two elements, which is the point of a bounce. */
  function strideMarks(fences, legs, model) {
    const marks = [];
    for (const f of fences) marks.push({ s: f.s, kind: 'fence', label: f.label, id: f.id });

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const from = fences[i], to = fences[i + 1];
      if (!from || !to || leg.strides == null || leg.strides < 1) continue;
      for (let k = 1; k <= leg.strides; k++) {
        const s = from.s + model.landingM + k * model.strideM;
        if (s <= from.s + 0.01 || s >= to.s - 0.01) continue;
        marks.push({ s, kind: 'stride', n: k, of: leg.strides, legIndex: i });
      }
    }
    marks.sort((a, b) => a.s - b.s);
    return marks;
  }

  /* Everything the ride needs, gathered once from a completed check. */
  function buildRide(check, horse) {
    const model = S.strideModel(horse);
    const route = (check && check.route) || {};
    const points = route.points || [];
    const lengthM = route.lengthM || (points.length > 1 ? G.polylineLength(points) : 0);
    const speedMpm = (check && check.timing && check.timing.speedMpm) || 325;

    const fences = (route.fenceAt || []).map(f => ({
      id: f.id, s: f.s, x: f.x, y: f.y,
      label: S.fenceLabel(f.jump),
      number: f.jump.number, element: f.jump.element
    }));
    const legs = (check.legs || []).map(l => ({
      fromId: l.fromId, toId: l.toId, fromLabel: l.fromLabel, toLabel: l.toLabel,
      strides: l.strides, category: l.category, verdict: l.verdict,
      metresText: l.measured && l.measured.metresText,
      strideWords: l.strideWords, severity: l.severity
    }));

    return {
      points, lengthM,
      speedMps: speedMpm / 60,
      speedMpm,
      model,
      fences, legs,
      marks: strideMarks(fences, legs, model),
      timeAllowedS: (check.timing && check.timing.seconds) || Math.ceil(lengthM / (speedMpm / 60)),
      rideable: fences.length > 0 && points.length > 1
    };
  }

  /* ---- The ride at a given distance round ---------------------------------- */
  function rideStateAt(ride, sRaw) {
    const s = clamp(sRaw, 0, ride.lengthM);
    const at = ride.points.length > 1 ? G.pointAtLength(ride.points, s) : { x: 0, y: 0 };
    const tan = ride.points.length > 1 ? G.tangentAtLength(ride.points, s) : { x: 0, y: 1 };

    /* Which fences are behind her. */
    const jumpedIds = [];
    let lastPassed = -1;
    for (let i = 0; i < ride.fences.length; i++) {
      if (s >= ride.fences[i].s - 0.001) { jumpedIds.push(ride.fences[i].id); lastPassed = i; }
    }

    /* Which leg she is on: the gap after the last fence she has jumped. */
    const legIndex = (lastPassed >= 0 && lastPassed < ride.legs.length) ? lastPassed : -1;
    const leg = legIndex >= 0 ? ride.legs[legIndex] : null;

    /* How many strides of that leg are behind her. */
    let strideIndex = 0;
    if (leg) {
      for (const m of ride.marks) {
        if (m.kind === 'stride' && m.legIndex === legIndex && m.s <= s + 0.001) strideIndex = m.n;
      }
    }

    const atEnd = s >= ride.lengthM - 0.001;
    const beforeFirst = lastPassed < 0;

    return {
      s, x: at.x, y: at.y,
      angle: G.bearing(tan),
      progress: ride.lengthM ? s / ride.lengthM : 0,
      legIndex, leg,
      strideIndex,
      strideCount: leg ? leg.strides : null,
      jumpedIds,
      jumpedCount: jumpedIds.length,
      nextFence: lastPassed + 1 < ride.fences.length ? ride.fences[lastPassed + 1] : null,
      elapsedS: ride.speedMps ? s / ride.speedMps : 0,
      atEnd, beforeFirst,
      caption: captionFor(ride, { beforeFirst, atEnd, lastPassed, leg, strideIndex })
    };
  }

  function captionFor(ride, c) {
    if (c.atEnd) {
      return ride.fences.length ? 'Through the finish — clear round' : 'Nothing to ride yet';
    }
    if (c.beforeFirst) {
      const first = ride.fences[0];
      return first ? `Coming to fence ${first.label}` : 'Nothing to ride yet';
    }
    if (!c.leg) {
      const last = ride.fences[ride.fences.length - 1];
      return last ? `Away from fence ${last.label} — to the finish` : '';
    }
    const bits = [`${c.leg.fromLabel} → ${c.leg.toLabel}`];
    if (c.leg.metresText) bits.push(c.leg.metresText);
    if (c.leg.strides != null && c.leg.strides > 0) {
      bits.push(c.strideIndex > 0
        ? `stride ${Math.min(c.strideIndex, c.leg.strides)} of ${c.leg.strides}`
        : (c.leg.strideWords || `${c.leg.strides} strides`));
    } else if (c.leg.strides === 0) {
      bits.push('bounce');
    }
    return bits.join(' · ');
  }

  /* ---- The driver -----------------------------------------------------------
     It is handed the time rather than reading the clock, so a test can advance it
     by exact milliseconds and assert exactly where it got to. */
  function createDriver(ride, opts) {
    const o = opts || {};
    let s = 0;
    let playing = false;
    let rate = o.rate || 1;
    let anchorTime = 0;
    let anchorS = 0;
    let tween = null;

    function play(nowMs) {
      if (s >= ride.lengthM - 0.001) s = 0;   /* pressing play at the end starts again */
      playing = true; tween = null;
      anchorTime = nowMs; anchorS = s;
    }
    function pause() { playing = false; tween = null; }
    /* Scrubbing has to re-anchor the clock as well as the distance. Moving
       anchorS on its own leaves anchorTime back where play started, so the very
       next tick adds all the time already elapsed and she is flung down the
       course from wherever she scrubbed to. */
    function seek(target, nowMs) {
      s = clamp(target, 0, ride.lengthM);
      tween = null;
      if (playing) { anchorS = s; anchorTime = nowMs == null ? anchorTime : nowMs; }
      return s;
    }
    function setRate(next, nowMs) {
      rate = Math.max(0.1, next);
      if (playing) { anchorS = s; anchorTime = nowMs; }
    }
    /* Next / Back: move to a fence over a fixed short time, whatever the distance,
       so stepping feels the same everywhere instead of crawling across a long
       approach and flicking through a combination. */
    function stepTo(targetS, nowMs, durationMs) {
      playing = false;
      tween = { fromS: s, toS: clamp(targetS, 0, ride.lengthM), start: nowMs,
        duration: Math.max(120, durationMs || 900) };
    }

    function tick(nowMs) {
      if (tween) {
        const t = clamp((nowMs - tween.start) / tween.duration, 0, 1);
        s = tween.fromS + (tween.toS - tween.fromS) * easeInOut(t);
        if (t >= 1) { s = tween.toS; tween = null; }
        return s;
      }
      if (!playing) return s;
      s = anchorS + ((nowMs - anchorTime) / 1000) * ride.speedMps * rate;
      if (s >= ride.lengthM) { s = ride.lengthM; playing = false; }
      return s;
    }

    return {
      get s() { return s; },
      get playing() { return playing; },
      get stepping() { return !!tween; },
      get rate() { return rate; },
      get finished() { return s >= ride.lengthM - 0.001; },
      play, pause, seek, setRate, stepTo, tick,
      toggle(nowMs) { playing ? pause() : play(nowMs); return playing; },
      /* Where the next and previous fences are, for the step buttons. */
      nextFenceS() {
        for (const f of ride.fences) if (f.s > s + 0.05) return f.s;
        return ride.lengthM;
      },
      prevFenceS() {
        let prev = 0;
        for (const f of ride.fences) { if (f.s < s - 0.05) prev = f.s; }
        return prev;
      }
    };
  }

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function clamp(n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); }

  /* ---- The click on each stride -------------------------------------------
     Scheduled ahead against the audio clock rather than fired frame by frame.
     The speed is constant, so every beat's moment is known the instant she presses
     play; firing them from requestAnimationFrame would wobble, which rather
     defeats the object of a metronome.

     Two notes: a quiet tick for a stride, a firmer one for a fence.

     Note for anyone puzzled later: iOS silences Web Audio when the physical mute
     switch is on, and there is no way for a page to detect that. So the button
     reports the app's own state and makes no claim about the phone's. */
  function createMetronome() {
    let ctx = null;
    let scheduled = [];
    let enabled = false;

    function ensureContext() {
      if (ctx) return ctx;
      const Ctor = typeof AudioContext !== 'undefined' ? AudioContext
        : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
      if (!Ctor) return null;
      ctx = new Ctor();
      return ctx;
    }

    /* Must be called from inside a tap: iOS will not start audio otherwise. */
    function enable() {
      const c = ensureContext();
      if (!c) return false;
      if (c.state === 'suspended') c.resume();
      enabled = true;
      return true;
    }
    function disable() { enabled = false; cancel(); }

    function click(when, kind) {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const fence = kind === 'fence';
      osc.type = 'square';
      osc.frequency.value = fence ? 660 : 1180;
      const peak = fence ? 0.16 : 0.055;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(peak, when + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + (fence ? 0.09 : 0.035));
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(when);
      osc.stop(when + (fence ? 0.11 : 0.05));
      scheduled.push(osc);
    }

    /* Lay out every beat still ahead of her. Called on play, and again whenever
       she scrubs or changes speed, so the rhythm always matches what she sees. */
    function schedule(ride, fromS, rate) {
      cancel();
      if (!enabled || !ctx) return 0;
      const perMetre = 1 / (ride.speedMps * (rate || 1));
      let n = 0;
      for (const m of ride.marks) {
        if (m.s < fromS - 0.001) continue;
        if (n >= 500) break;              /* a very long course is not worth a stack of nodes */
        click(ctx.currentTime + (m.s - fromS) * perMetre, m.kind);
        n++;
      }
      return n;
    }

    function cancel() {
      for (const osc of scheduled) { try { osc.stop(); } catch (e) { /* already done */ } }
      scheduled = [];
    }

    return {
      get enabled() { return enabled; },
      get supported() { return typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined'; },
      enable, disable, schedule, cancel
    };
  }

  return { bcbRide: { strideMarks, buildRide, rideStateAt, createDriver, createMetronome, easeInOut } };
});
