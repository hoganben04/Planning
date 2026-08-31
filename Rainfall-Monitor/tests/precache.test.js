/* Does the service worker list every file that ships?

   This test exists because the classic offline bug is adding a file, forgetting
   the precache list, and everything working perfectly right up until somebody is
   stood in a gateway with no signal.

   It also pins the two storage keys, because renaming one strands every setting
   already saved on a phone and the app opens with the default gauge and none of
   your marks — silently. */
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
  './sw.js',      /* the worker itself is fetched by the browser, not by us */
  './.nojekyll'   /* a marker for GitHub Pages; nothing ever requests it */
]);

test('every file in app/ is in the service worker precache list', () => {
  const listed = new Set(precacheList());
  const missing = shippedFiles(APP, './')
    .filter(file => !NOT_PRECACHED.has(file) && !listed.has(file));
  assert.deepEqual(missing, [], `not precached: ${missing.join(', ')}`);
});

test('every precached path is a file that exists', () => {
  const missing = precacheList()
    .filter(url => url !== './')
    .filter(url => !fs.existsSync(path.join(APP, url)));
  assert.deepEqual(missing, [], `precached but absent: ${missing.join(', ')}`);
});

test('every script the page loads is precached, in dependency order', () => {
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const srcs = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map(m => m[1]);
  const listed = precacheList();
  for (const src of srcs) {
    assert.ok(listed.indexOf(src) >= 0, `${src} is loaded by index.html but not precached`);
  }
  /* app.js needs every other module on the window before it runs, so it must be
     last. Getting this wrong is a blank screen with a console error. */
  assert.equal(srcs[srcs.length - 1], './lib/app.js');
});

test('the readings are never served from the cache', () => {
  /* A cached Environment Agency response would look exactly like a fresh one on
     screen, which is the worst failure available to this app. */
  assert.match(SW, /environment\.data\.gov\.uk/);
  assert.match(SW, /if \(url\.hostname\.endsWith\('environment\.data\.gov\.uk'\)\) return;/);
});

test('the storage keys have not been renamed', () => {
  const store = fs.readFileSync(path.join(APP, 'lib', 'store.js'), 'utf8');
  assert.match(store, /const SETTINGS_KEY = 'rm\.settings\.v1'/);
  assert.match(store, /const CACHE_KEY = 'rm\.cache\.v1'/);
});

test('the manifest points at icons that exist', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(APP, icon.src)), `${icon.src} is in the manifest but absent`);
  }
  assert.ok(fs.existsSync(path.join(APP, 'icons', 'icon-180.png')), 'the apple-touch-icon must exist');
});

test('the service worker version was bumped when the shipped files changed', () => {
  /* Not a date check — just that it is there and looks like a version, since an
     unbumped worker means a phone keeps running the old app for ever. */
  assert.match(SW, /const VERSION = '\d{4}-\d{2}-\d{2}-\d+'/);
});

test('a new version takes over an open page rather than waiting for it to close', () => {
  /* skipWaiting and clients.claim are a pair. With only clients.claim — which is
     how this shipped at first — the new worker sits in "waiting" until every tab
     is closed, so a fix reaches an installed copy two opens later. */
  assert.match(SW, /await self\.skipWaiting\(\)/);
  assert.match(SW, /await self\.clients\.claim\(\)/);
});
