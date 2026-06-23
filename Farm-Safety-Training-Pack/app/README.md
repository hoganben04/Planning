# Truleigh Manor Farm — Online Safety Training App

A self-contained web app version of the training pack. It guides a young worker
through five stages — **Induction → Learn modules → Assessment → Sign-off →
Certificate** — and produces a printable training record.

## What it does

- **Induction** — the golden rules, each acknowledged and signed by the trainee.
- **Learn modules** — all 28 modules (core safety + the full machinery handbook +
  reference), read in the browser, each marked "read & understood" with a date.
- **Assessment** — an auto-marked test. Pass mark **80%**, and **every
  safety-critical question** (marked ⚠) must be correct. Shows a full review with
  explanations, and can be retaken.
- **Sign-off** — the supervisor records a competency level, their name and the
  date for each machine/task, plus a final declaration. This is the part that
  needs a responsible adult.
- **Certificate** — unlocks only when every stage is complete; printable.
- **Record** — a printable summary for the file, plus JSON export.

Progress is saved in the browser it's used on (via `localStorage`). No account,
no server, no data leaves the device.

## How to use it

**Easiest:** open `index.html` in a web browser (double-click, or drag it into
Chrome/Edge/Safari). Everything works offline except the web fonts, which fall
back gracefully.

**Hosted (so it has a web address and works on a phone):** publish the
`Farm-Safety-Training-Pack/app/` folder as a static site, e.g.

- **GitHub Pages** — push the repo, enable Pages, point it at the `app/` folder
  (or move `app/` to the repo root). The app is then a URL anyone can open.
- Any static host (Netlify, a web server, etc.) — just serve the `app/` folder.

To print/save the certificate or record as PDF, use the **Print** button (or your
browser's Print → "Save as PDF").

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell |
| `styles.css` | Design system (agricultural green + hi-vis amber) |
| `app.js` | App logic: routing, progress, assessment, sign-off, certificate |
| `content.js` | **Generated** — module content embedded from the markdown pack |
| `assessment.js` | The question bank (edit here to change questions) |
| `assets/farm-map.*` | The farm field map |

## Keeping it in sync with the pack

The module content is generated from the markdown files so the app and the
written pack stay identical. If you edit any module, regenerate:

```
python3 tools/build_app_content.py
```

(Requires Python 3 with the `markdown` package: `pip install markdown`.)

## Notes & limits

- This is a single-trainee tool per browser. For multiple trainees, use a
  separate browser profile/device each, or export each trainee's record (JSON)
  and reset. A multi-user version with logins would need a small backend — say
  the word if you want that.
- The app supports the legal record-keeping but does **not** replace the
  employer's **young-person risk assessment** or **accredited operator training**
  (Lantra/NPTC) — see the pack's Modules 00, 04 and 12.
