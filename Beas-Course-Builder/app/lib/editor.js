/* Bea’s Course Builder — the arena editor.

   Four modes, because they are four different jobs and mixing them on a phone
   screen makes all of them harder:

     Build   put the jumps where you want them
     Number  tap them in the order you will jump them — this is the route
     Check   read what the app makes of it
     Ride    watch it play out, so she can learn it before she jumps it

   Numbering IS the route. The same jumps numbered a different way is a different
   course, which is exactly how a rider thinks about it, and it is why a double
   appears automatically when two fences are numbered a stride apart. */
(function (root) {
  const { h, clear, toast, announce, modal, confirmSheet, askText,
    fieldRow, stepper, segmented, SEVERITY_GLYPH } = root.bcbUi;
  const C = root.bcbCourse;
  const S = root.bcbStrides;
  const R = root.bcbRoute;
  const Render = root.bcbRender;
  const Interact = root.bcbInteract;
  const Share = root.bcbShare;
  const Ride = root.bcbRide;

  function createEditor(ctx) {
    const store = ctx.store;
    let course = null;
    let check = null;
    let interactions = null;
    let svg = null;
    let nodes = {};
    let preview = null;
    let panelDirty = false;
    /* Null unless she is in Ride mode. Holds the built ride, the driver, the
       metronome and the animation frame, so nothing of the ride survives leaving
       the mode. */
    let ridePlay = null;

    const local = {
      mode: 'build',
      panel: 'build',
      selectedId: null,
      view: null,
      showStrides: false,
      showGrid: true,
      paletteAll: false,
      numberOrder: [],
      rideRate: 1,
      rideFollow: false,
      rideSound: false
    };

    /* ---- reading the current state --------------------------------------- */
    function horse() { return store.horseForCourse(course); }
    function dark() {
      const theme = store.db.settings.theme;
      if (theme === 'dark') return true;
      if (theme === 'light') return false;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    function state() {
      return {
        course, check, horse: horse(), settings: store.db.settings,
        selectedId: local.selectedId, mode: local.mode,
        dark: dark(), showGrid: local.showGrid, showStrides: local.showStrides,
        showArenaSize: !!local.showArenaSize,
        guides: preview ? preview.guides : [],
        ride: ridePlay ? ridePlay.ride : null,
        rideState: ridePlay ? ridePlay.rideState : null,
        ui: { view: local.view }
      };
    }

    function recheck() {
      check = C.checkCourse(course, horse(), store.db.settings);
    }

    /* ---- building the screen once ---------------------------------------- */
    function mount(host, courseId) {
      course = store.course(courseId);
      if (!course) { ctx.navigate('#/courses'); return; }
      local.selectedId = null;
      local.view = null;
      recheck();

      const root_ = h('div', { class: 'editor', 'data-panel': 'peek' });
      nodes.editor = root_;

      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('id', 'arena');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'The arena, with the fences on it');

      nodes.readout = h('div', { class: 'stage__readout', id: 'readout' });
      nodes.stage = h('div', { class: 'stage' }, [
        svg,
        nodes.readout,
        nodes.tools = h('div', { class: 'stage__tools' })
      ]);

      nodes.panelBody = h('div', { class: 'sheetpanel__body' });
      nodes.panel = h('div', { class: 'sheetpanel', 'data-open': 'peek' }, [
        h('button', {
          class: 'sheetpanel__grip', type: 'button', 'aria-label': 'Open or close this panel',
          onclick: () => setPanelOpen(nodes.panel.getAttribute('data-open') !== 'full')
        }, [h('span', { 'aria-hidden': 'true' })]),
        nodes.panelBody
      ]);

      nodes.modebar = h('div', { class: 'modebar' });

      root_.appendChild(nodes.stage);
      root_.appendChild(nodes.panel);
      root_.appendChild(nodes.modebar);
      host.appendChild(root_);

      interactions = Interact.createInteractions({
        svg,
        getState: state,
        onSelect: (id, opts) => { setSelected(id, opts && opts.duringGesture); },
        onGestureEnd: () => { if (panelDirty) { panelDirty = false; renderPanel(); } },
        onPreview: p => { preview = p; showReadout(); if (!p) redraw(); else drawGuides(); },
        onView: v => { local.view = v; redraw(); },
        onCommit: patch => {
          applyToJump(patch.id, patch);
          preview = null;
        }
      });

      window.addEventListener('resize', onResize);
      document.addEventListener('keydown', onKey);

      renderChrome();
      renderTools();
      renderModebar();
      renderPanel();
      redraw();
      return root_;
    }

    function unmount() {
      exitRide();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
      if (interactions) interactions.destroy();
      interactions = null;
      nodes = {};
      svg = null;
    }

    function onResize() { redraw(); }

    /* ---- drawing ---------------------------------------------------------- */
    function redraw() {
      if (!svg) return;
      const renderer = Render.createRenderer(svg);
      renderer.draw(state());
      showReadout();
    }

    /* During a drag the interaction layer is moving the fence itself, so all we
       refresh here is the snap guides. Rebuilding the arena would undo the very
       thing she is dragging. */
    function drawGuides() {
      if (!svg) return;
      Render.refreshUiLayer(svg, state());
    }

    function showReadout() {
      if (!nodes.readout) return;
      clear(nodes.readout);
      const s = check.summary;

      if (preview && preview.chip) {
        nodes.readout.appendChild(h('b', {}, [preview.chip]));
        return;
      }
      if (local.mode === 'ride') {
        if (!ridePlay) {
          nodes.readout.appendChild(document.createTextNode('Number the fences first, then ride it'));
          return;
        }
        /* Kept as a reference: the frame loop writes its text sixty times a
           second, and building a fresh node that often is wasteful. The clock
           stays in the panel — on a 390pt screen the caption needs the width,
           and "stride 3 of 4" is the part she is reading. */
        nodes.readout.appendChild(nodes.rideCaption = h('b', {}, [ridePlay.rideState.caption]));
        return;
      }
      if (local.mode === 'number') {
        const done = local.numberOrder.length;
        nodes.readout.appendChild(document.createTextNode(
          done ? `Tapped ${done} — keep going in jumping order` : 'Tap the fences in the order you will jump them'));
        return;
      }
      if (local.selectedId) {
        const jump = findJump(local.selectedId);
        const leg = (check.legs || []).find(l => l.toId === local.selectedId);
        const spec = root.bcbJump(jump.type);
        const name = jump.number != null
          ? `${jump.number}${jump.element || ''}` : (spec ? spec.name : 'Fence');
        nodes.readout.appendChild(h('b', {}, [name]));
        nodes.readout.appendChild(document.createTextNode(leg
          ? ` · ${leg.measured.metresText} · ${leg.strideWords || ''}`
          : ` · ${spec ? spec.name.toLowerCase() : ''}`));
        return;
      }
      nodes.readout.appendChild(h('b', {}, [plural(s.efforts, 'effort')]));
      nodes.readout.appendChild(document.createTextNode(
        ` · ${s.lengthM}m · ${s.timeAllowed} · ${s.horseName}`));
      if (s.errors || s.warnings) {
        nodes.readout.appendChild(h('span', {
          class: 'pill ' + (s.errors ? 'pill--error' : 'pill--warn')
        }, [s.errors ? `${s.errors} to fix` : `${s.warnings} to check`]));
      }
    }

    /* ---- chrome ----------------------------------------------------------- */
    function renderChrome() {
      ctx.setChrome({
        back: '#/courses',
        title: course.name || 'Untitled course',
        subtitle: `${levelName()} · ${course.arena.widthM}x${course.arena.lengthM}m · ${horse() ? horse().name : 'no horse'}`,
        onTitleTap: renameCourse,
        actions: [
          { label: 'Share', primary: true, onClick: shareMenu }
        ]
      });
    }

    /* Undo and redo live on the arena rather than in the top bar: on a 390pt
       screen the bar cannot hold a back chevron, a two-line course name and four
       buttons without something being pushed off the edge. */
    function renderTools() {
      if (!nodes.tools) return;
      clear(nodes.tools);
      const tool = (glyph, title, onClick, disabled) => h('button', {
        class: 'stage__tool', type: 'button', title, 'aria-label': title,
        disabled: !!disabled, onclick: onClick
      }, [glyph]);
      nodes.tools.appendChild(tool('↶', 'Undo',
        () => { if (store.undo()) { reload(); toast('Undone'); } }, !store.canUndo));
      nodes.tools.appendChild(tool('↷', 'Redo',
        () => { if (store.redo()) { reload(); toast('Redone'); } }, !store.canRedo));
      nodes.tools.appendChild(tool('⤢', 'Fit the arena on screen',
        () => { local.view = null; redraw(); }));
      nodes.tools.appendChild(tool('⋯',
        local.showStrides ? 'Hide the strides' : 'Count the strides on the track',
        () => { local.showStrides = !local.showStrides; renderTools(); redraw(); }));
    }

    function levelName() {
      const level = root.bcbLevel(course.levelId);
      return level ? level.name : 'No level';
    }

    function reload() {
      const fresh = store.course(course.id);
      if (!fresh) { ctx.navigate('#/courses'); return; }
      course = fresh;
      recheck();
      if (local.mode === 'ride') { exitRide(); enterRide(); }
      renderChrome(); renderTools(); renderPanel(); redraw();
    }

    /* ---- mode bar --------------------------------------------------------- */
    function renderModebar() {
      clear(nodes.modebar);
      nodes.modebar.appendChild(segmented([
        { id: 'build', label: 'Build' },
        { id: 'number', label: 'Number' },
        { id: 'check', label: 'Check' },
        { id: 'ride', label: 'Ride' }
      ], local.mode, id => {
        if (local.mode === 'ride' && id !== 'ride') exitRide();
        local.mode = id;
        local.panel = id;
        if (id === 'number') { local.numberOrder = []; local.selectedId = null; }
        if (id === 'ride') { local.selectedId = null; enterRide(); }
        renderModebar(); renderPanel(); redraw();
      }));
    }

    /* ---- the panel -------------------------------------------------------- */
    function renderPanel() {
      clear(nodes.panelBody);
      const jump = local.selectedId ? findJump(local.selectedId) : null;

      if (local.mode === 'ride') {
        /* Left at a peek: the controls are three short rows, and the whole point
           of the mode is watching the arena. */
        setPanelOpen(!ridePlay);
        nodes.panelBody.appendChild(ridePanel());
        return;
      }
      if (local.mode === 'number') { setPanelOpen(true); nodes.panelBody.appendChild(numberPanel()); return; }
      if (local.mode === 'check') { setPanelOpen(true); nodes.panelBody.appendChild(checkPanel()); return; }
      if (jump) { setPanelOpen(true); nodes.panelBody.appendChild(inspector(jump)); return; }
      setPanelOpen(!!local.paletteAll);
      nodes.panelBody.appendChild(palette());
    }

    /* -- the jump palette -- */
    /* One scrolling row of jumps by default, so the arena keeps the screen.
       "All jumps" opens the full grid with the group names. */
    function palette() {
      const wrap = h('div', {});
      const chip = spec => h('button', {
        class: 'chip', type: 'button', onclick: () => addJump(spec.id),
        title: spec.note || spec.name, 'aria-label': `Add a ${spec.name.toLowerCase()}`
      }, [thumbnailFor(spec), spec.short || spec.name]);

      wrap.appendChild(h('div', { style: 'display:flex;align-items:center;gap:8px;margin:2px 0 4px' }, [
        h('span', { class: 'lede', style: 'flex:1;font-size:13px' }, ['Tap a jump to drop it in, then drag it.']),
        h('button', {
          class: 'iconbtn iconbtn--compact', type: 'button',
          onclick: () => { local.paletteAll = !local.paletteAll; renderPanel(); setPanelOpen(local.paletteAll); }
        }, [local.paletteAll ? 'Fewer' : 'All jumps'])
      ]));

      if (!local.paletteAll) {
        const strip = h('div', { class: 'palette' });
        for (const spec of root.BCB_JUMPS) strip.appendChild(chip(spec));
        wrap.appendChild(strip);
        return wrap;
      }
      for (const group of root.bcbJumpGroups()) {
        wrap.appendChild(h('h3', { style: 'margin:10px 0 5px' }, [group.name]));
        const grid = h('div', { class: 'palette palette--grid' });
        for (const spec of group.jumps) grid.appendChild(chip(spec));
        wrap.appendChild(grid);
      }
      return wrap;
    }

    function setPanelOpen(full) {
      if (nodes.panel) nodes.panel.setAttribute('data-open', full ? 'full' : 'peek');
      if (nodes.editor) nodes.editor.setAttribute('data-panel', full ? 'full' : 'peek');
    }

    function thumbnailFor(spec) {
      const NS = 'http://www.w3.org/2000/svg';
      const el = document.createElementNS(NS, 'svg');
      el.setAttribute('viewBox', '-2.2 -1.3 4.4 2.6');
      el.setAttribute('aria-hidden', 'true');
      const theme = Render.THEMES[dark() ? 'dark' : 'light'];
      const spread = Math.min((spec.defaultSpreadCm || 0) / 100, 1.4);
      for (const part of Render.glyph(spec.draw, 3.4, spread, { filler: 'none' }, theme, null)) {
        if (part) el.appendChild(part);
      }
      return el;
    }

    /* -- one fence -- */
    function inspector(jump) {
      const spec = root.bcbJump(jump.type);
      const level = root.bcbLevel(course.levelId);
      const wrap = h('div', { class: 'stack' });

      wrap.appendChild(h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
        h('h3', { style: 'flex:1' }, [
          (jump.number != null ? `Fence ${jump.number}${jump.element || ''} — ` : '') + (spec ? spec.name : 'Fence')
        ]),
        h('button', { class: 'iconbtn', type: 'button', onclick: () => setSelected(null) }, ['Done'])
      ]));

      if (spec && spec.note) wrap.appendChild(h('p', { class: 'lede' }, [spec.note]));

      /* what kind of fence */
      const typeSelect = h('select', {
        onchange: ev => {
          const next = root.bcbJump(ev.target.value);
          applyToJump(jump.id, {
            type: ev.target.value,
            spreadCm: next && next.hasSpread ? (next.defaultSpreadCm || 0) : 0,
            widthM: next ? next.defaultWidthM : jump.widthM
          });
          renderPanel();
        }
      });
      for (const group of root.bcbJumpGroups()) {
        const og = h('optgroup', { label: group.name });
        for (const s of group.jumps) {
          og.appendChild(h('option', { value: s.id, selected: s.id === jump.type }, [s.name]));
        }
        typeSelect.appendChild(og);
      }
      wrap.appendChild(fieldRow('Kind of fence', typeSelect));

      if (spec && spec.category === 'fence') {
        wrap.appendChild(fieldRow('Height',
          stepper({
            value: jump.heightCm, min: 20, max: 160, step: 5, label: 'height',
            format: v => `${(v / 100).toFixed(2)}m`,
            onChange: v => applyToJump(jump.id, { heightCm: v })
          }),
          level ? `${level.name} builds to ${((level.maxHeightCm || level.heightCm) / 100).toFixed(2)}m.` : null));

        if (spec.hasSpread) {
          wrap.appendChild(fieldRow('Spread (how wide)',
            stepper({
              value: jump.spreadCm, min: 0, max: spec.maxSpreadCm || 250, step: 10, label: 'spread',
              format: v => `${(v / 100).toFixed(2)}m`,
              onChange: v => applyToJump(jump.id, { spreadCm: v })
            }),
            'A wider fence eats into the distance to the next one.'));
        }
      }

      wrap.appendChild(fieldRow('Pole length',
        segmented([
          { id: 2.5, label: '2.5m' }, { id: 3.0, label: '3m' },
          { id: 3.5, label: '3.5m' }, { id: 4.0, label: '4m' }
        ], jump.widthM, v => { applyToJump(jump.id, { widthM: v }); renderPanel(); })));

      wrap.appendChild(fieldRow('Which way round',
        h('div', { class: 'stepper' }, [
          h('button', { type: 'button', 'aria-label': 'Turn anticlockwise',
            onclick: () => applyToJump(jump.id, { rotationDeg: turn(jump, -5) }) }, ['↺']),
          h('output', { id: 'rot-out' }, [`${Math.round(jump.rotationDeg || 0)}°`]),
          h('button', { type: 'button', 'aria-label': 'Turn clockwise',
            onclick: () => applyToJump(jump.id, { rotationDeg: turn(jump, 5) }) }, ['↻'])
        ]),
        'Or drag the round handle on the arena. The fence is jumped in the direction it faces.'));

      wrap.appendChild(h('div', { class: 'grid2' }, [
        h('button', { class: 'iconbtn', type: 'button',
          onclick: () => applyToJump(jump.id, { rotationDeg: turn(jump, 180) }) }, ['Jump it the other way']),
        h('button', { class: 'iconbtn', type: 'button', onclick: () => duplicateJump(jump) }, ['Duplicate'])
      ]));

      if (spec && spec.category === 'fence') {
        const fillerSelect = h('select', {
          onchange: ev => applyToJump(jump.id, { filler: ev.target.value })
        });
        for (const f of root.BCB_FILLERS) {
          fillerSelect.appendChild(h('option', { value: f.id, selected: f.id === jump.filler }, [f.name]));
        }
        wrap.appendChild(fieldRow('Filler', fillerSelect));
      }

      /* the distances either side of this fence */
      const before = (check.legs || []).find(l => l.toId === jump.id);
      const after = (check.legs || []).find(l => l.fromId === jump.id);
      if (before || after) {
        wrap.appendChild(h('h3', { style: 'margin-top:14px' }, ['Distances']));
        for (const leg of [before, after]) {
          if (!leg) continue;
          wrap.appendChild(legRow(leg));
        }
      }

      wrap.appendChild(h('button', {
        class: 'iconbtn', type: 'button',
        style: 'color:var(--error);margin-top:10px',
        onclick: () => removeJump(jump)
      }, ['Remove this fence']));
      return wrap;
    }

    function turn(jump, by) {
      return (((Math.round((jump.rotationDeg || 0) + by)) % 360) + 360) % 360;
    }

    function legRow(leg) {
      const settings = store.db.settings;
      const parts = [leg.measured.metresText];
      if (settings.showFeet) parts.push(leg.measured.feetText);
      if (settings.showPaces) parts.push(leg.measured.pacesText);
      return h('div', { class: 'card', style: 'padding:10px 11px' }, [
        h('div', { style: 'display:flex;gap:8px;align-items:baseline' }, [
          h('b', { style: 'flex:1' }, [`${leg.fromLabel} → ${leg.toLabel}`]),
          h('span', { class: 'pill pill--' + leg.severity }, [
            leg.strides == null ? 'too close' : `${leg.strideWords}`
          ])
        ]),
        h('div', { class: 'row__sub', style: 'margin-top:2px' }, [parts.join('  ·  ')]),
        h('div', { style: 'font-size:13px;margin-top:6px' }, [leg.advice]),
        leg.suggestion ? h('button', {
          class: 'issue__fix', type: 'button', onclick: () => takeSuggestion(leg.suggestion)
        }, [leg.suggestion.text]) : null
      ]);
    }

    /* -- numbering -- */
    function numberPanel() {
      const wrap = h('div', { class: 'stack' });
      wrap.appendChild(h('p', { class: 'lede' }, [
        'Tap the fences on the arena in the order you will jump them. Two fences a '
        + 'stride or two apart become one obstacle, lettered A and B.'
      ]));
      const order = local.numberOrder.map((id, i) => {
        const j = findJump(id);
        const spec = j && root.bcbJump(j.type);
        return h('div', { class: 'row', style: 'cursor:default' }, [
          h('span', { class: 'pill pill--accent' }, [String(i + 1)]),
          h('span', { class: 'row__main' }, [spec ? spec.name : 'Fence'])
        ]);
      });
      if (order.length) wrap.appendChild(h('div', { class: 'rowlist' }, order));

      wrap.appendChild(h('div', { class: 'grid2' }, [
        h('button', { class: 'iconbtn iconbtn--primary', type: 'button',
          disabled: !local.numberOrder.length, onclick: applyNumbering }, ['Save this route']),
        h('button', { class: 'iconbtn', type: 'button',
          onclick: () => { local.numberOrder = []; renderPanel(); redraw(); } }, ['Start again'])
      ]));
      wrap.appendChild(h('button', { class: 'iconbtn', type: 'button', onclick: numberInPlaceOrder },
        ['Or number them down the arena for me']));
      return wrap;
    }

    function applyNumbering() {
      const model = S.strideModel(horse());
      const updated = C.renumber(course, local.numberOrder, model);
      course.jumps = updated.jumps;
      store.touchCourse(course);
      local.numberOrder = [];
      local.mode = 'build'; local.panel = 'build';
      recheck(); renderModebar(); renderPanel(); redraw();
      toast('Route saved');
      announce(`Route saved. ${plural(check.summary.efforts, 'jumping effort')}.`);
    }

    function numberInPlaceOrder() {
      const fences = (course.jumps || [])
        .filter(j => root.bcbIsFence(j.type))
        .slice()
        .sort((a, b) => a.yM - b.yM || a.xM - b.xM);
      local.numberOrder = fences.map(j => j.id);
      renderPanel();
      redraw();
    }

    /* -- what the app makes of it -- */
    function checkPanel() {
      const wrap = h('div', { class: 'stack' });
      const s = check.summary;

      wrap.appendChild(h('div', { class: 'card' }, [
        h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' }, [
          h('span', { class: 'pill' }, [plural(s.obstacles, 'obstacle')]),
          h('span', { class: 'pill' }, [plural(s.efforts, 'effort')]),
          s.combinations ? h('span', { class: 'pill' }, [`${s.combinations} combination${s.combinations > 1 ? 's' : ''}`]) : null,
          h('span', { class: 'pill' }, [`${s.lengthM}m`]),
          h('span', { class: 'pill' }, [`time allowed ${check.timing.text}`]),
          h('span', { class: 'pill' }, [`limit ${check.timing.limitText}`]),
          h('span', { class: 'pill' }, [`${check.timing.speedMpm} m/min`])
        ]),
        h('div', { class: 'row__sub', style: 'margin-top:7px' }, [
          `Worked out for ${s.horseName}, striding ${s.strideM}m.`
        ])
      ]));

      if (!check.issues.length) {
        wrap.appendChild(h('div', { class: 'card', style: 'background:var(--ok-bg)' }, [
          h('b', {}, ['Nothing to flag. ']),
          'Every distance rides true and the course fits the arena.'
        ]));
      } else {
        wrap.appendChild(h('div', { class: 'issues' }, check.issues.map(issueRow)));
      }

      if (check.kit.short.length) {
        wrap.appendChild(h('h3', {}, ['What you need to build it']));
        wrap.appendChild(h('div', { class: 'card' }, [
          h('div', {}, Object.keys(check.kit.needed)
            .filter(k => check.kit.needed[k] > 0)
            .map(k => h('div', {}, [`${check.kit.needed[k]} ${C.kitLabel(k, check.kit.needed[k])}`])))
        ]));
      }

      if (check.legs.length) {
        wrap.appendChild(h('h3', {}, ['Every distance']));
        const table = h('table', { class: 'legtable' }, [
          h('thead', {}, [h('tr', {}, [
            h('th', {}, ['Leg']), h('th', {}, ['Distance']),
            h('th', {}, ['Strides']), h('th', {}, ['How it rides'])
          ])]),
          h('tbody', {}, check.legs.map(leg => h('tr', {}, [
            h('td', {}, [`${leg.fromLabel} → ${leg.toLabel}`]),
            h('td', { class: 'num' }, [leg.measured.metresText]),
            h('td', { class: 'num' }, [leg.strides == null ? '—' : String(leg.strides)]),
            h('td', {}, [h('span', { class: 'pill pill--' + leg.severity }, [
              leg.verdict.replace(/-/g, ' ')])])
          ])))
        ]);
        wrap.appendChild(table);
      }
      return wrap;
    }

    function issueRow(issue) {
      const body = h('div', {}, [issue.message]);
      if (issue.fix && issue.fix.moveJumpId) {
        body.appendChild(h('button', {
          class: 'issue__fix', type: 'button',
          onclick: ev => { ev.stopPropagation(); takeSuggestion(issue.fix); }
        }, [issue.fix.text]));
      }
      return h('button', {
        class: `issue issue--${issue.severity}`, type: 'button',
        onclick: () => {
          if (issue.jumpIds && issue.jumpIds.length) {
            local.mode = 'build'; local.panel = 'build';
            setSelected(issue.jumpIds[0]);
            renderModebar();
          }
        }
      }, [
        h('span', { class: 'issue__glyph', 'aria-hidden': 'true' }, [SEVERITY_GLYPH[issue.severity] || '·']),
        body
      ]);
    }

    function takeSuggestion(fix) {
      applyToJump(fix.moveJumpId, { xM: fix.newX, yM: fix.newY });
      toast('Moved. Check the new distance.');
    }

    /* ---- Ride mode --------------------------------------------------------
       She presses Ride and a marker travels the track at the class speed, with
       the leg and the stride count written out as it goes, so she can learn the
       route before she sits on the pony.

       All the arithmetic is in ride.js and none of it is here. This part owns the
       controls, one animation frame at a time, and nothing else. */
    const ZOOM_WINDOW_M = 26;    /* how much of the arena the follow view holds */

    function enterRide() {
      if (ridePlay) exitRide();
      recheck();
      const built = Ride.buildRide(check, horse());
      if (!built.rideable) { ridePlay = null; return; }
      ridePlay = {
        ride: built,
        driver: Ride.createDriver(built, { rate: local.rideRate }),
        metro: Ride.createMetronome(),
        rideState: Ride.rideStateAt(built, 0),
        raf: 0,
        scrubbing: false,
        savedView: local.view
      };
      ridePlay.driver.setRate(local.rideRate, now());
      /* Start from the whole arena, whatever she had panned to before: a ride
         that happens off the side of the screen teaches nothing. */
      local.view = null;
    }

    function exitRide() {
      if (!ridePlay) return;
      if (ridePlay.raf) cancelAnimationFrame(ridePlay.raf);
      ridePlay.driver.pause();
      ridePlay.metro.disable();
      local.view = ridePlay.savedView;
      ridePlay = null;
      for (const key of ['rideCaption', 'ridePlayBtn', 'rideScrub',
        'rideScrubText', 'rideSpeed', 'rideFollowBtn', 'rideSoundBtn']) nodes[key] = null;
    }

    function now() {
      return (window.performance && performance.now) ? performance.now() : Date.now();
    }

    /* -- the controls -- */
    function ridePanel() {
      if (!ridePlay) {
        return h('div', { class: 'stack' }, [
          h('h3', {}, ['Nothing to ride yet']),
          h('p', { class: 'lede' }, [
            'A ride follows the route, so the fences need numbering first. Tap the '
            + 'fences in Number mode in the order you will jump them, save the route, '
            + 'then come back here.'
          ]),
          h('button', {
            class: 'iconbtn iconbtn--primary', type: 'button',
            onclick: () => {
              local.mode = 'number'; local.panel = 'number';
              local.numberOrder = []; local.selectedId = null;
              renderModebar(); renderPanel(); redraw();
            }
          }, ['Number the fences'])
        ]);
      }

      const ride = ridePlay.ride;
      const wrap = h('div', { class: 'ride' });

      nodes.ridePlayBtn = h('button', {
        class: 'ride__play', type: 'button', onclick: togglePlay
      }, [playLabel()]);

      wrap.appendChild(h('div', { class: 'ride__row' }, [
        h('button', {
          class: 'iconbtn', type: 'button', 'aria-label': 'Back to the fence before',
          onclick: () => stepFence(-1)
        }, ['⏮ Back']),
        nodes.ridePlayBtn,
        h('button', {
          class: 'iconbtn', type: 'button', 'aria-label': 'On to the next fence',
          onclick: () => stepFence(1)
        }, ['Next ⏭'])
      ]));

      nodes.rideScrub = h('input', {
        class: 'ride__scrub', type: 'range', min: 0, max: round2(ride.lengthM), step: 0.1,
        value: round2(ridePlay.driver.s), 'aria-label': 'How far round the course',
        oninput: ev => scrubTo(Number(ev.target.value)),
        onpointerdown: () => { ridePlay.scrubbing = true; },
        onpointerup: () => { ridePlay.scrubbing = false; },
        onpointercancel: () => { ridePlay.scrubbing = false; },
        /* change fires when she lets go, including when her finger left the bar
           first — without it the bar would stay stuck under her last touch. */
        onchange: () => { ridePlay.scrubbing = false; }
      });
      wrap.appendChild(h('div', { class: 'ride__row' }, [
        nodes.rideScrub,
        nodes.rideScrubText = h('span', { class: 'ride__clock' }, [rideClockText()])
      ]));

      nodes.rideSpeed = segmented([
        { id: 0.5, label: '½×' }, { id: 0.75, label: '¾×' }, { id: 1, label: '1×' }
      ], local.rideRate, setRideRate);

      nodes.rideFollowBtn = h('button', {
        class: 'iconbtn iconbtn--compact', type: 'button',
        'aria-pressed': String(local.rideFollow),
        onclick: toggleFollow
      }, [followLabel()]);

      nodes.rideSoundBtn = h('button', {
        class: 'iconbtn iconbtn--compact', type: 'button',
        'aria-pressed': String(local.rideSound),
        onclick: toggleSound
      }, [local.rideSound ? 'Sound on' : 'Sound off']);

      wrap.appendChild(h('div', { class: 'ride__row ride__row--wrap' }, [
        nodes.rideSpeed, nodes.rideFollowBtn, nodes.rideSoundBtn
      ]));

      wrap.appendChild(h('p', { class: 'lede ride__note' }, [
        `${ride.fences.length} fences · ${Math.round(ride.lengthM)}m · `
        + `time allowed ${check.timing.text} at ${ride.speedMpm} m/min. `
        + 'The line is the app’s suggestion at your pony’s turning radius — ride your own.'
      ]));
      return wrap;
    }

    function playLabel() {
      if (!ridePlay) return 'Ride';
      if (ridePlay.driver.playing) return '❙❙ Pause';
      return ridePlay.driver.finished ? '↻ Ride it again' : '▶ Ride';
    }

    /* Only the bits that change on their own get touched here. Rebuilding the
       whole panel would take the scrub bar out from under her finger. */
    function refreshRideControls() {
      if (!ridePlay) return;
      if (nodes.ridePlayBtn) {
        clear(nodes.ridePlayBtn);
        nodes.ridePlayBtn.appendChild(document.createTextNode(playLabel()));
        nodes.ridePlayBtn.setAttribute('aria-pressed', String(ridePlay.driver.playing));
      }
      if (nodes.rideSpeed) {
        for (const btn of nodes.rideSpeed.children) {
          btn.setAttribute('aria-pressed', String(btn.textContent === rateLabel(local.rideRate)));
        }
      }
      if (nodes.rideFollowBtn) {
        nodes.rideFollowBtn.setAttribute('aria-pressed', String(local.rideFollow));
        clear(nodes.rideFollowBtn);
        nodes.rideFollowBtn.appendChild(document.createTextNode(followLabel()));
      }
      if (nodes.rideSoundBtn) {
        nodes.rideSoundBtn.setAttribute('aria-pressed', String(local.rideSound));
        clear(nodes.rideSoundBtn);
        nodes.rideSoundBtn.appendChild(document.createTextNode(local.rideSound ? 'Sound on' : 'Sound off'));
      }
    }

    /* Both toggles keep a label the same length whichever way they are set, so
       the row cannot reflow under her thumb and move the button she is aiming at. */
    function followLabel() { return local.rideFollow ? 'Zoom out' : 'Zoom in'; }

    function rateLabel(rate) {
      return rate === 0.5 ? '½×' : (rate === 0.75 ? '¾×' : '1×');
    }

    function rideClockText() {
      if (!ridePlay) return '';
      const st = ridePlay.rideState;
      return `${st.elapsedS.toFixed(1)}s / ${ridePlay.ride.timeAllowedS}s`;
    }

    /* -- the controls' handlers -- */
    function togglePlay() {
      if (!ridePlay) return;
      const d = ridePlay.driver;
      if (d.playing) {
        d.pause();
        ridePlay.metro.cancel();
      } else {
        /* The sound is started from inside the tap, because iOS will not let a
           page make a noise any other way. */
        if (local.rideSound) ridePlay.metro.enable();
        d.play(now());
        scheduleBeats();
        startRideLoop();
      }
      refreshRideControls();
      paintRide();
    }

    function stepFence(direction) {
      if (!ridePlay) return;
      const d = ridePlay.driver;
      ridePlay.metro.cancel();
      d.stepTo(direction > 0 ? d.nextFenceS() : d.prevFenceS(), now(), 700);
      startRideLoop();
      refreshRideControls();
    }

    function scrubTo(metres) {
      if (!ridePlay) return;
      ridePlay.driver.seek(metres, now());
      scheduleBeats();
      if (!ridePlay.raf) { ridePlay.rideState = Ride.rideStateAt(ridePlay.ride, ridePlay.driver.s); paintRide(); }
    }

    function setRideRate(rate) {
      local.rideRate = rate;
      if (ridePlay) {
        ridePlay.driver.setRate(rate, now());
        scheduleBeats();
      }
      refreshRideControls();
    }

    function toggleFollow() {
      local.rideFollow = !local.rideFollow;
      if (!local.rideFollow) local.view = null;
      refreshRideControls();
      redraw();
      if (local.rideFollow) paintRide();
    }

    function toggleSound() {
      local.rideSound = !local.rideSound;
      if (!ridePlay) { refreshRideControls(); return; }
      if (local.rideSound) {
        if (!ridePlay.metro.enable()) {
          local.rideSound = false;
          toast('This browser will not make a sound for the app.');
        } else {
          scheduleBeats();
          announce('Sound on. A click on every stride.');
        }
      } else {
        ridePlay.metro.disable();
      }
      refreshRideControls();
    }

    /* Every beat still to come is laid out on the audio clock at once. Firing
       them frame by frame would wobble, and a wobbly metronome is worse than
       none. Anything that changes when the beats fall — play, scrub, speed —
       lays them out again. */
    function scheduleBeats() {
      if (!ridePlay || !local.rideSound) return;
      if (!ridePlay.driver.playing) { ridePlay.metro.cancel(); return; }
      ridePlay.metro.schedule(ridePlay.ride, ridePlay.driver.s, ridePlay.driver.rate);
    }

    /* -- the loop -- */
    function startRideLoop() {
      if (!ridePlay || ridePlay.raf) return;
      ridePlay.raf = requestAnimationFrame(rideFrame);
    }

    function rideFrame(stamp) {
      if (!ridePlay) return;
      const d = ridePlay.driver;
      d.tick(stamp);
      ridePlay.rideState = Ride.rideStateAt(ridePlay.ride, d.s);
      paintRide();
      if (d.playing || d.stepping) {
        ridePlay.raf = requestAnimationFrame(rideFrame);
      } else {
        ridePlay.raf = 0;
        ridePlay.metro.cancel();
        refreshRideControls();
        announce(ridePlay.rideState.caption);
      }
    }

    /* One transform, one dash offset and a few rings — never a redraw. Sixty
       rebuilds of the arena a second would stutter, for the same reason a drag
       does not rebuild it either. */
    function paintRide() {
      if (!ridePlay || !svg) return;
      const st = ridePlay.rideState;
      if (!Render.updateRideLayer(svg, ridePlay.ride, st, dark())) { redraw(); return; }
      followMarker(st);
      if (nodes.rideCaption) nodes.rideCaption.textContent = st.caption;
      if (nodes.rideScrubText) nodes.rideScrubText.textContent = rideClockText();
      if (nodes.rideScrub && !ridePlay.scrubbing && document.activeElement !== nodes.rideScrub) {
        nodes.rideScrub.value = String(round2(st.s));
      }
    }

    /* Zoom that follows her round. The viewBox is set straight on the element
       rather than through a redraw: it is one attribute, and this runs every
       frame. */
    function followMarker(st) {
      if (!local.rideFollow) return;
      const a = course.arena, pad = 3;
      const w = Math.min(ZOOM_WINDOW_M, a.widthM + pad * 2);
      const hgt = Math.min(ZOOM_WINDOW_M, a.lengthM + pad * 2);
      const view = {
        x: clampSpan(st.x - w / 2, -pad, a.widthM + pad - w),
        y: clampSpan(st.y - hgt / 2, -pad, a.lengthM + pad - hgt),
        w, h: hgt
      };
      local.view = view;
      svg.setAttribute('viewBox', `${round2(view.x)} ${round2(view.y)} ${round2(view.w)} ${round2(view.h)}`);
    }

    /* If the window is wider than the arena there is nothing to clamp to, so it
       simply stays centred rather than being pinned to a nonsensical edge. */
    function clampSpan(v, lo, hi) {
      if (hi <= lo) return (lo + hi) / 2;
      return v < lo ? lo : (v > hi ? hi : v);
    }

    /* ---- changing the course --------------------------------------------- */
    function addJump(type) {
      const arena = course.arena;
      const view = local.view;
      const at = view
        ? { x: view.x + view.w / 2, y: view.y + view.h / 2 }
        : { x: arena.widthM / 2, y: arena.lengthM / 2 };
      const jump = C.newJump({
        type,
        xM: Math.min(Math.max(round2(at.x), 1), arena.widthM - 1),
        yM: Math.min(Math.max(round2(at.y), 1), arena.lengthM - 1),
        heightCm: defaultHeight(type)
      });
      course.jumps = (course.jumps || []).concat([jump]);
      store.touchCourse(course);
      recheck();
      setSelected(jump.id);
      const spec = root.bcbJump(type);
      announce(`${spec ? spec.name : 'Fence'} added. Drag it where you want it.`);
    }

    function defaultHeight(type) {
      const spec = root.bcbJump(type);
      if (spec && spec.category === 'pole') return 0;
      const level = root.bcbLevel(course.levelId);
      return level ? level.heightCm : 70;
    }

    function duplicateJump(jump) {
      const copy = Object.assign({}, jump, {
        id: C.id('jump'),
        xM: Math.min(jump.xM + 2, course.arena.widthM - 1),
        yM: Math.min(jump.yM + 2, course.arena.lengthM - 1),
        number: null, element: null
      });
      course.jumps = course.jumps.concat([copy]);
      store.touchCourse(course);
      recheck();
      setSelected(copy.id);
    }

    async function removeJump(jump) {
      const label = jump.number != null ? `fence ${jump.number}${jump.element || ''}` : 'this fence';
      course.jumps = course.jumps.filter(j => j.id !== jump.id);
      store.touchCourse(course);
      local.selectedId = null;
      recheck(); renderPanel(); redraw(); renderChrome();
      toast(`Removed ${label}`, {
        actionLabel: 'Undo',
        onAction: () => { if (store.undo()) reload(); }
      });
    }

    function applyToJump(id, patch) {
      const jump = findJump(id);
      if (!jump) return;
      Object.assign(jump, patch);
      store.touchCourse(course);
      recheck();
      redraw();
      renderChrome();
      renderTools();
      if (local.mode === 'check') renderPanel();
      showReadout();
    }

    /* `duringGesture` means a finger is still down. Redraw the arena so the
       selection ring appears, but leave the panel alone until she lifts off:
       opening it reflows the page and the drag would lose track of her finger. */
    function setSelected(id, duringGesture) {
      if (local.mode === 'number') {
        if (id) tapForNumbering(id);
        return;
      }
      local.selectedId = id;
      if (duringGesture) { panelDirty = true; redraw(); return; }
      panelDirty = false;
      renderPanel();
      redraw();
    }

    function tapForNumbering(id) {
      const at = local.numberOrder.indexOf(id);
      if (at >= 0) local.numberOrder = local.numberOrder.slice(0, at);
      else local.numberOrder = local.numberOrder.concat([id]);
      renderPanel();
      showReadout();
    }

    function findJump(id) { return (course.jumps || []).find(j => j.id === id) || null; }

    async function renameCourse() {
      const name = await askText({
        title: 'Name this course', value: course.name,
        placeholder: 'Sunday clear round'
      });
      if (name === null) return;
      course.name = name;
      store.touchCourse(course);
      renderChrome();
    }

    /* ---- keyboard, so it works on a laptop too --------------------------- */
    function onKey(ev) {
      if (ev.target && /input|select|textarea/i.test(ev.target.tagName)) return;

      /* Riding has its own keys: space to start and stop, arrows to step from
         fence to fence, which is what a laptop hand reaches for. */
      if (local.mode === 'ride' && ridePlay) {
        if (ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); togglePlay(); return; }
        if (ev.key === 'ArrowRight') { ev.preventDefault(); stepFence(1); return; }
        if (ev.key === 'ArrowLeft') { ev.preventDefault(); stepFence(-1); return; }
      }

      const jump = local.selectedId ? findJump(local.selectedId) : null;
      const step = ev.shiftKey ? 1 : 0.25;
      const nudge = (dx, dy) => {
        if (!jump) return;
        ev.preventDefault();
        applyToJump(jump.id, {
          xM: round2(Math.min(Math.max(jump.xM + dx, 0.4), course.arena.widthM - 0.4)),
          yM: round2(Math.min(Math.max(jump.yM + dy, 0.4), course.arena.lengthM - 0.4))
        });
        announce(describeSelected());
      };
      switch (ev.key) {
        case 'ArrowLeft': nudge(-step, 0); break;
        case 'ArrowRight': nudge(step, 0); break;
        case 'ArrowUp': nudge(0, -step); break;
        case 'ArrowDown': nudge(0, step); break;
        case '[': if (jump) { applyToJump(jump.id, { rotationDeg: turn(jump, ev.shiftKey ? -45 : -5) }); } break;
        case ']': if (jump) { applyToJump(jump.id, { rotationDeg: turn(jump, ev.shiftKey ? 45 : 5) }); } break;
        case 'Delete': case 'Backspace': if (jump) { ev.preventDefault(); removeJump(jump); } break;
        case 'Escape': setSelected(null); break;
        case 'z':
          if (ev.metaKey || ev.ctrlKey) {
            ev.preventDefault();
            if (ev.shiftKey ? store.redo() : store.undo()) reload();
          }
          break;
        default: break;
      }
    }

    function describeSelected() {
      const jump = findJump(local.selectedId);
      if (!jump) return '';
      const leg = (check.legs || []).find(l => l.toId === jump.id);
      return Render.describeForScreenReader(jump, root.bcbJump(jump.type), check)
        + (leg ? '' : '');
    }

    /* ---- getting it out -------------------------------------------------- */
    function shareMenu() {
      const body = h('div', { class: 'rowlist' }, [
        h('button', { class: 'row', type: 'button', onclick: () => { root.bcbUi.closeModal(); printSheet(); } }, [
          h('span', { class: 'row__main' }, [
            h('div', { class: 'row__title' }, ['Print a course sheet']),
            h('div', { class: 'row__sub' }, ['The plan, every distance and the time allowed. On an iPhone, choose Print then pinch to save it as a PDF.'])
          ])
        ]),
        h('button', { class: 'row', type: 'button', onclick: () => { root.bcbUi.closeModal(); sendPicture(); } }, [
          h('span', { class: 'row__main' }, [
            h('div', { class: 'row__title' }, ['Send a picture']),
            h('div', { class: 'row__sub' }, ['A PNG of the arena, to message to your instructor.'])
          ])
        ]),
        h('button', { class: 'row', type: 'button', onclick: () => { root.bcbUi.closeModal(); copyLink(); } }, [
          h('span', { class: 'row__main' }, [
            h('div', { class: 'row__title' }, ['Copy a link']),
            h('div', { class: 'row__sub' }, ['The whole course packed into a web link. Nothing is uploaded.'])
          ])
        ]),
        h('button', { class: 'row', type: 'button', onclick: () => { root.bcbUi.closeModal(); saveFile(); } }, [
          h('span', { class: 'row__main' }, [
            h('div', { class: 'row__title' }, ['Save as a file']),
            h('div', { class: 'row__sub' }, ['A JSON file you can keep or send.'])
          ])
        ])
      ]);
      modal({ title: 'Share this course', body, buttons: [{ label: 'Close' }] });
    }

    function printSheet() {
      ctx.buildSheet(course, check, horse());
      setTimeout(() => window.print(), 60);
    }

    function sendPicture() {
      const caption = `${course.name || 'Course'} · ${levelName()} · ${check.summary.lengthM}m · ${check.timing.text}`;
      const theme = Render.THEMES[dark() ? 'dark' : 'light'];
      /* Draw the whole arena, not whatever is on screen, and without the handles. */
      const saveView = local.view;
      local.view = null;
      const saved = local.selectedId;
      local.selectedId = null;
      redraw();

      /* the picture is a keepsake, so it carries the arena size */
      local.showArenaSize = true;
      redraw();
      Share.svgToPngBlob(svg, {
        width: 1800, aspect: course.arena.lengthM / course.arena.widthM > 1 ? 1.3 : 0.7,
        background: theme.paper, captionColour: theme.ink, caption
      }).then(blob => {
        local.showArenaSize = false;
        local.view = saveView; local.selectedId = saved; redraw();
        const file = new File([blob], Share.safeName(course.name, 'png'), { type: 'image/png' });
        showPictureSheet(file, blob);
      }).catch(err => {
        local.showArenaSize = false;
        local.view = saveView; local.selectedId = saved; redraw();
        toast(err.message || 'The picture could not be made.');
      });
    }

    /* The file is built first and the share call happens straight off the tap,
       because iOS refuses to share if anything is awaited in between. */
    function showPictureSheet(file, blob) {
      const img = h('img', {
        src: URL.createObjectURL(blob), alt: 'The course',
        style: 'width:100%;border-radius:10px;border:1px solid var(--line)'
      });
      const buttons = [{ label: 'Close' }];
      if (Share.canShareFiles()) {
        buttons.unshift({
          label: 'Send', style: 'primary',
          onClick: () => {
            Share.shareFile(file, { title: course.name || 'Course' })
              .catch(() => toast('Press and hold the picture to save it instead.'));
          }
        });
      } else {
        buttons.unshift({
          label: 'Download', style: 'primary',
          onClick: () => Share.downloadBlob(blob, file.name)
        });
      }
      modal({
        title: 'Your course',
        description: Share.canShareFiles()
          ? 'Send it, or press and hold the picture to save it.'
          : 'Press and hold the picture to save it, or download it.',
        body: img, buttons
      });
    }

    function copyLink() {
      Share.courseToHash(course).then(hash => {
        const url = `${location.origin}${location.pathname}#/open/${hash}`;
        if (url.length > 8000) {
          toast('This course is too big for a link — save it as a file instead.');
          return;
        }
        Share.copyText(url).then(
          () => toast('Link copied'),
          () => modal({
            title: 'Copy this link',
            body: h('textarea', { readonly: true, rows: 4 }, [url]),
            buttons: [{ label: 'Close' }]
          })
        );
      }).catch(() => toast('The link could not be made.'));
    }

    function saveFile() {
      const payload = JSON.stringify({
        app: 'beas-course-builder', schemaVersion: 1,
        exported: C.nowIso(), courses: [course],
        horses: horse() ? [horse()] : []
      }, null, 2);
      Share.downloadJson(payload, Share.safeName(course.name, 'course.json'));
      toast('Saved');
    }

    function round2(n) { return Math.round(n * 100) / 100; }
    function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

    return { mount, unmount, get course() { return course; }, reload };
  }

  root.bcbEditor = { createEditor };
})(typeof globalThis !== 'undefined' ? globalThis : this);
