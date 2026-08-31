/* Rainfall Monitor — where the numbers come from, and what is assumed about them.

   Everything this app shows is Environment Agency real-time data, used under the
   Open Government Licence. Nothing is computed on a server: the browser fetches
   from the EA directly and works the totals out on the phone. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const RM_API_BASE = 'https://environment.data.gov.uk/flood-monitoring';

  const RM_LICENCE = {
    text: 'Environment Agency flood and river level data from the real-time data API (Beta)',
    licence: 'Open Government Licence v3.0',
    licenceUrl: 'http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    docsUrl: 'https://environment.data.gov.uk/flood-monitoring/doc/rainfall'
  };

  /* ---- THE ONE CONVENTION THE WHOLE APP RESTS ON --------------------------
     An EA 15-minute rainfall reading is an ACCUMULATION: 3.32mm did not fall at
     00:15, it fell across a quarter of an hour. So every reading covers an
     interval, and the timestamp is one end of it — but which end is not stated
     unambiguously in the API documentation.

     This app assumes the timestamp is the START of the period, so the 00:15
     reading covers 00:15 to 00:30. That was chosen rather than guessed at:

       - It is the reading under which a `?today` query starting at a 00:00
         timestamp describes rain that fell today, rather than rain that fell in
         the last quarter of yesterday.
       - It is the safer of the two for a warning app. Labelling by the start
         means a burst is attributed to the later, more recent window, so an
         hourly total never looks quieter than it was.

     It matters in exactly two places — which side of midnight a reading falls,
     and where a bar sits on the chart — and the error either way is at most 15
     minutes. If the EA ever confirms the other convention, change this one
     constant: `coverage()` in lib/readings.js is the only reader of it, and the
     tests cover both settings. */
  const RM_PERIOD_LABEL = 'start';

  /* Gauges report by telemetry, and telemetry is late more often than it is
     broken. These are the ages at which the app starts saying so.

     Do not read "stale" as "faulty". The EA says some rain gauges only transmit
     once or twice a day, so a gauge can be perfectly healthy and eight hours
     behind. It does mean the number on the screen must not be trusted as the
     weather happening now, which is the thing worth flagging. */
  const RM_FRESHNESS = [
    { key: 'fresh', maxMinutes: 30, label: 'up to date' },
    { key: 'late', maxMinutes: 120, label: 'running late' },
    { key: 'stale', maxMinutes: Infinity, label: 'out of date' }
  ];

  return { RM_API_BASE, RM_LICENCE, RM_PERIOD_LABEL, RM_FRESHNESS };
});
