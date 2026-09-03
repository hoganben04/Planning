# CLAUDE.md — Land & Power project register protocol

**Read this file before you touch anything else in this folder.**

You are working inside Land & Power's live Dropbox. Other people rely on these files
being accurate. This document tells you where things are, what the fields mean, and
what you are and are not allowed to change.

---

## 1. What this system is

One status card per project, held **inside that project's own folder**, plus a
generated register that indexes all of them.

```
2.5 Projects/
├── 2.5.0 PROJECT REGISTER/          ← you are here
│   ├── CLAUDE.md                    ← this file: the protocol
│   ├── PROJECT-AGENT.md             ← brief for a chat working on ONE job
│   ├── PORTFOLIO-AGENT.md           ← brief for a chat reviewing ACROSS jobs
│   ├── PROJECT-REGISTER.md          ← GENERATED index of every project
│   ├── dashboard.html               ← GENERATED visual dashboard
│   ├── HOW-TO-USE.md                ← one-page guide for people
│   ├── _STATUS-TEMPLATE.md          ← copy this to start a new card
│   ├── _STATUS-EXAMPLE.md           ← a filled-in card, invented data, to copy the shape of
│   └── tools/build_register.py      ← rebuilds the register and dashboard
├── 2.5.1 ENQUIRIES AND TENDERS/
│   └── 2211 - David Lloyd Farnham - ROAM/
│       └── _STATUS.md               ← THE SOURCE OF TRUTH for job 2211
└── 2.5.2 LIVE PROJECTS/
    └── NNNN - Site name, POSTCODE - Client/
        └── _STATUS.md
```

The card lives with the project so that whoever is working on that job edits one small
file, and two people working on two different jobs can never collide. The register is
disposable — it is rebuilt from the cards on demand and must never be edited by hand.

Full Dropbox path to the register folder:

```
/Land and Power/2. Land and Power Civils/2.5 Projects/2.5.0 PROJECT REGISTER/
```

---

## 1a. Which role are you in?

Two kinds of chat use this folder. Decide which you are before reading further, then
open the matching brief.

| You have been asked to… | You are the… | Read | You may open |
|---|---|---|---|
| Work on one job — price it, review it, plan it, update it | **Project agent** | `PROJECT-AGENT.md` | Everything in that one project folder. Nothing in any other. |
| Look across jobs — Monday review, what's blocked, what's stalled | **Portfolio agent** | `PORTFOLIO-AGENT.md` | The register and `_STATUS.md` cards only. Never a project document. |

The split exists so that the cross-project view stays small enough to hold in one
conversation. Thirty-four cards fit. Thirty-four project folders do not. If a portfolio
chat starts opening estimates and drawings, it has stopped being a portfolio chat.

## 2. The stage model

The codes mirror the numbered subfolders that already exist in every project folder, so
there is no new vocabulary to learn. `Progress` is credited automatically from the stage.

### Enquiry track — job sits in `2.5.1 ENQUIRIES AND TENDERS`

| Code | Stage | Progress | Evidence in the folder |
|---|---|---|---|
| `E1` | Enquiry logged | 5% | `1. Enquiry` has the client's request |
| `E2` | Site visit / survey | 10% | `2. Site Visit inc. Photos` has photos or notes |
| `E3` | POC / IDNO enquiry | 15% | `3. IDNO` has an AV request or POC enquiry |
| `E4` | Estimate built | 20% | `4. L&P Estimate` has a priced BoQ |
| `E5` | Proposal issued | 25% | Proposal sent to the client |
| `E6` | In negotiation | 30% | Client has responded, terms being agreed |

### Live track — job sits in `2.5.2 LIVE PROJECTS`

| Code | Stage | Progress | Evidence in the folder |
|---|---|---|---|
| `L1` | Order received | 35% | `5. Client Order` has the order or PO |
| `L2` | LOAs & consents | 42% | `6. LOA's` signed; wayleaves in hand |
| `L3` | POC accepted | 50% | `8. POC Acceptance` has the accepted offer |
| `L4` | Design & approvals | 58% | `7. Project Management folder / 4. Design Spec` approved |
| `L5` | Work pack & mobilisation | 66% | `9. Site Work Pack` populated, RAMS issued |
| `L6` | On site | 75% | Construction under way |
| `L7` | Energisation & adoption | 85% | `17. Energisation Pack` submitted |
| `L8` | As-builts & handover | 92% | `20. As Laid record`, handover forms complete |
| `L9` | Final account | 97% | `11. Commercial and VOs` — final account, retention |
| `C` | Closed | 100% | Folder moved to `2.5.3 COMPLETED PROJECTS` |

**A stage is only reached when the evidence exists in the folder.** If you cannot see
the document, the project has not reached that stage. Say so rather than assuming.

---

## 3. Field dictionary

Fields live in the `---` block at the top of `_STATUS.md`.

