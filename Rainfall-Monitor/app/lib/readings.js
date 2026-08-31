/* Rainfall Monitor — turning an EA response into a series you can add up.

   Pure functions, no DOM, no network. This is the layer that has to be right,
   because everything above it is arithmetic on whatever comes out of here, and
   the failure mode of getting it wrong is a total that is quietly too low.

   The EA real-time API is a beta service publishing telemetry from about a
   thousand gauges, and it shows: fields change type, readings arrive twice,
   values come through as strings, and a gauge that has stopped reporting simply
   goes quiet rather than saying so. Every oddity handled below was handled
   because the alternative was a wrong number rather than an error. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../data/sources.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (sourcesMod) {
  const DEFAULT_PERIOD_LABEL = sourcesMod.RM_PERIOD_LABEL;

  /* How long a reading covers, from the period part of a measure id. The EA
     writes it either in words or as a number of seconds. */
  const PERIODS = {
    '15_min': 15,
    '15min': 15,
    '900': 15,
    'hourly': 60,
    '3600': 60,
    'daily': 1440,
    '86400': 1440
  };

  /* Rainfall that cannot be true. A tipping bucket cannot collect a negative
     amount, and the wettest quarter of an hour ever recorded in Britain is a
     long way under 100mm, so anything past that is a telemetry fault rather
     than weather. Both appear in the feed: -99 and 9999 are the usual ways a
     gauge says "no reading" without saying it. */
  const RAINFALL_MIN_MM = 0;
  const RAINFALL_MAX_MM_PER_PERIOD = 100;

  /* A river level below this or above this is a fault, not a river. The EA
     publishes levels in metres against a local datum, which can legitimately be
     slightly negative, but not by much and never by kilometres. */
  const LEVEL_MIN_M = -20;
  const LEVEL_MAX_M = 100;

  /* ---- Measure ids ---------------------------------------------------------
     A measure id says everything about what a number means:

         E9660-rainfall-tipping_bucket_raingauge-t-15_min-mm
         └id─┘ └param─┘ └───────qualifier──────┘ │ └period┘ └unit┘
                                                type

     Read right to left, because the qualifier in the middle is the only part
     that can contain extra hyphens. */
  function parseMeasureId(measureId) {
    if (typeof measureId !== 'string' || !measureId) return null;
    /* Accept a full URL or a bare id. */
    const bare = measureId.split('/').pop().split('?')[0];
    const parts = bare.split('-');
    if (parts.length < 5) return null;
    const unit = parts[parts.length - 1];
    const periodRaw = parts[parts.length - 2];
    const valueType = parts[parts.length - 3];
    const stationId = parts[0];
    const parameter = parts[1];
    const qualifier = parts.slice(2, parts.length - 3).join('-');
    if (!stationId || !parameter) return null;
    return {
      measureId: bare,
      stationId,
      parameter,
      qualifier,
      valueType,
      unit,
      periodMinutes: PERIODS[periodRaw] || null,
      periodRaw
    };
  }

  /* ---- The interval a reading covers --------------------------------------
     See the long note on RM_PERIOD_LABEL in data/sources.js: the timestamp is
     one end of the period and the app has to pick which. Everything that asks
     "does this reading belong in that window" asks it of the midpoint, so a
     reading lands in exactly one window and nothing is counted twice. */
  function coverage(t, periodMinutes, periodLabel) {
    const span = (periodMinutes || 0) * 60000;
    const label = periodLabel || DEFAULT_PERIOD_LABEL;
    const from = label === 'end' ? t - span : t;
    return { from, to: from + span, mid: from + span / 2 };
  }

  /* ---- Values --------------------------------------------------------------
     `value` arrives as a number, as a numeric string, or — when the EA has two
     readings for one timestamp — as an array of both. For an array take the
     largest: for rainfall a dropped tip reads as zero, never as too much, so the
     larger of two disagreeing readings is the one that is not missing rain. */
  function readValue(raw) {
    if (Array.isArray(raw)) {
      const values = raw.map(readValue).filter(v => v !== null);
      return values.length ? Math.max.apply(null, values) : null;
    }
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      return isFinite(n) ? n : null;
    }
    return null;
  }

  function plausible(value, parameter, periodMinutes) {
    if (value === null) return false;
    if (parameter === 'rainfall') {
      if (value < RAINFALL_MIN_MM) return false;
      /* Scale the ceiling with the period, so an hourly gauge is not rejected
         for reporting what four 15-minute buckets would have. */
      const scale = Math.max(1, (periodMinutes || 15) / 15);
      return value <= RAINFALL_MAX_MM_PER_PERIOD * scale;
    }
    if (parameter === 'level') return value >= LEVEL_MIN_M && value <= LEVEL_MAX_M;
    return true;
  }

  function readTime(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    const t = Date.parse(raw);
    return isFinite(t) ? t : null;
  }

  /* ---- Pulling the items out of a payload ---------------------------------
     `items` is an array of readings, except when there is exactly one reading,
     when JSON-LD collapses it to a bare object. Handled here rather than
     discovered later by a chart with nothing on it. */
  function itemsOf(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) {
      /* Several pages, or a bare items array. */
      const out = [];
      for (const part of payload) out.push.apply(out, itemsOf(part));
      return out;
    }
    if (payload.items) return Array.isArray(payload.items) ? payload.items : [payload.items];
    if (payload.dateTime || payload.measure) return [payload];
    return [];
  }

  /* ---- normalise ----------------------------------------------------------
     One or more EA payloads in, one clean ascending series out, plus a count of
     what was thrown away and why. The rejects are surfaced in the UI rather than
     swallowed: a gauge quietly dropping half its readings should be visible. */
  function normalise(payload, opts) {
    const o = opts || {};
    const items = itemsOf(payload);
    const byTime = new Map();
    const rejected = { noTime: 0, noValue: 0, implausible: 0, wrongStation: 0 };
    let meta = null;

    for (const item of items) {
      if (!item || typeof item !== 'object') { rejected.noValue++; continue; }
      const parsed = parseMeasureId(item.measure) ||
        parseMeasureId(item['@id']) ||
        (o.measureId ? parseMeasureId(o.measureId) : null);

      if (o.stationId && parsed && parsed.stationId &&
          parsed.stationId.toUpperCase() !== String(o.stationId).toUpperCase()) {
        rejected.wrongStation++;
        continue;
      }
      if (parsed && !meta) meta = parsed;

      const t = readTime(item.dateTime);
      if (t === null) { rejected.noTime++; continue; }

      const value = readValue(item.value);
      if (value === null) { rejected.noValue++; continue; }

      const parameter = (parsed && parsed.parameter) || o.parameter || 'rainfall';
      const periodMinutes = (parsed && parsed.periodMinutes) || o.periodMinutes || 15;
      if (!plausible(value, parameter, periodMinutes)) { rejected.implausible++; continue; }

      /* Later payloads win on a clash, which is what you want when a fresh
         fetch is merged over a cached one: the EA does revise readings. */
      byTime.set(t, { t, value });
    }

    const readings = Array.from(byTime.values()).sort((a, b) => a.t - b.t);
    return {
      stationId: (meta && meta.stationId) || o.stationId || null,
      parameter: (meta && meta.parameter) || o.parameter || 'rainfall',
      unit: (meta && meta.unit) || o.unit || null,
      periodMinutes: (meta && meta.periodMinutes) || o.periodMinutes || 15,
      periodLabel: o.periodLabel || DEFAULT_PERIOD_LABEL,
      measureId: (meta && meta.measureId) || null,
      readings,
      rejected,
      /* True when nothing at all came back, which is different from a gauge
         reporting a genuine run of zeros and must not be drawn as a dry spell. */
      empty: readings.length === 0
    };
  }

  /* Merge two series of the same station. Used to lay a fresh fetch over the
     cached copy, so a patchy signal narrows the gap instead of losing history. */
  function merge(older, newer) {
    if (!older || older.empty) return newer;
    if (!newer || newer.empty) return older;
    const byTime = new Map();
    for (const r of older.readings) byTime.set(r.t, r);
    for (const r of newer.readings) byTime.set(r.t, r);
    const readings = Array.from(byTime.values()).sort((a, b) => a.t - b.t);
    return Object.assign({}, newer, { readings, empty: readings.length === 0 });
  }

  /* Drop everything older than a cutoff, so a long-lived cache cannot grow for
     ever on a phone. */
  function trim(series, oldestT) {
    if (!series || series.empty) return series;
    const readings = series.readings.filter(r => r.t >= oldestT);
    return Object.assign({}, series, { readings, empty: readings.length === 0 });
  }

  function latest(series) {
    if (!series || series.empty) return null;
    return series.readings[series.readings.length - 1];
  }

  const rmReadings = {
    parseMeasureId, coverage, normalise, merge, trim, latest,
    readValue, plausible, itemsOf,
    PERIODS, RAINFALL_MAX_MM_PER_PERIOD
  };

  return { rmReadings };
});
