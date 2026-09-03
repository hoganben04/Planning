---
# ---------------------------------------------------------------------------
# L&P project status card.  Copy this file into the root of a project folder,
# rename it to _STATUS.md, and fill it in.  The block between the --- lines is
# read by tools/build_register.py, so keep the field names exactly as they are.
# Leave a field blank if you do not know it. Never guess.
# Field definitions and the stage codes are in CLAUDE.md.
# ---------------------------------------------------------------------------

job_no:                    # 0000
name:                      # Example Site
client:                    # ROAM Charging
site:                      # Example Site, AB1 2CD
division: Civils           # Civils | Electrical
work_type:                 # ICP | EVC | Civils | Solar | BESS | Fault | Survey | Other

register:                  # enquiry | live | on-hold | won | lost | complete
stage:                     # stage code, e.g. L4  (see CLAUDE.md)
progress:                  # leave blank to derive from stage; set only to override
rag:                       # green = on track | amber = watch | red = blocked
status_note:               # one line: where this project actually is today

owner:                     # who owns this project
value_net:                 # net order or quoted value, numbers only, e.g. 69362.60
currency: GBP

# Connection detail. Blank is fine on non-connection jobs.
dno:                       # SSEN | UKPN | SEPD | ...
idno:                      # Last Mile | ESP | Eclipse | ...
poc_ref:                   # e.g. FGD248/1
capacity_kva:              # e.g. 276

dates:
  enquiry_received:        # YYYY-MM-DD
  quote_sent:
  order_received:
  start_on_site:
  target_energisation:
  completion:

next_action:               # the single next thing that has to happen
next_action_owner:
next_action_due:           # YYYY-MM-DD
open_rfis:                 # count of unanswered RFIs, if you track them

last_updated:              # YYYY-MM-DD — always stamp this when you edit
last_updated_by:
confidence: unverified     # verified = checked against project documents
                           # unverified = best understanding, not yet confirmed
---

# {job_no} — {name}

## Where we are

_Two or three sentences a colleague could read cold and understand the project._

## Next actions

| # | Action | Owner | Due | Status |
|---|---|---|---|---|
| 1 |  |  |  | Open |

## Risks and blockers

| Risk | Impact | Mitigation | Owner |
|---|---|---|---|
|  |  |  |  |

## Key facts

| Item | Detail | Source |
|---|---|---|
| Client contact |  |  |
| POC / capacity |  |  |
| Scheme |  |  |

## Change log

Newest first. One line per update. Never delete an entry.

| Date | Who | What changed |
|---|---|---|
|  |  | Card created. |
