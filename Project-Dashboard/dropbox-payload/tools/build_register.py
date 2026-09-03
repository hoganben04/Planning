#!/usr/bin/env python3
"""
Rebuild the Land & Power project register and dashboard from the per-project
_STATUS.md cards held in each project folder.

    python3 build_register.py                 # write register + dashboard
    python3 build_register.py --check         # report only, change nothing
    python3 build_register.py --projects-root "/path/to/2.5 Projects"

Source of truth is always the _STATUS.md card inside each project folder.
This script never writes into a project folder; it only reads the cards and
regenerates PROJECT-REGISTER.md and dashboard.html in the register folder.

Standard library only, so it runs on a stock Mac with no pip install.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import re
import sys
from pathlib import Path

ENQUIRY_DIR = "2.5.1 ENQUIRIES AND TENDERS"
LIVE_DIR = "2.5.2 LIVE PROJECTS"
CARD_NAME = "_STATUS.md"

# Stage model. Codes mirror the numbered subfolders already used in every
# project folder, so the register never needs a vocabulary the team does not
# already have. `weight` is the percent-complete credited on reaching a stage.
STAGES: dict[str, tuple[str, int]] = {
    "E1": ("Enquiry logged", 5),
    "E2": ("Site visit / survey", 10),
    "E3": ("POC / IDNO enquiry", 15),
    "E4": ("Estimate built", 20),
    "E5": ("Proposal issued", 25),
    "E6": ("In negotiation", 30),
    "L1": ("Order received", 35),
    "L2": ("LOAs & consents", 42),
    "L3": ("POC accepted", 50),
    "L4": ("Design & approvals", 58),
    "L5": ("Work pack & mobilisation", 66),
    "L6": ("On site", 75),
    "L7": ("Energisation & adoption", 85),
    "L8": ("As-builts & handover", 92),
    "L9": ("Final account", 97),
    "C": ("Closed", 100),
}

RAG_ORDER = {"red": 0, "amber": 1, "green": 2, "": 3}
RAG_DOT = {"red": "🔴", "amber": "🟡", "green": "🟢", "": "⚪"}

# A card older than this is treated as untrustworthy and surfaced for review.
STALE_DAYS = 21


# --------------------------------------------------------------------------
# Front matter parsing
# --------------------------------------------------------------------------

def parse_front_matter(text: str) -> dict:
    """Parse the YAML-ish front matter block at the top of a card.

    Deliberately forgiving: supports `key: value` and a single level of
    indented nesting (used by `dates:`). Anything it cannot read is skipped
    rather than raising, so one malformed card never breaks the whole build.
    """
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    block = text[3:end]

    data: dict = {}
    parent: str | None = None
    for raw in block.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indented = line[0] in " \t"
        if ":" not in line:
            continue
        key, _, value = line.strip().partition(":")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # Strip a trailing inline comment, but keep '#' inside a quoted value.
        value = re.sub(r"\s+#.*$", "", value)

        if indented and parent:
            data.setdefault(parent, {})
            if isinstance(data[parent], dict):
                data[parent][key] = value
            continue

        if value == "":
            # Could be a parent key (`dates:`) or just an empty field.
            parent = key
            data.setdefault(key, "")
        else:
            parent = None
            data[key] = value
    return data


def as_float(value) -> float | None:
    if value in (None, "", "TBC"):
        return None
    try:
        return float(str(value).replace(",", "").replace("£", ""))
    except ValueError:
        return None


def as_date(value) -> dt.date | None:
    if not value:
        return None
    try:
        return dt.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


# --------------------------------------------------------------------------
# Project model
# --------------------------------------------------------------------------

class Project:
    """One project folder, with or without a _STATUS.md card."""

    def __init__(self, folder: Path, register: str, today: dt.date):
        self.folder = folder
        self.folder_name = folder.name
        self.today = today
        self.card_path = folder / CARD_NAME
        self.has_card = self.card_path.is_file()

        data = {}
        if self.has_card:
            try:
                data = parse_front_matter(
                    self.card_path.read_text(encoding="utf-8", errors="replace")
                )
            except OSError:
                data = {}
        self.data = data

        self.job_no = str(data.get("job_no") or self._job_from_folder())
        self.name = data.get("name") or self._name_from_folder()
        self.client = data.get("client", "")
        self.work_type = data.get("work_type", "")
        self.owner = data.get("owner", "")
        self.register = (data.get("register") or register).lower()
        self.stage = (data.get("stage") or "").upper()
        self.rag = (data.get("rag") or "").lower()
        if self.rag not in RAG_ORDER:
            self.rag = ""
        self.status_note = data.get("status_note", "")
        self.next_action = data.get("next_action", "")
        self.next_action_owner = data.get("next_action_owner", "")
        self.next_action_due = as_date(data.get("next_action_due"))
        self.value_net = as_float(data.get("value_net"))
        self.confidence = (data.get("confidence") or "").lower()
        self.last_updated = as_date(data.get("last_updated"))

        dates = data.get("dates") if isinstance(data.get("dates"), dict) else {}
        self.dates = {k: as_date(v) for k, v in dates.items()}

        explicit = as_float(data.get("progress"))
        if explicit is not None:
            self.progress = max(0, min(100, int(explicit)))
        elif self.stage in STAGES:
            self.progress = STAGES[self.stage][1]
        else:
            self.progress = 0

        try:
            self.folder_touched = dt.date.fromtimestamp(folder.stat().st_mtime)
        except OSError:
            self.folder_touched = None

    def _job_from_folder(self) -> str:
        match = re.match(r"\s*(\d{3,5})", self.folder_name)
        return match.group(1) if match else "----"

    def _name_from_folder(self) -> str:
        stripped = re.sub(r"^\s*\d{3,5}\s*[-–]?\s*", "", self.folder_name)
        return stripped.strip() or self.folder_name

    @property
    def stage_label(self) -> str:
        return STAGES.get(self.stage, ("Not set", 0))[0]

    @property
    def reference_date(self) -> dt.date | None:
        return self.last_updated or self.folder_touched

    @property
    def days_since_update(self) -> int | None:
        ref = self.reference_date
        return (self.today - ref).days if ref else None

    @property
    def is_stale(self) -> bool:
        days = self.days_since_update
        return days is not None and days > STALE_DAYS

    @property
    def is_overdue(self) -> bool:
        return self.next_action_due is not None and self.next_action_due < self.today

    def bar(self, width: int = 10) -> str:
        filled = round(self.progress / 100 * width)
        return "█" * filled + "░" * (width - filled)


def collect(projects_root: Path, today: dt.date) -> list[Project]:
    found: list[Project] = []
    for sub, register in ((LIVE_DIR, "live"), (ENQUIRY_DIR, "enquiry")):
        base = projects_root / sub
        if not base.is_dir():
            print(f"  ! not found, skipped: {base}", file=sys.stderr)
            continue
        for child in sorted(base.iterdir()):
            if child.is_dir() and not child.name.startswith("."):
                found.append(Project(child, register, today))
    return found


def sort_key(p: Project):
    """Worst-first: red before amber, overdue before not, then oldest touch."""
    return (
        RAG_ORDER.get(p.rag, 3),
        not p.is_overdue,
        -(p.days_since_update or 0),
        p.job_no,
    )


# --------------------------------------------------------------------------
# Markdown register
# --------------------------------------------------------------------------

def money(value: float | None) -> str:
    return f"£{value:,.0f}" if value is not None else "—"


def money_short(value: float | None) -> str:
    """Compact form for the dashboard gauges, where space is tight.

    Exact figures stay in the table; a gauge only has to convey magnitude.
    """
    if value is None:
        return "—"
    if abs(value) >= 1_000_000:
        return f"£{value / 1_000_000:.2f}m"
    if abs(value) >= 10_000:
        return f"£{value / 1000:.0f}k"
    return f"£{value:,.0f}"


def date_str(value: dt.date | None) -> str:
    return value.strftime("%d %b %y") if value else "—"


def md_cell(text: str) -> str:
    return str(text or "—").replace("|", "\\|").replace("\n", " ")


def render_register(projects: list[Project], today: dt.date, banner: str = "") -> str:
    live = [p for p in projects if p.register == "live"]
    enquiries = [p for p in projects if p.register == "enquiry"]
    carded = [p for p in projects if p.has_card]
    live_carded = [p for p in live if p.has_card]

    # Enquiries are a deep archive, so only those touched recently are treated
    # as live pipeline. Everything else stays in the folder, off the register.
    recent_cut = today - dt.timedelta(days=90)
    active_enq = [
        p for p in enquiries
        if p.has_card or (p.folder_touched and p.folder_touched >= recent_cut)
    ]

    pipeline_value = sum(p.value_net for p in live_carded if p.value_net)
    reds = [p for p in carded if p.rag == "red"]
    ambers = [p for p in carded if p.rag == "amber"]
    overdue = [p for p in carded if p.is_overdue]
    stale = [p for p in live if p.is_stale]
    avg = (
        round(sum(p.progress for p in live_carded) / len(live_carded))
        if live_carded else 0
    )

    out: list[str] = []
    add = out.append

    add("# Land & Power — Project Register")
    add("")
    if banner:
        add(f"> ## ⚠ {banner}")
        add("")
    add(
        f"**Generated:** {today.strftime('%A %d %B %Y')} · "
        f"**Live projects:** {len(live)} · "
        f"**Active enquiries:** {len(active_enq)} of {len(enquiries)} folders"
    )
    add("")
    add(
        "> Do not hand-edit this file. It is rebuilt from the `_STATUS.md` card in "
        "each project folder by `tools/build_register.py`. To change what appears "
        "here, edit the project's card. Read `CLAUDE.md` before updating anything."
    )
    add("")
    add("---")
    add("")

    # ---- headline numbers -------------------------------------------------
    add("## 1. Where the business is")
    add("")
    add("| | |")
    add("|---|---|")
    add(f"| Live projects | **{len(live)}** |")
    add(f"| Live projects with a status card | **{len(live_carded)} of {len(live)}** |")
    add(f"| Average progress, carded live projects | **{avg}%** |")
    add(f"| Value on carded live projects | **{money(pipeline_value)}** |")
    add(f"| Blocked (red), all carded projects | **{len(reds)}** |")
    add(f"| Needs watching (amber), all carded projects | **{len(ambers)}** |")
    add(f"| Overdue next actions, all carded projects | **{len(overdue)}** |")
    add(f"| Live projects with no sign of movement in {STALE_DAYS}+ days | **{len(stale)}** |")
    add("")

    if len(live_carded) < len(live):
        add(
            f"> **Rollout:** {len(live) - len(live_carded)} live projects still have no "
            f"`{CARD_NAME}`. Their rows below are drawn from the folder name and folder "
            "date only — treat the stage, value and owner as unknown, not as zero. "
            "For those rows the Updated column is the folder's modified date, which on a "
            "Dropbox shared mount can be reset in bulk by a sync or a permissions change, "
            "so it is an indication of activity rather than evidence of it."
        )
        add("")

    # ---- attention list ---------------------------------------------------
    add("## 2. Needs attention this week")
    add("")
    attention = sorted(
        {id(p): p for p in reds + ambers + overdue}.values(), key=sort_key
    )
    if attention:
        add("| Job | Project | Stage | Why | Action | Owner | Due |")
        add("|---|---|---|---|---|---|---|")
        for p in attention:
            why = []
            if p.rag == "red":
                why.append("Blocked")
            elif p.rag == "amber":
                why.append("Watch")
            if p.is_overdue:
                why.append(f"action {abs((today - p.next_action_due).days)}d overdue")
            add(
                f"| {RAG_DOT[p.rag]} {p.job_no} | {md_cell(p.name)} | {p.stage or '—'} "
                f"| {md_cell(', '.join(why))} | {md_cell(p.next_action)} "
                f"| {md_cell(p.next_action_owner or p.owner)} "
                f"| {date_str(p.next_action_due)} |"
            )
    else:
        add(
            "Nothing flagged red, amber or overdue on the cards that exist. "
            "That is only meaningful once every live project has a card."
        )
    add("")

    # ---- live projects ----------------------------------------------------
    add("## 3. Live projects")
    add("")
    add("| | Job | Project | Client | Type | Stage | Progress | Value | Owner | Next action | Due | Updated |")
    add("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for p in sorted(live, key=sort_key):
        flag = RAG_DOT[p.rag] if p.has_card else "·"
        stage = f"{p.stage} {p.stage_label}" if p.stage else "_no card_"
        prog = f"`{p.bar()}` {p.progress}%" if p.has_card else "—"
        upd = date_str(p.reference_date)
        if p.is_stale:
            upd += " ⏳"
        add(
            f"| {flag} | {p.job_no} | {md_cell(p.name)} | {md_cell(p.client)} "
            f"| {md_cell(p.work_type)} | {stage} | {prog} | {money(p.value_net)} "
            f"| {md_cell(p.owner)} | {md_cell(p.next_action)} "
            f"| {date_str(p.next_action_due)} | {upd} |"
        )
    add("")

    # ---- enquiries --------------------------------------------------------
    add("## 4. Active enquiries and tenders")
    add("")
    add(
        f"Enquiry folders touched in the last 90 days, plus any with a card. "
        f"The full archive of {len(enquiries)} enquiry folders stays in "
        f"`{ENQUIRY_DIR}` and is deliberately not listed here."
    )
    add("")
    add("| | Job | Enquiry | Client | Type | Stage | Value | Owner | Next action | Due | Updated |")
    add("|---|---|---|---|---|---|---|---|---|---|---|")
    for p in sorted(active_enq, key=sort_key):
        flag = RAG_DOT[p.rag] if p.has_card else "·"
        stage = f"{p.stage} {p.stage_label}" if p.stage else "_no card_"
        add(
            f"| {flag} | {p.job_no} | {md_cell(p.name)} | {md_cell(p.client)} "
            f"| {md_cell(p.work_type)} | {stage} | {money(p.value_net)} "
            f"| {md_cell(p.owner)} | {md_cell(p.next_action)} "
            f"| {date_str(p.next_action_due)} | {date_str(p.reference_date)} |"
        )
    add("")

    # ---- stage funnel -----------------------------------------------------
    add("## 5. Stage funnel (carded projects only)")
    add("")
    add("| Stage | | Count |")
    add("|---|---|---|")
    for code, (label, _) in STAGES.items():
        count = sum(1 for p in carded if p.stage == code)
        if count:
            add(f"| `{code}` {label} | {'▇' * count} | {count} |")
    add("")

    # ---- stale ------------------------------------------------------------
    if stale:
        add(f"## 6. Live projects with no movement in {STALE_DAYS}+ days")
        add("")
        add("| Job | Project | Last touched | Days |")
        add("|---|---|---|---|")
        for p in sorted(stale, key=lambda x: -(x.days_since_update or 0)):
            add(
                f"| {p.job_no} | {md_cell(p.name)} | {date_str(p.reference_date)} "
                f"| {p.days_since_update} |"
            )
        add("")

    add("---")
    add("")
    add(
        f"_Rebuild with_ `python3 \"{Path('tools/build_register.py')}\"` _from the "
        "register folder. Stage codes and field definitions are in `CLAUDE.md`._"
    )
    add("")
    return "\n".join(out)


# --------------------------------------------------------------------------
# HTML dashboard
# --------------------------------------------------------------------------

DASHBOARD_CSS = """
/* Palette is drawn from utility record drawings: cool paper greys, DNO
   linework teal for structure, and RAG reserved strictly for project state so
   the accent never competes with a severity signal. */
