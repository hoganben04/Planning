/* Rainfall Monitor — the wiring.

   The only file that touches the DOM, the network and the clock. Everything it
   decides comes from the pure modules underneath, so this file is deliberately
   dull: fetch, store, render, repeat.

   THE ORDER MATTERS ON A BAD SIGNAL. The screen is drawn from the cache first
   and only then refreshed, so opening the app in a yard shows the last known
   totals immediately rather than a spinner that may never resolve. A fetch that
   fails leaves the cached numbers where they are and adds a line saying how old
   they are — it never blanks a card it cannot replace. */
(function () {
  const A = window.rmAnalyse;
  const R = window.rmReadings;
  const Api = window.rmApi;
  const Ui = window.rmUi;
  const StoreLib = window.rmStore;

  const store = StoreLib.makeStore();

  const state = {
    settings: store.loadSettings(),
    entries: [],
    loading: false,
    lastCheckedAt: null,
    online: navigator.onLine === false ? false : true,
    settingsOpen: false
  };

  /* How much history to ask the EA for. Enough to fill the longest threshold
     window and the longest chart window, with a day spare so a gap in telemetry
     does not immediately eat into a total. */
  function hoursNeeded() {
    const longestRule = state.settings.thresholds.reduce((m, t) => Math.max(m, t.hours), 24);
    const longestChart = 120;
    return Math.min(240, Math.max(longestRule, longestChart) + 24);
  }

  /* ---- Rendering ---------------------------------------------------------- */

  const els = {};

  function render() {
    els.topbar.innerHTML = Ui.topbar(state);
    els.view.innerHTML =
      Ui.offlineBanner(state) +
      (state.settingsOpen ? Ui.settingsPanel(state.settings) : '') +
      Ui.stationCards(state.entries, state.settings, Date.now()) +
      Ui.credit();
    document.body.classList.toggle('settings-open', state.settingsOpen);
  }

  /* ---- Working out a verdict ---------------------------------------------- */

  function verdictFor(station, series) {
    const now = Date.now();
    if (station.kind === 'level') {
      return A.assessLevel(series, now, { watchM: station.watchM, alertM: station.alertM });
    }
    return A.assessRainfall(series, now, state.settings.thresholds);
  }

  function entryFromCache(station) {
    const cached = store.loadCacheEntry(station);
    if (!cached) {
      return {
        station,
        series: { empty: true, readings: [], periodMinutes: 15, parameter: station.kind, unit: null },
        verdict: verdictFor(station, { empty: true, readings: [], periodMinutes: 15 }),
        fromCache: false
      };
    }
    return {
      station,
      series: cached.series,
      verdict: verdictFor(station, cached.series),
      fromCache: true,
      cachedAt: cached.fetchedAt
    };
  }

  function drawFromCache() {
    state.entries = state.settings.stations.map(entryFromCache);
    render();
  }

  /* ---- Fetching ----------------------------------------------------------- */

  /* One station. Any failure ends up as an `error` on the entry beside whatever
     the cache still holds, never as a thrown exception — one dead gauge must not
     stop the others being drawn. */
  async function refreshStation(station) {
    const cached = store.loadCacheEntry(station);
    const now = Date.now();
    try {
      /* A river gauge has a name and a typical range worth showing, and they do
         not change, so they are fetched once and kept with the station. A rain
         gauge has neither published, so it is not asked. */
      if (station.kind === 'level' && !station.info) {
        try {
          station.info = await Api.fetchStationInfo(station.id) || {};
          if (station.info.eaLabel) station.eaLabel = station.info.eaLabel;
          store.saveSettings(state.settings);
        } catch (e) {
          station.info = {};
        }
      }

      const { payload } = await Api.fetchReadings(station, { now, hoursBack: hoursNeeded() });
      const fresh = R.normalise(payload, { stationId: station.id, parameter: station.kind });
      const merged = cached ? R.merge(cached.series, fresh) : fresh;
      const trimmed = R.trim(merged, now - store.CACHE_KEEP_HOURS * 3600000);
      store.saveCacheEntry(station, trimmed, now);
      return {
        station,
        series: trimmed,
        verdict: verdictFor(station, trimmed),
        fromCache: false,
        cachedAt: now
      };
    } catch (error) {
      const series = cached ? cached.series : { empty: true, readings: [], periodMinutes: 15 };
      return {
        station,
        series,
        verdict: verdictFor(station, series),
        fromCache: !!cached,
        cachedAt: cached ? cached.fetchedAt : null,
        error
      };
    }
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    render();
    try {
      /* Sequential on purpose. Two or three gauges is the normal case, the EA
         throttles, and a phone on one bar does better with one request at a time
         than three racing. */
      const entries = [];
      for (const station of state.settings.stations) {
        entries.push(await refreshStation(station));
        state.entries = entries.concat(
          state.settings.stations.slice(entries.length).map(entryFromCache)
        );
        render();
      }
      state.entries = entries;
      state.lastCheckedAt = Date.now();
    } finally {
      state.loading = false;
      render();
    }
  }

  /* ---- Settings changes --------------------------------------------------- */

  function persist() {
    store.saveSettings(state.settings);
  }

  function recomputeVerdicts() {
    state.entries = state.entries.map(entry => Object.assign({}, entry, {
      verdict: verdictFor(entry.station, entry.series)
    }));
  }

  function addStation() {
    const idInput = document.getElementById('add-id');
    const kindInput = document.getElementById('add-kind');
    const id = (idInput.value || '').trim().toUpperCase();
    if (!window.rmValidStationId(id)) {
      idInput.setAttribute('aria-invalid', 'true');
      return;
    }
    const kind = kindInput.value === 'level' ? 'level' : 'rainfall';
    if (state.settings.stations.some(s => s.id.toUpperCase() === id && s.kind === kind)) {
      idInput.value = '';
      return;
    }
    state.settings.stations.push({ id, kind, label: '', eaLabel: '', watchM: null, alertM: null });
    persist();
    idInput.value = '';
    drawFromCache();
    refresh();
  }

  function removeStation(index) {
    const station = state.settings.stations[index];
    if (!station) return;
    store.forget(station);
    state.settings.stations.splice(index, 1);
    if (!state.settings.stations.length) {
      state.settings.stations = store.defaults().stations;
    }
    persist();
    drawFromCache();
  }

  function onFieldChange(target) {
    const field = target.getAttribute('data-field');
    const index = Number(target.getAttribute('data-index'));
    const raw = target.value;

    if (field === 'autoRefreshMinutes') {
      state.settings.autoRefreshMinutes = Number(raw) || 5;
      persist();
      scheduleAutoRefresh();
      return;
    }
    if (field === 'label') {
      if (state.settings.stations[index]) {
        state.settings.stations[index].label = raw;
        persist();
      }
      return;
    }
    if (field === 'watchM' || field === 'alertM') {
      if (state.settings.stations[index]) {
        state.settings.stations[index][field] = StoreLib.numberOrNull(raw);
        persist();
        recomputeVerdicts();
        render();
      }
      return;
    }
    if (field === 'watchMm' || field === 'alertMm') {
      if (state.settings.thresholds[index]) {
        state.settings.thresholds[index][field] = StoreLib.numberOrNull(raw);
        persist();
        recomputeVerdicts();
        render();
      }
    }
  }

  /* ---- Events ------------------------------------------------------------- */

  function onClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.getAttribute('data-action');

    if (action === 'refresh') { refresh(); return; }
    if (action === 'settings') {
      state.settingsOpen = !state.settingsOpen;
      render();
      if (state.settingsOpen) {
        const panel = document.getElementById('settings-panel');
        if (panel) panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      return;
    }
    if (action === 'window') {
      state.settings.chartHours = Number(target.getAttribute('data-hours')) || 24;
      persist();
      render();
      return;
    }
    if (action === 'add-station') { addStation(); return; }
    if (action === 'remove-station') {
      removeStation(Number(target.getAttribute('data-index')));
      return;
    }
    if (action === 'forget') {
      /* Deliberately confirmed: it throws away the labels and the marks, which
         are the only things here that took any effort to set. */
      if (!window.confirm('Forget the gauges, the marks and the saved readings?')) return;
      store.clearAll();
      state.settings = store.loadSettings();
      state.settingsOpen = false;
      drawFromCache();
      refresh();
    }
  }

  /* Labels are saved as they are typed; numbers on change, so a half-typed "2"
     of "20" is not briefly treated as a threshold of 2. */
  function onInput(event) {
    const target = event.target;
    if (!target.matches || !target.matches('[data-field]')) return;
    if (target.getAttribute('data-field') === 'label') onFieldChange(target);
  }

  function onChange(event) {
    const target = event.target;
    if (!target.matches || !target.matches('[data-field]')) return;
    if (target.getAttribute('data-field') !== 'label') onFieldChange(target);
  }

  /* ---- The clock ---------------------------------------------------------- */

  let autoTimer = null;

  function scheduleAutoRefresh() {
    if (autoTimer) clearInterval(autoTimer);
    const minutes = state.settings.autoRefreshMinutes || 5;
    autoTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) refresh();
    }, minutes * 60000);
  }

  /* Coming back to the app after a while is the moment the numbers are most
     likely to be stale, so it refreshes on becoming visible rather than waiting
     for the next tick of the timer. */
  function onVisible() {
    if (document.visibilityState !== 'visible') return;
    const age = state.lastCheckedAt ? Date.now() - state.lastCheckedAt : Infinity;
    if (age > 120000) refresh();
    else render();
  }

  function onNetwork() {
    state.online = navigator.onLine !== false;
    render();
    if (state.online) refresh();
  }

  /* ---- Boot --------------------------------------------------------------- */

  function boot() {
    els.topbar = document.getElementById('topbar');
    els.view = document.getElementById('view');

    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onNetwork);
    window.addEventListener('offline', onNetwork);

    drawFromCache();
    scheduleAutoRefresh();
    if (state.online) refresh();

    if ('serviceWorker' in navigator) {
      /* Registered after first paint so it never delays the numbers appearing. */
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => { /* no offline, still works */ });
      });
    }
  }

  window.rmApp = { boot, state, refresh };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
