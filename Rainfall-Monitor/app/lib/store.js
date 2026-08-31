/* Rainfall Monitor — what is kept, and where.

   Two things are saved on the phone and nowhere else: the settings (which gauges,
   what thresholds, which chart window) and the last readings fetched.

   The cached readings are not a nicety. This app gets opened in a yard, in the
   rain, on one bar of signal, to answer "how much has it done since lunchtime" —
   and it must answer with the last thing it knew rather than a spinner. So every
   fetch is written through to storage, and a failed fetch falls back to it with
   the age shown honestly on screen.

   DO NOT RENAME THE KEYS. Whatever a phone has saved is under the old name. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../data/stations.js') : root,
    typeof require === 'function' ? require('../data/thresholds.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (stationMod, thresholdMod) {

  const SETTINGS_KEY = 'rm.settings.v1';
  const CACHE_KEY = 'rm.cache.v1';
  const SCHEMA = 1;

  /* Readings older than this are dropped from the cache on every save. Long
     enough for the three-day threshold window plus a margin; short enough that a
     year of use cannot fill a phone. */
  const CACHE_KEEP_HOURS = 120;

  function probeStorage() {
    try {
      const k = '__rm_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return localStorage;
    } catch (e) {
      /* Private browsing, or storage switched off. The app still works, it just
         forgets between visits — which is worth doing silently rather than
         refusing to start. */
      return null;
    }
  }

  function memoryStore() {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: k => m.delete(k)
    };
  }

  function makeStore(backing) {
    const store = backing || (typeof localStorage !== 'undefined' ? probeStorage() : null) || memoryStore();

    function readJson(key, fallback) {
      try {
        const raw = store.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed === null || parsed === undefined ? fallback : parsed;
      } catch (e) {
        /* Corrupt JSON must not brick the app. Start again rather than throw. */
        return fallback;
      }
    }

    function writeJson(key, value) {
      try {
        store.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        /* Quota, most likely. The app carries on with what is in memory. */
        return false;
      }
    }

    /* ---- Settings -------------------------------------------------------- */

    function defaults() {
      return {
        schema: SCHEMA,
        stations: stationMod.RM_DEFAULT_STATIONS.map(s => Object.assign({}, s)),
        thresholds: thresholdMod.RM_DEFAULT_THRESHOLDS.map(t => Object.assign({}, t)),
        chartHours: 24,
        autoRefreshMinutes: 5
      };
    }

    /* Merged over the defaults field by field, so a settings blob written by an
       older version of the app gains new fields instead of losing the app. */
    function loadSettings() {
      const saved = readJson(SETTINGS_KEY, null);
      const base = defaults();
      if (!saved || typeof saved !== 'object') return base;
      /* Merged into a NEW object rather than onto `base`. Assigning onto base
         would make `out.stations` and `base.stations` the same array, and every
         "fall back to the default" below would then be assigning the bad value
         to itself — which is how an empty gauge list stayed empty. */
      const out = Object.assign({}, base, saved);
      if (!Array.isArray(out.stations) || !out.stations.length) out.stations = base.stations;
      out.stations = out.stations
        .filter(s => s && stationMod.rmValidStationId(s.id))
        .map(s => ({
          id: String(s.id).trim(),
          kind: s.kind === 'level' ? 'level' : 'rainfall',
          label: typeof s.label === 'string' ? s.label : '',
          eaLabel: typeof s.eaLabel === 'string' ? s.eaLabel : '',
          watchM: numberOrNull(s.watchM),
          alertM: numberOrNull(s.alertM)
        }));
      if (!out.stations.length) out.stations = base.stations;
      if (!Array.isArray(out.thresholds) || !out.thresholds.length) out.thresholds = base.thresholds;
      out.thresholds = out.thresholds
        .filter(t => t && isFinite(Number(t.hours)) && Number(t.hours) > 0)
        .map(t => ({
          hours: Number(t.hours),
          label: typeof t.label === 'string' && t.label ? t.label : `in ${t.hours}h`,
          watchMm: numberOrNull(t.watchMm),
          alertMm: numberOrNull(t.alertMm)
        }))
        .sort((a, b) => a.hours - b.hours);
      if (!out.thresholds.length) out.thresholds = base.thresholds;
      out.chartHours = [6, 24, 48, 120].indexOf(Number(out.chartHours)) >= 0 ? Number(out.chartHours) : 24;
      out.schema = SCHEMA;
      return out;
    }

    function saveSettings(settings) {
      return writeJson(SETTINGS_KEY, settings);
    }

    /* ---- Cached readings ------------------------------------------------- */

    function cacheKeyFor(station) {
      return `${station.kind}:${String(station.id).toUpperCase()}`;
    }

    function loadCache() {
      const saved = readJson(CACHE_KEY, null);
      return saved && typeof saved === 'object' ? saved : {};
    }

    /* Stored as the raw reading pairs rather than the derived series, so a change
       to the analysis never has to migrate a cache. */
    function saveCacheEntry(station, series, fetchedAt) {
      const cache = loadCache();
      const oldest = fetchedAt - CACHE_KEEP_HOURS * 3600000;
      cache[cacheKeyFor(station)] = {
        fetchedAt,
        parameter: series.parameter,
        unit: series.unit,
        periodMinutes: series.periodMinutes,
        measureId: series.measureId,
        readings: series.readings.filter(r => r.t >= oldest).map(r => [r.t, r.value])
      };
      return writeJson(CACHE_KEY, cache);
    }

    function loadCacheEntry(station) {
      const entry = loadCache()[cacheKeyFor(station)];
      if (!entry || !Array.isArray(entry.readings)) return null;
      /* A cached entry can legitimately hold no readings — a gauge that answered
         with nothing, or whose readings were all unusable. `empty` has to say so,
         because the whole of lib/analyse.js trusts that flag to decide whether
         there is a latest reading to look at. */
      const readings = entry.readings
        .filter(pair => Array.isArray(pair) && isFinite(pair[0]) && isFinite(pair[1]))
        .map(pair => ({ t: pair[0], value: pair[1] }));
      return {
        fetchedAt: entry.fetchedAt || null,
        series: {
          stationId: station.id,
          parameter: entry.parameter || (station.kind === 'level' ? 'level' : 'rainfall'),
          unit: entry.unit || null,
          periodMinutes: entry.periodMinutes || 15,
          measureId: entry.measureId || null,
          readings,
          rejected: { noTime: 0, noValue: 0, implausible: 0, wrongStation: 0 },
          empty: readings.length === 0
        }
      };
    }

    function forget(station) {
      const cache = loadCache();
      delete cache[cacheKeyFor(station)];
      return writeJson(CACHE_KEY, cache);
    }

    function clearAll() {
      try { store.removeItem(SETTINGS_KEY); store.removeItem(CACHE_KEY); return true; }
      catch (e) { return false; }
    }

    return {
      defaults, loadSettings, saveSettings,
      loadCacheEntry, saveCacheEntry, forget, clearAll,
      SETTINGS_KEY, CACHE_KEY, CACHE_KEEP_HOURS
    };
  }

  function numberOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  }

  const rmStore = { makeStore, memoryStore, numberOrNull, SETTINGS_KEY, CACHE_KEY };
  return { rmStore };
});