:root {
  --paper:#f2f5f4; --surface:#ffffff; --surface-2:#fafbfb;
  --ink:#101714; --ink-2:#3d4c46; --mute:#68786f;
  --rule:#dde3e0; --rule-2:#e9edeb;
  --accent:#12556b; --accent-soft:#dbe8ec;
  --red:#a83228; --amber:#8f5c06; --green:#186340;
  --red-bg:#f7e4e1; --amber-bg:#f8eddb; --green-bg:#e0efe7; --idle-bg:#eceeed;
  --idle:#7d8b84;
  --shadow:0 1px 2px rgba(16,23,20,.05), 0 1px 12px rgba(16,23,20,.04);
}
@media (prefers-color-scheme:dark) {
  :root:not([data-theme="light"]) {
    --paper:#0d1211; --surface:#151d1a; --surface-2:#1a2320;
    --ink:#e7edea; --ink-2:#b3c0ba; --mute:#879990;
    --rule:#26312d; --rule-2:#1f2926;
    --accent:#6fb3c9; --accent-soft:#1c3238;
    --red:#ff8d80; --amber:#e2a747; --green:#5ccb91;
    --red-bg:#33201d; --amber-bg:#332818; --green-bg:#172c22; --idle-bg:#212a27;
    --idle:#7b8a83;
    --shadow:none;
  }
}
:root[data-theme="dark"] {
  --paper:#0d1211; --surface:#151d1a; --surface-2:#1a2320;
  --ink:#e7edea; --ink-2:#b3c0ba; --mute:#879990;
  --rule:#26312d; --rule-2:#1f2926;
  --accent:#6fb3c9; --accent-soft:#1c3238;
  --red:#ff8d80; --amber:#e2a747; --green:#5ccb91;
  --red-bg:#33201d; --amber-bg:#332818; --green-bg:#172c22; --idle-bg:#212a27;
  --idle:#7b8a83;
  --shadow:none;
}

