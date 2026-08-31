/* Rainfall Monitor — the bands, and the numbers a warning is judged against.

   READ THIS BEFORE TRUSTING A WARNING.

   These thresholds are this app's own. They are not an Environment Agency
   trigger, not a Met Office warning level, and not calibrated to any particular
   piece of ground. They are round numbers chosen to be useful on a farm: low
   enough to be worth a look, high enough not to cry wolf every time it rains.

   Whether a given total actually causes trouble depends on things no rain gauge
   knows — how wet the ground already is, how steep it is, what is growing on it,
   where the drains and ditches run, and whether the last three days were dry or
   sodden. 30mm on baked summer ground runs straight off; the same 30mm on ground
   already at field capacity in February does something else entirely.

   So: treat a warning as "go and look", never as "this will flood". Then edit
   these numbers in Settings as you learn what your own ground actually does.
   Whatever you set is saved on the phone and used from then on.

   The real flood warnings — the official ones, issued by people with models and
   river gauges — are at gov.uk/check-flooding. This app is a rain gauge, and
   knows nothing about rivers rising somewhere upstream. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /* ---- How hard it is raining, right now ----------------------------------
     Bands on the instantaneous rate, taken from the latest 15-minute reading
     multiplied up to an hourly rate. A quarter of an hour at 13mm/h is a heavy
     shower; a whole hour at 13mm/h is a different matter, which is what the
     accumulation thresholds below are for. */
  const RM_INTENSITY_BANDS = [
    { key: 'dry', maxMmPerHour: 0.05, label: 'dry', note: 'nothing in the bucket' },
    { key: 'light', maxMmPerHour: 2, label: 'light', note: 'drizzle to steady light rain' },
    { key: 'moderate', maxMmPerHour: 10, label: 'moderate', note: 'proper rain; you would put a coat on' },
    { key: 'heavy', maxMmPerHour: 30, label: 'heavy', note: 'loud on a roof; surfaces start to run' },
    { key: 'torrential', maxMmPerHour: Infinity, label: 'torrential', note: 'cloudburst; drains will not keep up' }
  ];

  /* ---- How much has fallen, over how long ---------------------------------
     Two steps per window. `watch` is worth knowing about. `alert` is worth
     walking out to look at the gateway, the yard drain and the ditch.

     The windows are deliberately different shapes of problem:
       1h   — a cloudburst. Surface water, blocked gullies, water off a road or
              a yard going somewhere it should not.
       6h   — a wet afternoon. Ground giving up, tracks turning, ditches filling.
       24h  — a wet day. The one that gets rivers and land drains involved.
       72h  — three wet days. Nothing dramatic in any one hour, but the ground is
              now full and the next shower has nowhere to go. This is the window
              that catches the winter flood that "came out of nowhere". */
  const RM_DEFAULT_THRESHOLDS = [
    { hours: 1, label: 'in an hour', watchMm: 10, alertMm: 20 },
    { hours: 6, label: 'in 6 hours', watchMm: 20, alertMm: 40 },
    { hours: 24, label: 'in 24 hours', watchMm: 30, alertMm: 60 },
    { hours: 72, label: 'in 3 days', watchMm: 50, alertMm: 90 }
  ];

  /* Warning levels, worst last. The UI colours and sorts by this order. */
  const RM_LEVELS = [
    { key: 'quiet', rank: 0, label: 'Nothing doing' },
    { key: 'watch', rank: 1, label: 'Worth watching' },
    { key: 'alert', rank: 2, label: 'Go and look' }
  ];

  /* ---- River level stations ------------------------------------------------
     A level gauge is worth having beside the rain gauge, because it is the thing
     rain does that actually matters. Levels are absolute though: 1.2m is high on
     one river and nothing on another, so there is no useful default. The app
     reads the station's own typical range from the EA (`stageScale`) when it can,
     and otherwise asks you to set the two numbers yourself. */
  const RM_DEFAULT_LEVEL_THRESHOLDS = { watchM: null, alertM: null };

  /* A river coming up fast is news even below any threshold. Metres per hour. */
  const RM_LEVEL_RISE_WATCH_M_PER_HOUR = 0.1;
  const RM_LEVEL_RISE_ALERT_M_PER_HOUR = 0.25;

  function rmIntensityBand(mmPerHour) {
    const v = Number(mmPerHour);
    if (!isFinite(v) || v < 0) return null;
    for (const band of RM_INTENSITY_BANDS) if (v < band.maxMmPerHour) return band;
    return RM_INTENSITY_BANDS[RM_INTENSITY_BANDS.length - 1];
  }

  function rmLevelRank(key) {
    const found = RM_LEVELS.find(l => l.key === key);
    return found ? found.rank : 0;
  }

  function rmWorstLevel(keys) {
    let worst = 'quiet';
    for (const k of keys || []) if (rmLevelRank(k) > rmLevelRank(worst)) worst = k;
    return worst;
  }

  return {
    RM_INTENSITY_BANDS, RM_DEFAULT_THRESHOLDS, RM_LEVELS,
    RM_DEFAULT_LEVEL_THRESHOLDS,
    RM_LEVEL_RISE_WATCH_M_PER_HOUR, RM_LEVEL_RISE_ALERT_M_PER_HOUR,
    rmIntensityBand, rmLevelRank, rmWorstLevel
  };
});
