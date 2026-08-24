# Bea’s Course Builder

Plan show jumping courses and pole work to scale, with the stride distances worked
out for your own pony.

It runs in a web browser and installs to an iPhone home screen, where it works
with no signal. Nothing is uploaded, there is no account, and everything is kept
on the phone.

**[Open the app](https://hoganben04.github.io/Planning/course-builder/)** — then
see *Putting it on your phone* below.

**[Landing page](https://hoganben04.github.io/Planning/course-builder/about.html)** —
the page to send to somebody who has never seen it: what it does, screenshots,
and the install steps. Bea’s own courses are behind the app link above.

## What it does

- **Draw a course on a to-scale arena.** Drop jumps in, drag them about, turn
  them round. Pick from the standard arena sizes (20x40, 20x60, 30x60, 40x80 and
  the rest) or measure your own.
- **Check every distance automatically.** Tap Check and it walks the course for
  you: how many strides between each pair of fences, whether that distance rides
  true, long or short, and — the one that matters — whether it falls awkwardly
  between two stride numbers. When a distance is wrong it offers to move the
  fence to fix it.
- **Distances in metres, feet and walking paces.** Because you will be setting
  the jumps out yourself, and "eleven paces" is more use than "10.4m" when you
  are stood in the arena with a pole under each arm.
- **Your own horses.** Everything comes from the canter stride length, so a
  14.2hh pony gets pony distances rather than a horse's. Switch horse and every
  distance is worked out again. Each one can have a photo, kept on the phone and
  never uploaded.
- **Your own jumps.** Tell it what you actually own and it warns you when a
  course needs more wings or poles than you have, and lists what to carry out.
- **Number the fences to set the route.** Numbering *is* the route. Two fences a
  stride apart automatically become one obstacle, lettered A and B.
- **Pole work too.** Ground poles, placing poles, trotting poles and bounces,
  with the spacings for your pony's size.
- **Print, send or share.** A course sheet with the plan, every distance and the
  time allowed; a picture to message your instructor; or the whole course packed
  into a link.

## Putting it on your phone

There is no App Store listing — it installs straight from Safari, which is why it
needs no Apple account and costs nothing.

1. Open the link above in **Safari** on the iPhone or iPad.
2. Tap the **share button** (the square with the arrow coming out of it).
3. Scroll down and tap **Add to Home Screen**, then **Add**.

It now has its own icon and opens full screen like any other app, and works with
no signal.

Worth doing rather than just bookmarking: Safari clears a website's saved data
after about a week of not visiting it, but a web app added to the home screen is
exempt. Add it to the home screen and your courses stay put. There is a **Save a
backup** button in Settings as well, and it is worth using now and then.

### Printing a course sheet

Open a course, tap **Share**, then **Print a course sheet**. On an iPhone, choose
Print and then pinch outwards on the preview to turn it into a PDF you can save
or send.

## How the distances are worked out

One idea does most of the work. A horse lands about half a stride beyond a fence
and takes off about half a stride before the next one, so the allowance either
side adds up to one whole stride:

```
clear distance for n strides  =  (n + 1) x stride length
```

For a horse striding 12ft that gives the familiar 24ft one-stride double. For a
14.2hh pony striding 3.2m it gives 6.4m — nearly a metre shorter. Set a pony a
horse's double and she meets the second element wrong, and this is the mistake the
app exists to catch. Most course-planning tools default to horse distances.

Distances are measured as **clear ground, back rail to front rail, along the line
you would actually ride** — which is how a distance is walked, and why a wide oxer
eats into the gap to the next fence. A fence set at an angle to the line of travel
correctly counts as deeper than its nominal spread.

The warnings scale with your horse's own stride rather than using fixed
centimetres, so they are pony-correct without a second set of numbers.

The ridden line is worked out as a straight approach to each fence, a straight
getaway, and a proper turn in between at your horse's turning radius. That is
also what makes the course length — and so the time allowed — a figure a horse
could actually achieve.

## About the heights and speeds — please read

**Check your class schedule before you trust a height.** The machine that built
this app could not reach `britishshowjumping.co.uk`, `pcuk.org` or the FEI site,
so **no rulebook was read directly**. What that means in practice:

- **Class heights** (British Novice 0.90m, Discovery 1.00m, Newcomers 1.10m,
  Foxhunter 1.20m, PC70/80/90/100, and the rest) are well corroborated from
  equestrian media and venue guides.
- **Spreads are our own estimates.** The British Showjumping "Heights and Spreads
  of Obstacles" table could not be read, so every spread in the app is a guess.
- **Speeds in metres per minute and arena minimums are unconfirmed.**

Every figure carries its source and a confidence level, listed in full on the
**Distances** screen, along with the things we could not establish at all. All of
it is in one file — `app/data/levels.js` — with a note at the top saying how to
correct it. If you have the current rulebooks, editing the numbers there is all it
takes; no code needs to change.

The app words its warnings as advice rather than as rules for exactly this reason.

A note on terminology: this was asked for as "BHA standards". The BHA is the
British Horseracing Authority, which regulates racing. Arena show jumping is
governed by **British Showjumping**, and for a young rider the **Pony Club**
rulebook is usually the closer reference. The app covers both, plus the
unaffiliated heights people actually school over at home.

## For anyone working on it

No build step, no dependencies, no framework. Plain HTML, CSS and JavaScript in
`app/`, loaded with ordinary `<script>` tags. Playwright is a development-only
dependency for the browser tests.

```
app/
  index.html            the shell
  about.html            the landing page — self-contained, its own styles
  images/               screenshots for that page, and the hero photo slot
  styles.css            theme, layout, components
  print.css             the course sheet
  manifest.webmanifest  makes it installable
  sw.js                 offline caching
  data/
    sources.js          where every governing-body figure came from, and its confidence
    levels.js           the class ladder: heights, spreads, speeds     <- edit this
    jumps.js            the obstacle catalogue: how each is built and drawn
    arenas.js           arena presets and building margins
    distances.js        stride lengths, tolerances, pole spacings
  lib/
    geometry.js         vectors, oriented boxes, polylines             (pure)
    turns.js            arc/straight/arc joins at a real turning radius (pure)
    strides.js          THE DISTANCE ENGINE                            (pure)
    route.js            the ridden line, course length, time allowed    (pure)
    course.js           the course model, numbering, whole-course checks (pure)
    store.js            state, saving, undo, import and export
    render.js           course -> SVG
    interact.js         pointer handling: drag, rotate, pinch, snap
    share.js            picture, print, link and file
    photo.js            shrinking a horse photo down to something storable
    ui.js               small pieces of interface
    editor.js           the arena editor screen
    app.js              router and the other screens
tests/
  *.test.js             node:test — the maths and the rules, no browser needed
  e2e/                  Playwright — real drags, readouts, offline
tools/make_icons.mjs    renders the icon PNGs from icon.svg
```

The arena is one SVG whose **user units are metres**, so there is no scale factor
anywhere in the drawing code and zooming is a change of `viewBox`. Colours are
passed to the renderer as plain hex rather than read from CSS, because a
serialised SVG has no stylesheet and a PNG export would otherwise come out blank.

`geometry`, `turns`, `strides`, `route` and `course` never touch the DOM, which is
what lets the maths be tested in plain Node.

### Running it

```sh
npm run dev        # serves app/ on http://localhost:4173
npm test           # the maths and the rules (no browser)
npm run test:e2e   # Playwright, iPhone and desktop viewports
npm run icons      # regenerate the icon PNGs from icon.svg
```

The e2e tests need Playwright's Chromium. In this environment it is already
present — do not run `playwright install`. `node_modules/playwright` is a symlink
to the global install.

### What the tests cover

`npm test` — the published distance tables (12/24/36/48ft and the pony
equivalents), the pony/horse divergence, every classification boundary, spread and
angle handling, that a suggested fix really does produce a true distance, course
numbering and lettering, the whole-course checks, the link codec, and that the
service worker precache lists every file that ships.

`npm run test:e2e` — real pointer drags through the DevTools protocol rather than
synthesised mouse events, snapping, the check panel, numbering, sharing, printing,
and that the app still works with the network switched off.

### What could not be tested here

The build machine is Linux with Chromium only — there is no WebKit build and no
iPhone. So these need trying on a real device:

- how a drag actually *feels* under a thumb, and pinch-zoom
- the iOS share sheet, and saving a picture by pressing and holding it
- Print, and pinching the preview into a PDF
- Add to Home Screen, the icon, and the full-screen launch
- the notch and home-indicator insets

### Putting your own photo on the landing page

Drop a picture at `app/images/hero.jpg` and it takes over the top of the landing
page. There is nothing to switch on: the page asks for that file, and if it is not
there the `<img>` removes itself and the drawn arena underneath shows instead — so
the page looks finished either way, and adding the photo needs no code change.

Two things worth doing when you add one:

- **Shrink it first.** Anything over about 400KB makes the page slow on a phone
  signal. Roughly 1600px on the long edge is plenty.
- **Fix the alt text.** It currently reads `alt="Bea and her pony"`, which is a
  guess. Change it in `app/about.html` to describe what the picture actually shows.

Horse photos inside the app are a different thing and need no work from you: she
picks one on the horse's page and `lib/photo.js` crops it square, scales it to
480px and squeezes it under 120KB before storing it. That matters because the
browser gives the whole app about 5MB for everything, and one untouched iPhone
photo would fill it.

### Publishing

`.github/workflows/deploy-pages.yml` assembles **both** apps in this repository
into one Pages site, because a repository only gets one and each deployment
replaces the whole thing:

- `/` — the farm safety training app (unchanged)
- `/course-builder/` — this app
- `/course-builder/about.html` — the landing page

The landing page and its screenshots are deliberately **not** in the service
worker's precache list: they are large, they are read once over a signal, and they
are of no use standing in a field. The worker still caches them on demand if she
does open the page.

Every path in this app is relative for that reason. An absolute path would resolve
to the other app at the site root, and there is a test that checks for it.
