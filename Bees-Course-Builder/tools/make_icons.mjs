/* Renders icons/icon.svg to the PNG sizes the manifest and iOS need.
   Development only; the PNGs it makes are committed.

   There is no image library in this environment, so the rendering is done by
   headless Chromium, which is already here for the tests.

   Run: node tools/make_icons.mjs                                            */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const iconDir = join(here, '..', 'app', 'icons');
const svg = readFileSync(join(iconDir, 'icon.svg'), 'utf8');

/* iOS masks and rounds the home-screen icon itself, and a maskable icon is
   cropped to a circle, so each needs its own treatment. */
const JOBS = [
  { file: 'icon-180.png', size: 180, squareOpaque: true },   /* apple-touch-icon */
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512, padding: 0.2 }
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const job of JOBS) {
  const pad = job.padding ? Math.round(job.size * job.padding) : 0;
  const inner = job.size - pad * 2;
  await page.setViewportSize({ width: job.size, height: job.size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#F3E7D3">
    <div style="width:${job.size}px;height:${job.size}px;display:flex;align-items:center;
                justify-content:center;background:#F3E7D3">
      <div style="width:${inner}px;height:${inner}px">${svg}</div>
    </div></body></html>`);
  const buffer = await page.screenshot({ omitBackground: false });
  writeFileSync(join(iconDir, job.file), buffer);
  console.log(`${job.file}  ${job.size}x${job.size}${pad ? ` (${pad}px padding)` : ''}`);
}

await browser.close();