*, *::before, *::after { box-sizing:border-box; }

body {
  margin:0;
  padding:32px 24px 72px;
  background:var(--paper);
  color:var(--ink);
  font-family:"IBM Plex Sans","Helvetica Neue",Helvetica,Arial,sans-serif;
  font-size:14px;
  line-height:1.5;
  -webkit-font-smoothing:antialiased;
}
.wrap { max-width:1280px; margin:0 auto; display:flex; flex-direction:column; gap:22px; }

/* ---- masthead ---- */
.masthead { display:flex; flex-wrap:wrap; align-items:flex-end; gap:16px 28px;
  border-bottom:2px solid var(--ink); padding-bottom:14px; }
.masthead h1 { font-family:"Barlow Semi Condensed","Arial Narrow",sans-serif;
  font-size:clamp(30px,4.4vw,44px); font-weight:600; letter-spacing:-.01em;
  line-height:1; margin:0; text-wrap:balance; }
.masthead h1 .thin { color:var(--mute); font-weight:500; }
.stamp { margin-left:auto; text-align:right; font-family:"IBM Plex Mono",monospace;
  font-size:11px; line-height:1.7; color:var(--mute); letter-spacing:.02em; }
.stamp b { color:var(--ink-2); font-weight:600; }

.banner { background:var(--amber-bg); color:var(--amber);
  border:1px solid var(--amber); border-left-width:4px;
  padding:11px 15px; font-weight:600; font-size:13px; letter-spacing:.01em; }

