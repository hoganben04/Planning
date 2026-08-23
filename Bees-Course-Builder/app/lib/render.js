/* Bee's Course Builder — drawing the arena.

   The arena is one SVG whose user units ARE metres, so nothing in here needs a
   scale factor: a fence at 14.5m across the arena is drawn at x="14.5". Zooming
   is a change of viewBox and nothing else.

   Colours are passed in as plain hex values rather than read from CSS. That
   looks like the wrong choice until you try to turn the arena into a PNG: a
   serialised SVG has no stylesheet, so custom properties resolve to nothing and
   the picture comes out blank. Explicit attributes export correctly every time. */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./geometry.js') : root,
    typeof require === 'function' ? require('./strides.js') : root,
    typeof require === 'function' ? require('./route.js') : root,
    typeof require === 'function' ? require('../data/jumps.js') : root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (geomMod, strideMod, routeMod, jumpMod) {
  const G = geomMod.bcbGeom;
  const S = strideMod.bcbStrides;
  const R = routeMod.bcbRoute;
  const NS = 'http://www.w3.org/2000/svg';

  const POLE = 0.13;          /* how thick a pole is drawn, in metres */
  const WING = 0.7;           /* how far a wing sticks out */

  const THEMES = {
    light: {
      surround: '#E6E9EE', arena: '#F3E7D3', arenaEdge: '#8A6A46',
      grid: '#DFCCAE', centreLine: '#CDB491',
      ink: '#1A2229', muted: '#5E6C79', paper: '#FFFFFF',
      pole: '#FFFFFF', poleEdge: '#33404B', wing: '#8A6A46',
      track: '#D6337E', trackSoft: '#F2B8D2',
      water: '#59B4DC', waterEdge: '#2C7FA6',
      wall: '#A25248', wallEdge: '#6E322B',
      select: '#0E9E92', snap: '#0E9E92',
      groundPole: '#9AA3AD', placingPole: '#C79A2E',
      ok: '#1F8A4C', note: '#8A6A46', warn: '#C9781B', error: '#C7362F',
      bubble: '#1A2229', bubbleText: '#FFFFFF',
      halo: '#7C5CD3'
    },
    dark: {
      surround: '#0F1418', arena: '#2E2519', arenaEdge: '#8A6A46',
      grid: '#453723', centreLine: '#54432C',
      ink: '#E8EDF2', muted: '#9CACB8', paper: '#141A20',
      pole: '#EDEFF2', poleEdge: '#0B0F13', wing: '#A07C52',
      track: '#FF5CA0', trackSoft: '#6E2549',
      water: '#4FA8D4', waterEdge: '#8FD3F0',
      wall: '#B85F53', wallEdge: '#E0968B',
      select: '#2BD4C4', snap: '#2BD4C4',
      groundPole: '#8892A0', placingPole: '#D9B054',
      ok: '#43C97B', note: '#C0A070', warn: '#F0A44C', error: '#FF6B62',
      bubble: '#E8EDF2', bubbleText: '#141A20',
      halo: '#A38CF0'
    }
  };

  function el(name, attrs, children) {
    const node = document.createElementNS(NS, name);
    if (attrs) for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      node.setAttribute(k, String(v));
    }
    if (children) for (const c of [].concat(children)) {
      if (c) node.appendChild(c);
    }
    return node;
  }

  function n1(v) { return Math.round(v * 1000) / 1000; }

  /* ---- The renderer -------------------------------------------------------- */
  function createRenderer(svg) {
    let lastView = null;

    function draw(state) {
      const course = state.course;
      const check = state.check;
      const theme = THEMES[state.dark ? 'dark' : 'light'];
      const arena = course.arena;
      const ui = state.ui || {};
      const surround = 4;

      const view = ui.view || {
        x: -surround, y: -surround,
        w: arena.widthM + surround * 2, h: arena.lengthM + surround * 2
      };
      lastView = view;
      svg.setAttribute('viewBox', `${n1(view.x)} ${n1(view.y)} ${n1(view.w)} ${n1(view.h)}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('data-arena-w', arena.widthM);
      svg.setAttribute('data-arena-l', arena.lengthM);

      while (svg.firstChild) svg.removeChild(svg.firstChild);

      const pxPerM = pixelsPerMetre(svg, view);
      const grab = Math.max(1.1, 44 / Math.max(pxPerM, 1));   /* finger-sized hit area */

      svg.appendChild(defs(theme));
      svg.appendChild(el('rect', {
        x: view.x, y: view.y, width: view.w, height: view.h,
        /* On paper the surround is left white: a grey box that size is a lot of
           ink for something that carries no information. */
        fill: state.paperSurround ? theme.paper : theme.surround,
        'data-surround': '1'
      }));
      svg.appendChild(arenaLayer(arena, theme, state));
      if (check) {
        svg.appendChild(trackLayer(check, theme, state));
        svg.appendChild(measureLayer(check, theme, state, pxPerM));
      }
      svg.appendChild(jumpLayer(course, check, theme, state, grab));
      svg.appendChild(uiLayer(course, theme, state, pxPerM));
      return { view, pxPerM };
    }

    return {
      draw,
      get view() { return lastView; },
      themeFor: dark => THEMES[dark ? 'dark' : 'light']
    };
  }

  function pixelsPerMetre(svg, view) {
    const box = svg.getBoundingClientRect ? svg.getBoundingClientRect() : { width: 400, height: 700 };
    if (!box.width || !box.height) return 10;
    return Math.min(box.width / view.w, box.height / view.h);
  }

  function defs(theme) {
    const brick = el('pattern', {
      id: 'bcb-brick', width: 0.5, height: 0.28, patternUnits: 'userSpaceOnUse'
    }, [
      el('rect', { width: 0.5, height: 0.28, fill: theme.wall }),
      el('path', {
        d: 'M0 0.14 H0.5 M0.25 0 V0.14 M0 0.28 H0.5 M0.5 0.14 V0.28',
        stroke: theme.wallEdge, 'stroke-width': 0.03, fill: 'none'
      })
    ]);
    const ripple = el('pattern', {
      id: 'bcb-water', width: 0.9, height: 0.45, patternUnits: 'userSpaceOnUse'
    }, [
      el('rect', { width: 0.9, height: 0.45, fill: theme.water }),
      el('path', {
        d: 'M0 0.22 q0.22 -0.16 0.45 0 q0.22 0.16 0.45 0',
        stroke: theme.waterEdge, 'stroke-width': 0.05, fill: 'none', opacity: 0.7
      })
    ]);
    const arrow = el('marker', {
      id: 'bcb-arrow', viewBox: '0 0 10 10', refX: 7, refY: 5,
      markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse'
    }, [el('path', { d: 'M0 1 L9 5 L0 9 z', fill: theme.track })]);
    return el('defs', null, [brick, ripple, arrow]);
  }

  /* ---- Arena, grid and markings -------------------------------------------- */
  function arenaLayer(arena, theme, state) {
    const g = el('g', { 'data-layer': 'arena', 'aria-hidden': 'true' });
    g.appendChild(el('rect', {
      x: 0, y: 0, width: arena.widthM, height: arena.lengthM,
      fill: theme.arena, stroke: theme.arenaEdge, 'stroke-width': 0.22
    }));

    if (state.showGrid !== false) {
      const lines = [];
      for (let x = 5; x < arena.widthM; x += 5) {
        lines.push(`M${x} 0 V${arena.lengthM}`);
      }
      for (let y = 5; y < arena.lengthM; y += 5) {
        lines.push(`M0 ${y} H${arena.widthM}`);
      }
      g.appendChild(el('path', {
        d: lines.join(' '), stroke: theme.grid, 'stroke-width': 0.05, fill: 'none', opacity: 0.9
      }));
    }

    /* Centre line, so she can see whether a fence is square and central. */
    g.appendChild(el('path', {
      d: `M${arena.widthM / 2} 0 V${arena.lengthM}`,
      stroke: theme.centreLine, 'stroke-width': 0.08,
      'stroke-dasharray': '1.2 1', fill: 'none'
    }));

    /* The arena size is printed on the course sheet, where there is room for it,
       but on screen it is already in the title bar and only competes with the
       readout for space. */
    if (state.showArenaSize) {
      g.appendChild(el('text', {
        x: arena.widthM / 2, y: arena.lengthM + 2.6,
        'text-anchor': 'middle', fill: theme.muted,
        'font-size': 1.5, 'font-family': systemFont()
      }, [textNode(`${arena.widthM} x ${arena.lengthM}m`)]));
    }
    return g;
  }

  function systemFont() {
    /* A system stack, written as an attribute, so a serialised SVG keeps its
       lettering when it is turned into a PNG. */
    return 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
  }

  function textNode(str) { return document.createTextNode(str); }

  /* ---- The ridden line ----------------------------------------------------- */
  function trackLayer(check, theme, state) {
    const g = el('g', { 'data-layer': 'track', 'aria-hidden': 'true' });
    const route = check.route;
    if (!route || !route.points || route.points.length < 2) return g;

    g.appendChild(el('path', {
      d: pathFrom(route.points), fill: 'none',
      stroke: theme.trackSoft, 'stroke-width': 0.7,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.85
    }));
    g.appendChild(el('path', {
      d: pathFrom(route.points), fill: 'none',
      stroke: theme.track, 'stroke-width': 0.16,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'stroke-dasharray': '1.6 0.9'
    }));

    for (const m of R.directionMarks(route.points, 9)) {
      g.appendChild(el('path', {
        d: 'M-0.55 -0.42 L0.42 0 L-0.55 0.42',
        fill: 'none', stroke: theme.track, 'stroke-width': 0.16,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        transform: `translate(${n1(m.x)} ${n1(m.y)}) rotate(${n1(m.angle)})`
      }));
    }

    for (const [line, label] of [[route.startLine, 'S'], [route.finishLine, 'F']]) {
      if (!line) continue;
      g.appendChild(el('path', {
        d: `M${n1(line.x1)} ${n1(line.y1)} L${n1(line.x2)} ${n1(line.y2)}`,
        stroke: theme.track, 'stroke-width': 0.16, 'stroke-dasharray': '0.5 0.4'
      }));
      g.appendChild(el('text', {
        x: n1(line.x2), y: n1(line.y2),
        dx: 0.5, dy: 0.5, fill: theme.track,
        'font-size': 1.5, 'font-weight': 700, 'font-family': systemFont()
      }, [textNode(label)]));
    }
    return g;
  }

  function pathFrom(points) {
    return points.map((p, i) => `${i ? 'L' : 'M'}${n1(p.x)} ${n1(p.y)}`).join(' ');
  }

  /* ---- Distances written on the plan -------------------------------------- */
  function measureLayer(check, theme, state, pxPerM) {
    const g = el('g', { 'data-layer': 'measures', 'aria-hidden': 'true' });
    if (state.showDistances === false) return g;
    const route = check.route;
    if (!route || !route.fenceAt) return g;
    const byId = new Map(route.fenceAt.map(f => [f.id, f]));

    for (const leg of check.legs || []) {
      if (leg.category === 'unrelated' && state.showAllDistances !== true) continue;
      const from = byId.get(leg.fromId), to = byId.get(leg.toId);
      if (!from || !to) continue;
      const mid = G.pointAtLength(route.points, (from.s + to.s) / 2);
      if (!mid) continue;

      const colour = theme[leg.severity] || theme.muted;
      const label = leg.strides == null
        ? leg.measured.metresText
        : `${leg.measured.metresText} · ${leg.strides}`;
      const w = label.length * 0.62 + 0.9;

      g.appendChild(el('rect', {
        x: n1(mid.x - w / 2), y: n1(mid.y - 0.85), width: n1(w), height: 1.7,
        rx: 0.45, fill: theme.paper, stroke: colour, 'stroke-width': 0.09, opacity: 0.96
      }));
      g.appendChild(el('text', {
        x: n1(mid.x), y: n1(mid.y + 0.45), 'text-anchor': 'middle',
        fill: colour, 'font-size': 1.1, 'font-weight': 600, 'font-family': systemFont()
      }, [textNode(label)]));

      /* Stride pips, so she can count the strides she is being told about. */
      if (state.showStrides && leg.strides && leg.strides <= 8) {
        for (const pip of R.stridePips(route.points, from.s, to.s, check.summary.strideM)) {
          g.appendChild(el('circle', {
            cx: n1(pip.x), cy: n1(pip.y), r: 0.22,
            fill: theme.track, opacity: 0.75
          }));
        }
      }
    }
    return g;
  }

  /* ---- The fences ---------------------------------------------------------- */
  function jumpLayer(course, check, theme, state, grab) {
    const g = el('g', { 'data-layer': 'jumps' });
    const groups = check ? check.efforts : [];

    /* A soft halo behind the elements of a combination, so it reads as one
       obstacle at a glance. */
    for (const group of groups) {
      if (group.elements.length < 2) continue;
      const xs = [], ys = [];
      for (const e of group.elements) {
        for (const c of G.boxCorners(S.footprintBox(e))) { xs.push(c.x); ys.push(c.y); }
      }
      const pad = 1.1;
      g.appendChild(el('rect', {
        x: n1(Math.min(...xs) - pad), y: n1(Math.min(...ys) - pad),
        width: n1(Math.max(...xs) - Math.min(...xs) + pad * 2),
        height: n1(Math.max(...ys) - Math.min(...ys) + pad * 2),
        rx: 1.2, fill: theme.halo, opacity: 0.12,
        stroke: theme.halo, 'stroke-width': 0.07, 'stroke-dasharray': '0.7 0.5',
        'aria-hidden': 'true'
      }));
    }

    for (const jump of course.jumps || []) {
      g.appendChild(drawJump(jump, theme, state, grab, check));
    }
    return g;
  }

  function drawJump(jump, theme, state, grab, check) {
    const spec = jumpMod.bcbJump(jump.type) || jumpMod.bcbJump('vertical');
    const selected = state.selectedId === jump.id;
    const w = jump.widthM || spec.defaultWidthM;
    const spread = (jump.spreadCm || 0) / 100;

    const g = el('g', {
      'data-jump': jump.id,
      'data-type': jump.type,
      transform: `translate(${n1(jump.xM)} ${n1(jump.yM)}) rotate(${n1(jump.rotationDeg || 0)})`,
      tabindex: 0, role: 'button',
      'aria-label': describeForScreenReader(jump, spec, check)
    });

    /* An invisible pad so a thumb can find a fence that is only a few pixels
       thick on screen. Sized from the current zoom. */
    g.appendChild(el('rect', {
      class: 'jump__hit',
      x: n1(-Math.max(w, grab) / 2), y: n1(-Math.max(spread, grab) / 2),
      width: n1(Math.max(w, grab)), height: n1(Math.max(spread, grab)),
      fill: 'transparent', 'pointer-events': 'all'
    }));

    const colour = jump.colour || null;
    const parts = glyph(spec.draw, w, spread, jump, theme, colour);
    for (const p of parts) g.appendChild(p);

    if (selected) {
      const pad = 0.5;
      g.appendChild(el('rect', {
        x: n1(-w / 2 - pad), y: n1(-Math.max(spread, 0.4) / 2 - pad),
        width: n1(w + pad * 2), height: n1(Math.max(spread, 0.4) + pad * 2),
        rx: 0.35, fill: 'none', stroke: theme.select, 'stroke-width': 0.12,
        'stroke-dasharray': '0.6 0.4', 'pointer-events': 'none'
      }));
    }

    /* The fence number, kept upright however the fence is turned, and sitting on
       the take-off side so it never covers a pole. */
    if (jump.number != null) {
      const side = -(Math.max(spread, 0.4) / 2 + 1.35);
      const bubble = el('g', {
        transform: `translate(0 ${n1(side)}) rotate(${n1(-(jump.rotationDeg || 0))})`,
        'pointer-events': 'none'
      });
      bubble.appendChild(el('circle', { r: 0.95, fill: theme.bubble, opacity: 0.92 }));
      bubble.appendChild(el('text', {
        y: 0.42, 'text-anchor': 'middle', fill: theme.bubbleText,
        'font-size': 1.25, 'font-weight': 700, 'font-family': systemFont()
      }, [textNode(`${jump.number}${jump.element || ''}`)]));
      g.appendChild(bubble);
    }
    return g;
  }

  function describeForScreenReader(jump, spec, check) {
    const bits = [];
    bits.push(jump.number != null ? `Fence ${jump.number}${jump.element || ''}` : 'Unnumbered');
    bits.push(spec.name.toLowerCase());
    if (jump.heightCm) bits.push(`${(jump.heightCm / 100).toFixed(2)} metres high`);
    if (spec.hasSpread && jump.spreadCm) bits.push(`${(jump.spreadCm / 100).toFixed(2)} metre spread`);
    bits.push(`at ${jump.xM.toFixed(1)} across, ${jump.yM.toFixed(1)} down`);
    if (jump.rotationDeg) bits.push(`turned ${Math.round(jump.rotationDeg)} degrees`);
    if (check) {
      const leg = (check.legs || []).find(l => l.toId === jump.id);
      if (leg) bits.push(`${leg.measured.metresText} from fence ${leg.fromLabel}, ${leg.strideWords || ''}, ${leg.verdict.replace(/-/g, ' ')}`);
    }
    return bits.join(', ') + '.';
  }

  /* ---- How each kind of fence looks from above ----------------------------- */
  function glyph(kind, w, spread, jump, theme, colour) {
    const pole = colour || theme.pole;
    const edge = theme.poleEdge;
    const half = w / 2;
    const out = [];

    const bar = (y, thickness, fill) => el('rect', {
      x: n1(-half), y: n1(y - (thickness || POLE) / 2),
      width: n1(w), height: n1(thickness || POLE),
      rx: n1((thickness || POLE) / 2),
      fill: fill || pole, stroke: edge, 'stroke-width': 0.035
    });

    const wings = (y) => el('path', {
      d: `M${n1(-half)} ${n1(y - WING / 2)} L${n1(-half)} ${n1(y + WING / 2)}`
        + ` M${n1(half)} ${n1(y - WING / 2)} L${n1(half)} ${n1(y + WING / 2)}`,
      stroke: theme.wing, 'stroke-width': 0.16, 'stroke-linecap': 'round'
    });

    switch (kind) {
      case 'crosspoles':
        out.push(el('path', {
          d: `M${n1(-half)} ${n1(-0.45)} L${n1(half)} ${n1(0.45)}`
            + ` M${n1(-half)} ${n1(0.45)} L${n1(half)} ${n1(-0.45)}`,
          stroke: pole, 'stroke-width': 0.11, 'stroke-linecap': 'round'
        }));
        out.push(wings(0));
        break;

      case 'planks':
        out.push(bar(0, 0.3, pole));
        out.push(el('path', {
          d: `M${n1(-half / 3)} -0.15 V0.15 M${n1(half / 3)} -0.15 V0.15`,
          stroke: edge, 'stroke-width': 0.05
        }));
        out.push(wings(0));
        break;

      case 'gate':
        out.push(bar(0, 0.28, pole));
        out.push(el('path', {
          d: `M${n1(-half)} -0.14 L${n1(half)} 0.14 M${n1(-half)} 0.14 L${n1(half)} -0.14`,
          stroke: edge, 'stroke-width': 0.05
        }));
        out.push(wings(0));
        break;

      case 'wall':
        out.push(el('rect', {
          x: n1(-half), y: n1(-Math.max(spread, 0.3) / 2),
          width: n1(w), height: n1(Math.max(spread, 0.3)),
          rx: 0.08, fill: 'url(#bcb-brick)', stroke: theme.wallEdge, 'stroke-width': 0.06
        }));
        break;

      case 'oxer':
        out.push(bar(n1(-spread / 2), POLE));
        out.push(bar(n1(spread / 2), POLE * 1.25));
        out.push(spreadTick(spread, half, theme));
        out.push(wings(-spread / 2));
        out.push(wings(spread / 2));
        break;

      case 'oxer-square':
        out.push(bar(n1(-spread / 2), POLE * 1.15));
        out.push(bar(n1(spread / 2), POLE * 1.15));
        out.push(spreadTick(spread, half, theme));
        out.push(wings(-spread / 2));
        out.push(wings(spread / 2));
        break;

      case 'oxer-swedish':
        out.push(el('path', {
          d: `M${n1(-half)} ${n1(-spread / 2)} L${n1(half)} ${n1(spread / 2)}`
            + ` M${n1(-half)} ${n1(spread / 2)} L${n1(half)} ${n1(-spread / 2)}`,
          stroke: pole, 'stroke-width': 0.11, 'stroke-linecap': 'round'
        }));
        out.push(wings(-spread / 2));
        out.push(wings(spread / 2));
        break;

      case 'triple-bar':
        out.push(bar(n1(-spread / 2), POLE * 0.8));
        out.push(bar(0, POLE));
        out.push(bar(n1(spread / 2), POLE * 1.3));
        out.push(spreadTick(spread, half, theme));
        out.push(wings(-spread / 2));
        out.push(wings(spread / 2));
        break;

      case 'liverpool':
        out.push(el('rect', {
          x: n1(-half * 0.92), y: n1(-Math.max(spread, 0.8) / 2),
          width: n1(w * 0.92), height: n1(Math.max(spread, 0.8)),
          rx: 0.25, fill: 'url(#bcb-water)', stroke: theme.waterEdge, 'stroke-width': 0.06
        }));
        out.push(bar(n1(spread / 2), POLE));
        out.push(wings(spread / 2));
        break;

      case 'water':
        out.push(el('rect', {
          x: n1(-half), y: n1(-Math.max(spread, 1) / 2),
          width: n1(w), height: n1(Math.max(spread, 1)),
          rx: 0.4, fill: 'url(#bcb-water)', stroke: theme.waterEdge, 'stroke-width': 0.08
        }));
        break;

      case 'ground-pole':
        out.push(bar(0, POLE * 0.85, theme.groundPole));
        break;

      case 'placing-pole':
        out.push(bar(0, POLE * 0.85, theme.placingPole));
        break;

      case 'raised-pole':
        out.push(bar(0, POLE * 0.9, theme.placingPole));
        out.push(el('path', {
          d: `M${n1(-half)} -0.22 V0.22 M${n1(half)} -0.22 V0.22`,
          stroke: theme.wing, 'stroke-width': 0.18, 'stroke-linecap': 'round'
        }));
        break;

      default:
        out.push(bar(0, POLE));
        out.push(wings(0));
    }

    /* A filler reads as a band under the front pole. */
    if (jump.filler && jump.filler !== 'none') {
      const frontY = spread ? -spread / 2 : 0;
      out.push(el('rect', {
        x: n1(-half * 0.8), y: n1(frontY - 0.34), width: n1(w * 0.8), height: 0.2,
        rx: 0.1, fill: theme.wing, opacity: 0.85
      }));
    }
    return out;
  }

  /* A little bracket showing how wide a spread fence is. */
  function spreadTick(spread, half, theme) {
    if (spread < 0.3) return null;
    const x = half + 0.35;
    return el('path', {
      d: `M${n1(x)} ${n1(-spread / 2)} V${n1(spread / 2)}`
        + ` M${n1(x - 0.16)} ${n1(-spread / 2)} H${n1(x + 0.16)}`
        + ` M${n1(x - 0.16)} ${n1(spread / 2)} H${n1(x + 0.16)}`,
      stroke: theme.muted, 'stroke-width': 0.05, fill: 'none', opacity: 0.8
    });
  }

  /* ---- Handles and guides, screen only ------------------------------------ */
  function uiLayer(course, theme, state, pxPerM) {
    const g = el('g', { 'data-layer': 'ui', 'aria-hidden': 'true' });
    const jump = (course.jumps || []).find(j => j.id === state.selectedId);

    for (const guide of state.guides || []) {
      if (guide.kind === 'line') {
        g.appendChild(el('path', {
          d: `M${n1(guide.x1)} ${n1(guide.y1)} L${n1(guide.x2)} ${n1(guide.y2)}`,
          stroke: theme.snap, 'stroke-width': 0.1, 'stroke-dasharray': '0.7 0.5', fill: 'none'
        }));
      }
    }

    if (jump && !jump.locked) {
      /* One rotation grip, out on the landing side so her thumb is never over
         the fence she is turning. */
      const spread = (jump.spreadCm || 0) / 100;
      const reach = Math.max(spread / 2, 0.4) + 2.4;
      const grip = el('g', {
        'data-handle': 'rotate',
        transform: `translate(${n1(jump.xM)} ${n1(jump.yM)}) rotate(${n1(jump.rotationDeg || 0)})`,
        style: 'cursor: grab'
      });
      grip.appendChild(el('path', {
        d: `M0 ${n1(Math.max(spread / 2, 0.4))} V${n1(reach)}`,
        stroke: theme.select, 'stroke-width': 0.1
      }));
      grip.appendChild(el('circle', {
        cy: n1(reach), r: 0.8, fill: theme.select, opacity: 0.28, 'pointer-events': 'all'
      }));
      grip.appendChild(el('circle', {
        cy: n1(reach), r: 0.44, fill: theme.select, 'pointer-events': 'all'
      }));
      g.appendChild(grip);
    }
    return g;
  }

  /* Replace just the handles-and-guides layer. Rebuilding the whole arena on
     every pointer move would throw away the live position of the fence being
     dragged, so the fence would appear to snap back to where it started on every
     single move — which reads as the drag being broken. */
  function refreshUiLayer(svg, state) {
    const old = svg.querySelector('[data-layer="ui"]');
    if (!old) return;
    const theme = THEMES[state.dark ? 'dark' : 'light'];
    const view = (state.ui && state.ui.view) || null;
    const pxPerM = view ? pixelsPerMetre(svg, view) : 10;
    const next = uiLayer(state.course, theme, state, pxPerM);
    old.parentNode.replaceChild(next, old);
  }

  /* ---- Turning the arena into a standalone picture ------------------------ */
  /* Everything is already drawn with explicit colours and a system font stack,
     so this is really just a copy with a background and a caption added. */
  function standaloneSvg(svg, opts) {
    const o = opts || {};
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', NS);
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('width', o.width || 1600);
    clone.setAttribute('height', o.height || 1000);
    /* Handles and hit pads are no use in a picture. */
    for (const node of [...clone.querySelectorAll('[data-layer="ui"], .jump__hit')]) {
      node.parentNode.removeChild(node);
    }
    for (const node of [...clone.querySelectorAll('[tabindex]')]) {
      node.removeAttribute('tabindex');
      node.removeAttribute('role');
    }
    return new XMLSerializer().serializeToString(clone);
  }

  return {
    bcbRender: {
      createRenderer, THEMES, standaloneSvg, refreshUiLayer, el, glyph, systemFont, pathFrom,
      pixelsPerMetre, describeForScreenReader
    }
  };
});
