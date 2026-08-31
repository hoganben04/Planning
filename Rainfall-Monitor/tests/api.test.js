/* Tests for the requests, and for what happens when they fail.

   The URL tests exist because the query parameters on this API are the easiest
   thing in the whole app to get quietly wrong — `today` instead of `since`, or a
   missing limit — and both mistakes produce a plausible-looking screen with the
   wrong numbers on it rather than an error.

   The error tests exist because "no data" is not one situation. A dead signal, a
   mistyped station id and a throttled request all need different words on the
   screen, and only one of them is worth retrying. */
const test = require('node:test');
const assert = require('node:assert');

const { rmApi: Api } = require('../app/lib/api.js');

const NOW = Date.parse('2026-08-31T01:15:00Z');

test('a readings URL asks for the right station, parameter and window', () => {
  const url = Api.readingsUrl({
    id: 'E9660', kind: 'rainfall', since: Api.sinceIso(NOW, 24), limit: 200
  });
  assert.ok(url.startsWith('https://environment.data.gov.uk/flood-monitoring/id/stations/E9660/readings?'));
  assert.match(url, /parameter=rainfall/);
  assert.match(url, /_sorted/);
  assert.match(url, /_limit=200/);
  assert.match(url, /since=2026-08-30T01%3A15%3A00Z/);
});

test('the app never asks for `today`', () => {
  /* `today` starts at midnight UTC, so at ten past midnight it returns ten
     minutes of rain — and it cuts a burst that straddles midnight in half. The
     app asks for a rolling window instead, always. */
  const url = Api.readingsUrl({ id: 'E9660', kind: 'rainfall', since: Api.sinceIso(NOW, 96) });
  assert.ok(url.indexOf('today') < 0);
  assert.match(url, /since=/);
});

test('a level station asks for levels', () => {
  const url = Api.readingsUrl({ id: 'L2404', kind: 'level', since: Api.sinceIso(NOW, 24) });
  assert.match(url, /parameter=level/);
  assert.match(url, /stations\/L2404\/readings/);
});

test('a station id with awkward characters is escaped rather than injected', () => {
  const url = Api.readingsUrl({ id: 'a b&c', kind: 'rainfall' });
  assert.ok(url.indexOf('a b&c') < 0);
  assert.match(url, /stations\/a%20b%26c\/readings/);
});

test('the limit always has headroom over the readings expected', () => {
  /* The EA caps a response at 500 unless told otherwise, and five days of
     15-minute data is 480 — so a week silently truncates without this. */
  assert.ok(Api.limitFor(24, 15) > 96);
  assert.ok(Api.limitFor(168, 15) > 672);
  assert.ok(Api.limitFor(120, 15) > 480);
  assert.ok(Api.limitFor(1, 15) >= 100, 'a floor, so a short window still gets a sane limit');
});

test('since is an ISO time to the second, which is what the EA accepts', () => {
  assert.equal(Api.sinceIso(NOW, 0), '2026-08-31T01:15:00Z');
  assert.ok(Api.sinceIso(NOW, 3).indexOf('.') < 0, 'no milliseconds');
});

/* ---- Failures --------------------------------------------------------- */

function fakeFetch(response) {
  return async () => response;
}

function jsonResponse(body, status) {
  return {
    ok: (status || 200) < 400,
    status: status || 200,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

test('a good response comes back parsed', async () => {
  const payload = { items: [{ dateTime: '2026-08-31T00:00:00Z', value: 1 }] };
  const got = await Api.fetchJson('https://example.test/x', { fetch: fakeFetch(jsonResponse(payload)) });
  assert.deepEqual(got, payload);
});

test('a mistyped station id is told apart from everything else', async () => {
  await assert.rejects(
    () => Api.fetchJson('https://example.test/x', { fetch: fakeFetch(jsonResponse('', 404)) }),
    err => err.kind === 'notFound'
  );
});

test('being throttled is its own kind of failure', async () => {
  await assert.rejects(
    () => Api.fetchJson('https://example.test/x', { fetch: fakeFetch(jsonResponse('', 429)) }),
    err => err.kind === 'throttled'
  );
});

test('a server error is reported as one', async () => {
  await assert.rejects(
    () => Api.fetchJson('https://example.test/x', { fetch: fakeFetch(jsonResponse('', 503)) }),
    err => err.kind === 'server'
  );
});

test('a dead connection is offline, not bad data', async () => {
  const boom = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(
    () => Api.fetchJson('https://example.test/x', { fetch: boom }),
    err => err.kind === 'offline'
  );
});

test('an aborted request is a timeout', async () => {
  const abort = async () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    throw e;
  };
  await assert.rejects(
    () => Api.fetchJson('https://example.test/x', { fetch: abort }),
    err => err.kind === 'timeout'
  );
});

test('an HTML error page where JSON was expected is caught, not parsed into nothing', async () => {
  await assert.rejects(
    () => Api.fetchJson('https://example.test/x', {
      fetch: fakeFetch(jsonResponse('<html>Service unavailable</html>'))
    }),
    err => err.kind === 'badData'
  );
});

test('station info pulls out the name and the typical range a level needs', async () => {
  const payload = {
    items: {
      label: 'Adur at Beeding Bridge',
      riverName: 'River Adur',
      town: 'Upper Beeding',
      catchmentName: 'Adur and Ouse',
      lat: 50.88,
      long: -0.31,
      stageScale: {
        typicalRangeLow: '0.15',
        typicalRangeHigh: '2.10',
        maxOnRecord: { value: '3.44' }
      }
    }
  };
  const info = await Api.fetchStationInfo('L2404', { fetch: fakeFetch(jsonResponse(payload)) });
  assert.equal(info.eaLabel, 'Adur at Beeding Bridge');
  assert.equal(info.river, 'River Adur');
  assert.equal(info.typicalRangeLow, 0.15);
  assert.equal(info.typicalRangeHigh, 2.1);
  assert.equal(info.recordMax, 3.44);
});

test('a rain gauge has no name or range, and that is not an error', async () => {
  /* The EA withholds both on purpose for rainfall stations. */
  const info = await Api.fetchStationInfo('E9660', {
    fetch: fakeFetch(jsonResponse({ items: { lat: 50.9, long: -0.3 } }))
  });
  assert.equal(info.eaLabel, '');
  assert.equal(info.typicalRangeLow, null);
});

test('a label that arrives as a list takes the first of them', async () => {
  /* Some stations carry two labels. Left unhandled this renders as
     "Name A,Name B" on the card. */
  const info = await Api.fetchStationInfo('L1', {
    fetch: fakeFetch(jsonResponse({ items: { label: ['Beeding Bridge', 'Bramber'] } }))
  });
  assert.equal(info.eaLabel, 'Beeding Bridge');
});

test('fetchReadings asks for the window it was given', async () => {
  let seen = null;
  const spy = async (url) => { seen = url; return jsonResponse({ items: [] }); };
  await Api.fetchReadings({ id: 'E9660', kind: 'rainfall' },
    { fetch: spy, now: NOW, hoursBack: 48 });
  assert.match(seen, /since=2026-08-29T01%3A15%3A00Z/);
  assert.match(seen, /parameter=rainfall/);
});
