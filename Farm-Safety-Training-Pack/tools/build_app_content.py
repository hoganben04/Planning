#!/usr/bin/env python3
"""Generate app/content.js from the training-pack markdown.

The online app embeds module content directly (no runtime fetch) so it works
opened from disk or hosted. Internal .md links are rewritten to in-app routes.
Modules that become interactive in the app (the quiz/answer-key, competency
checklist and training record) are intentionally excluded from the reader.

Usage: python3 build_app_content.py
"""
import json
import os
import re
import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.abspath(os.path.join(HERE, ".."))
OUT = os.path.join(PACK, "app", "content.js")

# (relative path, id, group, short title)
MODULES = [
    ("README.md", "overview", "Start here", "How this works"),
    ("00-trainers-guide-and-the-law.md", "law", "Start here", "The law & your duties"),
    ("01-induction-and-farm-rules.md", "induction", "Core safety", "Induction & golden rules"),
    ("02-the-big-killers-and-safe-stop.md", "safe-stop", "Core safety", "Big killers & Safe Stop"),
    ("03-tractors.md", "tractors", "Core safety", "Tractors"),
    ("04-telehandlers-and-loaders.md", "telehandlers", "Core safety", "Telehandlers & loaders"),
    ("05-pto-and-machinery.md", "pto", "Core safety", "PTO & field machinery"),
    ("06-hay-and-haylage-operations.md", "hay", "Core safety", "Hay & haylage operations"),
    ("07-manual-handling-ppe-noise-dust.md", "health", "Core safety", "Handling, PPE, noise & dust"),
    ("08-site-hazards.md", "site", "Core safety", "Site hazards"),
    ("09-emergencies-first-aid-reporting.md", "emergencies", "Core safety", "Emergencies & first aid"),
    ("15-Machinery-Handbook/README.md", "hb-index", "Machinery handbook", "Handbook overview"),
    ("15-Machinery-Handbook/A1-fuelling-up.md", "hb-fuel", "Machinery handbook", "Fuelling up"),
    ("15-Machinery-Handbook/A2-greasing-and-daily-maintenance.md", "hb-grease", "Machinery handbook", "Greasing & daily checks"),
    ("15-Machinery-Handbook/B1-case-ih-puma-240-cvx.md", "hb-puma", "Machinery handbook", "Case IH Puma 240 CVX"),
    ("15-Machinery-Handbook/B2-john-deere-6150r.md", "hb-jd", "Machinery handbook", "John Deere 6150R"),
    ("15-Machinery-Handbook/C1-jcb-541-70-telehandler.md", "hb-541", "Machinery handbook", "JCB 541-70 Loadall"),
    ("15-Machinery-Handbook/C2-jcb-516-40-telehandler.md", "hb-516", "Machinery handbook", "JCB 516-40"),
    ("15-Machinery-Handbook/D1-kuhn-gf-8501-tedder.md", "hb-tedder", "Machinery handbook", "Kuhn GF 8501 tedder"),
    ("15-Machinery-Handbook/D2-kuhn-ga-twin-rotor-rake.md", "hb-rake", "Machinery handbook", "Kuhn GA twin rotor rake"),
    ("15-Machinery-Handbook/D3-new-holland-bb940a-baler.md", "hb-baler", "Machinery handbook", "New Holland BB940A baler"),
    ("15-Machinery-Handbook/D4-kuhn-front-rear-3m-mowers.md", "hb-mowers", "Machinery handbook", "Kuhn 3m mowers"),
    ("15-Machinery-Handbook/E1-bale-grabs-and-squeeze.md", "hb-grabs", "Machinery handbook", "Bale grabs & squeeze"),
    ("15-Machinery-Handbook/E2-bale-trailers.md", "hb-trailers", "Machinery handbook", "Bale trailers"),
    ("16-Farm-Map-and-Field-Names.md", "map", "Reference", "Farm map & field names"),
    ("12-young-person-risk-assessment.md", "risk", "Reference", "Young-person risk assessment"),
    ("EMERGENCY-INFORMATION-CARD.md", "emergency-card", "Reference", "Emergency information card"),
    ("SOURCES.md", "sources", "Reference", "Sources & further reading"),
]

PATH_TO_ID = {os.path.basename(p): mid for p, mid, _, _ in MODULES}
# also map handbook relative names
for p, mid, _, _ in MODULES:
    PATH_TO_ID[p] = mid
    PATH_TO_ID[os.path.basename(p)] = mid


def rewrite_links(html):
    """Point internal .md links at in-app routes; fix asset path for the map."""
    def repl(m):
        href = m.group(1)
        # strip anchors/dirs
        base = href.split("#")[0]
        name = os.path.basename(base)
        if name in PATH_TO_ID:
            return f'href="#/read/{PATH_TO_ID[name]}"'
        if base.endswith(".md"):
            # unknown md -> overview
            return 'href="#/read/overview"'
        return m.group(0)
    html = re.sub(r'href="([^"]+\.md(?:#[^"]*)?)"', repl, html)
    # Map image path -> app asset
    html = html.replace('src="Farm-Map/truleigh-manor-farm-map.png"', 'src="assets/farm-map.png"')
    html = html.replace('href="Farm-Map/truleigh-manor-farm-map.svg"', 'href="assets/farm-map.svg"')
    html = html.replace('href="Farm-Map/Truleigh_Manor_Farm_Field_Maps.kml"', 'href="#/read/map"')
    return html


def preprocess(md_text):
    md_text = re.sub(r"(?m)^(\s*)[-*]\s+\[\s\]\s+", r"\1- ☐ ", md_text)
    md_text = re.sub(r"(?m)^(\s*)[-*]\s+\[[xX]\]\s+", r"\1- ☑ ", md_text)
    return md_text


def main():
    md = markdown.Markdown(extensions=["tables", "fenced_code", "sane_lists"])
    out = []
    for rel, mid, group, short in MODULES:
        path = os.path.join(PACK, rel)
        with open(path, encoding="utf-8") as f:
            text = preprocess(f.read())
        md.reset()
        html = rewrite_links(md.convert(text))
        # title = first H1 text
        m = re.search(r"<h1>(.*?)</h1>", html, re.S)
        title = re.sub("<.*?>", "", m.group(1)).strip() if m else short
        out.append({"id": mid, "group": group, "short": short, "title": title, "html": html})

    groups = []
    for _, _, g, _ in MODULES:
        if g not in groups:
            groups.append(g)

    js = (
        "// AUTO-GENERATED by tools/build_app_content.py — do not edit by hand.\n"
        "window.MODULES = " + json.dumps(out, ensure_ascii=False) + ";\n"
        "window.MODULE_GROUPS = " + json.dumps(groups, ensure_ascii=False) + ";\n"
    )
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"Wrote {OUT}: {len(out)} modules, {len(groups)} groups, {len(js)//1024} KB")


if __name__ == "__main__":
    main()
