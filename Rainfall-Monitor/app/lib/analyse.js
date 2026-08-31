/* Rainfall Monitor — the arithmetic, and the judgement.

   Pure functions, no DOM, no network, no clock of its own: every function that
   needs to know the time is handed it. That is what makes the whole of this file
   testable, and it is why `now` appears in so many signatures.

   Two ideas run through it.

   COVERAGE, NOT COUNT. A total over the last six hours is only trustworthy if
   there were six hours of readings to add up. A gauge that went quiet for four of
   them will report a small, calm-looking number, and a small calm-looking number
   from a broken gauge is the most dangerous thing this app could show. So every
   total carries how much of its window actually had data, and the UI says so
   whenever that falls short.

   ZERO IS NOT MISSING. A run of 0.00 readings means it genuinely did not rain,
   and that is useful information. No readings at all means we do not know. The
   two are kept apart everywhere. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./readings.js') : root,
    typeof require === 'function' ? require('../data/thresholds.js') : root,
    typeof require === 'function' ? require('../data/sources.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (readingsMod, thresholdMod, sourcesMod) {
  const R = readingsMod.rmReadings;
  const FRESHNESS = sourcesMod.RM_FRESHNESS;
  const intensityBand = thresholdMod.rmIntensityBand;
  const worstLevel = thresholdMod.rmWorstLevel;
  const RISE_WATCH = thresholdMod.RM_LEVEL_RISE_WATCH_M_PER_HOUR;
  const RISE_ALERT = thresholdMod.RM_LEVEL_RISE_ALERT_M_PER_HOUR;

  const HOUR = 3600000;
  const MINUTE = 60000;

  /* A reading below this is a damp bucket, not rain. Gauges differ in resolution
     — most tip in 0.2mm steps, some report hundredths — so this is set below the
     finest of them and only exists to stop "it is raining" latching on a
     rounding artefact. */
  const WET_MM = 0.05;

  /* How little of a window may be missing before a total stops being quotable.
     Four fifths is a judgement call: one dropped reading in a six-hour window is
     noise, an hour of them is not. */
  const GOOD_COVERAGE = 0.8;

  /* Which window a reading belongs to is decided by where its period STARTS.

     The obvious alternative is the midpoint of the period, and that was the
     first attempt. It has a nasty edge: a reading whose period runs up to and
     past `now` has its midpoint in the future, so it is excluded from every
     total for the first half of its period. During a cloudburst that means the
     freshest quarter of an hour is missing from the hourly total for up to seven
     and a half minutes — precisely when somebody is refreshing the screen.

     Bracketing each window as [from, to) on the period start fixes that and
     keeps everything the midpoint rule was chosen for: consecutive windows
     partition the readings exactly, so nothing is counted twice at the seam, and
     the local-midnight split stays right under either setting of
     RM_PERIOD_LABEL. */
  function slotStart(series, reading) {
    return R.coverage(reading.t, series.periodMinutes, series.periodLabel).from;
  }

  /* ---- Totals -------------------------------------------------------------- */

  /* Sum a window, and report honestly how complete it was.

     The window is [from, to) on the start of each reading's covered period — see
     slotStart() for why that bracketing and not another. */
  function windowSum(series, from, to) {
    const expected = series && series.periodMinutes
      ? Math.max(1, Math.round((to - from) / (series.periodMinutes * MINUTE)))
      : 1;
    if (!series || series.empty) {
      return { mm: null, count: 0, expected, coverage: 0, from, to, wet: 0 };
    }
    let mm = 0;
    let count = 0;
    let wet = 0;
    for (const reading of series.readings) {
      const slot = slotStart(series, reading);
      if (slot < from || slot >= to) continue;
      mm += reading.value;
      count++;
      if (reading.value >= WET_MM) wet++;
    }
    return {
      mm: count ? Math.round(mm * 100) / 100 : null,
      count,
      expected,
      coverage: expected ? Math.min(1, count / expected) : 0,
      from,
      to,
      wet
    };
  }

  /* The last `hours` hours, ending now. */
  function windowTotal(series, now, hours) {
    const t = windowSum(series, now - hours * HOUR, now);
    return Object.assign({ hours }, t);
  }

  /* One total per configured threshold window, each judged against its own two
     numbers. This is the object the summary tiles are drawn from. */
  function totals(series, now, thresholds) {
    return (thresholds || []).map(rule => {
      const t = windowTotal(series, now, rule.hours);
      return Object.assign({}, t, {
        label: rule.label,
        watchMm: rule.watchMm,
        alertMm: rule.alertMm,
        level: totalLevel(t.mm, rule),
        /* A total that only looks quiet because the gauge was quiet. */
        thin: t.count > 0 && t.coverage < GOOD_COVERAGE,
        missing: t.count === 0
      });
    });
  }

  function totalLevel(mm, rule) {
    if (mm === null || !rule) return 'quiet';
    if (rule.alertMm !== null && rule.alertMm !== undefined && mm >= rule.alertMm) return 'alert';
    if (rule.watchMm !== null && rule.watchMm !== undefined && mm >= rule.watchMm) return 'watch';
    return 'quiet';
  }

  /* Rain since local midnight. The day boundary is passed in rather than worked
     out here, because "today" is a local idea and this file has no timezone —
     see dayBounds() below for the browser's answer. */
  function dayTotal(series, dayStart, dayEnd) {
    return windowSum(series, dayStart, dayEnd);
  }

  /* Local midnight either side of a moment, from the browser's own timezone. The
     only function here that is allowed to know about calendars. */
  function dayBounds(now) {
    const d = new Date(now);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return { start, end: start + 24 * HOUR };
  }

  /* ---- Intensity ---------------------------------------------------------- */

  /* An accumulation over a period, expressed as the rate it implies. 3.32mm in a
     quarter of an hour is 13.3mm/h — for the quarter of an hour it lasted, which
     is the caveat the UI has to keep attached to this number. */
  function ratePerHour(value, periodMinutes) {
    if (value === null || value === undefined || !periodMinutes) return null;
    return Math.round(value * (60 / periodMinutes) * 100) / 100;
  }

  /* The wettest single reading in a window, and when. */
  function peak(series, now, hours) {
    if (!series || series.empty) return null;
    const from = now - hours * HOUR;
    let best = null;
    for (const reading of series.readings) {
      const slot = slotStart(series, reading);
      if (slot < from || slot >= now) continue;
      if (!best || reading.value > best.value) best = reading;
    }
    if (!best) return null;
    return {
      t: best.t,
      value: best.value,
      mmPerHour: ratePerHour(best.value, series.periodMinutes),
      band: intensityBand(ratePerHour(best.value, series.periodMinutes))
    };
  }

  /* What the most recent reading says it is doing. Deliberately not called
     "raining now": the most recent reading can be hours old, which is why
     freshness() sits right beside it in the UI. */
  function current(series) {
    const last = R.latest(series);
    if (!last) return null;
    const mmPerHour = ratePerHour(last.value, series.periodMinutes);
    return {
      t: last.t,
      value: last.value,
      mmPerHour,
      band: intensityBand(mmPerHour),
      wet: last.value >= WET_MM
    };
  }

  /* ---- Spells ------------------------------------------------------------- */

  /* Is it raining, and if not, when did it stop? Answered from the readings
     rather than from the clock, so a gauge that went quiet mid-shower reports
     "no readings since" instead of inventing a dry spell. */
  function spell(series, now) {
    /* Both checks, not just `empty`: a series assembled from a cache or a stub
       can claim not to be empty while holding nothing, and this used to be a
       crash rather than a shrug. */
    if (!series || series.empty || !series.readings || !series.readings.length) {
      return { known: false };
    }
    let lastWet = null;
    for (const reading of series.readings) {
      if (reading.value >= WET_MM) lastWet = reading;
    }
    const last = R.latest(series);
    const lastCovered = R.coverage(last.t, series.periodMinutes, series.periodLabel).to;
    if (!lastWet) {
      return {
        known: true,
        raining: false,
        lastWetT: null,
        dryMinutes: Math.max(0, Math.round((lastCovered - slotStart(series, series.readings[0])) / MINUTE)),
        dryThroughout: true
      };
    }
    const wetCovered = R.coverage(lastWet.t, series.periodMinutes, series.periodLabel).to;
    const raining = lastWet.t === last.t;
    return {
      known: true,
      raining,
      lastWetT: lastWet.t,
      lastWetEndT: wetCovered,
      dryMinutes: raining ? 0 : Math.max(0, Math.round((now - wetCovered) / MINUTE)),
      dryThroughout: false
    };
  }

  /* ---- Freshness ---------------------------------------------------------- */

  /* How far behind the feed is. See the note on RM_FRESHNESS: late is normal,
     and does not mean the gauge is broken — but it does mean the screen is not
     showing the weather happening now. */
  function freshness(latestT, now) {
    if (!latestT) return { key: 'none', minutes: null, label: 'no readings' };
    const minutes = Math.max(0, Math.round((now - latestT) / MINUTE));
    for (const band of FRESHNESS) {
      if (minutes <= band.maxMinutes) return { key: band.key, minutes, label: band.label };
    }
    return { key: 'stale', minutes, label: 'out of date' };
  }

  /* ---- The verdict -------------------------------------------------------- */

  /* One level for the station, and the reasons in plain words. The reasons are
     the point: "Go and look" on its own is not actionable, "42mm in 6 hours, past
     your 40mm mark" is. */
  function assessRainfall(series, now, thresholds) {
    const rows = totals(series, now, thresholds);
    const cur = current(series);
    const fresh = freshness(cur ? cur.t : null, now);
    const reasons = [];

    for (const row of rows) {
      if (row.level === 'quiet' || row.mm === null) continue;
      const mark = row.level === 'alert' ? row.alertMm : row.watchMm;
      reasons.push({
        level: row.level,
        text: `${row.mm.toFixed(1)}mm ${row.label}, past the ${mark}mm mark`
      });
    }

    /* A gauge that has stopped talking is its own kind of warning, because the
       app cannot tell a dry night from a dead gauge. Raised as a watch, never as
       an alert: it is a reason to distrust the screen, not a reason to expect
       water. */
    if (fresh.key === 'stale' || fresh.key === 'none') {
      reasons.push({
        level: 'watch',
        text: fresh.key === 'none'
          ? 'no readings at all from this gauge'
          : `nothing from this gauge for ${formatMinutes(fresh.minutes)}`
      });
    }

    return {
      kind: 'rainfall',
      level: worstLevel(reasons.map(r => r.level)),
      reasons,
      totals: rows,
      current: cur,
      freshness: fresh,
      peak: peak(series, now, 24),
      spell: spell(series, now)
    };
  }

  /* ---- River levels ------------------------------------------------------- */

  /* Levels do not add up, so the useful questions are "how high" and "how fast".
     Rate of rise is taken over the last hour of readings actually present, not
     assumed to be four of them. */
  function levelSummary(series, now) {
    const last = R.latest(series);
    if (!last) return null;
    const at = (hoursAgo) => {
      const target = last.t - hoursAgo * HOUR;
      let best = null;
      for (const r of series.readings) {
        if (r.t > target) break;
        best = r;
      }
      return best;
    };
    const hourAgo = at(1);
    const sixAgo = at(6);
    const change1h = hourAgo && hourAgo.t !== last.t ? last.value - hourAgo.value : null;
    const change6h = sixAgo && sixAgo.t !== last.t ? last.value - sixAgo.value : null;
    /* Rate over the real gap between the two readings, which may not be exactly
       an hour if the feed is patchy. */
    const rate = hourAgo && hourAgo.t !== last.t
      ? (last.value - hourAgo.value) / ((last.t - hourAgo.t) / HOUR)
      : null;
    return {
      t: last.t,
      value: last.value,
      change1h: change1h === null ? null : Math.round(change1h * 1000) / 1000,
      change6h: change6h === null ? null : Math.round(change6h * 1000) / 1000,
      ratePerHour: rate === null ? null : Math.round(rate * 1000) / 1000,
      trend: rate === null ? 'unknown' : rate > 0.01 ? 'rising' : rate < -0.01 ? 'falling' : 'steady',
      freshness: freshness(last.t, now)
    };
  }

  function assessLevel(series, now, levelThresholds) {
    const summary = levelSummary(series, now);
    const reasons = [];
    if (!summary) {
      return {
        kind: 'level', level: 'watch', reasons: [{ level: 'watch', text: 'no readings at all from this gauge' }],
        summary: null, freshness: freshness(null, now)
      };
    }
    const th = levelThresholds || {};
    if (th.alertM !== null && th.alertM !== undefined && summary.value >= th.alertM) {
      reasons.push({ level: 'alert', text: `${summary.value.toFixed(2)}m, past your ${Number(th.alertM).toFixed(2)}m mark` });
    } else if (th.watchM !== null && th.watchM !== undefined && summary.value >= th.watchM) {
      reasons.push({ level: 'watch', text: `${summary.value.toFixed(2)}m, past your ${Number(th.watchM).toFixed(2)}m mark` });
    }
    if (summary.ratePerHour !== null && summary.ratePerHour >= RISE_ALERT) {
      reasons.push({ level: 'alert', text: `rising ${summary.ratePerHour.toFixed(2)}m an hour` });
    } else if (summary.ratePerHour !== null && summary.ratePerHour >= RISE_WATCH) {
      reasons.push({ level: 'watch', text: `rising ${summary.ratePerHour.toFixed(2)}m an hour` });
    }
    if (summary.freshness.key === 'stale') {
      reasons.push({ level: 'watch', text: `nothing from this gauge for ${formatMinutes(summary.freshness.minutes)}` });
    }
    return {
      kind: 'level',
      level: worstLevel(reasons.map(r => r.level)),
      reasons,
      summary,
      freshness: summary.freshness
    };
  }

  /* ---- Words ------------------------------------------------------------- */

  function formatMinutes(minutes) {
    if (minutes === null || minutes === undefined) return 'an unknown time';
    if (minutes < 60) return `${minutes} min`;
    const hours = minutes / 60;
    if (hours < 24) {
      const h = Math.floor(hours);
      const m = minutes - h * 60;
      return m >= 5 ? `${h}h ${m}m` : `${h}h`;
    }
    const days = Math.round(hours / 24);
    return days === 1 ? 'a day' : `${days} days`;
  }

  const rmAnalyse = {
    windowSum, windowTotal, totals, totalLevel, dayTotal, dayBounds,
    ratePerHour, peak, current, spell, freshness,
    assessRainfall, levelSummary, assessLevel, formatMinutes,
    WET_MM, GOOD_COVERAGE
  };

  return { rmAnalyse };
});
