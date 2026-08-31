/* Tests for what is kept on the phone.

   Two things have to hold. Settings written by an older version of the app must
   still open in a newer one — losing somebody's marks is a real cost, and it is
   silent. And a corrupt or full storage must degrade rather than break: the app
   is opened in a yard to answer a question, and it has to answer it. */
const test = require('node:test');
const assert = require('node:assert');

const { rmStore: S } = require('../app/lib/store.js');
const T = require('../app/data/thresholds.js');

function fresh() {
  return S.makeStore(S.memoryStore());
}

test('a first run starts with E9660 and the default marks', () => {
  const settings = fresh().loadSettings();
  assert.equal(settings.stations.length, 1);
  assert.equal(settings.stations[0].id, 'E9660');
  assert.equal(settings.stations[0].kind, 'rainfall');
  assert.equal(settings.thresholds.length, T.RM_DEFAULT_THRESHOLDS.length);
  assert.equal(settings.chartHours, 24);
});

test('settings survive a round trip', () => {
  const store = fresh();
  const settings = store.loadSettings();
  settings.stations[0].label = 'Top field';
  settings.chartHours = 48;
  settings.thresholds[0].alertMm = 25;
  store.saveSettings(settings);

  const back = store.loadSettings();
  assert.equal(back.stations[0].label, 'Top field');
  assert.equal(back.chartHours, 48);
  assert.equal(back.thresholds[0].alertMm, 25);
});

test('a settings blob from an older version gains the new fields instead of losing the app', () => {
  const backing = S.memoryStore();
  backing.setItem(S.SETTINGS_KEY, JSON.stringify({
    stations: [{ id: 'E9660', kind: 'rainfall', label: 'Yard' }]
    /* No thresholds, no chartHours, no autoRefreshMinutes: an older shape. */
  }));
  const settings = S.makeStore(backing).loadSettings();
  assert.equal(settings.stations[0].label, 'Yard');
  assert.equal(settings.thresholds.length, T.RM_DEFAULT_THRESHOLDS.length);
  assert.equal(settings.chartHours, 24);
  assert.ok(settings.autoRefreshMinutes > 0);
});

test('corrupt storage starts again rather than throwing', () => {
  const backing = S.memoryStore();
  backing.setItem(S.SETTINGS_KEY, '{not json at all');
  const settings = S.makeStore(backing).loadSettings();
  assert.equal(settings.stations[0].id, 'E9660');
});

test('rubbish in the saved settings is filtered out', () => {
  const backing = S.memoryStore();
  backing.setItem(S.SETTINGS_KEY, JSON.stringify({
    stations: [
      { id: 'E9660', kind: 'rainfall' },
      { id: 'not a valid id!!', kind: 'rainfall' },
      { id: 'L2404', kind: 'nonsense' }
    ],
    thresholds: [
      { hours: 6, label: 'in 6 hours', watchMm: 20, alertMm: 40 },
      { hours: 'banana', watchMm: 1 },
      { hours: 1, label: 'in an hour', watchMm: 'x', alertMm: 20 }
    ],
    chartHours: 999
  }));
  const settings = S.makeStore(backing).loadSettings();
  assert.deepEqual(settings.stations.map(s => s.id), ['E9660', 'L2404']);
  assert.equal(settings.stations[1].kind, 'rainfall', 'an unknown kind falls back to rainfall');
  assert.equal(settings.thresholds.length, 2);
  assert.deepEqual(settings.thresholds.map(t => t.hours), [1, 6], 'windows come out in order');
  assert.equal(settings.thresholds[0].watchMm, null, 'an unreadable number becomes blank, not zero');
  assert.equal(settings.chartHours, 24, 'an unsupported chart window falls back');
});

test('removing every gauge puts the default back rather than leaving an empty app', () => {
  const backing = S.memoryStore();
  backing.setItem(S.SETTINGS_KEY, JSON.stringify({ stations: [] }));
  assert.equal(S.makeStore(backing).loadSettings().stations[0].id, 'E9660');
});

