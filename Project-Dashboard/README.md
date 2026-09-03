# Land & Power — team project register

A markdown-based project tracking system that lives in Dropbox, so that every team
member — and every team member's Claude — reads and writes the same source of truth.

Built for the existing L&P folder structure. It adds no new tools and no new
subscriptions, and it does not ask anyone to stop using Dropbox.

## The problem it solves

Projects live in Dropbox under `2.5.1 ENQUIRIES AND TENDERS` (598 folders) and
`2.5.2 LIVE PROJECTS` (34 folders). The folders hold excellent detail but nothing
answers "where is everything, right now, and what needs me today". People already run
Claude against individual project folders — Lee's `2211 DL Farnham - Claude Session Log.md`
is a good example — but each session starts cold and none of it aggregates.

## The design in one paragraph

Each project folder gets a `_STATUS.md` card at its root: YAML front matter that machines
read, and a markdown body that people read. A generator script walks the two project
folders, reads every card, and writes `PROJECT-REGISTER.md` and `dashboard.html` into a
new `2.5.0 PROJECT REGISTER` folder. A `CLAUDE.md` in that folder tells any team member's
Claude how the system works and what it is not allowed to do.

**Cards are the source of truth. The register is disposable and regenerated.**

### Why per-project cards rather than one central file

Dropbox does not merge simultaneous edits — it creates "conflicted copy" files. A single
shared tracker would collide constantly across a team of this size. One card per project
means the only person editing a file is the person working on that job. The aggregate view
is then computed, not maintained.

### Why the stage codes mirror the folder numbers

Every project folder already contains `1. Enquiry` through `9. Site Work Pack`. The stage
model reuses that numbering, so a stage is verifiable by looking in the folder rather than
by asking someone. Nobody has to learn a new vocabulary, and Claude can check a claimed
stage against evidence on disk.

## What is here

| Path | What it is |
|---|---|
| `dropbox-payload/CLAUDE.md` | The protocol. Field dictionary, stage model, and the rules — including "never invent a fact". |
| `dropbox-payload/HOW-TO-USE.md` | One page for people who will not read `CLAUDE.md`. |
| `dropbox-payload/PROJECT-AGENT.md` | Brief for a chat working on one job. May read that whole project folder. |
| `dropbox-payload/PORTFOLIO-AGENT.md` | Brief for a chat reviewing across jobs. Reads cards only, never project documents. |
| `dropbox-payload/_STATUS-TEMPLATE.md` | The per-project card, commented field by field. |
| `dropbox-payload/tools/build_register.py` | The generator. Standard library only — runs on a stock Mac. |
| `dropbox-payload/_STATUS-EXAMPLE.md` | An anonymised worked card showing the shape of a good one. |
| `docs/example-populated/` | A synthetic populated register and dashboard, so the end state is visible. |

## What is deliberately not in this repository

The live `PROJECT-REGISTER.md` and `dashboard.html`. They are generated in Dropbox, from
Dropbox, and contain the client list and job values. No real project data — client
names, contacts, values, margins — belongs in git. The repository holds the tooling only.

## The two-agent split

The reason a project-management chat gets overwhelmed is that it reads whole project
folders. This system splits the work between two roles, described in the two briefs:

- **Project agent** — one chat per job. Reads everything in that project folder, does
  the work, keeps that job's `_STATUS.md` current.
- **Portfolio agent** — one chat for the business. Reads only the cards and the register,
  never a project document. Thirty-four cards at ~2 KB each is ~80 KB; one project folder
  is bigger than that on its own. Staying on cards is what keeps the overview chat small.

## Deploying it

Copy `dropbox-payload/` into Dropbox as:

```
/Land and Power/2. Land and Power Civils/2.5 Projects/2.5.0 PROJECT REGISTER/
```

`2.5.0` sorts above `2.5.1`, so it lands at the top of the Projects folder. Then, per
project, copy `_STATUS-TEMPLATE.md` in as `_STATUS.md` and fill it in.

Rollout does not have to be all at once. The register reports how many live projects still
have no card, and projects without one still appear — drawn from the folder name and folder
date — so the register is complete from day one and gets more accurate as cards land.

### Rebuilding

```bash
cd "/Land and Power/2. Land and Power Civils/2.5 Projects/2.5.0 PROJECT REGISTER"
python3 tools/build_register.py          # rewrite register + dashboard
python3 tools/build_register.py --check   # report only, write nothing
```

The script only reads project folders. It writes nothing outside the register folder.

## Suggested rollout

1. Deploy the register folder and rebuild, so `PROJECT-REGISTER.md` exists and lists all
   632 folders with the 34 live ones at the top.
2. Card the live projects first, oldest-untouched first. Roughly ten minutes each with
   Claude reading the folder alongside you.
3. Card only the enquiries that are genuinely live. The register already limits the
   enquiry table to folders touched in the last 90 days — about 33 of the 598.
4. Once cards exist, rebuild weekly before the Monday review and work the "needs attention"
   section top-down.

## Known limits

- The generator needs the Dropbox folder synced locally; it reads the filesystem, not the
  Dropbox API. Anyone with Dropbox desktop can run it.
- Progress percentages are stage-weighted, not earned-value. They show position in the
  process, not cost or hours consumed.
- Only Civils (`2. Land and Power Civils`) is wired up. The Electrical division has its own
  `2.5 Projects` folder with a different internal structure; extending to it means pointing
  the script at a second root.
