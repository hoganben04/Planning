/* Bea's Course Builder — photographs of horses.

   A photo straight off an iPhone is several megabytes. The browser gives the
   whole app about five megabytes of storage for everything — every course, every
   horse, every setting — so a picture has to be shrunk hard before it is kept, or
   one photo of a pony would fill the lot and saving would start failing.

   So each photo is cropped square, scaled down to 480 pixels and squeezed to
   under 120KB, which is plenty for a face on a phone screen. Nothing is uploaded;
   it is stored on the device with everything else. */
(function (root) {
  const MAX_EDGE = 480;          /* pixels across, after cropping square */
  const MAX_BYTES = 120 * 1024;  /* the compressed result must fit in this */
  const MAX_INPUT = 40 * 1024 * 1024;
  const QUALITIES = [0.82, 0.7, 0.6, 0.5, 0.4, 0.3];

  function isImage(file) {
    return !!file && typeof file.type === 'string' && file.type.indexOf('image/') === 0;
  }

  /* Load the file into something we can draw. createImageBitmap is used where it
     exists because it honours the orientation flag iPhone photos carry — without
     that, pictures taken in portrait come out on their side. */
  async function load(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (e) {
        /* Safari has been known to reject the option; fall through. */
        try { return await createImageBitmap(file); } catch (e2) { /* fall through */ }
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('That file could not be opened as a picture.'));
        img.src = url;
      });
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  }

  function sizeOf(source) {
    return {
      w: source.width || source.naturalWidth || 0,
      h: source.height || source.naturalHeight || 0
    };
  }

  /* How to crop a rectangle down to a centred square. Pure, so it can be tested
     without a browser. */
  function squareCrop(w, h) {
    const edge = Math.min(w, h);
    return { sx: Math.round((w - edge) / 2), sy: Math.round((h - edge) / 2), edge };
  }

  function targetEdge(edge) {
    return Math.max(64, Math.min(MAX_EDGE, edge));
  }

  /* file -> a small square data URI, or an error worth showing someone. */
  async function fromFile(file) {
    if (!isImage(file)) throw new Error('Choose a picture — a photo or an image file.');
    if (file.size > MAX_INPUT) throw new Error('That picture is enormous. Try a smaller one.');

    const source = await load(file);
    const { w, h } = sizeOf(source);
    if (!w || !h) throw new Error('That picture could not be read.');

    const crop = squareCrop(w, h);
    const edge = targetEdge(crop.edge);

    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    /* white behind it, so a transparent PNG does not come out black as a JPEG */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, edge, edge);
    ctx.drawImage(source, crop.sx, crop.sy, crop.edge, crop.edge, 0, 0, edge, edge);
    if (source.close) source.close();

    for (const quality of QUALITIES) {
      const uri = canvas.toDataURL('image/jpeg', quality);
      if (byteLength(uri) <= MAX_BYTES) return uri;
    }
    /* Still too big at the lowest quality: halve the size and try once more. */
    const small = document.createElement('canvas');
    small.width = small.height = Math.round(edge / 2);
    const sctx = small.getContext('2d');
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(0, 0, small.width, small.height);
    sctx.drawImage(canvas, 0, 0, small.width, small.height);
    const uri = small.toDataURL('image/jpeg', 0.5);
    if (byteLength(uri) <= MAX_BYTES) return uri;
    throw new Error('That picture will not shrink small enough to keep. Try another.');
  }

  /* Roughly how many bytes a data URI takes up. Base64 carries three bytes in
     every four characters. */
  function byteLength(dataUri) {
    const comma = dataUri.indexOf(',');
    const body = comma < 0 ? dataUri : dataUri.slice(comma + 1);
    return Math.ceil(body.length * 3 / 4);
  }

  function looksLikePhoto(value) {
    return typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(value);
  }

  root.bcbPhoto = {
    fromFile, isImage, squareCrop, targetEdge, byteLength, looksLikePhoto,
    MAX_EDGE, MAX_BYTES
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
