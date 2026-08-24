/* Bee's Course Builder — where everything is kept.

   One store holds the whole app: her horses, her courses, her kit list and her
   settings. Anything that changes goes through `update()`, which saves and then
   tells the screen to redraw. That way the drawing can never disagree with the
   distances printed beside it.

   Saved in localStorage. A web app added to the iPhone home screen is exempt
   from Safari's habit of clearing storage after a week of not being used, which
   is the honest reason the app nags her to install it — but there is a rolling
   backup key and a JSON export as well, because losing her courses would be
   unforgivable. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./course.js') : root,
    typeof require === 'function' ? require('../data/arenas.js') : root,
    typeof require === 'function' ? require('../data/levels.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (courseMod, arenaMod, levelMod) {
  const C = courseMod.bcbCourse;

  const KEY = 'bcb.db.v1';
  const BACKUP_KEY = 'bcb.db.backup.v1';
  const UI_KEY = 'bcb.ui.v1';
  const SCHEMA = 1;

  /* ---- Storage that cannot break the app ----------------------------------- */
  function probeStorage() {
    try {
      const k = '__bcb_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return localStorage;
    } catch (e) {
      return null;
    }
  }

  function memoryStore() {
    const m = new Map();
    return {
      getItem: k => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: k => m.delete(k)
    };
  }

  function blankDb() {
    const arena = arenaMod.bcbArena(arenaMod.BCB_DEFAULT_ARENA);
    return {
      schemaVersion: SCHEMA,
      app: 'bees-course-builder',
      savedAt: null,
      settings: {
        paceM: 0.90,
        showFeet: true,
        showPaces: true,
        trackKit: true,
        theme: 'auto',
        defaultArena: { widthM: arena.widthM, lengthM: arena.lengthM, name: arena.name, indoor: arena.indoor },
        defaultLevelId: levelMod.BCB_DEFAULT_LEVEL,
        activeHorseId: null,
        snapM: 0.25,
        snapDeg: 5,
        /* A modest home setup, and enough to build the example course. She should
           change these to what is actually in her field — that is the point of
           the kit list. */
        kit: { wings: 8, poles: 16, walls: 1, planks: 1, gates: 1, trays: 0, fillers: 4 }
      },
      horses: [],
      courses: []
    };
  }

  /* Bring an older save up to date. If we ever meet data written by a NEWER
     version of the app than this one, we refuse rather than write over it —
     that is how a cached old copy of a web app eats somebody's work. */
  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return { db: blankDb(), fresh: true };
    if (raw.schemaVersion > SCHEMA) {
      return { db: raw, refused: true, note: 'These courses were saved by a newer version of the app.' };
    }
    const db = Object.assign(blankDb(), raw);
    db.settings = Object.assign(blankDb().settings, raw.settings || {});
    db.settings.kit = Object.assign(blankDb().settings.kit, (raw.settings && raw.settings.kit) || {});
    db.horses = (Array.isArray(raw.horses) ? raw.horses : []).map(repairHorse).filter(Boolean);
    db.courses = Array.isArray(raw.courses) ? raw.courses.map(repairCourse).filter(Boolean) : [];
    db.schemaVersion = SCHEMA;
    return { db, refused: false };
  }

  /* Photos arriving in a backup are checked rather than trusted: anything that is
     not plainly an image data URI is dropped, and anything oversized goes too,
     because one big blob in a shared file could fill the whole storage budget. */
  const MAX_PHOTO_CHARS = 400 * 1024;
  function repairHorse(h) {
    if (!h || typeof h !== 'object') return null;
    const horse = Object.assign(C.newHorse(), h);
    const photo = horse.photo;
    const ok = typeof photo === 'string'
      && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)
      && photo.length <= MAX_PHOTO_CHARS;
    horse.photo = ok ? photo : null;
    return horse;
  }

  /* A course from a file or a shared link must never be able to break the app,
     so anything odd is repaired rather than thrown. */
  function repairCourse(c) {
    if (!c || typeof c !== 'object') return null;
    const base = C.newCourse();
    const out = Object.assign(base, c);
    out.arena = Object.assign(base.arena, c.arena || {});
    out.arena.widthM = clampNum(out.arena.widthM, 5, 150, 20);
    out.arena.lengthM = clampNum(out.arena.lengthM, 5, 200, 60);
    out.jumps = (Array.isArray(c.jumps) ? c.jumps : []).slice(0, 200).map(j => {
      const jump = Object.assign(C.newJump(), j);
      /* A course from a file or a link might name a fence we do not have. Draw it
         as a plain upright rather than leaving a hole in the arena. */
      if (!jumpKnown(jump.type)) jump.type = 'vertical';
      jump.xM = clampNum(jump.xM, -5, out.arena.widthM + 5, out.arena.widthM / 2);
      jump.yM = clampNum(jump.yM, -5, out.arena.lengthM + 5, out.arena.lengthM / 2);
      jump.rotationDeg = ((Math.round(clampNum(jump.rotationDeg, -3600, 3600, 0)) % 360) + 360) % 360;
      jump.heightCm = clampNum(jump.heightCm, 0, 200, 70);
      jump.spreadCm = clampNum(jump.spreadCm, 0, 500, 0);
      jump.widthM = clampNum(jump.widthM, 0.5, 8, 3);
      if (jump.number != null) jump.number = Math.round(clampNum(jump.number, 1, 99, 1));
      return jump;
    });
    out.route = Object.assign({ mode: 'auto', points: [], startLine: null, finishLine: null }, c.route || {});
    if (!Array.isArray(out.route.points)) out.route.points = [];
    return out;
  }

  function jumpKnown(type) {
    const jumps = (typeof require === 'function')
      ? require('../data/jumps.js') : { bcbJump: (typeof globalThis !== 'undefined' ? globalThis : this).bcbJump };
    return !!(jumps.bcbJump && jumps.bcbJump(type));
  }

  function clampNum(n, lo, hi, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /* ---- The store ----------------------------------------------------------- */
  function createStore(options) {
    const opts = options || {};
    const raw = opts.storage !== undefined ? opts.storage : probeStorage();
    const storage = raw || memoryStore();
    const persistent = !!raw;

    let db;
    let loadNote = null;
    try {
      const text = storage.getItem(KEY);
      const result = migrate(text ? JSON.parse(text) : null);
      db = result.db;
      if (result.refused) loadNote = { kind: 'refused', message: result.note };
      else if (text) storage.setItem(BACKUP_KEY, text);
      db.readOnly = !!result.refused;
    } catch (e) {
      /* The main save is unreadable — try the backup before giving up. */
      db = null;
      try {
        const backup = storage.getItem(BACKUP_KEY);
        if (backup) {
          db = migrate(JSON.parse(backup)).db;
          loadNote = { kind: 'recovered', message: 'The last save was damaged, so the previous one was used.' };
        }
      } catch (e2) { /* fall through */ }
      if (!db) {
        db = blankDb();
        loadNote = { kind: 'reset', message: 'The saved courses could not be read, so we have started fresh.' };
      }
    }

    let ui = {};
    try { ui = JSON.parse(storage.getItem(UI_KEY) || '{}') || {}; } catch (e) { ui = {}; }

    const listeners = new Set();
    let saveTimer = null;
    let quotaFull = false;
    const history = [];
    const future = [];

    function notify(reason) {
      for (const fn of listeners) {
        try { fn(db, reason); } catch (e) { console.error('listener failed', e); }
      }
    }

    function saveNow() {
      if (db.readOnly) return;
      try {
        db.savedAt = C.nowIso();
        const payload = Object.assign({}, db);
        delete payload.readOnly;
        storage.setItem(KEY, JSON.stringify(payload));
        quotaFull = false;
      } catch (e) {
        quotaFull = true;
        notify('quota');
      }
    }

    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, 300);
    }

    /* Everything that changes anything goes through here. */
    function update(fn, opt) {
      const o = opt || {};
      if (o.undoable !== false) pushHistory();
      const out = fn(db);
      if (out) db = out;
      scheduleSave();
      notify(o.reason || 'update');
      return db;
    }

    function pushHistory() {
      try {
        history.push(JSON.stringify({ horses: db.horses, courses: db.courses }));
        if (history.length > 40) history.shift();
        future.length = 0;
      } catch (e) { /* not worth failing an edit over */ }
    }

    function undo() {
      if (!history.length) return false;
      try {
        future.push(JSON.stringify({ horses: db.horses, courses: db.courses }));
        const prev = JSON.parse(history.pop());
        db.horses = prev.horses; db.courses = prev.courses;
        scheduleSave(); notify('undo');
        return true;
      } catch (e) { return false; }
    }

    function redo() {
      if (!future.length) return false;
      try {
        history.push(JSON.stringify({ horses: db.horses, courses: db.courses }));
        const next = JSON.parse(future.pop());
        db.horses = next.horses; db.courses = next.courses;
        scheduleSave(); notify('redo');
        return true;
      } catch (e) { return false; }
    }

    function setUi(patch) {
      Object.assign(ui, patch);
      try { storage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* never important */ }
    }

    return {
      get db() { return db; },
      get ui() { return ui; },
      get persistent() { return persistent; },
      get quotaFull() { return quotaFull; },
      get loadNote() { return loadNote; },
      get canUndo() { return history.length > 0; },
      get canRedo() { return future.length > 0; },
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      notify, update, undo, redo, saveNow, setUi,

      /* -- finding things -- */
      course(id) { return db.courses.find(c => c.id === id) || null; },
      horse(id) { return db.horses.find(h => h.id === id) || null; },
      activeHorse() {
        return this.horse(db.settings.activeHorseId) || db.horses[0] || null;
      },
      horseForCourse(course) {
        return (course && this.horse(course.horseId)) || this.activeHorse();
      },

      /* -- changing things -- */
      addCourse(over) {
        const settings = db.settings;
        const course = C.newCourse(Object.assign({
          arena: Object.assign({}, settings.defaultArena),
          levelId: settings.defaultLevelId,
          horseId: settings.activeHorseId
        }, over || {}));
        update(d => { d.courses.unshift(course); });
        return course;
      },
      saveCourse(course) {
        update(d => {
          course.updatedAt = C.nowIso();
          const i = d.courses.findIndex(c => c.id === course.id);
          if (i >= 0) d.courses[i] = course; else d.courses.unshift(course);
        });
        return course;
      },
      touchCourse(course, opt) {
        update(d => {
          course.updatedAt = C.nowIso();
          const i = d.courses.findIndex(c => c.id === course.id);
          if (i >= 0) d.courses[i] = course;
        }, opt);
      },
      deleteCourse(id) { update(d => { d.courses = d.courses.filter(c => c.id !== id); }); },
      duplicateCourse(id) {
        const src = this.course(id);
        if (!src) return null;
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = C.id('course');
        copy.name = `${src.name || 'Course'} (copy)`;
        copy.createdAt = copy.updatedAt = C.nowIso();
        copy.jumps = copy.jumps.map(j => Object.assign({}, j, { id: C.id('jump') }));
        update(d => { d.courses.unshift(copy); });
        return copy;
      },
      addHorse(over) {
        const horse = C.newHorse(over);
        update(d => {
          d.horses.push(horse);
          if (!d.settings.activeHorseId) d.settings.activeHorseId = horse.id;
        });
        return horse;
      },
      saveHorse(horse) {
        update(d => {
          const i = d.horses.findIndex(h => h.id === horse.id);
          if (i >= 0) d.horses[i] = horse; else d.horses.push(horse);
        });
        return horse;
      },
      deleteHorse(id) {
        update(d => {
          d.horses = d.horses.filter(h => h.id !== id);
          if (d.settings.activeHorseId === id) {
            d.settings.activeHorseId = d.horses.length ? d.horses[0].id : null;
          }
        });
      },
      setSettings(patch) { update(d => { Object.assign(d.settings, patch); }, { undoable: false }); },
      setKit(patch) { update(d => { Object.assign(d.settings.kit, patch); }, { undoable: false }); },

      /* -- backup -- */
      exportJson() {
        return JSON.stringify({
          app: 'bees-course-builder', schemaVersion: SCHEMA,
          exported: C.nowIso(),
          settings: db.settings, horses: db.horses, courses: db.courses
        }, null, 2);
      },
      importJson(text, mode) {
        const incoming = JSON.parse(text);
        const clean = migrate(incoming).db;
        update(d => {
          if (mode === 'replace') {
            d.settings = clean.settings; d.horses = clean.horses; d.courses = clean.courses;
          } else {
            const have = new Set(d.courses.map(c => c.id));
            for (const c of clean.courses) if (!have.has(c.id)) d.courses.unshift(c);
            const haveH = new Set(d.horses.map(h => h.id));
            for (const h of clean.horses) if (!haveH.has(h.id)) d.horses.push(h);
          }
        });
        return { courses: clean.courses.length, horses: clean.horses.length };
      }
    };
  }

  /* First run: give her something to look at rather than an empty screen. */
  function seed(store) {
    if (store.db.horses.length || store.db.courses.length) return;
    const pony = store.addHorse({
      name: 'My pony', typeId: 'pony-large', heightCm: 148,
      notes: 'Change the name and height to match your own — every distance in the app comes from this.'
    });
    store.setSettings({ activeHorseId: pony.id });

    /* A real PC80 round: down the left, round the bottom, back up the right
       through a double. The positions are chosen so every distance comes out
       true for a 14.2hh pony's 3.2m stride, so she can see what the app is for
       before changing anything. */
    const course = store.addCourse({
      name: 'First course', levelId: 'pc80', horseId: pony.id,
      notes: 'Every distance here is a true one for a 14.2hh pony. Drag a fence and '
        + 'watch the distances change.'
    });
    const put = (over) => C.newJump(over);
    course.jumps = [
      put({ type: 'crosspoles', xM: 4.5, yM: 14.0, heightCm: 60, number: 1 }),
      put({ type: 'vertical', xM: 4.5, yM: 30.0, heightCm: 75, number: 2 }),
      put({ type: 'planks', xM: 4.5, yM: 42.8, heightCm: 75, number: 3 }),
      put({ type: 'oxer-ascending', xM: 14, yM: 50.8, rotationDeg: 180, heightCm: 75, spreadCm: 80, number: 4 }),
      put({ type: 'vertical', xM: 14, yM: 34.8, rotationDeg: 180, heightCm: 75, number: 5, element: 'A' }),
      put({ type: 'vertical', xM: 14, yM: 28.4, rotationDeg: 180, heightCm: 75, number: 5, element: 'B' }),
      put({ type: 'wall', xM: 14, yM: 15.6, rotationDeg: 180, heightCm: 75, spreadCm: 30, number: 6 })
    ];
    store.saveCourse(course);

    /* Pole work, for schooling at home. Trot poles at 1.05m suit a large pony;
       the placing pole meets the cross pole on a good stride. */
    const grid = store.addCourse({
      name: 'Trotting poles and a cross', levelId: 'crosspoles', horseId: pony.id,
      notes: 'Trot poles about 1.05m apart for a 14.2hh pony. Shorten them if she feels cramped.'
    });
    grid.jumps = [
      put({ type: 'ground-pole', xM: 10, yM: 20.0 }),
      put({ type: 'ground-pole', xM: 10, yM: 21.05 }),
      put({ type: 'ground-pole', xM: 10, yM: 22.1 }),
      put({ type: 'ground-pole', xM: 10, yM: 23.15 }),
      put({ type: 'placing-pole', xM: 10, yM: 27.0 }),
      put({ type: 'crosspoles', xM: 10, yM: 29.3, heightCm: 45, number: 1 })
    ];
    store.saveCourse(grid);
  }

  return {
    bcbStore: { createStore, blankDb, migrate, repairCourse, repairHorse, seed,
      KEY, BACKUP_KEY, UI_KEY, SCHEMA, MAX_PHOTO_CHARS }
  };
});
