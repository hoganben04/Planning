/* Does the service worker list every file that ships?

   This test exists because the classic offline bug is adding a file, forgetting
   the precache list, and everything working perfectly right up until someone is
   standing in a field with no signal. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..', 'app');
const SW = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');

function precacheList() {
  const match = SW.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(match, 'sw.js must declare a PRECACHE array');
  return match[1].split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function shippedFiles(dir, prefix) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}${entry.name}`;
    if (entry.isDirectory()) out.push(...shippedFiles(path.join(dir, entry.name), `${rel}/`));
    else out.push(rel);
  }
  return out;
}

/* Files that ship but are deliberately not precached, with the reason. */
const NOT_PRECACHED = new Set([
  './sw.js',        /* the worker itself is fetched by the browser, not by us */
  './.nojekyll'     /* a marker for GitHub Pages; nothing ever requests it */
]);

test('every file in app/ is in the service worker precache list', () => {
  const listed = new Set(precacheList());
  const shipped = shippedFiles(APP, './').filter(f => !NOT_PRECACHED.has(f));
  const missing = shipped.filter(f => !listed.has(f));
  assert.deepStrictEqual(missing, [],
    `these ship but would not be available offline: ${missing.join(', ')}`);
});

test('the precache list has no entries that do not exist', () => {
  const shipped = new Set(shippedFiles(APP, './'));
  const phantom = precacheList().filter(f => f !== './' && !shipped.has(f));
  assert.deepStrictEqual(phantom, [],
    `these are cached but not shipped: ${phantom.join(', ')}`);
});

test('the cache version is stamped and looks like a date', () => {
  const m = SW.match(/const VERSION = '([^']+)'/);
  assert.ok(m, 'sw.js must declare a VERSION');
  assert.match(m[1], /^\d{4}-\d{2}-\d{2}-\d+$/,
    'the version should read like 2026-08-23-1 so it is obvious when it last changed');
});

test('the worker does not take over without being asked', () => {
  /* skipWaiting must only happen in response to a message from the page, or a new
     version would swap itself in underneath a course being edited.

     Comments are stripped first: the install handler explains why it does NOT
     call skipWaiting, and a plain text search would flag that explanation. */
  const code = SW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const installBlock = code.slice(
    code.indexOf("addEventListener('install'"), code.indexOf("addEventListener('activate'"));
  assert.ok(!/skipWaiting/.test(installBlock),
    'install must not call skipWaiting');
  assert.match(SW, /addEventListener\('message'[\s\S]*SKIP_WAITING[\s\S]*skipWaiting/,
    'skipWaiting should be driven by a message from the page');
});

test('index.html loads every script the precache expects', () => {
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const listed = new Set(precacheList());
  for (const src of scripts) {
    assert.ok(listed.has(src), `${src} is loaded by index.html but not precached`);
  }
  /* and the other way: every lib and data file is actually loaded */
  const shipped = shippedFiles(APP, './').filter(f => /^\.\/(lib|data)\/.*\.js$/.test(f));
  for (const file of shipped) {
    assert.ok(scripts.includes(file), `${file} ships but index.html never loads it`);
  }
});

test('the manifest and the icons agree', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.webmanifest'), 'utf8'));
  assert.strictEqual(manifest.start_url, './', 'relative, so it works in a subfolder');
  assert.strictEqual(manifest.scope, './');
  assert.strictEqual(manifest.display, 'standalone');
  assert.strictEqual(manifest.lang, 'en-GB');
  for (const icon of manifest.icons) {
    const file = path.join(APP, icon.src);
    assert.ok(fs.existsSync(file), `${icon.src} is in the manifest but missing`);
  }
  /* iOS needs a 180px apple-touch-icon, referenced from the HTML not the manifest */
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  assert.match(html, /apple-touch-icon/, 'iOS needs an apple-touch-icon');
  assert.ok(fs.existsSync(path.join(APP, 'icons', 'icon-180.png')));
});

test('nothing is linked with an absolute path, which would break in a subfolder', () => {
  /* The app is published at /course-builder/, so a leading slash would resolve to
     the other app at the site root. */
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const absolute = [...html.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)].map(m => m[1]);
  assert.deepStrictEqual(absolute, [], `absolute paths found: ${absolute.join(', ')}`);
});
