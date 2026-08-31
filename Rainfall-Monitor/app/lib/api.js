/* Rainfall Monitor — talking to the Environment Agency.

   The fetching is done by the browser, straight to the EA. There is no server in
   the middle, which is why this app can be a static page on GitHub Pages and why
   nothing about which gauges you watch leaves the phone.

   That does mean the app depends on the EA sending CORS headers on the
   real-time API. It does, and has since the service opened — the API is
   documented for exactly this kind of use — but if a browser ever starts
   refusing the request, that is what has changed, and fetchJson() reports it as
   its own kind of failure rather than as "no data".

   URL building is separated from fetching so the URLs can be unit-tested. They
   are worth testing: the query parameters are where this API is easiest to get
   quietly wrong. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('../data/sources.js') : root,
    typeof require === 'function' ? require('../data/stations.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (sourcesMod, stationMod) {
  const BASE = sourcesMod.RM_API_BASE;
  const kindOf = stationMod.rmKind;

  /* ---- Why `since` and not `today` ---------------------------------------
     The obvious query is `?today`, and it is a trap. `today` starts at midnight
     UTC, so at ten past midnight it returns ten minutes of rain and the app
     reports a dry night through the middle of a storm. Worse, a burst that
     straddles midnight — which is exactly what the reading that started this app
     did — gets cut in half, and the half that mattered is on the other side.

     So the app always asks for a window measured backwards from now, long enough
     to cover the longest threshold window with history to spare. Anything the
     user sees as "today" is worked out locally from the series, where local
     midnight is actually local. */
  function sinceIso(now, hoursBack) {
    return new Date(now - hoursBack * 3600000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  /* The EA caps a response at 500 readings unless told otherwise. At 15-minute
     data that is five days and five hours — so a week of history silently
     truncates, and it truncates the OLD end or the new one depending on sort
     order, which is a horrible bug to find. Always send an explicit limit with
     headroom. */
  function limitFor(hoursBack, periodMinutes) {
    const expected = Math.ceil((hoursBack * 60) / (periodMinutes || 15));
    return Math.max(100, Math.ceil(expected * 1.2) + 20);
  }

  function readingsUrl(opts) {
    const o = opts || {};
    const kind = kindOf(o.kind);
    const params = [];
    /* `_sorted` gives newest first, which is the order the EA's own examples use
       and the order its truncation assumes. normalise() sorts it back. */
    params.push('_sorted');
    params.push('parameter=' + encodeURIComponent(kind.parameter));
    if (o.since) params.push('since=' + encodeURIComponent(o.since));
    params.push('_limit=' + (o.limit || 500));
    return `${BASE}/id/stations/${encodeURIComponent(o.id)}/readings?${params.join('&')}`;
  }

  function stationUrl(id) {
    return `${BASE}/id/stations/${encodeURIComponent(id)}`;
  }

  /* ---- Errors -------------------------------------------------------------
     Told apart because the right thing to say to the user differs completely:
     "no signal" is wait, "no such gauge" is fix the id, and "blocked" is a
     browser or network problem that no amount of retrying will help. */
  function ApiError(kind, message, cause) {
    const e = new Error(message);
    e.name = 'ApiError';
    e.kind = kind;
    if (cause) e.cause = cause;
    return e;
  }

  const TIMEOUT_MS = 20000;

  async function fetchJson(url, opts) {
    const o = opts || {};
    const fetchImpl = o.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchImpl) throw ApiError('unsupported', 'This browser cannot fetch.');

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), o.timeoutMs || TIMEOUT_MS)
      : null;

    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: controller ? controller.signal : undefined,
        cache: 'no-store'
      });
    } catch (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw ApiError('timeout', 'The Environment Agency did not answer in time.', err);
      }
      /* A blocked cross-origin request and a dead connection look identical from
         here: the browser refuses to say which, on purpose. Both come out as
         "offline", with the CORS possibility mentioned in the UI's help rather
         than guessed at here. */
      throw ApiError('offline', 'Could not reach the Environment Agency.', err);
    }
    if (timer) clearTimeout(timer);

    if (response.status === 404) {
      throw ApiError('notFound', 'The Environment Agency has no station with that id.');
    }
    if (response.status === 429) {
      throw ApiError('throttled', 'Too many requests to the Environment Agency; try again shortly.');
    }
    if (!response.ok) {
      throw ApiError('server', `The Environment Agency returned ${response.status}.`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      throw ApiError('badData', 'The Environment Agency sent something that was not JSON.', err);
    }
  }

  /* Station metadata: a river gauge has a name and a typical range, both worth
     showing. A rain gauge has neither, by EA policy, so a failure here is not
     worth surfacing — the readings are the point. */
  async function fetchStationInfo(id, opts) {
    const payload = await fetchJson(stationUrl(id), opts);
    const item = payload && payload.items
      ? (Array.isArray(payload.items) ? payload.items[0] : payload.items)
      : null;
    if (!item) return null;
    const scale = item.stageScale && item.stageScale.typicalRangeHigh !== undefined
      ? item.stageScale
      : null;
    return {
      id,
      eaLabel: typeof item.label === 'string' ? item.label
        : Array.isArray(item.label) ? item.label[0] : '',
      river: item.riverName || '',
      town: item.town || '',
      catchment: item.catchmentName || '',
      lat: typeof item.lat === 'number' ? item.lat : null,
      long: typeof item.long === 'number' ? item.long : null,
      typicalRangeLow: scale ? Number(scale.typicalRangeLow) : null,
      typicalRangeHigh: scale ? Number(scale.typicalRangeHigh) : null,
      recordMax: scale && scale.maxOnRecord && scale.maxOnRecord.value !== undefined
        ? Number(scale.maxOnRecord.value) : null
    };
  }

  async function fetchReadings(station, opts) {
    const o = opts || {};
    const hoursBack = o.hoursBack || 96;
    const url = readingsUrl({
      id: station.id,
      kind: station.kind,
      since: sinceIso(o.now || Date.now(), hoursBack),
      limit: limitFor(hoursBack, o.periodMinutes || 15)
    });
    const payload = await fetchJson(url, o);
    return { url, payload };
  }

  const rmApi = {
    sinceIso, limitFor, readingsUrl, stationUrl,
    fetchJson, fetchReadings, fetchStationInfo, ApiError, TIMEOUT_MS
  };

  return { rmApi };
});
