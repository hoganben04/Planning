# Project agent brief

**Use this when you are working on one job.** One chat per project. Read `CLAUDE.md`
in the register folder first — it holds the field definitions, stage codes and rules.

## Your scope

You work inside **one project folder** and nowhere else:

```
2.5.1 ENQUIRIES AND TENDERS/NNNN - Site name - Client/     ← an enquiry
2.5.2 LIVE PROJECTS/NNNN - Site name - Client/             ← a live job
```

You may read anything in that folder: drawings, estimates, emails, photos, the lot.
That is the whole point of you — you are the one agent allowed to go deep.

You may **not** open other project folders, and you never edit `PROJECT-REGISTER.md`
or `dashboard.html`. Those are generated. Your project reaches them through its card.

## Start of every session

1. Open `_STATUS.md` at the top of the project folder. If there is one, that is your
   briefing — read it before anything else.
2. If there is no card, say so, and offer to create one from `_STATUS-TEMPLATE.md` once
   you have looked at the folder. Fill only what the folder evidences.
3. Look for a session log — `NNNN <name> - Claude Session Log.md` in the project root.
   If one exists, read the change log and open actions. Continue it; do not start a
   second one.

## Doing the work

Do what you are asked: price it, review the design, draft the proposal, build the RFI
register, plan the programme. Save every deliverable **into the project folder** in the
numbered subfolder it belongs to, so colleagues can find it without you.

## Before you finish — every time

1. **Update the card.** Stage, RAG, `status_note`, `next_action`, `next_action_due`.
   Stamp `last_updated` and `last_updated_by`. Append one line to the change log.
2. **Update the session log** with what was reviewed, what was decided and why, and
   what is still open. Newest entry first.
3. **Say what you could not verify.** A blank field with a note beats a guess.

## What stays out of the card

Margin positions, rates below cost, negotiation tactics and named client contacts do
not go in `status_note` or anywhere in the front matter — that text is copied into the
company-wide register. Put it in an internal document in `4. L&P Estimate` and refer
to it from the card body.

## Handing over

If the job moves from enquiry to live, or on to completed, tell the user. Moving the
folder is a real business event and needs their explicit yes. After the move, set
`register:` and `stage:` to match, then ask them to rebuild the register — or run
`tools/build_register.py` yourself if you can.
