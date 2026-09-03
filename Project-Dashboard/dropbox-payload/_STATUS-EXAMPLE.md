---
# Worked example. Every fact below is invented. Copy the *shape*, not the content.
job_no: 0000
name: Example Site
client: Example Client Ltd
site: 1 Example Road, Anytown, AB1 2CD
division: Civils
work_type: ICP+EVC

register: enquiry
stage: E4
rag: amber
status_note: Two priced packages drafted and saved to 4. L&P Estimate. Not yet issued to the client. Commercial position under review before issue.

owner: A. Estimator
value_net: 50000
currency: GBP

dno: SSEN
idno: Last Mile
poc_ref: XXX000/0
capacity_kva: 250

dates:
  enquiry_received: 2026-06-01
  quote_sent:
  order_received:
  start_on_site:
  target_energisation:
  completion:

next_action: Issue the RFI register to the client and close the high-priority items before order
next_action_owner: A. Estimator
next_action_due: 2026-06-15
open_rfis: 12

last_updated: 2026-06-08
last_updated_by: A. Estimator
confidence: verified
---

# 0000 — Example Site

## Where we are

The client issued an approved design pack and a budget estimate on 1 June 2026. The work
has been split into two priced packages: connection works and charger installation. Both
estimates and an RFI register were produced on 8 June and saved to `4. L&P Estimate`.
Nothing has been issued to the client yet.

The commercial position is the live issue and is recorded in the internal comparison
workbook, not here. Keep margin, rate and negotiation detail in an internal document —
never in `status_note`, which is copied into the company-wide register.

## Next actions

| # | Action | Owner | Due | Status |
|---|---|---|---|---|
| 1 | Issue the RFI register to the client; close the high-priority items before order | A. Estimator | 2026-06-15 | Open |
| 2 | Site visit — `2. Site Visit inc. Photos` is empty | Projects | — | Open |
| 3 | Confirm framework call-off or competitive bid | A. Estimator | — | Open |

## Risks and blockers

| Risk | Impact | Mitigation | Owner |
|---|---|---|---|
| Design pack contradicts itself on who terminates in the substation | Scope of substation works undefined | RFI raised; assumed position recorded pending answer | A. Estimator |
| Highway status unclear — footpath vs private land | Determines whether a Section 50 licence is needed | RFI raised | A. Estimator |

## Key facts

| Item | Detail | Source |
|---|---|---|
| Client contact | Named contact and role — in `9. Key Contact details`, not here | Key Contact Details.xlsx |
| POC / capacity | SSEN, XXX000/0 — 250kVA secured | Approved schematic C001 |
| IDNO | Last Mile, project ref in `3. IDNO` | Design acceptance letter |
| Scheme | 120m LV mains to a new feeder pillar, CT metered | Drawing E001 Rev 02 |
| Governing drawing | E001 Rev 02 — DNO and IDNO approved | Design pack |

## Change log

Newest first. One line per update. Never delete an entry.

| Date | Who | What changed |
|---|---|---|
| 2026-06-08 | A. Estimator | Enquiry pack reviewed. Both estimates and the RFI register produced and saved to `4. L&P Estimate`. Card created. |