| Field | Meaning | Rules |
|---|---|---|
| `job_no` | L&P job number | 4 digits. Must match the folder name prefix. |
| `name` | Short project name | Site or scheme, not the full folder name. |
| `client` | Paying client | The contracting party, not the end site. |
| `site` | Site address | Include the postcode. |
| `division` | `Civils` or `Electrical` | |
| `work_type` | `ICP`, `EVC`, `Civils`, `Solar`, `BESS`, `Fault`, `Survey`, `Other` | Combine with `+`, e.g. `ICP+EVC`. |
| `register` | `enquiry`, `live`, `on-hold`, `won`, `lost`, `complete` | Must agree with which folder the project sits in. |
| `stage` | Stage code from §2 | |
| `progress` | Percent complete | Leave blank. Only set to override the stage default, and say why in the change log. |
| `rag` | `green` on track, `amber` watch, `red` blocked | Red means someone outside the project team needs to act. |
| `status_note` | One line: where the project actually is | Written for a colleague reading it cold. |
| `owner` | Who owns the project | A person, not a team. |
| `value_net` | Net order or quoted value | Numbers only, no `£` or commas. |
| `dno` / `idno` / `poc_ref` / `capacity_kva` | Connection detail | Blank on non-connection jobs. |
| `dates:` | Milestone dates | `YYYY-MM-DD`. Blank if not yet reached. |
| `next_action` | The single next thing that has to happen | One action, not a list. Put the rest in the body table. |
| `next_action_due` | When it is needed | `YYYY-MM-DD`. Overdue actions are flagged on the dashboard. |
| `open_rfis` | Count of unanswered RFIs | Optional. |
| `last_updated` | Date you edited the card | **Always stamp this.** Cards older than 21 days are flagged as stale. |
| `last_updated_by` | Who edited it | |
| `confidence` | `verified` or `unverified` | `verified` only when you have checked the project documents. Default to `unverified`. |

---

## 4. Rules you must follow

1. **Never invent a fact.** If a value, date, stage or owner is not evidenced in the
   project folder or given to you by the person you are talking to, leave it blank and
   list it as an open question. A blank field is useful. A guessed field is dangerous —
   somebody will price or programme work off it.
2. **Cite where facts came from.** In the `Key facts` table, name the document. This is
   what makes a card trustworthy six months later.
3. **Always stamp `last_updated` and `last_updated_by`** when you change a card.
4. **Append to the change log, never rewrite it.** Newest entry at the top of the table.
   Do not delete history.
5. **Never hand-edit `PROJECT-REGISTER.md` or `dashboard.html`.** They are generated.
   Edit the card, then rebuild (§5).
6. **Never move, rename or delete a project folder** without being asked to explicitly.
   Moving a folder between `2.5.1` and `2.5.2` is a real business event — confirm first.
7. **Never change `value_net` without documentary evidence** and a change log entry
   naming that document.
8. **One person edits one card at a time.** Dropbox resolves simultaneous edits by
   creating a "conflicted copy" file rather than merging. If you see a file named
   `_STATUS (conflicted copy).md`, stop and tell the user — do not guess which wins.
9. **Say when you are unsure.** "The folder has no estimate, so I have left the stage at
   E3" is a good answer. Inferring E4 is not.
10. **Do not put client-confidential commercial detail in `status_note`.** Internal
    margin positions belong in the body of the card, not in a field that gets copied into
    a company-wide register.

---

## 5. Rebuilding the register

The register and dashboard are generated. After editing any card:

```bash
cd "/Land and Power/2. Land and Power Civils/2.5 Projects/2.5.0 PROJECT REGISTER"
python3 tools/build_register.py
```

This rewrites `PROJECT-REGISTER.md` and `dashboard.html`. It only ever reads the project
folders; it never writes into them. `--check` prints a summary without writing anything.

If Python is not available to you, you may regenerate `PROJECT-REGISTER.md` by reading
every `_STATUS.md` and following the exact layout of the existing file. Do not invent a
new layout — the file is diffed between weeks.

---

## 6. Standard jobs people will ask you to do

**"Where are we on everything?"**
Read `PROJECT-REGISTER.md`. If its Generated date is not today, rebuild first. Lead with
red items, then overdue actions, then anything stale.

**"Update job 2247."**
Open `2.5.2 LIVE PROJECTS/2247 - .../_STATUS.md`. Ask what changed if it is not obvious.
Check the folder for evidence of the stage. Edit the card, stamp it, append to the change
log, then rebuild the register.

**"Set up a card for job 2253."**
Copy `_STATUS-TEMPLATE.md` into the project folder as `_STATUS.md`. Fill in only what the
folder or the user tells you. Set `confidence: unverified`. List the blanks you could not
fill so somebody can answer them.

**"What is stalled?"**
Section 6 of the register lists live projects with no movement in 21+ days. Cross-check
against overdue `next_action_due` dates.

**"This enquiry has been won."**
Confirm with the user, then: move the folder from `2.5.1` to `2.5.2`, set
`register: live`, set `stage: L1`, fill `dates.order_received`, append to the change log,
rebuild. The folder move needs explicit confirmation — it is a real business event.

**"Add a new enquiry."**
Next job number is one above the highest in use anywhere. Copy
`2.5.4 TEMPLATE PROJECT FOLDER`, name it `NNNN - Site name, POSTCODE - Client`, add a
card at `E1`.

---

## 7. When you find a problem

If the folder contradicts the card — the card says `L6 On site` but `9. Site Work Pack`
is empty — do not silently correct either one. Report the contradiction to the user with
both pieces of evidence and ask which is right. Cards drift; folders drift too. A human
decides.