/* ---- instrument panel ---- */
.panel-strip { display:grid; gap:1px; background:var(--rule);
  grid-template-columns:repeat(auto-fit,minmax(148px,1fr));
  border:1px solid var(--rule); box-shadow:var(--shadow); }
.gauge { background:var(--surface); padding:13px 16px 15px; }
.gauge .k { font-family:"IBM Plex Mono",monospace; font-size:9.5px;
  text-transform:uppercase; letter-spacing:.11em; color:var(--mute);
  margin-bottom:7px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gauge .v { font-family:"Barlow Semi Condensed","Arial Narrow",sans-serif;
  font-size:clamp(24px,2.4vw,33px); font-weight:600; line-height:.95;
  letter-spacing:-.01em; font-variant-numeric:tabular-nums;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gauge .v small { font-size:17px; font-weight:500; color:var(--mute); }
.gauge.is-red .v { color:var(--red); } .gauge.is-amber .v { color:var(--amber); }
.gauge.is-green .v { color:var(--green); }

/* ---- sections ---- */
section { background:var(--surface); border:1px solid var(--rule);
  box-shadow:var(--shadow); }
.head { display:flex; align-items:baseline; gap:12px; padding:14px 18px 12px;
  border-bottom:1px solid var(--rule); }
.head h2 { font-family:"IBM Plex Mono",monospace; font-size:10.5px; font-weight:600;
  text-transform:uppercase; letter-spacing:.13em; color:var(--ink-2); margin:0; }
.head .count { font-family:"IBM Plex Mono",monospace; font-size:10.5px;
  color:var(--mute); margin-left:auto; letter-spacing:.04em; }
.body { padding:4px 0 6px; }
.pad { padding:16px 18px; }

/* ---- attention rows: severity carried by a stripe, not colour alone ---- */
.alerts { display:flex; flex-direction:column; }
.alert { display:grid; grid-template-columns:4px 62px 1fr auto; gap:0 14px;
  align-items:center; padding:11px 18px 11px 0; border-bottom:1px solid var(--rule-2); }
.alert:last-child { border-bottom:none; }
.alert .stripe { align-self:stretch; }
.alert.sev-red .stripe { background:var(--red); }
.alert.sev-amber .stripe { background:var(--amber); }
.alert .job { font-family:"IBM Plex Mono",monospace; font-size:13px; font-weight:600;
  font-variant-numeric:tabular-nums; }
.alert .what { min-width:0; }
.alert .what .nm { font-weight:600; }
.alert .what .act { color:var(--ink-2); font-size:13px; }
.alert .meta { text-align:right; font-size:12px; color:var(--mute); white-space:nowrap; }
.alert .meta .who { display:block; color:var(--ink-2); }

.tag { display:inline-block; font-family:"IBM Plex Mono",monospace; font-size:9.5px;
  font-weight:600; text-transform:uppercase; letter-spacing:.09em;
  padding:2px 6px; border-radius:2px; vertical-align:1px; }
.tag-red { background:var(--red-bg); color:var(--red); }
.tag-amber { background:var(--amber-bg); color:var(--amber); }
.tag-late { background:var(--red-bg); color:var(--red); margin-left:5px; }

/* ---- schedule table ---- */
.scroll { overflow-x:auto; }
table { width:100%; border-collapse:collapse; min-width:1000px; }
thead th { font-family:"IBM Plex Mono",monospace; font-size:9.5px; font-weight:600;
  text-transform:uppercase; letter-spacing:.1em; color:var(--mute); text-align:left;
  padding:9px 12px; border-bottom:1px solid var(--rule); white-space:nowrap;
  background:var(--surface-2); }
tbody td { padding:9px 12px; border-bottom:1px solid var(--rule-2);
  vertical-align:middle; }
tbody tr:last-child td { border-bottom:none; }
tbody tr:hover td { background:var(--surface-2); }
td.sev { width:4px; padding:0; }
tr.sev-red td.sev { background:var(--red); }
tr.sev-amber td.sev { background:var(--amber); }
tr.sev-green td.sev { background:var(--green); }
tr.sev-none td.sev { background:var(--rule); }
.job-c { font-family:"IBM Plex Mono",monospace; font-weight:600;
  font-variant-numeric:tabular-nums; white-space:nowrap; }
.nm-c { font-weight:600; min-width:190px; }
.dim { color:var(--mute); }
.nocard { font-family:"IBM Plex Mono",monospace; font-size:11px; color:var(--mute);
  background:var(--idle-bg); padding:2px 6px; border-radius:2px; white-space:nowrap; }
.stage-c { font-family:"IBM Plex Mono",monospace; font-size:12px; white-space:nowrap; }
.stage-c .code { font-weight:600; color:var(--accent); }
.money, .date-c { font-variant-numeric:tabular-nums; white-space:nowrap; }
.money { text-align:right; }
.late { color:var(--red); font-weight:600; }

/* progress meter: bar plus number, so it reads without colour vision */
.meter { display:flex; align-items:center; gap:9px; min-width:132px; }
.meter .track { flex:1; height:7px; background:var(--rule); position:relative; }
.meter .fill { position:absolute; inset:0 auto 0 0; background:var(--accent); }
.meter .pct { font-family:"IBM Plex Mono",monospace; font-size:11.5px;
  font-variant-numeric:tabular-nums; color:var(--ink-2); width:32px; text-align:right; }

/* ---- funnel: genuinely ordered, so the sequence carries meaning ---- */
.funnel { display:flex; flex-direction:column; gap:5px; }
.frow { display:grid; grid-template-columns:30px minmax(120px,190px) 1fr 26px;
  gap:12px; align-items:center; }
.frow .code { font-family:"IBM Plex Mono",monospace; font-size:11px; font-weight:600;
  color:var(--accent); }
.frow .lbl { font-size:13px; color:var(--ink-2); }
.frow .barwrap { background:var(--rule-2); height:14px; }
.frow .bar { height:14px; background:var(--accent-soft);
  border-right:3px solid var(--accent); }
.frow .n { font-family:"IBM Plex Mono",monospace; font-size:12px; text-align:right;
  font-variant-numeric:tabular-nums; color:var(--ink-2); }

.note { font-size:12.5px; color:var(--mute); margin:0; }
.note code { font-family:"IBM Plex Mono",monospace; font-size:11.5px; }
footer { font-family:"IBM Plex Mono",monospace; font-size:10.5px; color:var(--mute);
  text-align:center; letter-spacing:.04em; padding-top:4px; }
footer code { color:var(--ink-2); }

a:focus-visible, tr:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
@media (prefers-reduced-motion:reduce) { *{ transition:none!important; animation:none!important; } }
@media (max-width:640px) {
  body { padding:22px 14px 56px; }
  .stamp { margin-left:0; text-align:left; }
  .alert { grid-template-columns:4px 52px 1fr; }
  .alert .meta { grid-column:3; text-align:left; }
}
"""


def render_dashboard(projects: list[Project], today: dt.date, banner: str = "") -> str:
    live = [p for p in projects if p.register == "live"]
    live_carded = [p for p in live if p.has_card]
    carded = [p for p in projects if p.has_card]
    recent_cut = today - dt.timedelta(days=90)
    active_enq = [
        p for p in projects
        if p.register == "enquiry"
        and (p.has_card or (p.folder_touched and p.folder_touched >= recent_cut))
    ]
    value = sum(p.value_net for p in live_carded if p.value_net)
    avg = (
        round(sum(p.progress for p in live_carded) / len(live_carded))
        if live_carded else 0
    )
    reds = [p for p in carded if p.rag == "red"]
    ambers = [p for p in carded if p.rag == "amber"]
    greens = [p for p in carded if p.rag == "green"]
    overdue = [p for p in carded if p.is_overdue]
    stale = [p for p in live if p.is_stale]

    def esc(text) -> str:
        return html.escape(str(text if text not in (None, "") else "—"))

    # ---- attention block -------------------------------------------------
    attention = sorted(
        {id(p): p for p in reds + ambers + overdue}.values(), key=sort_key
    )
    alerts = []
    for p in attention:
        sev = p.rag if p.rag in ("red", "amber") else "amber"
        tags = ""
        if p.rag == "red":
            tags += '<span class="tag tag-red">blocked</span> '
        elif p.rag == "amber":
            tags += '<span class="tag tag-amber">watch</span> '
        if p.is_overdue:
            days = (today - p.next_action_due).days
            tags += f'<span class="tag tag-late">{days}d overdue</span>'
        alerts.append(
            f'<div class="alert sev-{sev}">'
            f'<div class="stripe"></div>'
            f'<div class="job">{esc(p.job_no)}</div>'
            f'<div class="what"><div class="nm">{esc(p.name)} {tags}</div>'
            f'<div class="act">{esc(p.next_action)}</div></div>'
            f'<div class="meta"><span class="who">'
            f"{esc(p.next_action_owner or p.owner)}</span>"
            f"{esc(date_str(p.next_action_due))}</div>"
            f"</div>"
        )

    # ---- schedule --------------------------------------------------------
    rows = []
    for p in sorted(live, key=sort_key):
        sev = p.rag if p.has_card and p.rag else ("none" if not p.has_card else "none")
        if p.has_card:
            stage_cell = (
                f'<span class="code">{esc(p.stage)}</span> '
                f"<span>{esc(p.stage_label)}</span>"
                if p.stage else '<span class="dim">stage not set</span>'
            )
            meter = (
                f'<div class="meter"><div class="track">'
                f'<div class="fill" style="width:{p.progress}%"></div></div>'
                f'<div class="pct">{p.progress}%</div></div>'
            )
        else:
            stage_cell = '<span class="nocard">no card</span>'
            meter = '<span class="dim">—</span>'
        due = esc(date_str(p.next_action_due))
        rows.append(
            f'<tr class="sev-{sev}">'
            f'<td class="sev"></td>'
            f'<td class="job-c">{esc(p.job_no)}</td>'
            f'<td class="nm-c">{esc(p.name)}</td>'
            f"<td>{esc(p.client)}</td>"
            f'<td class="stage-c">{stage_cell}</td>'
            f"<td>{meter}</td>"
            f'<td class="money">{esc(money(p.value_net))}</td>'
            f"<td>{esc(p.owner)}</td>"
            f"<td>{esc(p.next_action)}</td>"
            f'<td class="date-c{" late" if p.is_overdue else ""}">{due}</td>'
            f"</tr>"
        )

    # ---- funnel ----------------------------------------------------------
    counts = {c: sum(1 for p in carded if p.stage == c) for c in STAGES}
    peak = max(counts.values()) or 1
    frows = [
        f'<div class="frow"><div class="code">{code}</div>'
        f'<div class="lbl">{esc(label)}</div>'
        f'<div class="barwrap"><div class="bar" '
        f'style="width:{counts[code] / peak * 100:.0f}%"></div></div>'
        f'<div class="n">{counts[code]}</div></div>'
        for code, (label, _) in STAGES.items() if counts[code]
    ]

    banner_html = f'<div class="banner">&#9888;&nbsp; {esc(banner)}</div>' if banner else ""
    rollout_note = ""
    if len(live_carded) < len(live):
        rollout_note = (
            f'<div class="pad"><p class="note">'
            f"{len(live) - len(live_carded)} of {len(live)} live projects have no "
            f"<code>_STATUS.md</code> card yet. They are listed with the stripe greyed "
            f"and no stage — unknown, not zero. Value and average progress above cover "
            f"carded projects only.</p></div>"
        )

    return f"""<title>L&amp;P Project Register</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>{DASHBOARD_CSS}</style>
<div class="wrap">
  {banner_html}

  <header class="masthead">
    <h1>Project Register<br><span class="thin">Land &amp; Power Civils</span></h1>
    <div class="stamp">
      generated <b>{today.strftime('%d %b %Y')}</b><br>
      source <b>_STATUS.md</b> per project folder<br>
      {len(live)} live &middot; {len(active_enq)} active enquiries
    </div>
  </header>

  <div class="panel-strip">
    <div class="gauge"><div class="k">Live projects</div>
      <div class="v">{len(live)}</div></div>
    <div class="gauge"><div class="k">Active enquiries</div>
      <div class="v">{len(active_enq)}</div></div>
    <div class="gauge"><div class="k">Avg progress</div>
      <div class="v">{avg}<small>%</small></div></div>
    <div class="gauge"><div class="k">Carded value</div>
      <div class="v">{esc(money_short(value))}</div></div>
    <div class="gauge is-red"><div class="k">Blocked</div>
      <div class="v">{len(reds)}</div></div>
    <div class="gauge is-amber"><div class="k">Watch</div>
      <div class="v">{len(ambers)}</div></div>
    <div class="gauge is-green"><div class="k">On track</div>
      <div class="v">{len(greens)}</div></div>
    <div class="gauge"><div class="k">Cards in place</div>
      <div class="v">{len(live_carded)}<small>/{len(live)}</small></div></div>
  </div>

  <section>
    <div class="head"><h2>Needs attention</h2>
      <span class="count">{len(attention)} item{'' if len(attention) == 1 else 's'}</span></div>
    <div class="body">
      {''.join(alerts) if alerts
       else '<div class="pad"><p class="note">Nothing red, amber or overdue on the '
            'cards that exist. That is only meaningful once every live project has '
            'a card.</p></div>'}
    </div>
  </section>

  <section>
    <div class="head"><h2>Live projects</h2>
      <span class="count">{len(live)} folders &middot; worst first</span></div>
    <div class="scroll">
      <table>
        <thead><tr>
          <th class="sev"></th><th>Job</th><th>Project</th><th>Client</th><th>Stage</th>
          <th>Progress</th><th style="text-align:right">Value</th><th>Owner</th>
          <th>Next action</th><th>Due</th>
        </tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </div>
    {rollout_note}
  </section>

  <section>
    <div class="head"><h2>Stage funnel</h2>
      <span class="count">carded projects only</span></div>
    <div class="pad">
      {f'<div class="funnel">{"".join(frows)}</div>' if frows
       else '<p class="note">No cards yet, so no funnel to draw.</p>'}
    </div>
  </section>

  {f'''<section>
    <div class="head"><h2>No movement in {STALE_DAYS}+ days</h2>
      <span class="count">{len(stale)} live projects</span></div>
    <div class="pad"><p class="note">
      {esc(', '.join(f"{p.job_no} {p.name} ({p.days_since_update}d)"
                     for p in sorted(stale, key=lambda x: -(x.days_since_update or 0))[:14]))}
      {'&hellip;' if len(stale) > 14 else ''}
    </p></div>
  </section>''' if stale else ''}

  <footer>
    source of truth is each project folder&rsquo;s <code>_STATUS.md</code> &middot;
    regenerate with <code>tools/build_register.py</code>
  </footer>
</div>
"""


# --------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--projects-root",
        type=Path,
        help='Path to the "2.5 Projects" folder. Defaults to the parent of the '
             "register folder this script lives in.",
    )
    ap.add_argument("--out", type=Path, help="Register folder to write into.")
    ap.add_argument(
        "--check", action="store_true", help="Report only; write nothing."
    )
    ap.add_argument("--today", help="Override today's date (YYYY-MM-DD), for testing.")
    ap.add_argument(
        "--banner",
        default="",
        help="Warning banner to stamp across the outputs. Use it on any demo, "
             "training or sandbox copy so it can never be mistaken for the live "
             "register.",
    )
    args = ap.parse_args()

    register_dir = args.out or Path(__file__).resolve().parent.parent
    projects_root = args.projects_root or register_dir.parent
    today = as_date(args.today) or dt.date.today()

    print(f"Projects root : {projects_root}")
    projects = collect(projects_root, today)
    if not projects:
        print(
            "No project folders found. Check --projects-root points at the "
            f'"2.5 Projects" folder containing "{LIVE_DIR}".',
            file=sys.stderr,
        )
        return 1

    live = [p for p in projects if p.register == "live"]
    carded = [p for p in projects if p.has_card]
    print(
        f"Found         : {len(projects)} project folders "
        f"({len(live)} live), {len(carded)} with a {CARD_NAME} card"
    )

    if args.check:
        for p in sorted(live, key=sort_key):
            mark = RAG_DOT[p.rag] if p.has_card else "·"
            note = "" if p.has_card else "  (no card)"
            print(f"  {mark} {p.job_no}  {p.progress:>3}%  {p.name[:52]}{note}")
        return 0

    register_dir.mkdir(parents=True, exist_ok=True)
    md = register_dir / "PROJECT-REGISTER.md"
    htm = register_dir / "dashboard.html"
    md.write_text(render_register(projects, today, args.banner), encoding="utf-8")
    htm.write_text(render_dashboard(projects, today, args.banner), encoding="utf-8")
    print(f"Wrote         : {md}")
    print(f"Wrote         : {htm}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        # Someone piped us into head/less and closed the pipe early.
        sys.exit(0)
    except KeyboardInterrupt:
        sys.exit(130)
