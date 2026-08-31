/* Rainfall Monitor — the gauges being watched.

   An EA rain gauge has no name. The Agency withholds them on purpose, along with
   the exact position: "for information protection reasons the rainfall monitoring
   stations do not have names and their geographic location has been reduced to a
   100m grid". So a gauge arrives as a bare id like E9660, and the only way it
   ever gets a useful label is if you type one in yourself — which the app lets
   you do, and remembers.

   River level stations, by contrast, do have names, and the app fills those in
   from the EA when it fetches them. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /* What the app knows how to read. `parameter` is the EA's own query value. */
  const RM_KINDS = {
    rainfall: {
      key: 'rainfall',
      parameter: 'rainfall',
      noun: 'rain gauge',
      unit: 'mm',
      /* Rainfall accumulates, so totals over a window are meaningful. */
      accumulates: true
    },
    level: {
      key: 'level',
      parameter: 'level',
      noun: 'river level',
      unit: 'm',
      /* A level is a state, not a quantity that adds up. Summing levels would be
         meaningless, so the app reports the latest reading and how fast it is
         moving instead. */
      accumulates: false
    }
  };

  /* The gauge this app was built around. Everything else is added by hand. */
  const RM_DEFAULT_STATIONS = [
    { id: 'E9660', kind: 'rainfall', label: '' }
  ];

  /* A station id is short, alphanumeric, and sometimes has letters on the end
     (E9660, 52203, L2404, 1491TH). Validated loosely — the EA is the authority on
     whether one exists, and it will say so with a 404. */
  function rmValidStationId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_.-]{2,32}$/.test(id.trim());
  }

  function rmStationName(station) {
    if (!station) return '';
    const label = (station.label || '').trim();
    if (label) return label;
    if ((station.eaLabel || '').trim()) return station.eaLabel.trim();
    return station.id;
  }

  function rmKind(key) {
    return RM_KINDS[key] || RM_KINDS.rainfall;
  }

  return { RM_KINDS, RM_DEFAULT_STATIONS, rmValidStationId, rmStationName, rmKind };
});
