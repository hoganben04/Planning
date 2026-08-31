/* Rainfall Monitor — the chart, drawn as SVG text.

   These functions take numbers and return a string of SVG. They touch no DOM,
   which means the chart can be unit-tested like anything else, and it means the
   whole picture is one innerHTML assignment rather than a few hundred element
   creations on a phone.

   Colours come from CSS custom properties rather than being written in here, so
   the chart follows the light and dark theme with the rest of the app.

   THE GAPS ARE PART OF THE PICTURE. A missing quarter of an hour is drawn as a
   grey mark on the baseline, not left blank, because blank looks exactly like
   dry. A chart of a gauge that stopped reporting at four o'clock should show
   that it stopped reporting at four o'clock. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./readings.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (readingsMod) {
  const R = readingsMod.rmReadings;

  /* A wide, short viewBox scaled to the container by CSS, so the same drawing
     works on a phone held either way round without re-rendering. */
  const W = 720;
  const H = 200;
  const PAD = { top: 14, right: 8, bottom: 26, left: 44 };
  const PLOT = { x: PAD.left, y: PAD.top, w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function round(n) { return Math.round(n * 100) / 100; }

  /* A y axis that ends on a round number, so the top gridline reads 4mm rather
     than 3.32mm. Rounds UP to the next round number at the scale of the value:
     3.32 gives 4, 17 gives 20, 0.6 gives 0.6. */
  const TOP_STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

  function niceMax(value, minimum) {
    const target = Math.max(value || 0, minimum || 0);
    if (!(target > 0)) return minimum || 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
    for (const step of TOP_STEPS) {
      const candidate = step * magnitude;
      if (candidate >= target - 1e-9) return round(candidate);
    }
    return round(10 * magnitude);
  }

  function timeLabel(t, hours) {
    const d = new Date(t);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (hours > 48) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `${days[d.getDay()]} ${hh}`;
    }
    return `${hh}:${mm}`;
  }

  /* Vertical gridlines on the hour, spaced so the labels never collide. */
  function timeTicks(from, to) {
    const hours = (to - from) / 3600000;
    const everyHours = hours <= 8 ? 1 : hours <= 30 ? 3 : hours <= 60 ? 6 : 12;
    const ticks = [];
    const start = new Date(from);
    start.setMinutes(0, 0, 0);
    for (let t = start.getTime(); t <= to; t += everyHours * 3600000) {
      if (t < from) continue;
      const d = new Date(t);
      if (d.getHours() % everyHours !== 0) continue;
      ticks.push(t);
    }
    return { ticks, hours };
  }

  /* The gridlines, the baseline and the two axis labels.

     The unit goes on the top label — "4mm", not a separate "mm" floating above
     it, which is what it used to be and which collided with the number at every
     size worth using. */
  function frame(from, to, opts) {
    const o = opts || {};
    const { ticks, hours } = timeTicks(from, to);
    const span = to - from || 1;
    const x = t => PLOT.x + ((t - from) / span) * PLOT.w;
    const unit = o.unit || '';
    let out = '';
    for (const t of ticks) {
      const px = round(x(t));
      out += `<line class="rm-grid" x1="${px}" y1="${PLOT.y}" x2="${px}" y2="${PLOT.y + PLOT.h}" />`;
      out += `<text class="rm-axis" x="${px}" y="${H - 9}" text-anchor="middle">${esc(timeLabel(t, hours))}</text>`;
    }
    out += `<line class="rm-baseline" x1="${PLOT.x}" y1="${PLOT.y + PLOT.h}" x2="${PLOT.x + PLOT.w}" y2="${PLOT.y + PLOT.h}" />`;
    out += `<text class="rm-axis" x="${PLOT.x - 6}" y="${PLOT.y + 4}" text-anchor="end">${esc(o.maxLabel)}${esc(unit)}</text>`;
    out += `<text class="rm-axis" x="${PLOT.x - 6}" y="${PLOT.y + PLOT.h}" text-anchor="end">${esc(o.lowLabel === undefined ? 0 : o.lowLabel)}</text>`;
    return out;
  }

  function open(title) {
    /* No preserveAspectRatio override: the default keeps the drawing square to
       itself, so the axis text is never stretched. CSS gives it the full width of
       the card and lets the height follow. */
    return `<svg class="rm-chart" viewBox="0 0 ${W} ${H}" ` +
      `role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg">`;
  }

  function empty(message) {
    return open(message) +
      `<text class="rm-empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">${esc(message)}</text></svg>`;
  }

  /* ---- Rainfall: a bar per reading period -------------------------------- */
  function bars(series, opts) {
    const o = opts || {};
    const from = o.from;
    const to = o.to;
    if (!series || series.empty) return empty('No readings for this gauge');

    const span = to - from || 1;
    const x = t => PLOT.x + ((t - from) / span) * PLOT.w;
    const periodMs = (series.periodMinutes || 15) * 60000;
    const inWindow = series.readings.filter(r => {
      const c = R.coverage(r.t, series.periodMinutes, series.periodLabel);
      return c.to > from && c.from < to;
    });
    if (!inWindow.length) return empty('No readings in this window');

    const peak = inWindow.reduce((m, r) => Math.max(m, r.value), 0);
    /* The threshold, as a single period's worth of rain, so a 20mm/h line lands
       where one 15-minute bar would have to reach to be raining that hard. */
    const perPeriod = o.rateLineMmPerHour
      ? o.rateLineMmPerHour * ((series.periodMinutes || 15) / 60)
      : 0;
    let max = niceMax(peak, 1);
    /* If the line would sit exactly on the top of the axis it reads as the
       chart's own border rather than as a threshold — which is what happened
       with a 4.14mm peak against a 20mm/h mark, both landing on 5. Give it a
       step of headroom, but only when the line is going to be drawn at all: a
       quiet day keeps its sensitive axis rather than being flattened to make
       room for a mark nowhere near being met. */
    if (perPeriod && perPeriod <= max && perPeriod >= max * 0.97) {
      max = niceMax(perPeriod * 1.05, 1);
    }
    const y = v => PLOT.y + PLOT.h - Math.min(1, v / max) * PLOT.h;

    let out = open(o.title || 'Rainfall');
    out += frame(from, to, { maxLabel: `${max}`, unit: o.unit || series.unit || 'mm' });

    /* Where readings are missing. Done before the bars so a bar always draws
       over its own marker rather than under it. */
    const present = new Set(inWindow.map(r => r.t));
    const firstSlot = Math.ceil(from / periodMs) * periodMs;
    let gapRuns = 0;
    for (let t = firstSlot; t < to && gapRuns < 400; t += periodMs, gapRuns++) {
      if (present.has(t)) continue;
      const bx = round(x(t));
      const bw = Math.max(1, round((periodMs / span) * PLOT.w) - 0.5);
      /* BELOW the baseline, not on it. On it, a long run of gaps reads as a
         dashed axis rather than as missing data — which is the exact confusion
         the markers exist to prevent. */
      out += `<rect class="rm-gap" x="${bx}" y="${PLOT.y + PLOT.h + 2}" width="${bw}" height="3" />`;
    }

    /* The threshold line, when one applies to a single period. Drawn as an
       hourly-rate equivalent so a 20mm/h alert shows where a single 15-minute
       bar would have to reach to be raining that hard. */
    if (perPeriod) {
      if (perPeriod <= max) {
        const ly = round(y(perPeriod));
        out += `<line class="rm-threshold" x1="${PLOT.x}" y1="${ly}" x2="${PLOT.x + PLOT.w}" y2="${ly}" />`;
        /* Labelled at the left, where the chart is emptiest. At the right it sat
           on top of the most recent bars — the ones being looked at. */
        out += `<text class="rm-axis rm-threshold-label" x="${PLOT.x + 4}" y="${ly - 4}" text-anchor="start">` +
          `${esc(o.rateLineMmPerHour + 'mm/h')}</text>`;
      }
    }

    for (const r of inWindow) {
      if (r.value <= 0) continue;
      const c = R.coverage(r.t, series.periodMinutes, series.periodLabel);
      const bx = round(x(c.from));
      const bw = Math.max(1, round((periodMs / span) * PLOT.w) - 0.5);
      const by = round(y(r.value));
      const bh = Math.max(1, round(PLOT.y + PLOT.h - by));
      out += `<rect class="rm-bar" x="${bx}" y="${by}" width="${bw}" height="${bh}" />`;
    }

    out += '</svg>';
    return out;
  }

  /* ---- River level: a line, with the station's own normal range behind it -- */
  function line(series, opts) {
    const o = opts || {};
    const from = o.from;
    const to = o.to;
    if (!series || series.empty) return empty('No readings for this gauge');

    const inWindow = series.readings.filter(r => r.t >= from && r.t <= to);
    if (!inWindow.length) return empty('No readings in this window');

    const span = to - from || 1;
    const x = t => PLOT.x + ((t - from) / span) * PLOT.w;

    const values = inWindow.map(r => r.value);
    const candidates = values.concat(
      [o.typicalRangeLow, o.typicalRangeHigh, o.watchM, o.alertM]
        .filter(v => v !== null && v !== undefined && isFinite(v))
    );
    let lo = Math.min.apply(null, candidates);
    let hi = Math.max.apply(null, candidates);
    if (hi - lo < 0.1) { hi += 0.05; lo -= 0.05; }
    const pad = (hi - lo) * 0.1;
    lo -= pad; hi += pad;
    const y = v => PLOT.y + PLOT.h - ((v - lo) / (hi - lo)) * PLOT.h;

    let out = open(o.title || 'River level');

    /* The typical range as a band, because "1.2m" means nothing without it. */
    if (isFinite(o.typicalRangeLow) && isFinite(o.typicalRangeHigh) &&
        o.typicalRangeHigh > o.typicalRangeLow) {
      const top = round(y(o.typicalRangeHigh));
      const bottom = round(y(o.typicalRangeLow));
      out += `<rect class="rm-band" x="${PLOT.x}" y="${top}" width="${PLOT.w}" height="${round(bottom - top)}" />`;
    }

    /* A level axis does not start at zero — the baseline is the bottom of the
       range on show, so it has to be labelled with its real value. */
    out += frame(from, to, {
      maxLabel: `${round(hi)}`,
      lowLabel: round(lo),
      unit: o.unit || 'm'
    });

    for (const mark of [{ v: o.watchM, cls: 'rm-threshold' }, { v: o.alertM, cls: 'rm-threshold rm-threshold-alert' }]) {
      if (mark.v === null || mark.v === undefined || !isFinite(mark.v)) continue;
      if (mark.v < lo || mark.v > hi) continue;
      const ly = round(y(mark.v));
      out += `<line class="${mark.cls}" x1="${PLOT.x}" y1="${ly}" x2="${PLOT.x + PLOT.w}" y2="${ly}" />`;
    }

    const points = inWindow.map(r => `${round(x(r.t))},${round(y(r.value))}`).join(' ');
    out += `<polyline class="rm-line" points="${points}" />`;
    /* Where the river is now. A short window inside a long chart is otherwise a
       few pixels of line in one corner, easily missed. */
    const last = inWindow[inWindow.length - 1];
    out += `<circle class="rm-dot" cx="${round(x(last.t))}" cy="${round(y(last.value))}" r="3.5" />`;
    out += '</svg>';
    return out;
  }

  const rmChart = { bars, line, niceMax, timeTicks, esc, W, H, PLOT };
  return { rmChart };
});
