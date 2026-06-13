#!/usr/bin/env python3
"""Build a single printable PDF booklet from the farm safety training pack.

Concatenates the markdown modules in reading order, converts to HTML, applies a
print stylesheet (A4, page breaks per module, table/checkbox styling, page
numbers) and renders to PDF with WeasyPrint. The farm map PNG is embedded.

Usage: python3 build_pdf.py
Output: ../Truleigh-Manor-Farm-Safety-Training-Pack.pdf
"""
import os
import re
import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.abspath(os.path.join(HERE, ".."))
OUT = os.path.join(PACK, "Truleigh-Manor-Farm-Safety-Training-Pack.pdf")

# Reading order. Paths relative to the pack root.
ORDER = [
    "README.md",
    "00-trainers-guide-and-the-law.md",
    "01-induction-and-farm-rules.md",
    "02-the-big-killers-and-safe-stop.md",
    "03-tractors.md",
    "04-telehandlers-and-loaders.md",
    "05-pto-and-machinery.md",
    "06-hay-and-haylage-operations.md",
    "07-manual-handling-ppe-noise-dust.md",
    "08-site-hazards.md",
    "09-emergencies-first-aid-reporting.md",
    "10-knowledge-check-quiz.md",
    "11-knowledge-check-answer-key.md",
    "12-young-person-risk-assessment.md",
    "13-competency-checklist-signoff.md",
    "14-training-record-and-certificate.md",
    "15-Machinery-Handbook/README.md",
    "15-Machinery-Handbook/A1-fuelling-up.md",
    "15-Machinery-Handbook/A2-greasing-and-daily-maintenance.md",
    "15-Machinery-Handbook/B1-case-ih-puma-240-cvx.md",
    "15-Machinery-Handbook/B2-john-deere-6150r.md",
    "15-Machinery-Handbook/C1-jcb-541-70-telehandler.md",
    "15-Machinery-Handbook/C2-jcb-516-40-telehandler.md",
    "15-Machinery-Handbook/D1-kuhn-gf-8501-tedder.md",
    "15-Machinery-Handbook/D2-kuhn-ga-twin-rotor-rake.md",
    "15-Machinery-Handbook/D3-new-holland-bb940a-baler.md",
    "15-Machinery-Handbook/D4-kuhn-front-rear-3m-mowers.md",
    "15-Machinery-Handbook/E1-bale-grabs-and-squeeze.md",
    "15-Machinery-Handbook/E2-bale-trailers.md",
    "16-Farm-Map-and-Field-Names.md",
    "EMERGENCY-INFORMATION-CARD.md",
    "SOURCES.md",
]

CSS = """
@page {
  size: A4;
  margin: 18mm 16mm 20mm 16mm;
  @bottom-center { content: "Truleigh Manor Farm — Health & Safety Training Pack"; font-size: 8pt; color: #777; }
  @bottom-right  { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #777; }
}
body { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 10.5pt; line-height: 1.4; color: #1a1a1a; }
.module { page-break-before: always; }
#cover { page-break-after: always; page-break-before: avoid; text-align: center; padding-top: 60mm; }
#cover h1 { font-size: 30pt; color: #1b5e20; border: none; margin-bottom: 4mm; }
#cover h2 { font-size: 16pt; color: #33691e; border: none; font-weight: normal; }
#cover .meta { margin-top: 40mm; font-size: 11pt; color: #333; }
#cover img { max-width: 70%; margin-top: 12mm; border: 1px solid #ccc; }
h1 { font-size: 18pt; color: #1b5e20; border-bottom: 2px solid #66bb6a; padding-bottom: 2mm; margin-top: 0; }
h2 { font-size: 13.5pt; color: #2e7d32; margin-top: 6mm; }
h3 { font-size: 11.5pt; color: #33691e; }
table { border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 9.5pt; }
th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #e8f5e9; }
tr { page-break-inside: avoid; }
code { background: #f2f2f2; padding: 1px 4px; border-radius: 3px; font-family: "DejaVu Sans Mono", monospace; font-size: 9pt; }
pre { background: #f6f8fa; padding: 6px 8px; border-radius: 4px; border: 1px solid #e1e4e8; white-space: pre-wrap; }
blockquote { border-left: 4px solid #ffb300; background: #fff8e1; margin: 3mm 0; padding: 2mm 4mm; }
img { max-width: 100%; height: auto; }
ul, ol { margin: 2mm 0 2mm 0; padding-left: 6mm; }
li { margin: 0.6mm 0; }
hr { border: none; border-top: 1px solid #ddd; margin: 4mm 0; }
a { color: #1565c0; text-decoration: none; }
strong { color: #111; }
"""


def preprocess(md_text):
    # Render task-list checkboxes as printable boxes.
    md_text = re.sub(r"(?m)^(\s*)[-*]\s+\[\s\]\s+", r"\1- ☐ ", md_text)
    md_text = re.sub(r"(?m)^(\s*)[-*]\s+\[[xX]\]\s+", r"\1- ☑ ", md_text)
    return md_text


def main():
    md = markdown.Markdown(extensions=["tables", "fenced_code", "sane_lists", "nl2br"])
    parts = []

    map_png = os.path.join(PACK, "Farm-Map", "truleigh-manor-farm-map.png")
    parts.append(f"""
    <div id="cover">
      <h1>Farm Health &amp; Safety Training Pack</h1>
      <h2>Truleigh Manor Farm &middot; Summer Hay &amp; Haylage Season</h2>
      <img src="file://{map_png}" alt="Farm map"/>
      <div class="meta">
        For a young worker (16) operating tractors, telehandlers, tedders,<br/>
        rakes, mowers, balers and associated equipment.<br/><br/>
        Edburton Road, Henfield, BN5 9LL<br/>
        Trainee: ____________________   Start date: ____________________
      </div>
    </div>
    """)

    for rel in ORDER:
        path = os.path.join(PACK, rel)
        with open(path, encoding="utf-8") as f:
            text = preprocess(f.read())
        md.reset()
        html = md.convert(text)
        parts.append(f'<div class="module">{html}</div>')

    full_html = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<style>{CSS}</style></head><body>" + "".join(parts) + "</body></html>"
    )

    from weasyprint import HTML
    HTML(string=full_html, base_url=PACK).write_pdf(OUT)
    size = os.path.getsize(OUT)
    print(f"Wrote {OUT} ({size//1024} KB)")


if __name__ == "__main__":
    main()
