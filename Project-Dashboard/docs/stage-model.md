# Stage model — how a stage is proved

The register credits progress from a stage code. A stage is only reached when the
evidence exists in the project folder. This page is the test for each one, so two people
looking at the same folder reach the same stage.

The codes deliberately mirror the numbered subfolders that already exist inside every
project folder, taken from `2.5.4 TEMPLATE PROJECT FOLDER`:

```
1. Enquiry              5. Client Order         9. Site Work Pack
2. Site Visit inc. Photos   6. LOA's
3. IDNO                 7. Project Management folder
4. L&P Estimate         8. POC Acceptance
```

## Enquiry track

| Code | Stage | % | Proved by |
|---|---|---|---|
| `E1` | Enquiry logged | 5 | A client request exists in `1. Enquiry`. The job has a number and a folder. |
| `E2` | Site visit / survey | 10 | `2. Site Visit inc. Photos` contains photographs or survey notes. An empty folder is not a site visit. |
| `E3` | POC / IDNO enquiry | 15 | An AV request, POC enquiry or DNO application in `3. IDNO` or `2.14 DNO : iDNO Applications`. |
| `E4` | Estimate built | 20 | A priced bill of quantities in `4. L&P Estimate`. |
| `E5` | Proposal issued | 25 | Evidence the proposal went to the client — a sent email or a dated issue sheet. A PDF sitting in the folder is not proof it was issued. |
| `E6` | In negotiation | 30 | A client response on record: query, counter-offer or rate challenge. |

## Live track

| Code | Stage | % | Proved by |
|---|---|---|---|
| `L1` | Order received | 35 | A client order or PO in `5. Client Order`. |
| `L2` | LOAs & consents | 42 | Signed LOAs in `6. LOA's`. Wayleaves and licences in hand where the route needs them. |
| `L3` | POC accepted | 50 | The accepted connection offer in `8. POC Acceptance`. |
| `L4` | Design & approvals | 58 | An approved-for-construction drawing. Approved means the DNO or IDNO has signed it, not that a designer has issued it. |
| `L5` | Work pack & mobilisation | 66 | `9. Site Work Pack` populated: RAMS, work instructions, traffic management, searches. |
| `L6` | On site | 75 | Site induction records or daily reports showing work has started. |
| `L7` | Energisation & adoption | 85 | An energisation request submitted — `17. Energisation Pack`. |
| `L8` | As-builts & handover | 92 | As-laid records in `20. As Laid record` and handover forms complete. |
| `L9` | Final account | 97 | Final account issued. Variations agreed in `11. Commercial and VOs`. |
| `C` | Closed | 100 | Retention released and the folder moved to `2.5.3 COMPLETED PROJECTS`. |

## What the percentage does and does not mean

It is a **position in the process**, weighted so that the milestones which actually
de-risk a job — order, POC acceptance, design approval — move the number most.

It is **not** earned value. It says nothing about cost or hours consumed. A job at `L6`
75% may have burned 95% of its budget. If you need commercial position, read the card
body and the commercial folder.

## Overriding the percentage

Set `progress:` on the card only when the stage default is genuinely wrong — a long `L6`
that is 90% built, for example. Say why in the change log. Overrides that are not
explained get removed at the next review.
