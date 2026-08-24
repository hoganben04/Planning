/* Bea's Course Builder — small pieces of interface.

   Element building, toasts, modal sheets and the bits of wording that appear in
   more than one place. Nothing clever, just kept in one spot so the app sounds
   the same everywhere. */
(function (root) {
  const D = root.BCB_TOLERANCE ? root : null;

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'dataset') {
          for (const dk of Object.keys(v)) el.dataset[dk] = v[dk];
        } else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (children != null) {
      for (const c of [].concat(children)) {
        if (c === null || c === undefined || c === false) continue;
        el.appendChild(typeof c === 'string' || typeof c === 'number'
          ? document.createTextNode(String(c)) : c);
      }
    }
    return el;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---- Toasts -------------------------------------------------------------- */
  function toast(message, opts) {
    const o = opts || {};
    const host = document.getElementById('toasts');
    if (!host) return;
    const node = h('div', { class: 'toast', role: 'status' }, [message]);
    if (o.actionLabel && o.onAction) {
      node.appendChild(h('button', {
        type: 'button',
        onclick: () => { o.onAction(); dismiss(); }
      }, [o.actionLabel]));
    }
    host.appendChild(node);
    const timer = setTimeout(dismiss, o.ms || (o.actionLabel ? 7000 : 3200));
    function dismiss() {
      clearTimeout(timer);
      if (node.parentNode) node.parentNode.removeChild(node);
    }
    return dismiss;
  }

  function announce(message) {
    const live = document.getElementById('live');
    if (live) live.textContent = message;
  }

  /* ---- Modal sheets ------------------------------------------------------- */
  let openModal = null;

  function modal(opts) {
    closeModal();
    const o = opts || {};
    const box = h('div', { class: 'modal__box', role: 'dialog', 'aria-modal': 'true',
      'aria-label': o.title || 'Dialog' });
    if (o.title) box.appendChild(h('div', { class: 'modal__title' }, [o.title]));
    if (o.description) box.appendChild(h('p', { class: 'lede' }, [o.description]));
    if (o.body) box.appendChild(o.body);

    const actions = h('div', { class: 'modal__actions' });
    for (const b of (o.buttons || [])) {
      actions.appendChild(h('button', {
        type: 'button', class: b.style || '',
        onclick: () => { const keep = b.onClick && b.onClick(); if (!keep) closeModal(); }
      }, [b.label]));
    }
    if (actions.childNodes.length) box.appendChild(actions);

    const backdrop = h('div', { class: 'modal' }, [box]);
    backdrop.addEventListener('pointerdown', ev => {
      if (ev.target === backdrop && o.dismissable !== false) closeModal();
    });
    document.body.appendChild(backdrop);
    openModal = { backdrop, restoreFocus: document.activeElement };
    const first = box.querySelector('input, select, textarea, button');
    if (first) setTimeout(() => first.focus(), 30);
    document.addEventListener('keydown', onKey);
    return { close: closeModal, box };
  }

  function onKey(ev) {
    if (ev.key === 'Escape' && openModal) { ev.preventDefault(); closeModal(); }
  }

  function closeModal() {
    if (!openModal) return;
    document.removeEventListener('keydown', onKey);
    if (openModal.backdrop.parentNode) {
      openModal.backdrop.parentNode.removeChild(openModal.backdrop);
    }
    if (openModal.restoreFocus && openModal.restoreFocus.focus) {
      try { openModal.restoreFocus.focus(); } catch (e) { /* fine */ }
    }
    openModal = null;
  }

  function confirmSheet(opts) {
    return new Promise(resolve => {
      modal({
        title: opts.title,
        description: opts.description,
        buttons: [
          { label: opts.cancelLabel || 'Cancel', onClick: () => resolve(false) },
          { label: opts.confirmLabel || 'Yes', style: opts.danger ? 'danger' : 'primary',
            onClick: () => resolve(true) }
        ]
      });
    });
  }

  function askText(opts) {
    return new Promise(resolve => {
      const input = h('input', { type: 'text', value: opts.value || '',
        placeholder: opts.placeholder || '', 'aria-label': opts.title || 'Value' });
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); resolve(input.value.trim()); closeModal(); }
      });
      modal({
        title: opts.title,
        description: opts.description,
        body: h('div', { class: 'field' }, [input]),
        buttons: [
          { label: 'Cancel', onClick: () => resolve(null) },
          { label: opts.confirmLabel || 'Save', style: 'primary',
            onClick: () => resolve(input.value.trim()) }
        ]
      });
    });
  }

  /* ---- Wording shared between screens ------------------------------------ */
  const SEVERITY_GLYPH = { error: '✕', warn: '!', note: '~', ok: '✓' };

  function severityWord(s) {
    return { error: 'Needs fixing', warn: 'Worth a look', note: 'Just so you know', ok: 'Fine' }[s] || s;
  }

  function fieldRow(label, control, hint) {
    return h('label', { class: 'field' }, [
      h('span', { class: 'field__label' }, [label]),
      control,
      hint ? h('span', { class: 'field__hint' }, [hint]) : null
    ]);
  }

  function stepper(opts) {
    const out = h('output', {}, [opts.format(opts.value)]);
    let value = opts.value;
    const set = v => {
      value = Math.max(opts.min, Math.min(opts.max, Math.round(v / opts.step) * opts.step));
      value = Math.round(value * 1000) / 1000;
      out.textContent = opts.format(value);
      opts.onChange(value);
    };
    return h('div', { class: 'stepper' }, [
      h('button', { type: 'button', 'aria-label': `Less ${opts.label || ''}`.trim(),
        onclick: () => set(value - opts.step) }, ['−']),
      out,
      h('button', { type: 'button', 'aria-label': `More ${opts.label || ''}`.trim(),
        onclick: () => set(value + opts.step) }, ['+'])
    ]);
  }

  function segmented(items, current, onPick) {
    const seg = h('div', { class: 'seg', role: 'group' });
    for (const item of items) {
      seg.appendChild(h('button', {
        type: 'button', 'aria-pressed': String(item.id === current),
        onclick: () => onPick(item.id)
      }, [item.label]));
    }
    return seg;
  }

  function niceDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return 'today';
    const days = Math.round((now - d) / 86400000);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function handsText(cm) {
    if (!cm) return '';
    const inches = cm / 2.54;
    const hands = Math.floor(inches / 4);
    const rest = Math.round(inches - hands * 4);
    return rest ? `${hands}.${rest}hh` : `${hands}hh`;
  }

  function handsToCm(text) {
    const m = String(text).match(/^(\d+)(?:[.,](\d))?/);
    if (!m) return null;
    const hands = parseInt(m[1], 10);
    const inches = m[2] ? parseInt(m[2], 10) : 0;
    return Math.round((hands * 4 + inches) * 2.54);
  }

  root.bcbUi = {
    h, clear, esc, toast, announce, modal, closeModal, confirmSheet, askText,
    SEVERITY_GLYPH, severityWord, fieldRow, stepper, segmented, niceDate,
    handsText, handsToCm
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
