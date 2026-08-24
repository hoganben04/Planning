/* Bea's Course Builder — moving things about with a thumb.

   All input goes through Pointer Events, which is one code path for a finger, an
   Apple Pencil and a mouse. Two rules keep it feeling right on a phone:

   1. Every "feel" measurement — how big a grab area is, how far you must move
      before it counts as a drag, how close a snap magnet reaches — is written in
      screen pixels and divided by the current zoom. So a gesture behaves the same
      whether the whole arena is on screen or she has zoomed into one corner.

   2. While a drag is in flight the fence's transform is written straight onto the
      SVG node and nothing is saved. Only on lifting off does the change go into
      the store. That keeps dragging smooth, and it means a second finger landing
      mid-drag can roll the fence back to where it started instead of smearing it
      across the arena. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./geometry.js') : root,
    typeof require === 'function' ? require('./strides.js') : root,
    typeof require === 'function' ? require('./route.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (geomMod, strideMod, routeMod) {
  const G = geomMod.bcbGeom;
  const S = strideMod.bcbStrides;
  const R = routeMod.bcbRoute;

  const DRAG_PX = 8;            /* move this far before it counts as a drag */
  const SNAP_PX = 14;           /* how far a snap magnet reaches, on screen */
  const MIN_ZOOM = 0.4;
  const MAX_ZOOM = 6;

  function createInteractions(cfg) {
    const svg = cfg.svg;
    const pointers = new Map();
    let drag = null;
    let pinch = null;

    /* ---- screen <-> arena ------------------------------------------------- */
    function toArena(clientX, clientY) {
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const pt = svg.createSVGPoint ? svg.createSVGPoint() : new DOMPoint();
      pt.x = clientX; pt.y = clientY;
      const p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }

    function pxPerMetre() {
      const box = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      if (!vb || !vb.width || !box.width) return 10;
      return Math.min(box.width / vb.width, box.height / vb.height);
    }

    const metresPerPx = () => 1 / Math.max(pxPerMetre(), 0.0001);

    /* ---- what did she touch? --------------------------------------------- */
    function hit(target) {
      if (!target || !target.closest) return { kind: 'empty' };
      const handle = target.closest('[data-handle]');
      if (handle) return { kind: 'handle', handle: handle.getAttribute('data-handle') };
      const jump = target.closest('[data-jump]');
      if (jump) return { kind: 'jump', id: jump.getAttribute('data-jump'), node: jump };
      return { kind: 'empty' };
    }

    /* ---- snapping --------------------------------------------------------- */
    /* Priority matters. A true stride distance from the fence before is worth
       far more to her than lining up with a grid, so it wins. */
    function snap(jump, wanted, state) {
      const reach = SNAP_PX * metresPerPx();
      const arena = state.course.arena;
      const model = S.strideModel(state.horse);
      const guides = [];
      let out = { x: wanted.x, y: wanted.y };
      let tookX = false, tookY = false;
      let chip = null;

      /* 1. a true distance from the fence before or after this one in the round */
      const order = R.jumpingOrder(state.course.jumps || []);
      const index = order.findIndex(j => j.id === jump.id);
      const neighbours = [];
      if (index > 0) neighbours.push(order[index - 1]);
      if (index >= 0 && index < order.length - 1) neighbours.push(order[index + 1]);

      for (const other of neighbours) {
        const from = { x: other.xM, y: other.yM };
        const dir = G.norm(G.sub(out, from));
        if (G.len(dir) < 0.01) continue;
        const moved = Object.assign({}, jump, { xM: out.x, yM: out.y });
        const currentGap = S.measureGap(other, moved).clearM;
        for (const target of S.trueDistanceTargets(model, 6)) {
          const delta = target.clearM - currentGap;
          if (Math.abs(delta) > reach) continue;
          out = G.add(out, G.mul(dir, delta));
          tookX = tookY = true;
          chip = `${target.strides === 0 ? 'bounce' : S.strideWords(target.strides)} · ${target.clearM.toFixed(1)}m`;
          guides.push({ kind: 'line', x1: from.x, y1: from.y, x2: out.x, y2: out.y });
          break;
        }
        if (tookX) break;
      }

      /* 2. the centre line and the quarter lines */
      if (!tookX) {
        for (const x of [arena.widthM / 2, arena.widthM / 4, arena.widthM * 3 / 4]) {
          if (Math.abs(out.x - x) <= reach) {
            out.x = x; tookX = true;
            guides.push({ kind: 'line', x1: x, y1: 0, x2: x, y2: arena.lengthM });
            break;
          }
        }
      }
      if (!tookY) {
        for (const y of [arena.lengthM / 2]) {
          if (Math.abs(out.y - y) <= reach) {
            out.y = y; tookY = true;
            guides.push({ kind: 'line', x1: 0, y1: y, x2: arena.widthM, y2: y });
            break;
          }
        }
      }

      /* 3. failing all that, a quarter-metre grid */
      const step = (state.settings && state.settings.snapM) || 0.25;
      if (!tookX) out.x = Math.round(out.x / step) * step;
      if (!tookY) out.y = Math.round(out.y / step) * step;

      /* Never let a fence be dragged clean out of the arena. */
      out.x = G.clamp(out.x, 0.4, arena.widthM - 0.4);
      out.y = G.clamp(out.y, 0.4, arena.lengthM - 0.4);
      return { x: round2(out.x), y: round2(out.y), guides, chip };
    }

    function snapAngle(deg, state) {
      const step = (state.settings && state.settings.snapDeg) || 5;
      let a = Math.round(deg / step) * step;
      for (const hard of [0, 45, 90, 135, 180, 225, 270, 315, 360]) {
        if (Math.abs(a - hard) <= 3) { a = hard; break; }
      }
      return ((a % 360) + 360) % 360;
    }

    /* ---- live preview, without touching the store ------------------------ */
    function previewJump(id, xM, yM, rotationDeg) {
      const node = svg.querySelector(`[data-jump="${cssEscape(id)}"]`);
      if (!node) return;
      node.setAttribute('transform', `translate(${round3(xM)} ${round3(yM)}) rotate(${round3(rotationDeg)})`);
      /* keep the number bubble upright while the fence turns under it */
      const bubble = node.querySelector('g[transform*="rotate"]');
      if (bubble && bubble !== node) {
        const t = bubble.getAttribute('transform') || '';
        const translate = (t.match(/translate\([^)]*\)/) || ['translate(0 0)'])[0];
        bubble.setAttribute('transform', `${translate} rotate(${round3(-rotationDeg)})`);
      }
    }

    function cssEscape(s) {
      return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
    }

    /* ---- gestures --------------------------------------------------------- */
    function onDown(ev) {
      if (!ev.isPrimary && pointers.size === 0) return;
      const state = cfg.getState();
      if (!state || !state.course) return;

      pointers.set(ev.pointerId, {
        startClient: { x: ev.clientX, y: ev.clientY },
        lastClient: { x: ev.clientX, y: ev.clientY },
        startArena: toArena(ev.clientX, ev.clientY)
      });
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* not fatal */ }

      /* A second finger means she is pinching, so any drag in flight is undone
         rather than left half-finished. */
      if (pointers.size === 2) {
        cancelDrag();
        const [a, b] = [...pointers.values()];
        pinch = {
          startDist: Math.hypot(a.lastClient.x - b.lastClient.x, a.lastClient.y - b.lastClient.y),
          startView: Object.assign({}, currentView(state)),
          centreArena: midArena(a, b)
        };
        return;
      }
      if (pointers.size > 2) return;

      const target = hit(ev.target);
      const pointer = pointers.get(ev.pointerId);

      if (target.kind === 'handle' && target.handle === 'rotate' && state.selectedId) {
        const jump = findJump(state, state.selectedId);
        if (jump) {
          drag = { mode: 'rotate', jump, startRotation: jump.rotationDeg || 0, moved: false };
        }
        ev.preventDefault();
        return;
      }

      if (target.kind === 'jump') {
        const jump = findJump(state, target.id);
        if (!jump) return;
        /* Selecting is told it is inside a gesture, so the editor can hold off
           opening the inspector until she lifts off. Opening a panel mid-drag
           reflows the page and the arena stops tracking her finger. */
        if (state.selectedId !== target.id) cfg.onSelect(target.id, { duringGesture: true });
        if (!jump.locked && state.mode !== 'number') {
          drag = {
            mode: 'move', jump,
            grabOffset: G.sub({ x: jump.xM, y: jump.yM }, pointer.startArena),
            startPos: { x: jump.xM, y: jump.yM }, moved: false
          };
        }
        ev.preventDefault();
        return;
      }

      drag = { mode: 'pan', startView: Object.assign({}, currentView(state)), moved: false };
    }

    function onMove(ev) {
      const pointer = pointers.get(ev.pointerId);
      if (!pointer) return;
      pointer.lastClient = { x: ev.clientX, y: ev.clientY };
      const state = cfg.getState();
      if (!state) return;

      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.lastClient.x - b.lastClient.x, a.lastClient.y - b.lastClient.y);
        if (pinch.startDist > 4) {
          const scale = G.clamp(pinch.startDist / dist, 1 / MAX_ZOOM, 1 / MIN_ZOOM);
          zoomAbout(state, pinch.startView, pinch.centreArena, scale);
        }
        ev.preventDefault();
        return;
      }

      if (!drag) return;
      const travelled = Math.hypot(
        ev.clientX - pointer.startClient.x, ev.clientY - pointer.startClient.y);
      if (!drag.moved && travelled < DRAG_PX) return;
      drag.moved = true;

      if (drag.mode === 'move') {
        const at = toArena(ev.clientX, ev.clientY);
        const wanted = G.add(at, drag.grabOffset);
        const snapped = snap(drag.jump, wanted, state);
        drag.pending = snapped;
        previewJump(drag.jump.id, snapped.x, snapped.y, drag.jump.rotationDeg || 0);
        cfg.onPreview({
          jump: Object.assign({}, drag.jump, { xM: snapped.x, yM: snapped.y }),
          guides: snapped.guides, chip: snapped.chip
        });
      } else if (drag.mode === 'rotate') {
        const at = toArena(ev.clientX, ev.clientY);
        const v = G.sub(at, { x: drag.jump.xM, y: drag.jump.yM });
        /* the grip sticks out on the landing side, which is 90 degrees on from
           the direction the poles lie */
        const angle = snapAngle(G.bearing(v) - 90, state);
        drag.pending = { rotationDeg: angle };
        previewJump(drag.jump.id, drag.jump.xM, drag.jump.yM, angle);
        cfg.onPreview({
          jump: Object.assign({}, drag.jump, { rotationDeg: angle }),
          guides: [], chip: `${Math.round(angle)}°`
        });
      } else if (drag.mode === 'pan') {
        const perPx = metresPerPx();
        const dx = (ev.clientX - pointer.startClient.x) * perPx;
        const dy = (ev.clientY - pointer.startClient.y) * perPx;
        cfg.onView({
          x: drag.startView.x - dx, y: drag.startView.y - dy,
          w: drag.startView.w, h: drag.startView.h
        });
      }
      ev.preventDefault();
    }

    function onUp(ev) {
      const wasDrag = drag;
      pointers.delete(ev.pointerId);
      try { svg.releasePointerCapture(ev.pointerId); } catch (e) { /* fine */ }

      if (pointers.size < 2) pinch = null;
      if (!wasDrag) return;
      drag = null;

      if (!wasDrag.moved) {
        if (wasDrag.mode === 'pan') cfg.onSelect(null);
        else cfg.onGestureEnd && cfg.onGestureEnd();
        return;
      }
      if (wasDrag.mode === 'move' && wasDrag.pending) {
        cfg.onCommit({ id: wasDrag.jump.id, xM: wasDrag.pending.x, yM: wasDrag.pending.y });
        if (cfg.onGestureEnd) cfg.onGestureEnd();
      } else if (wasDrag.mode === 'rotate' && wasDrag.pending) {
        cfg.onCommit({ id: wasDrag.jump.id, rotationDeg: wasDrag.pending.rotationDeg });
        if (cfg.onGestureEnd) cfg.onGestureEnd();
      } else {
        cfg.onPreview(null);
      }
    }

    function onCancel(ev) {
      pointers.delete(ev.pointerId);
      cancelDrag();
      if (pointers.size < 2) pinch = null;
    }

    function cancelDrag() {
      if (!drag) return;
      if (drag.mode === 'move' && drag.jump) {
        previewJump(drag.jump.id, drag.startPos.x, drag.startPos.y, drag.jump.rotationDeg || 0);
      } else if (drag.mode === 'rotate' && drag.jump) {
        previewJump(drag.jump.id, drag.jump.xM, drag.jump.yM, drag.startRotation);
      }
      drag = null;
      cfg.onPreview(null);
    }

    /* ---- zoom and pan ---------------------------------------------------- */
    function currentView(state) {
      if (state.ui && state.ui.view) return state.ui.view;
      const a = state.course.arena, s = 4;
      return { x: -s, y: -s, w: a.widthM + s * 2, h: a.lengthM + s * 2 };
    }

    function zoomAbout(state, fromView, centre, scale) {
      const arena = state.course.arena;
      const fit = arena.widthM + 8;
      const w = G.clamp(fromView.w * scale, fit / MAX_ZOOM, fit / MIN_ZOOM * 2);
      const k = w / fromView.w;
      cfg.onView({
        x: centre.x - (centre.x - fromView.x) * k,
        y: centre.y - (centre.y - fromView.y) * k,
        w, h: fromView.h * k
      });
    }

    function midArena(a, b) {
      return {
        x: (a.startArena.x + b.startArena.x) / 2,
        y: (a.startArena.y + b.startArena.y) / 2
      };
    }

    function findJump(state, id) {
      return (state.course.jumps || []).find(j => j.id === id) || null;
    }

    function onWheel(ev) {
      const state = cfg.getState();
      if (!state) return;
      ev.preventDefault();
      const view = currentView(state);
      const at = toArena(ev.clientX, ev.clientY);
      zoomAbout(state, view, at, ev.deltaY > 0 ? 1.12 : 1 / 1.12);
    }

    /* Two-finger gestures on iOS also fire these, which would zoom the page
       rather than the arena. */
    function blockGesture(ev) { ev.preventDefault(); }

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onCancel);
    svg.addEventListener('wheel', onWheel, { passive: false });
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
      svg.addEventListener(t, blockGesture);
    }

    return {
      toArena, pxPerMetre, snap, snapAngle, cancelDrag,
      fitView(state) {
        const a = state.course.arena, s = 4;
        cfg.onView({ x: -s, y: -s, w: a.widthM + s * 2, h: a.lengthM + s * 2 });
      },
      destroy() {
        svg.removeEventListener('pointerdown', onDown);
        svg.removeEventListener('pointermove', onMove);
        svg.removeEventListener('pointerup', onUp);
        svg.removeEventListener('pointercancel', onCancel);
        svg.removeEventListener('wheel', onWheel);
        for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
          svg.removeEventListener(t, blockGesture);
        }
      }
    };
  }

  function round2(n) { return Math.round(n * 100) / 100; }
  function round3(n) { return Math.round(n * 1000) / 1000; }

  return { bcbInteract: { createInteractions, DRAG_PX, SNAP_PX } };
})
;
