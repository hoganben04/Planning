/* Bee's Course Builder — putting it together.

   A hash router, five screens and the boot sequence. Hash routing rather than the
   History API because it works with no server rewrites, survives being served
   from a subfolder, and behaves properly once the app is on the home screen. */
(function (root) {
  const U = root.bcbUi;
  const { h, clear, toast, modal, confirmSheet, askText, fieldRow, stepper,
    segmented, niceDate, handsText, handsToCm } = U;
  const C = root.bcbCourse;
  const S = root.bcbStrides;
  const R = root.bcbRoute;
  const Render = root.bcbRender;
  const Share = root.bcbShare;
  const Store = root.bcbStore;

  const store = Store.createStore();
  let currentScreen = null;
  let editor = null;

  const el = {
    topbar: document.getElementById('topbar'),
    view: document.getElementById('view'),
    tabbar: document.getElementById('tabbar'),
    sheet: document.getElementById('sheet')
  };

  /* One consistent set of line icons. Mixing colour emoji with mono symbols
     looks like an accident rather than a decision. */
  const ICONS = {
    courses: 'M3 5h18M3 12h18M3 19h18',
    horses: 'M5 20c0-5 2-8 5-9l1-4 3 2 3-1-1 4c2 2 3 5 3 8',
    reference: 'M3 8h18v8H3zM7 8v4M11 8v4M15 8v4M19 8v4',
    settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1'
  };

  const TABS = [
    { id: 'courses', href: '#/courses', label: 'Courses' },
    { id: 'horses', href: '#/horses', label: 'Horses' },
    { id: 'reference', href: '#/reference', label: 'Distances' },
    { id: 'settings', href: '#/settings', label: 'Settings' }
  ];

  function icon(name) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', ICONS[name] || ICONS.courses);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.9');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  /* ---- chrome -------------------------------------------------------------- */
  function setChrome(spec) {
    clear(el.topbar);
    if (spec.back) {
      el.topbar.appendChild(h('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'Back',
        onclick: () => navigate(spec.back)
      }, ['‹']));
    }
    const title = h('div', { class: 'topbar__title' }, [
      h('div', {}, [spec.title]),
      spec.subtitle ? h('div', { class: 'topbar__sub' }, [spec.subtitle]) : null
    ]);
    if (spec.onTitleTap) {
      title.setAttribute('role', 'button');
      title.setAttribute('tabindex', '0');
      title.style.cursor = 'pointer';
      title.addEventListener('click', spec.onTitleTap);
      title.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); spec.onTitleTap(); }
      });
    }
    el.topbar.appendChild(title);
    for (const action of spec.actions || []) {
      el.topbar.appendChild(h('button', {
        class: 'iconbtn' + (action.primary ? ' iconbtn--primary' : ''),
        type: 'button', title: action.title || action.label,
        'aria-label': action.title || action.label,
        disabled: action.disabled || false,
        onclick: action.onClick
      }, [action.label]));
    }
  }

  function renderTabs(activeId) {
    clear(el.tabbar);
    for (const tab of TABS) {
      el.tabbar.appendChild(h('button', {
        class: 'tab', type: 'button',
        'aria-current': tab.id === activeId ? 'page' : null,
        onclick: () => navigate(tab.href)
      }, [
        h('span', { class: 'tab__glyph', 'aria-hidden': 'true' }, [icon(tab.id)]),
        h('span', {}, [tab.label])
      ]));
    }
  }

  /* ---- router ------------------------------------------------------------- */
  function navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  function route() {
    const hash = location.hash || '#/courses';
    if (currentScreen === 'editor' && editor) { editor.unmount(); editor = null; }
    currentScreen = null;
    clear(el.view);
    el.view.classList.remove('view--flush');
    el.view.scrollTop = 0;

    const openMatch = hash.match(/^#\/open\/(.+)$/);
    const courseMatch = hash.match(/^#\/course\/([^/]+)$/);
    const horseMatch = hash.match(/^#\/horses\/([^/]+)$/);

    if (openMatch) { screenOpenLink(openMatch[1]); return; }
    if (courseMatch) { screenEditor(courseMatch[1]); return; }
    if (horseMatch) { screenHorse(horseMatch[1]); return; }
    if (hash.startsWith('#/horses')) { screenHorses(); return; }
    if (hash.startsWith('#/reference')) { screenReference(); return; }
    if (hash.startsWith('#/settings')) { screenSettings(); return; }
    screenCourses();
  }

  /* ---- screen: the course library ---------------------------------------- */
  function screenCourses() {
    renderTabs('courses');
    setChrome({
      title: "Bee's Course Builder",
      actions: [{
        label: '+ New', primary: true, onClick: async () => {
          const name = await askText({
            title: 'New course', placeholder: 'Sunday clear round',
            description: 'You can change this later.'
          });
          if (name === null) return;
          const course = store.addCourse({ name: name || 'Untitled course' });
          navigate(`#/course/${course.id}`);
        }
      }]
    });

    const pad = h('div', { class: 'pad stack' });
    warnings(pad);

    if (!store.db.courses.length) {
      pad.appendChild(h('div', { class: 'empty' }, [
        h('div', { class: 'empty__big', 'aria-hidden': 'true' }, ['▦']),
        h('p', {}, ['No courses yet.']),
        h('p', { class: 'lede' }, ['Make one and start dropping jumps into the arena.'])
      ]));
    } else {
      const list = h('div', { class: 'courselist' });
      for (const course of store.db.courses) {
        list.appendChild(courseCard(course));
      }
      pad.appendChild(list);
    }
    el.view.appendChild(pad);
  }

  function courseCard(course) {
    const horse = store.horseForCourse(course);
    const check = C.checkCourse(course, horse, store.db.settings);
    const level = root.bcbLevel(course.levelId);
    const s = check.summary;

    const badge = s.errors ? h('span', { class: 'pill pill--error' }, [`${s.errors} to fix`])
      : (s.warnings ? h('span', { class: 'pill pill--warn' }, [`${s.warnings} to check`])
        : h('span', { class: 'pill pill--ok' }, ['looks good']));

    return h('div', { class: 'card coursecard' }, [
      h('div', { class: 'coursecard__thumb', 'aria-hidden': 'true' }, [thumbnail(course, check)]),
      h('button', {
        class: 'row__main', type: 'button',
        style: 'background:none;border:0;padding:0;text-align:left;cursor:pointer',
        onclick: () => navigate(`#/course/${course.id}`)
      }, [
        h('div', { class: 'coursecard__name' }, [course.name || 'Untitled course']),
        h('div', { class: 'coursecard__meta' }, [
          `${level ? level.name : 'no level'} · ${plural(s.efforts, 'effort')} · ${s.lengthM}m · ${check.timing.text}`
        ]),
        h('div', { class: 'coursecard__meta' }, [
          `${horse ? horse.name : 'no horse'} · ${niceDate(course.updatedAt)}`
        ]),
        h('div', { style: 'margin-top:5px' }, [badge])
      ]),
      h('button', {
        class: 'iconbtn', type: 'button', 'aria-label': `More for ${course.name || 'this course'}`,
        onclick: () => courseMenu(course)
      }, ['⋯'])
    ]);
  }

  function thumbnail(course, check) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    document.body.appendChild(svg);   /* needs to be in the document to measure */
    svg.style.position = 'absolute';
    svg.style.width = '184px';
    svg.style.height = '124px';
    svg.style.left = '-9999px';
    const renderer = Render.createRenderer(svg);
    renderer.draw({
      course, check, horse: store.horseForCourse(course), settings: store.db.settings,
      dark: isDark(), showGrid: false, showDistances: false, ui: {}
    });
    document.body.removeChild(svg);
    svg.style.position = '';
    svg.style.left = '';
    svg.style.width = '';
    svg.style.height = '';
    return svg;
  }

  function courseMenu(course) {
    modal({
      title: course.name || 'Untitled course',
      body: h('div', { class: 'rowlist' }, [
        menuRow('Open', () => navigate(`#/course/${course.id}`)),
        menuRow('Rename', async () => {
          const name = await askText({ title: 'Rename course', value: course.name });
          if (name === null) return;
          course.name = name; store.touchCourse(course); route();
        }),
        menuRow('Duplicate', () => {
          const copy = store.duplicateCourse(course.id);
          if (copy) { toast('Duplicated'); route(); }
        }),
        menuRow('Change the arena', () => arenaSheet(course)),
        menuRow('Change the level', () => levelSheet(course)),
        menuRow('Change the horse', () => horseSheet(course)),
        menuRow('Delete', async () => {
          const yes = await confirmSheet({
            title: 'Delete this course?',
            description: 'It cannot be brought back, though you can undo straight away.',
            confirmLabel: 'Delete', danger: true
          });
          if (!yes) return;
          store.deleteCourse(course.id);
          route();
          toast('Deleted', { actionLabel: 'Undo', onAction: () => { store.undo(); route(); } });
        }, true)
      ]),
      buttons: [{ label: 'Close' }]
    });
  }

  function menuRow(label, onClick, danger) {
    return h('button', {
      class: 'row', type: 'button',
      style: danger ? 'color:var(--error)' : '',
      onclick: () => { U.closeModal(); onClick(); }
    }, [h('span', { class: 'row__main' }, [label])]);
  }

  function arenaSheet(course) {
    const body = h('div', { class: 'rowlist' });
    for (const arena of root.BCB_ARENAS) {
      body.appendChild(h('button', {
        class: 'row', type: 'button',
        onclick: () => {
          course.arena = { widthM: arena.widthM, lengthM: arena.lengthM, name: arena.name, indoor: arena.indoor };
          store.touchCourse(course);
          U.closeModal(); reopen(course);
        }
      }, [h('span', { class: 'row__main' }, [
        h('div', { class: 'row__title' }, [arena.name]),
        h('div', { class: 'row__sub' }, [arena.note || ''])
      ])]));
    }
    body.appendChild(h('button', {
      class: 'row', type: 'button', onclick: async () => {
        U.closeModal();
        const w = await askText({ title: 'How wide is your arena, in metres?', value: String(course.arena.widthM) });
        if (w === null) return;
        const l = await askText({ title: 'And how long?', value: String(course.arena.lengthM) });
        if (l === null) return;
        course.arena = {
          widthM: Math.min(Math.max(parseFloat(w) || 20, 5), 150),
          lengthM: Math.min(Math.max(parseFloat(l) || 60, 5), 200),
          name: 'Custom', indoor: false
        };
        store.touchCourse(course); reopen(course);
      }
    }, [h('span', { class: 'row__main' }, [
      h('div', { class: 'row__title' }, ['Measure your own']),
      h('div', { class: 'row__sub' }, ['Type the width and length in metres.'])
    ])]));
    modal({ title: 'Which arena?', body, buttons: [{ label: 'Close' }] });
  }

  function levelSheet(course) {
    const body = h('div', { class: 'rowlist' });
    for (const group of root.bcbLevelGroups()) {
      body.appendChild(h('h3', { style: 'margin:10px 0 2px' }, [group.name]));
      for (const level of group.levels) {
        body.appendChild(h('button', {
          class: 'row', type: 'button',
          onclick: () => {
            course.levelId = level.id;
            store.touchCourse(course);
            U.closeModal(); reopen(course);
          }
        }, [h('span', { class: 'row__main' }, [
          h('div', { class: 'row__title' }, [level.name]),
          h('div', { class: 'row__sub' }, [
            `${(level.heightCm / 100).toFixed(2)}m`
            + (level.maxHeightCm && level.maxHeightCm !== level.heightCm
              ? ` up to ${(level.maxHeightCm / 100).toFixed(2)}m` : '')
            + ` · ${level.speedMpm} m/min`
          ])
        ])]));
      }
    }
    modal({ title: 'Which class?', body, buttons: [{ label: 'Close' }] });
  }

  function horseSheet(course) {
    if (!store.db.horses.length) {
      U.closeModal();
      toast('Add a horse first');
      navigate('#/horses');
      return;
    }
    const body = h('div', { class: 'rowlist' });
    for (const horse of store.db.horses) {
      const model = S.strideModel(horse);
      body.appendChild(h('button', {
        class: 'row', type: 'button',
        onclick: () => {
          course.horseId = horse.id;
          store.touchCourse(course);
          U.closeModal(); reopen(course);
        }
      }, [h('span', { class: 'row__main' }, [
        h('div', { class: 'row__title' }, [horse.name || 'Unnamed']),
        h('div', { class: 'row__sub' }, [`${model.strideM}m stride`])
      ])]));
    }
    modal({ title: 'Which horse?', body, buttons: [{ label: 'Close' }] });
  }

  function reopen(course) {
    if (location.hash === `#/course/${course.id}`) route();
    else route();
  }

  /* ---- screen: the editor ------------------------------------------------- */
  function screenEditor(courseId) {
    currentScreen = 'editor';
    renderTabs(null);
    el.view.classList.add('view--flush');
    editor = root.bcbEditor.createEditor({
      store, navigate, setChrome, buildSheet
    });
    editor.mount(el.view, courseId);
  }

  /* ---- screen: horses ---------------------------------------------------- */
  function screenHorses() {
    renderTabs('horses');
    setChrome({
      title: 'Horses and ponies',
      actions: [{
        label: '+ New', primary: true, onClick: () => {
          const horse = store.addHorse({ name: '' });
          navigate(`#/horses/${horse.id}`);
        }
      }]
    });
    const pad = h('div', { class: 'pad stack' });
    pad.appendChild(h('p', { class: 'lede' }, [
      'Every distance in the app comes from the stride length here, so it is worth '
      + 'getting right. The stride you pick is a starting point — if your pony always '
      + 'meets a true distance a bit short, shorten it.'
    ]));
    if (!store.db.horses.length) {
      pad.appendChild(h('div', { class: 'empty' }, [
        h('div', { class: 'empty__big', 'aria-hidden': 'true' }, ['🐴']),
        h('p', {}, ['No horses yet.'])
      ]));
    }
    const list = h('div', { class: 'rowlist' });
    for (const horse of store.db.horses) {
      const model = S.strideModel(horse);
      const active = store.db.settings.activeHorseId === horse.id;
      list.appendChild(h('button', {
        class: 'row', type: 'button', onclick: () => navigate(`#/horses/${horse.id}`)
      }, [
        h('span', { class: 'row__main' }, [
          h('div', { class: 'row__title' }, [
            horse.name || 'Unnamed',
            active ? h('span', { class: 'pill pill--accent', style: 'margin-left:7px' }, ['using']) : null
          ]),
          h('div', { class: 'row__sub' }, [
            `${model.strideM}m stride · ${handsText(horse.heightCm)}`
            + (horse.breed ? ` · ${horse.breed}` : '')
          ])
        ]),
        h('span', { class: 'row__go', 'aria-hidden': 'true' }, ['›'])
      ]));
    }
    pad.appendChild(list);
    el.view.appendChild(pad);
  }

  function screenHorse(id) {
    const horse = store.horse(id);
    if (!horse) { navigate('#/horses'); return; }
    renderTabs('horses');
    setChrome({ back: '#/horses', title: horse.name || 'New horse' });

    const pad = h('div', { class: 'pad stack' });
    const save = patch => { Object.assign(horse, patch); store.saveHorse(horse); };

    pad.appendChild(fieldRow('Name', h('input', {
      type: 'text', value: horse.name, placeholder: 'Bramble',
      oninput: ev => { save({ name: ev.target.value }); setChrome({ back: '#/horses', title: ev.target.value || 'New horse' }); }
    })));

    const typeSelect = h('select', {
      onchange: ev => {
        const type = root.bcbHorseType(ev.target.value);
        save({ typeId: ev.target.value, strideM: null, heightCm: type ? type.maxHeightCm : horse.heightCm });
        route();
      }
    });
    for (const type of root.BCB_HORSE_TYPES) {
      typeSelect.appendChild(h('option', { value: type.id, selected: type.id === horse.typeId },
        [`${type.name} — ${type.detail}`]));
    }
    pad.appendChild(fieldRow('What sort', typeSelect,
      'This sets the stride length, the turning circle and the pole spacings.'));

    pad.appendChild(fieldRow('Height', h('input', {
      type: 'text', value: handsText(horse.heightCm), placeholder: '14.2hh',
      onchange: ev => {
        const cm = handsToCm(ev.target.value);
        if (cm) { save({ heightCm: cm }); route(); }
      }
    }), `${horse.heightCm}cm. Type it in hands, like 14.2hh.`));

    const model = S.strideModel(horse);
    pad.appendChild(fieldRow('Canter stride', stepper({
      value: model.strideM, min: 2.2, max: 4.4, step: 0.05, label: 'stride',
      format: v => `${v.toFixed(2)}m`,
      onChange: v => { save({ strideM: Math.round(v * 100) / 100 }); refreshStrideTable(); }
    }), 'The distance she covers in one canter stride. Everything else follows from this.'));

    const table = h('div', { class: 'card' });
    pad.appendChild(table);
    function refreshStrideTable() {
      const m = S.strideModel(horse);
      clear(table);
      table.appendChild(h('h3', {}, ['True distances for this stride']));
      const rows = h('table', { class: 'legtable' }, [
        h('thead', {}, [h('tr', {}, [
          h('th', {}, ['Strides']), h('th', {}, ['Metres']), h('th', {}, ['Feet']), h('th', {}, ['Paces'])
        ])]),
        h('tbody', {}, [0, 1, 2, 3, 4, 5, 6].map(n => {
          const d = S.trueDistance(m, n);
          const mm = S.measurement(d, store.db.settings.paceM);
          return h('tr', {}, [
            h('td', {}, [n === 0 ? 'bounce' : String(n)]),
            h('td', { class: 'num' }, [mm.metresText]),
            h('td', { class: 'num' }, [mm.feetText]),
            h('td', { class: 'num' }, [mm.pacesText])
          ]);
        }))
      ]);
      table.appendChild(rows);
    }
    refreshStrideTable();

    pad.appendChild(fieldRow('Breed or type', h('input', {
      type: 'text', value: horse.breed || '', placeholder: 'Connemara',
      oninput: ev => save({ breed: ev.target.value })
    })));

    pad.appendChild(fieldRow('Notes', h('textarea', {
      placeholder: 'Gets long down the far side; keep the turn short.',
      oninput: ev => save({ notes: ev.target.value })
    }, [horse.notes || ''])));

    if (store.db.settings.activeHorseId !== horse.id) {
      pad.appendChild(h('button', {
        class: 'iconbtn iconbtn--primary', type: 'button',
        onclick: () => { store.setSettings({ activeHorseId: horse.id }); toast(`Using ${horse.name || 'this horse'}`); route(); }
      }, ['Use this one by default']));
    }

    pad.appendChild(h('button', {
      class: 'iconbtn', type: 'button', style: 'color:var(--error)',
      onclick: async () => {
        const yes = await confirmSheet({
          title: `Delete ${horse.name || 'this horse'}?`, confirmLabel: 'Delete', danger: true
        });
        if (!yes) return;
        store.deleteHorse(horse.id);
        navigate('#/horses');
      }
    }, ['Delete']));

    el.view.appendChild(pad);
  }

  /* ---- screen: the reference tables -------------------------------------- */
  function screenReference() {
    renderTabs('reference');
    setChrome({ title: 'Distances and heights' });
    const pad = h('div', { class: 'pad stack' });
    const horse = store.activeHorse();
    const model = S.strideModel(horse);

    pad.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, ['Walking a distance']),
      h('p', { class: 'lede' }, [
        `A pace of about ${store.db.settings.paceM}m. Count your paces between the fences `
        + 'and look the number up here, or use the calculator below.'
      ])
    ]));

    /* the little calculator */
    const out = h('div', { class: 'card', style: 'background:var(--accent-soft)' });
    const input = h('input', {
      type: 'number', step: '0.1', inputmode: 'decimal', value: '10',
      'aria-label': 'A distance to look up',
      oninput: () => recalc()
    });
    const unit = h('select', { onchange: () => recalc() }, [
      h('option', { value: 'm' }, ['metres']),
      h('option', { value: 'paces' }, ['paces']),
      h('option', { value: 'ft' }, ['feet'])
    ]);
    function recalc() {
      const v = parseFloat(input.value) || 0;
      const metres = unit.value === 'm' ? v
        : (unit.value === 'paces' ? v * store.db.settings.paceM : v * 0.3048);
      clear(out);
      if (metres <= 0) { out.appendChild(h('p', {}, ['Type a distance.'])); return; }
      const nReal = (metres - model.overheadM) / model.strideM;
      const n = Math.max(0, Math.round(nReal));
      const trueM = S.trueDistance(model, n);
      const off = metres - trueM;
      const mm = S.measurement(metres, store.db.settings.paceM);
      out.appendChild(h('b', {}, [`${mm.metresText} · ${mm.feetText} · ${mm.pacesText}`]));
      out.appendChild(h('p', {}, [
        n === 0
          ? `About a bounce for ${model.name}.`
          : `${S.strideWords(n)} for ${model.name}, ${Math.abs(off) < 0.16 ? 'and a true one'
            : `${(Math.abs(off)).toFixed(1)}m ${off > 0 ? 'long' : 'short'}`}.`
      ]));
      out.appendChild(h('p', { class: 'lede' }, [`A true ${S.strideWords(n)} would be ${trueM.toFixed(1)}m.`]));
    }
    pad.appendChild(fieldRow('I measured', h('div', { class: 'grid2' }, [input, unit])));
    pad.appendChild(out);
    recalc();

    /* the stride table */
    pad.appendChild(h('h2', {}, [`True distances for ${model.name}`]));
    pad.appendChild(h('p', { class: 'lede' }, [
      `Striding ${model.strideM}m. A distance for n strides is (n + 1) stride lengths, `
      + 'because she lands about half a stride out and takes off about half a stride before.'
    ]));
    pad.appendChild(h('table', { class: 'legtable' }, [
      h('thead', {}, [h('tr', {}, [
        h('th', {}, ['Strides']), h('th', {}, ['Metres']), h('th', {}, ['Feet']), h('th', {}, ['Paces'])
      ])]),
      h('tbody', {}, [0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => {
        const mm = S.measurement(S.trueDistance(model, n), store.db.settings.paceM);
        return h('tr', {}, [
          h('td', {}, [n === 0 ? 'bounce' : String(n)]),
          h('td', { class: 'num' }, [mm.metresText]),
          h('td', { class: 'num' }, [mm.feetText]),
          h('td', { class: 'num' }, [mm.pacesText])
        ]);
      }))
    ]));

    /* pole work */
    const spacing = root.BCB_POLE_SPACING[horse ? (horse.typeId || 'pony-large') : 'pony-large']
      || root.BCB_POLE_SPACING['pony-large'];
    pad.appendChild(h('h2', {}, ['Pole work']));
    pad.appendChild(h('table', { class: 'legtable' }, [
      h('tbody', {}, [
        poleRow('Walk poles', spacing.walkM),
        poleRow('Trot poles', spacing.trotM),
        poleRow('Canter poles', spacing.canterM),
        poleRow('Bounce', S.strideModel(horse) && root.bcbBounceRange(model.strideM)),
        poleRow('Placing pole, trotting in', root.BCB_PLACING_POLE.trotM),
        poleRow('Placing pole, cantering in', root.BCB_PLACING_POLE.canterM)
      ])
    ]));
    pad.appendChild(h('p', { class: 'lede' }, [root.BCB_POLE_SPACING.note]));

    /* class heights */
    pad.appendChild(h('h2', {}, ['Class heights']));
    for (const group of root.bcbLevelGroups()) {
      pad.appendChild(h('h3', { style: 'margin-top:14px' }, [group.name]));
      pad.appendChild(h('table', { class: 'legtable' }, [
        h('thead', {}, [h('tr', {}, [
          h('th', {}, ['Class']), h('th', {}, ['Height']), h('th', {}, ['Spread']), h('th', {}, ['Speed'])
        ])]),
        h('tbody', {}, group.levels.map(level => h('tr', {}, [
          h('td', {}, [level.name]),
          h('td', { class: 'num' }, [
            `${(level.heightCm / 100).toFixed(2)}m`
            + (level.maxHeightCm !== level.heightCm ? `–${(level.maxHeightCm / 100).toFixed(2)}` : '')
          ]),
          h('td', { class: 'num' }, [level.spreadCm ? `${(level.spreadCm / 100).toFixed(2)}m` : '—']),
          h('td', { class: 'num' }, [`${level.speedMpm}`])
        ])))
      ]));
    }

    /* where the numbers came from */
    pad.appendChild(h('h2', {}, ['Where these numbers come from']));
    pad.appendChild(h('div', { class: 'banner' }, [
      h('div', {}, [
        h('b', {}, ['Check your schedule before you trust a height. ']),
        'The machine that built this app could not reach the British Showjumping or '
        + 'Pony Club websites, so no rulebook was read directly. Class heights are well '
        + 'corroborated from other sources. The spreads are our own estimates, and the '
        + 'speeds and arena minimums are not confirmed.'
      ])
    ]));
    pad.appendChild(h('h3', { style: 'margin-top:14px' }, ['Not established']));
    pad.appendChild(h('ul', { class: 'lede' }, root.BCB_UNVERIFIED.map(t => h('li', {}, [t]))));
    pad.appendChild(h('h3', { style: 'margin-top:14px' }, ['Sources']));
    const srcList = h('div', { class: 'rowlist' });
    for (const id of Object.keys(root.BCB_SOURCES)) {
      const src = root.BCB_SOURCES[id];
      srcList.appendChild(h('div', { class: 'card', style: 'padding:9px 11px' }, [
        h('div', { style: 'display:flex;gap:7px;align-items:baseline' }, [
          h('span', { class: 'pill pill--' + confidencePill(src.confidence) }, [src.confidence]),
          h('b', { style: 'flex:1;font-size:14px' }, [src.what])
        ]),
        h('div', { class: 'row__sub' }, [`${src.body} · ${src.where}`]),
        src.url ? h('a', { href: src.url, rel: 'noreferrer noopener', target: '_blank',
          class: 'row__sub' }, [src.url]) : null
      ]));
    }
    pad.appendChild(srcList);
    el.view.appendChild(pad);
  }

  function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

  function confidencePill(c) {
    return { official: 'ok', pdf: 'ok', secondary: 'note', community: 'warn', estimate: 'error' }[c] || 'note';
  }

  function poleRow(label, range) {
    if (!range) return null;
    return h('tr', {}, [
      h('td', {}, [label]),
      h('td', { class: 'num' }, [`${range[0].toFixed(2)} – ${range[1].toFixed(2)}m`])
    ]);
  }

  /* ---- screen: settings -------------------------------------------------- */
  function screenSettings() {
    renderTabs('settings');
    setChrome({ title: 'Settings' });
    const pad = h('div', { class: 'pad stack' });
    const settings = store.db.settings;

    if (!store.persistent) {
      pad.appendChild(h('div', { class: 'banner' }, [
        h('div', {}, [h('b', {}, ['Not saving on this device. ']),
          'Your courses will go when you close the tab. Save them as files instead.'])
      ]));
    }
    if (!isInstalled()) {
      pad.appendChild(h('div', { class: 'banner banner--info' }, [
        h('div', {}, [h('b', {}, ['Add this to your home screen. ']),
          'Tap the share button in Safari, then "Add to Home Screen". It then works with '
          + 'no signal, and — the real reason — Safari stops clearing saved courses after '
          + 'a week of not being opened.'])
      ]));
    }

    pad.appendChild(h('h2', {}, ['How distances are shown']));
    pad.appendChild(fieldRow('Your walking pace', stepper({
      value: settings.paceM, min: 0.6, max: 1.2, step: 0.05, label: 'pace',
      format: v => `${v.toFixed(2)}m`,
      onChange: v => store.setSettings({ paceM: v })
    }), 'Pace out ten metres, count your steps, and divide. Worth doing once — it makes '
      + 'the "paces" numbers actually yours.'));

    pad.appendChild(toggle('Show feet as well as metres', settings.showFeet,
      v => store.setSettings({ showFeet: v })));
    pad.appendChild(toggle('Show walking paces', settings.showPaces,
      v => store.setSettings({ showPaces: v })));

    pad.appendChild(h('h2', {}, ['My jumps']));
    pad.appendChild(h('p', { class: 'lede' }, [
      'What you actually own. The app tells you when a course needs more than this — '
      + 'no other planner does, and it is the difference between a course you can build '
      + 'and one you can only look at.'
    ]));
    pad.appendChild(toggle('Warn me when I have not got enough kit', settings.trackKit,
      v => store.setSettings({ trackKit: v })));
    const kitGrid = h('div', { class: 'stack' });
    const KIT = [
      ['wings', 'Pairs of wings or standards'],
      ['poles', 'Poles'],
      ['fillers', 'Fillers'],
      ['walls', 'Walls'],
      ['planks', 'Sets of planks'],
      ['gates', 'Gates'],
      ['trays', 'Water trays']
    ];
    for (const [key, label] of KIT) {
      kitGrid.appendChild(fieldRow(label, stepper({
        value: settings.kit[key] || 0, min: 0, max: 99, step: 1, label,
        format: v => String(v),
        onChange: v => store.setKit({ [key]: v })
      })));
    }
    pad.appendChild(kitGrid);

    pad.appendChild(h('h2', {}, ['Look']));
    pad.appendChild(fieldRow('Theme', segmented([
      { id: 'auto', label: 'Auto' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }
    ], settings.theme, id => { store.setSettings({ theme: id }); applyTheme(); route(); })));

    pad.appendChild(h('h2', {}, ['Keeping your courses safe']));
    pad.appendChild(h('div', { class: 'grid2' }, [
      h('button', {
        class: 'iconbtn iconbtn--primary', type: 'button',
        onclick: () => {
          Share.downloadJson(store.exportJson(),
            `bees-course-builder-${new Date().toISOString().slice(0, 10)}.json`);
          toast('Saved a backup');
        }
      }, ['Save a backup']),
      h('button', { class: 'iconbtn', type: 'button', onclick: importSheet }, ['Load a backup'])
    ]));

    pad.appendChild(h('h2', {}, ['About']));
    pad.appendChild(h('p', { class: 'lede' }, [
      "Bee's Course Builder works entirely on your phone. Nothing is uploaded, there is "
      + 'no account, and it works with no signal once you have added it to your home screen.'
    ]));
    pad.appendChild(h('p', { class: 'lede' }, [
      `${store.db.courses.length} courses, ${store.db.horses.length} horses. `
      + (store.db.savedAt ? `Last saved ${niceDate(store.db.savedAt)}.` : '')
    ]));
    el.view.appendChild(pad);
  }

  function toggle(label, value, onChange) {
    const input = h('input', { type: 'checkbox', checked: !!value });
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'check' }, [input, h('span', {}, [label])]);
  }

  function importSheet() {
    const file = h('input', { type: 'file', accept: 'application/json,.json' });
    const area = h('textarea', { placeholder: 'Or paste the contents of a backup file here', rows: 5 });
    file.addEventListener('change', async () => {
      if (!file.files || !file.files[0]) return;
      try {
        const text = await Share.readFile(file.files[0]);
        finish(text);
      } catch (e) { toast(e.message); }
    });
    function finish(text) {
      try {
        const result = store.importJson(text, 'merge');
        U.closeModal();
        toast(`Loaded ${result.courses} courses and ${result.horses} horses`);
        route();
      } catch (e) {
        toast('That does not look like a backup from this app.');
      }
    }
    modal({
      title: 'Load a backup',
      description: 'Anything new is added; nothing already here is overwritten.',
      body: h('div', { class: 'stack' }, [file, area]),
      buttons: [
        { label: 'Cancel' },
        { label: 'Load', style: 'primary', onClick: () => {
          if (area.value.trim()) { finish(area.value); return true; }
        } }
      ]
    });
  }

  /* ---- screen: a course arriving by link -------------------------------- */
  function screenOpenLink(hash) {
    renderTabs(null);
    setChrome({ back: '#/courses', title: 'A shared course' });
    const pad = h('div', { class: 'pad stack' });
    pad.appendChild(h('p', { class: 'lede' }, ['Reading the link…']));
    el.view.appendChild(pad);

    Share.hashToCourse(hash).then(incoming => {
      clear(pad);
      const course = Store.repairCourse(Object.assign(C.newCourse(), incoming));
      const horse = store.activeHorse();
      const check = C.checkCourse(course, horse, store.db.settings);
      pad.appendChild(h('h1', {}, [course.name || 'A shared course']));
      pad.appendChild(h('p', { class: 'lede' }, [
        `${check.summary.efforts} jumping efforts in a ${course.arena.widthM}x${course.arena.lengthM}m `
        + `arena. Checked here against ${check.summary.horseName}.`
      ]));
      const holder = h('div', { class: 'card', style: 'padding:6px' });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.width = '100%';
      svg.style.height = '380px';
      holder.appendChild(svg);
      pad.appendChild(holder);
      Render.createRenderer(svg).draw({
        course, check, horse, settings: store.db.settings, dark: isDark(), ui: {}
      });
      pad.appendChild(h('div', { class: 'grid2' }, [
        h('button', { class: 'iconbtn iconbtn--primary', type: 'button', onclick: () => {
          course.id = C.id('course');
          course.horseId = horse ? horse.id : null;
          store.saveCourse(course);
          history.replaceState(null, '', location.pathname);
          navigate(`#/course/${course.id}`);
          toast('Saved to your courses');
        } }, ['Save it to my courses']),
        h('button', { class: 'iconbtn', type: 'button', onclick: () => navigate('#/courses') }, ['No thanks'])
      ]));
    }).catch(err => {
      clear(pad);
      pad.appendChild(h('div', { class: 'banner' }, [h('div', {}, [err.message || 'That link could not be read.'])]));
      pad.appendChild(h('button', { class: 'iconbtn', type: 'button', onclick: () => navigate('#/courses') }, ['Back to my courses']));
    });
  }

  /* ---- the printable course sheet -------------------------------------- */
  function buildSheet(course, check, horse) {
    clear(el.sheet);
    /* A wide arena reads better across the page than beside the tables. */
    el.sheet.setAttribute('data-arena',
      course.arena.widthM / course.arena.lengthM > 1.3 ? 'wide' : 'tall');
    const level = root.bcbLevel(course.levelId);
    const s = check.summary;
    const settings = store.db.settings;

    el.sheet.appendChild(h('div', { class: 'sheet__head' }, [
      h('div', {}, [
        h('div', { class: 'sheet__title' }, [course.name || 'Course']),
        h('div', { class: 'sheet__sub' }, [
          `${level ? level.name : 'No class set'} · ${course.arena.widthM} x ${course.arena.lengthM}m`
          + ` · ${horse ? horse.name : 'no horse'} striding ${s.strideM}m`
        ])
      ]),
      h('div', { class: 'sheet__facts' }, [
        h('div', {}, [h('b', {}, [`${s.obstacles}`]), ' obstacles, ', h('b', {}, [`${s.efforts}`]), ' efforts']),
        h('div', {}, [h('b', {}, [`${s.lengthM}m`]), ` at ${check.timing.speedMpm} m/min`]),
        h('div', {}, ['Time allowed ', h('b', {}, [check.timing.text]), `, limit ${check.timing.limitText}`]),
        h('div', {}, [new Date().toLocaleDateString('en-GB')])
      ])
    ]));

    /* The plan, drawn fresh at the full arena so the on-screen zoom does not leak
       into the printout.

       It is sized in millimetres to fit a fixed box rather than given the whole
       page width. A 20x60m school is three times as long as it is wide, so at
       176mm across it would be over 400mm tall — off the bottom of an A4 page,
       taking the tables with it. So the diagram gets a column of its own and the
       tables sit beside it. */
    const surround = 4;
    const aspect = (course.arena.widthM + surround * 2) / (course.arena.lengthM + surround * 2);
    const boxW = 58, boxH = 150;                       /* millimetres */
    const fit = Math.min(boxW / aspect, boxH);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', `${(fit * aspect).toFixed(1)}mm`);
    svg.setAttribute('height', `${fit.toFixed(1)}mm`);

    const plan = h('div', { class: 'sheet__diagram' }, [svg]);
    const tables = h('div', { class: 'sheet__tables' });
    el.sheet.appendChild(h('div', { class: 'sheet__body' }, [plan, tables]));

    /* light theme on paper, whatever the screen is doing */
    Render.createRenderer(svg).draw({
      course, check, horse, settings, dark: false, showGrid: true,
      showArenaSize: true, paperSurround: true, ui: {}
    });

    tables.appendChild(h('h2', {}, ['The fences']));
    tables.appendChild(h('table', {}, [
      h('thead', {}, [h('tr', {}, [
        h('th', {}, ['No.']), h('th', {}, ['Fence']), h('th', {}, ['Height']),
        h('th', {}, ['Spread']), h('th', {}, ['Filler'])
      ])]),
      h('tbody', {}, check.efforts.flatMap(group => group.elements.map(e => {
        const spec = root.bcbJump(e.type);
        return h('tr', {}, [
          h('td', { class: 'num' }, [`${group.number}${e.element || ''}`]),
          h('td', {}, [spec ? spec.name : 'Fence']),
          h('td', { class: 'num' }, [e.heightCm ? `${(e.heightCm / 100).toFixed(2)}m` : '—']),
          h('td', { class: 'num' }, [e.spreadCm ? `${(e.spreadCm / 100).toFixed(2)}m` : '—']),
          h('td', {}, [e.filler && e.filler !== 'none' ? fillerName(e.filler) : ''])
        ]);
      })))
    ]));

    if (check.legs.length) {
      tables.appendChild(h('h2', {}, ['The distances']));
      tables.appendChild(h('table', {}, [
        h('thead', {}, [h('tr', {}, [
          h('th', {}, ['Leg']), h('th', {}, ['Metres']), h('th', {}, ['Feet']),
          h('th', {}, ['Paces']), h('th', {}, ['Strides']), h('th', {}, ['How it rides'])
        ])]),
        h('tbody', {}, check.legs.map(leg => h('tr', {}, [
          h('td', { class: 'num' }, [`${leg.fromLabel} → ${leg.toLabel}`]),
          h('td', { class: 'num' }, [leg.measured.metresText]),
          h('td', { class: 'num' }, [leg.measured.feetText]),
          h('td', { class: 'num' }, [leg.measured.pacesText]),
          h('td', { class: 'num' }, [leg.strides == null ? '—' : String(leg.strides)]),
          h('td', { class: `verdict-${leg.severity}` }, [leg.verdict.replace(/-/g, ' ')])
        ])))
      ]));
    }

    const needed = Object.keys(check.kit.needed).filter(k => check.kit.needed[k] > 0);
    if (needed.length) {
      tables.appendChild(h('h2', {}, ['What to carry out']));
      tables.appendChild(h('p', {}, [
        needed.map(k => `${check.kit.needed[k]} ${C.kitLabel(k, check.kit.needed[k])}`).join(', ') + '.'
      ]));
    }

    if (check.issues.length) {
      tables.appendChild(h('h2', {}, ['Worth checking']));
      tables.appendChild(h('ul', {}, check.issues.map(i => h('li', {}, [i.message]))));
    }

    el.sheet.appendChild(h('div', { class: 'sheet__notes' }, [
      h('b', {}, ['Notes: ']), course.notes || ''
    ]));
    el.sheet.appendChild(h('div', { class: 'sheet__foot' }, [
      'Distances worked out for a ' + s.strideM + 'm stride, measured back rail to front '
      + 'rail along the track. Walk them and check before you jump. Your class schedule '
      + 'and the current rulebook are the authority on heights and speeds, not this sheet. '
      + "Made with Bee's Course Builder."
    ]));
  }

  function fillerName(id) {
    const f = root.BCB_FILLERS.find(x => x.id === id);
    return f ? f.name : id;
  }

  /* ---- boot ------------------------------------------------------------- */
  function isDark() {
    const theme = store.db.settings.theme;
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyTheme() {
    const theme = store.db.settings.theme;
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }

  function isInstalled() {
    return window.navigator.standalone === true
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  function warnings(pad) {
    const note = store.loadNote;
    if (note) {
      pad.appendChild(h('div', { class: 'banner' }, [h('div', {}, [note.message])]));
    }
    if (!store.persistent) {
      pad.appendChild(h('div', { class: 'banner' }, [
        h('div', {}, [h('b', {}, ['Not saving on this device. ']),
          'Anything you make will go when you close the tab.'])
      ]));
    }
    if (store.quotaFull) {
      pad.appendChild(h('div', { class: 'banner' }, [
        h('div', {}, ['There is no room left to save. Delete an old course, or save a backup and remove some.'])
      ]));
    }
  }

  function boot() {
    applyTheme();
    Store.seed(store);
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', () => { if (store.db.settings.theme === 'auto') route(); });
    }
    window.addEventListener('hashchange', route);
    if (!location.hash) location.hash = '#/courses';
    route();

    if ('serviceWorker' in navigator) {
      /* Only reload when she has actually asked for the new version. The worker
         also claims the page the very first time the app is opened, and reloading
         on that would throw away whatever she was in the middle of doing. */
      let updateAsked = false;
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
          .then(reg => {
            reg.addEventListener('updatefound', () => {
              const waiting = reg.installing || reg.waiting;
              if (!waiting) return;
              waiting.addEventListener('statechange', () => {
                if (waiting.state === 'installed' && navigator.serviceWorker.controller) {
                  toast('A new version is ready', {
                    actionLabel: 'Reload',
                    onAction: () => {
                      updateAsked = true;
                      waiting.postMessage({ type: 'SKIP_WAITING' });
                    },
                    ms: 20000
                  });
                }
              });
            });
          })
          .catch(() => { /* the app works perfectly well without it */ });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (updateAsked) location.reload();
        });
        /* An installed app can sit unopened for weeks, so look for a new version
           whenever she comes back to it. */
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          navigator.serviceWorker.getRegistration().then(reg => reg && reg.update()).catch(() => {});
        });
      });
    }

    /* Expose a little for the tests, and only when asked for. */
    if (location.search.indexOf('test=1') >= 0) {
      window.__bcb = {
        store,
        state: () => JSON.parse(JSON.stringify(store.db)),
        check: courseId => C.checkCourse(store.course(courseId), store.horseForCourse(store.course(courseId)), store.db.settings),
        toClient: (xM, yM) => {
          const svg = document.getElementById('arena');
          const ctm = svg.getScreenCTM();
          const pt = svg.createSVGPoint();
          pt.x = xM; pt.y = yM;
          const p = pt.matrixTransform(ctm);
          return { x: p.x, y: p.y };
        },
        route
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