test('readings are cached and come back as a usable series', () => {
  const store = fresh();
  const station = { id: 'E9660', kind: 'rainfall' };
  const now = Date.parse('2026-08-31T01:15:00Z');
  store.saveCacheEntry(station, {
    parameter: 'rainfall', unit: 'mm', periodMinutes: 15, measureId: 'm',
    readings: [
      { t: Date.parse('2026-08-31T00:00:00Z'), value: 2.23 },
      { t: Date.parse('2026-08-31T00:15:00Z'), value: 3.32 }
    ]
  }, now);

  const back = store.loadCacheEntry(station);
  assert.equal(back.fetchedAt, now);
  assert.equal(back.series.readings.length, 2);
  assert.equal(back.series.readings[1].value, 3.32);
  assert.equal(back.series.empty, false);
});

test('the cache drops readings older than the window it keeps', () => {
  const store = fresh();
  const station = { id: 'E9660', kind: 'rainfall' };
  const now = Date.parse('2026-08-31T00:00:00Z');
  store.saveCacheEntry(station, {
    parameter: 'rainfall', unit: 'mm', periodMinutes: 15, measureId: 'm',
    readings: [
      { t: now - (store.CACHE_KEEP_HOURS + 24) * 3600000, value: 5 },
      { t: now - 3600000, value: 1 }
    ]
  }, now);
  const back = store.loadCacheEntry(station);
  assert.equal(back.series.readings.length, 1);
  assert.equal(back.series.readings[0].value, 1);
});

test('a rain gauge and a level gauge with the same id are cached apart', () => {
  const store = fresh();
  const now = Date.now();
  store.saveCacheEntry({ id: 'X1', kind: 'rainfall' },
    { parameter: 'rainfall', periodMinutes: 15, readings: [{ t: now, value: 1 }] }, now);
  store.saveCacheEntry({ id: 'X1', kind: 'level' },
    { parameter: 'level', periodMinutes: 15, readings: [{ t: now, value: 9 }] }, now);
  assert.equal(store.loadCacheEntry({ id: 'X1', kind: 'rainfall' }).series.readings[0].value, 1);
  assert.equal(store.loadCacheEntry({ id: 'X1', kind: 'level' }).series.readings[0].value, 9);
});

test('a corrupt cache entry is ignored rather than crashing the card', () => {
  const backing = S.memoryStore();
  backing.setItem(S.CACHE_KEY, JSON.stringify({
    'rainfall:E9660': { fetchedAt: 1, readings: [['not a time', 'not a value'], [123, 4]] }
  }));
  const back = S.makeStore(backing).loadCacheEntry({ id: 'E9660', kind: 'rainfall' });
  assert.equal(back.series.readings.length, 1);
  assert.equal(back.series.readings[0].value, 4);
});

test('forgetting a gauge removes its readings but leaves the others', () => {
  const store = fresh();
  const now = Date.now();
  const a = { id: 'A1', kind: 'rainfall' };
  const b = { id: 'B1', kind: 'rainfall' };
  for (const s of [a, b]) {
    store.saveCacheEntry(s, { parameter: 'rainfall', periodMinutes: 15, readings: [{ t: now, value: 1 }] }, now);
  }
  store.forget(a);
  assert.equal(store.loadCacheEntry(a), null);
  assert.ok(store.loadCacheEntry(b));
});

test('storage that refuses to write does not break the app', () => {
  const refusing = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {}
  };
  const store = S.makeStore(refusing);
  assert.equal(store.saveSettings(store.loadSettings()), false);
  assert.equal(store.loadSettings().stations[0].id, 'E9660', 'and it still opens');
});

test('a number field accepts blank as blank, not as zero', () => {
  assert.equal(S.numberOrNull(''), null);
  assert.equal(S.numberOrNull(null), null);
  assert.equal(S.numberOrNull('abc'), null);
  assert.equal(S.numberOrNull('0'), 0);
  assert.equal(S.numberOrNull('12.5'), 12.5);
});

test('a cached entry holding no readings reports itself as empty', () => {
  /* It used to claim otherwise, and the analysis — which trusts this flag to
     decide whether there is a latest reading — crashed the card. A gauge that
     answers with nothing, or whose readings are all unusable, gets here. */
  const store = fresh();
  const station = { id: 'E9660', kind: 'rainfall' };
  store.saveCacheEntry(station, {
    parameter: 'rainfall', unit: 'mm', periodMinutes: 15, measureId: 'm', readings: []
  }, Date.now());
  const back = store.loadCacheEntry(station);
  assert.equal(back.series.readings.length, 0);
  assert.equal(back.series.empty, true);
});
