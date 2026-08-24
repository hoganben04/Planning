/* Bea's Course Builder — getting a course off the phone.

   Four ways out, in the order she is likely to want them:
     print   a course sheet she can take to the arena or give her instructor
     picture a PNG to send in a message
     link    the whole course packed into a URL, so sharing needs no server
     file    JSON, for a backup

   The iOS traps are all in here, commented where they bite. */
(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./render.js') : root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (renderMod) {
  const Render = renderMod.bcbRender;

  /* iOS Safari gives a blank canvas above roughly five million pixels on older
     or low-memory devices, with no error to tell you why. */
  const MAX_CANVAS_PX = 5000000;

  /* ---- Picture ------------------------------------------------------------- */
  async function svgToPngBlob(svg, opts) {
    const o = opts || {};
    const wantW = o.width || 1800;
    const wantH = o.height || Math.round(wantW * (o.aspect || 0.62));
    const scale = Math.min(1, Math.sqrt(MAX_CANVAS_PX / (wantW * wantH)));
    const w = Math.max(320, Math.round(wantW * scale));
    const h = Math.max(200, Math.round(wantH * scale));

    const markup = Render.standaloneSvg(svg, { width: w, height: h });
    /* A data URI rather than a blob URL: older iOS Safari refuses to draw a
       blob-URL SVG into a canvas, and fails silently when it does. */
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);

    const img = new Image();
    img.decoding = 'sync';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('The arena could not be turned into a picture.'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h + (o.caption ? 64 : 0);
    const ctx = canvas.getContext('2d');
    /* Paint the background first — a transparent PNG looks broken in Messages. */
    ctx.fillStyle = o.background || '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, w, h);

    if (o.caption) {
      ctx.fillStyle = o.captionColour || '#1A2229';
      ctx.font = '600 26px system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.caption, 24, h + 32);
    }

    return await new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('The picture came out empty.')), 'image/png');
      } else {
        try {
          const data = canvas.toDataURL('image/png');
          fetch(data).then(r => r.blob()).then(resolve, reject);
        } catch (e) { reject(e); }
      }
    });
  }

  /* iOS only allows sharing from inside a real tap, and an `await` in between
     loses that permission. So the file is built when the share sheet opens and
     this is called synchronously from the button itself. */
  function shareFile(file, meta) {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share(Object.assign({ files: [file] }, meta || {}));
    }
    return Promise.reject(new Error('unsupported'));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---- Link ---------------------------------------------------------------- */
  /* The course is squeezed down to short keys and whole centimetres before it is
     compressed, which gets a full course into a link short enough to send in a
     message. The fragment after # never reaches a server, so this is private as
     well as serverless. */
  const TYPES = ['crosspoles', 'vertical', 'planks', 'gate', 'wall', 'oxer-ascending',
    'oxer-square', 'oxer-swedish', 'triple-bar', 'liverpool', 'water',
    'ground-pole', 'placing-pole', 'raised-pole'];

  function pack(course) {
    return {
      v: 1,
      n: course.name || '',
      a: [Math.round(course.arena.widthM * 10), Math.round(course.arena.lengthM * 10)],
      l: course.levelId || '',
      o: course.notes || '',
      j: (course.jumps || []).map(j => [
        Math.max(0, TYPES.indexOf(j.type)),
        Math.round(j.xM * 100), Math.round(j.yM * 100),
        Math.round(j.rotationDeg || 0),
        Math.round(j.widthM * 100), Math.round(j.spreadCm || 0), Math.round(j.heightCm || 0),
        j.number == null ? 0 : j.number,
        j.element ? 'ABC'.indexOf(j.element) + 1 : 0
      ])
    };
  }

  function unpack(packed) {
    return {
      name: packed.n || 'Shared course',
      arena: { widthM: (packed.a[0] || 200) / 10, lengthM: (packed.a[1] || 600) / 10 },
      levelId: packed.l || undefined,
      notes: packed.o || '',
      jumps: (packed.j || []).map(a => ({
        type: TYPES[a[0]] || 'vertical',
        xM: a[1] / 100, yM: a[2] / 100, rotationDeg: a[3],
        widthM: a[4] / 100, spreadCm: a[5], heightCm: a[6],
        number: a[7] || null,
        element: a[8] ? 'ABC'[a[8] - 1] : null
      }))
    };
  }

  async function courseToHash(course) {
    const text = JSON.stringify(pack(course));
    const bytes = new TextEncoder().encode(text);
    if (typeof CompressionStream === 'function') {
      try {
        const cs = new CompressionStream('deflate-raw');
        const writer = cs.writable.getWriter();
        writer.write(bytes); writer.close();
        const buf = await new Response(cs.readable).arrayBuffer();
        return 'c1z' + toBase64Url(new Uint8Array(buf));
      } catch (e) { /* fall through to the plain form */ }
    }
    return 'c1p' + toBase64Url(bytes);
  }

  async function hashToCourse(hash) {
    const tag = hash.slice(0, 3);
    const body = hash.slice(3);
    /* Check the tag before decoding: otherwise a link that is not ours at all
       fails with a base64 complaint rather than something she can act on. */
    if (tag !== 'c1z' && tag !== 'c1p') {
      throw new Error('That link is not one of ours.');
    }
    let bytes;
    try {
      bytes = fromBase64Url(body);
    } catch (e) {
      throw new Error('That link looks damaged — try copying it again.');
    }
    let text;
    if (tag === 'c1z') {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(bytes); writer.close();
      const buf = await new Response(ds.readable).arrayBuffer();
      text = new TextDecoder().decode(buf);
    } else {
      text = new TextDecoder().decode(bytes);
    }
    try {
      return unpack(JSON.parse(text));
    } catch (e) {
      throw new Error('That link looks damaged — try copying it again.');
    }
  }

  function toBase64Url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(str) {
    const s = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const raw = atob(s + pad);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    /* The old way, for browsers without the clipboard API. */
    return new Promise((resolve, reject) => {
      const box = document.createElement('textarea');
      box.value = text;
      box.setAttribute('readonly', '');
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(box);
      ok ? resolve() : reject(new Error('Could not copy'));
    });
  }

  /* ---- File --------------------------------------------------------------- */
  function downloadJson(text, filename) {
    downloadBlob(new Blob([text], { type: 'application/json' }), filename);
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('That file could not be read.'));
      reader.readAsText(file);
    });
  }

  function safeName(name, ext) {
    const base = (name || 'course').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 48);
    return `${base || 'course'}.${ext}`;
  }

  return {
    bcbShare: {
      svgToPngBlob, shareFile, downloadBlob, downloadJson, readFile, safeName,
      courseToHash, hashToCourse, pack, unpack, copyText, TYPES,
      canShareFiles: () => !!(navigator.canShare && navigator.share)
    }
  };
});
