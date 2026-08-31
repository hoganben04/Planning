/* Rainfall Monitor — turning a verdict into a screen.

   Every function here takes data and returns a string of HTML. Nothing in this
   file listens for anything; lib/app.js owns the events and re-renders. Keeping
   it that way means the whole screen is a function of the data, so it cannot
   drift out of step with the numbers underneath it.

   The order of a card is the order the questions get asked in a yard: is
   anything wrong, is it raining now, how much has it done, and then the picture.
   Totals come before the chart because a total is what gets acted on. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./analyse.js') : root,
    typeof require === 'function' ? require('./chart.js') : root,
    typeof require === 'function' ? require('../data/stations.js') : root,
    typeof require === 'function' ? require('../data/thresholds.js') : root,
    typeof require === 'function' ? require('../data/sources.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (analyseMod, chartMod, stationMod, thresholdMod, sourcesMod) {
  const A = analyseMod.rmAnalyse;
  const C = chartMod.rmChart;
  const stationName = stationMod.rmStationName;
  const kindOf = stationMod.rmKind;
  const LEVELS = thresholdMod.RM_LEVELS;
  const LICENCE = sourcesMod.RM_LICENCE;
  const API_BASE = sourcesMod.RM_API_BASE;

  const esc = C.esc;

  /* ---- Words and numbers -------------------------------------------------- */

  function clock(t) {
    if (!t) return '—';
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /* A timestamp a person can place without doing arithmetic: the time on its own
     if it is today, the day as well if it is not. */
  function stamp(t, now) {
    if (!t) return 'never';
    const day = A.dayBounds(now);
    if (t >= day.start && t < day.end) return clock(t);
    if (t >= day.start - 86400000 && t < day.start) return `yesterday ${clock(t)}`;
    const d = new Date(t);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${clock(t)}`;
  }

  function mm(value, places) {
    if (value === null || value === undefined) return '—';
    return Number(value).toFixed(places === undefined ? 1 : places);
  }

  function levelLabel(key) {
    const found = LEVELS.find(l => l.key === key);
    return found ? found.label : key;
  }

  /* ---- Small pieces ------------------------------------------------------- */

  function pill(level, text) {
    return `<span class="pill pill-${esc(level)}">${esc(text)}</span>`;
  }

  function freshnessPill(fresh) {
    if (!fresh || fresh.key === 'fresh') return '';
    const level = fresh.key === 'late' ? 'watch' : 'alert';
    const age = fresh.minutes === null ? '' : ` (${A.formatMinutes(fresh.minutes)} old)`;
    return pill(level, `${fresh.label}${age}`);
  }

  function reasonList(reasons) {
    if (!reasons || !reasons.length) return '';
    return `<ul class="reasons">` + reasons.map(r =>
      `<li class="reason reason-${esc(r.level)}">${esc(r.text)}</li>`
    ).join('') + `</ul>`;
  }

  /* A tile per window. `thin` is shown on the tile itself rather than in a
     footnote, because the whole point is that the number beside it is not to be
     trusted on its own. */
  function tile(row) {
    const cls = ['tile', `tile-${row.level}`];
    if (row.missing) cls.push('tile-missing');
    else if (row.thin) cls.push('tile-thin');
    const value = row.mm === null ? '—' : mm(row.mm);
    const note = row.missing
      ? 'no readings'
      : row.thin
        ? `only ${Math.round(row.coverage * 100)}% of the window`
        : '';
    return `<div class="${cls.join(' ')}">
      <div class="tile-value">${esc(value)}<span class="tile-unit">mm</span></div>
      <div class="tile-label">${esc(row.label)}</div>
      ${note ? `<div class="tile-note">${esc(note)}</div>` : ''}
    </div>`;
  }

  /* ---- Rainfall card ------------------------------------------------------ */

  function rainfallCard(entry, settings, now) {
    const station = entry.station;
    const verdict = entry.verdict;
    const series = entry.series;
    const name = stationName(station);
    const hours = settings.chartHours;

    const today = series && !series.empty
      ? (function () {
        const day = A.dayBounds(now);
        return A.dayTotal(series, day.start, Math.min(now, day.end));
      })()
      : null;

    const todayTile = tile({
      mm: today ? today.mm : null,
      label: 'since midnight',
      level: 'quiet',
      coverage: today ? today.coverage : 0,
      /* Not marked thin: the day is only as long as it has been so far, so a
         morning reading legitimately covers a fraction of 24 hours. */
      thin: false,
      missing: !today || today.count === 0
    });

    const cur = verdict.current;
    const spell = verdict.spell;

    let nowLine;
    if (!cur) {
      nowLine = 'No readings from this gauge.';
    } else if (cur.wet) {
      nowLine = `Raining — ${esc(cur.band.label)}, ${mm(cur.mmPerHour)}mm/h at ${esc(clock(cur.t))}.`;
    } else if (spell.known && spell.dryThroughout) {
      nowLine = `Dry throughout, latest reading ${esc(clock(cur.t))}.`;
    } else if (spell.known && spell.lastWetEndT) {
      nowLine = `Dry — last rain ${esc(stamp(spell.lastWetEndT, now))}, ${esc(A.formatMinutes(spell.dryMinutes))} ago.`;
    } else {
      nowLine = `Dry, latest reading ${esc(clock(cur.t))}.`;
    }

    const peak = verdict.peak;
    const peakLine = peak && peak.value > 0
      ? `Wettest quarter of an hour in 24h: <strong>${mm(peak.value, 2)}mm</strong> at
         ${esc(stamp(peak.t, now))} — ${mm(peak.mmPerHour)}mm/h, ${esc(peak.band.label)}.`
      : '';

    const alertRate = (settings.thresholds.find(t => t.hours === 1) || {}).alertMm || null;
    const chart = C.bars(series, {
      from: now - hours * 3600000,
      to: now,
      title: `Rainfall at ${name}, last ${hours} hours`,
      unit: 'mm',
      rateLineMmPerHour: alertRate
    });

    return card({
      station, name, verdict, entry, now, settings,
      noun: 'rain gauge',
      body: `
        <p class="now">${nowLine}</p>
        <div class="tiles">${todayTile}${verdict.totals.map(tile).join('')}</div>
        ${peakLine ? `<p class="peak">${peakLine}</p>` : ''}
        <div class="chart-wrap">${chart}</div>
        ${windowPicker(hours)}
      `
    });
  }

  /* ---- River level card --------------------------------------------------- */

  function levelCard(entry, settings, now) {
    const station = entry.station;
    const verdict = entry.verdict;
    const series = entry.series;
    const name = stationName(station);
    const hours = settings.chartHours;
    const s = verdict.summary;
    const info = station.info || {};

    const arrow = s ? ({ rising: '▲', falling: '▼', steady: '▬', unknown: '' })[s.trend] : '';
    const nowLine = s
      ? `<strong>${mm(s.value, 2)}m</strong> at ${esc(clock(s.t))} — ${esc(arrow)} ${esc(s.trend)}` +
        (s.change1h === null ? '' : `, ${s.change1h >= 0 ? '+' : ''}${mm(s.change1h, 2)}m in the hour`) +
        (s.change6h === null ? '' : `, ${s.change6h >= 0 ? '+' : ''}${mm(s.change6h, 2)}m in 6 hours`) + '.'
      : 'No readings from this gauge.';

    const rangeLine = isFinite(info.typicalRangeLow) && isFinite(info.typicalRangeHigh)
      ? `Normal range here is ${mm(info.typicalRangeLow, 2)}m to ${mm(info.typicalRangeHigh, 2)}m` +
        (isFinite(info.recordMax) ? `; highest on record ${mm(info.recordMax, 2)}m` : '') + '.'
      : `<span class="soft">No typical range published for this station, so the app cannot say
         whether that is high — set your own marks in Settings.</span>`;

    const marksLine = (station.watchM === null || station.watchM === undefined) &&
      (station.alertM === null || station.alertM === undefined)
      ? `<p class="soft">No level marks set for this gauge, so it can only warn on how fast
          the river is rising. Add them in Settings once you know what height matters here.</p>`
      : '';

    const chart = C.line(series, {
      from: now - hours * 3600000,
      to: now,
      title: `River level at ${name}, last ${hours} hours`,
      /* The EA publishes levels as mASD or mAOD against a local datum. On an
         axis that is noise: "m" is what a person reads a river height in. */
      unit: 'm',
      typicalRangeLow: info.typicalRangeLow,
      typicalRangeHigh: info.typicalRangeHigh,
      watchM: station.watchM,
      alertM: station.alertM
    });

    return card({
      station, name, verdict, entry, now, settings,
      noun: 'river level',
      body: `
        <p class="now">${nowLine}</p>
        <p class="soft">${rangeLine}</p>
        ${marksLine}
        <div class="chart-wrap">${chart}</div>
        ${windowPicker(hours)}
      `
    });
  }

  /* ---- The shell shared by both ------------------------------------------ */

  function card(o) {
    const { station, name, verdict, entry, now } = o;
    const problem = entry.error
      ? `<p class="error">${esc(entry.error.message)}${entry.cachedAt
        ? ` Showing what was saved at ${esc(stamp(entry.cachedAt, now))}.`
        : ''}</p>`
      : '';
    const cached = !entry.error && entry.fromCache && entry.cachedAt
      ? `<p class="soft">Saved copy from ${esc(stamp(entry.cachedAt, now))}.</p>`
      : '';
    const rejects = entry.series && entry.series.rejected
      ? Object.entries(entry.series.rejected).filter(([, n]) => n > 0)
      : [];
    const rejectLine = rejects.length
      ? `<p class="soft">${esc(rejects.reduce((a, [, n]) => a + n, 0))} reading(s) from this
         gauge were unusable and left out.</p>`
      : '';

    return `<article class="card card-${esc(verdict.level)}" data-station="${esc(station.id)}" data-kind="${esc(station.kind)}">
      <header class="card-head">
        <div>
          <h2 class="card-name">${esc(name)}</h2>
          <p class="card-sub">${esc(station.id)} · ${esc(o.noun)}
            <a class="ea-link" href="${esc(API_BASE)}/id/stations/${esc(encodeURIComponent(station.id))}"
               target="_blank" rel="noopener">EA record</a></p>
        </div>
        <div class="card-status">
          ${pill(verdict.level, levelLabel(verdict.level))}
          ${freshnessPill(verdict.freshness)}
        </div>
      </header>
      ${problem}${cached}
      ${reasonList(verdict.reasons)}
      ${o.body}
      ${rejectLine}
    </article>`;
  }

  function windowPicker(hours) {
    const options = [6, 24, 48, 120];
    return `<div class="window" role="group" aria-label="Chart window">` +
      options.map(h => {
        const label = h < 48 ? `${h}h` : h === 48 ? '2 days' : '5 days';
        return `<button type="button" class="chip${h === hours ? ' chip-on' : ''}"
          data-action="window" data-hours="${h}"${h === hours ? ' aria-pressed="true"' : ' aria-pressed="false"'}>
          ${esc(label)}</button>`;
      }).join('') + `</div>`;
  }

  /* ---- The whole page ----------------------------------------------------- */

  function stationCards(entries, settings, now) {
    if (!entries.length) {
      return `<p class="empty-state">No gauges yet. Add one in Settings — the app starts
        with E9660, and any Environment Agency station id will do.</p>`;
    }
    return entries.map(entry => entry.station.kind === 'level'
      ? levelCard(entry, settings, now)
      : rainfallCard(entry, settings, now)).join('');
  }

  function topbar(state) {
    const worst = thresholdMod.rmWorstLevel((state.entries || []).map(e => e.verdict.level));
    const busy = state.loading ? ' is-busy' : '';
    return `<div class="topbar-inner">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">☂</span>
        <span class="brand-text">Rainfall Monitor</span>
      </div>
      <div class="topbar-status" aria-live="polite">
        ${pill(worst, levelLabel(worst))}
        <span class="checked">${state.lastCheckedAt
          ? `checked ${esc(clock(state.lastCheckedAt))}`
          : 'not checked yet'}</span>
      </div>
      <div class="topbar-actions">
        <button type="button" class="btn${busy}" data-action="refresh"${state.loading ? ' disabled' : ''}>
          ${state.loading ? 'Checking…' : 'Check now'}</button>
        <button type="button" class="btn btn-quiet" data-action="settings" aria-expanded="${state.settingsOpen ? 'true' : 'false'}">
          Settings</button>
      </div>
    </div>`;
  }

  function offlineBanner(state) {
    if (state.online !== false) return '';
    return `<p class="banner">No signal. Showing the last readings saved on this phone.</p>`;
  }

  function credit() {
    return `<footer class="credit">
      <p>${esc(LICENCE.text)}, used under the
        <a href="${esc(LICENCE.licenceUrl)}" target="_blank" rel="noopener">${esc(LICENCE.licence)}</a>.
        Readings are fetched by this phone straight from the Environment Agency; nothing is
        sent anywhere else and there is no account.</p>
      <p><strong>This is a rain gauge, not a flood warning.</strong> The official warnings for
        your area are at <a href="https://check-for-flooding.service.gov.uk/" target="_blank"
        rel="noopener">check-for-flooding.service.gov.uk</a>.</p>
    </footer>`;
  }

  /* ---- Settings ----------------------------------------------------------- */

  function settingsPanel(settings) {
    return `<section class="settings" id="settings-panel" aria-label="Settings">
      <h2>Gauges</h2>
      <p class="soft">An Environment Agency station id — E9660, 52203, L2404. Rain gauges have
        no published name, so give it one that means something to you.</p>
      <div class="rows">
        ${settings.stations.map((s, i) => stationRow(s, i)).join('')}
      </div>
      <div class="add-row">
        <input type="text" id="add-id" placeholder="Station id" inputmode="text"
          autocapitalize="characters" autocomplete="off" spellcheck="false" />
        <select id="add-kind">
          <option value="rainfall">Rain gauge</option>
          <option value="level">River level</option>
        </select>
        <button type="button" class="btn" data-action="add-station">Add</button>
      </div>

      <h2>When to warn</h2>
      <p class="soft">Millimetres of rain in a window. <strong>Worth watching</strong> is worth
        knowing about; <strong>go and look</strong> means walk out to the gateway and the ditch.
        These start as round numbers, not as anything official — change them as you learn what
        your own ground does.</p>
      <table class="thresholds">
        <thead><tr><th>Window</th><th>Worth watching</th><th>Go and look</th></tr></thead>
        <tbody>
          ${settings.thresholds.map((t, i) => `<tr>
            <th scope="row">${esc(t.label)}</th>
            <td><input type="number" min="0" step="1" inputmode="decimal" value="${t.watchMm === null ? '' : esc(t.watchMm)}"
              data-field="watchMm" data-index="${i}" aria-label="Worth watching, ${esc(t.label)}" /></td>
            <td><input type="number" min="0" step="1" inputmode="decimal" value="${t.alertMm === null ? '' : esc(t.alertMm)}"
              data-field="alertMm" data-index="${i}" aria-label="Go and look, ${esc(t.label)}" /></td>
          </tr>`).join('')}
        </tbody>
      </table>

      <h2>Checking</h2>
      <label class="field">
        <span>Check again every</span>
        <select data-field="autoRefreshMinutes">
          ${[5, 15, 30, 60].map(m => `<option value="${m}"${m === settings.autoRefreshMinutes ? ' selected' : ''}>
            ${m} minutes</option>`).join('')}
        </select>
      </label>
      <p class="soft">Gauges report by telemetry every quarter of an hour at best, and some only
        a couple of times a day, so checking more often than this gains nothing.</p>

      <div class="danger">
        <button type="button" class="btn btn-quiet" data-action="forget">Forget everything saved</button>
      </div>
    </section>`;
  }

  function stationRow(station, index) {
    const kind = kindOf(station.kind);
    return `<div class="row" data-index="${index}">
      <div class="row-main">
        <span class="row-id">${esc(station.id)}</span>
        <span class="row-kind">${esc(kind.noun)}</span>
        <input type="text" class="row-label" value="${esc(station.label || '')}"
          placeholder="${esc(station.eaLabel || 'Name it, e.g. Top field')}"
          data-field="label" data-index="${index}" aria-label="Name for ${esc(station.id)}" />
        <button type="button" class="btn btn-quiet" data-action="remove-station" data-index="${index}"
          aria-label="Remove ${esc(station.id)}">Remove</button>
      </div>
      ${station.kind === 'level' ? `<div class="row-marks">
        <label>Watch above
          <input type="number" step="0.01" inputmode="decimal" value="${station.watchM === null || station.watchM === undefined ? '' : esc(station.watchM)}"
            data-field="watchM" data-index="${index}" /> m</label>
        <label>Alert above
          <input type="number" step="0.01" inputmode="decimal" value="${station.alertM === null || station.alertM === undefined ? '' : esc(station.alertM)}"
            data-field="alertM" data-index="${index}" /> m</label>
      </div>` : ''}
    </div>`;
  }

  const rmUi = {
    clock, stamp, mm, pill, tile, reasonList, freshnessPill, windowPicker,
    rainfallCard, levelCard, stationCards, topbar, offlineBanner, credit,
    settingsPanel, stationRow, levelLabel
  };
  return { rmUi };
});
