# How to use the project register

One page. No technical knowledge needed.

---

## The idea

Every project folder gets one small file called `_STATUS.md` sitting at the top of it.
That file says where the project is, who owns it, and what happens next.

A register file then pulls all of those together so anyone can see the whole business on
one page — including Claude, when you ask it about a project.

**You update the card in your project's folder. Nobody updates a central spreadsheet.**
That is the whole point: no more waiting for one person to finish editing before you can
make your change.

---

## Finding it

```
Dropbox → Land and Power → 2. Land and Power Civils → 2.5 Projects
   → 2.5.0 PROJECT REGISTER
```

- `PROJECT-REGISTER.md` — the whole business on one page
- `dashboard.html` — the same thing, prettier. Double-click to open it in a browser.

---

## Updating your project (the 30-second version)

1. Open your project folder.
2. Open `_STATUS.md` at the top of it. Any text editor works, or just ask Claude.
3. Change the bits that have moved on — usually `stage`, `status_note`, `next_action`
   and `rag`.
4. Change `last_updated` to today's date and put your name in `last_updated_by`.
5. Add one line to the change log at the bottom.

If there is no `_STATUS.md` in your project folder yet, copy `_STATUS-TEMPLATE.md` from
the register folder into it and rename it.

---

## The traffic light

| | Means | Use it when |
|---|---|---|
| 🟢 `green` | On track | Nothing needed from anyone outside the project team |
| 🟡 `amber` | Watch | Slipping, or a decision is needed soon |
| 🔴 `red` | Blocked | Someone outside the project team must act now |

Red is a request for help, not a confession. Use it.

---

## The stages

Enquiry: `E1` logged → `E2` site visit → `E3` POC/IDNO → `E4` estimate → `E5` proposal
issued → `E6` in negotiation

Live: `L1` order → `L2` LOAs → `L3` POC accepted → `L4` design → `L5` work pack →
`L6` on site → `L7` energisation → `L8` handover → `L9` final account

These match the numbered folders you already use. Progress percentage is worked out from
the stage, so you never have to guess a number.

---

## Asking Claude

There are two ways to use Claude with this, and it matters which you pick:

- **Working on one job?** Start the chat with: *"Read PROJECT-AGENT.md in the register
  folder, then open job 2247."* That chat can go as deep as it likes into that one folder.
- **Looking across everything?** Start with: *"Read PORTFOLIO-AGENT.md in the register
  folder and give me the Monday review."* That chat only reads the cards, so it never
  gets bogged down — and it will tell you when a card is missing or out of date.

Do not mix the two in one chat. That is how a conversation ends up too big to be useful.

Things that work:

- "Where are we on everything? Anything red?"
- "Update 2247 — POC came back accepted today, design starts next week."
- "Which live projects have had no movement in three weeks?"
- "Set up a status card for 2253 from what is in the folder."
- "What is the total value of live work at the moment?"
- "2211 has been won — move it to live projects."

Claude is told to leave a field blank rather than guess it, so if it says it does not
know, that is working as intended. Tell it the answer and it will fill it in.

---

## Two rules

1. **Do not edit `PROJECT-REGISTER.md` or `dashboard.html` by hand.** They get rebuilt
   and your edit will vanish. Edit your project's card instead.
2. **If you ever see a file with "conflicted copy" in the name**, two people saved at the
   same time. Tell Ben rather than deleting either one.
