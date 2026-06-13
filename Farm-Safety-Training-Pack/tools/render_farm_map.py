#!/usr/bin/env python3
"""Render the Truleigh Manor Farm field map from the supplied KML.

Produces a clean, printable site map (SVG + PNG) with the farm boundary,
field-boundary polygons, footpaths/walkways and numbered field labels (1-33),
so it can be printed and marked up during the safety induction.

Standard library only for parsing; cairosvg (optional) for PNG export.
Usage:
    python3 render_farm_map.py [input.kml] [output_basename]
Defaults: ../Farm-Map/Truleigh_Manor_Farm_Field_Maps.kml -> ../Farm-Map/truleigh-manor-farm-map
"""
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

KML_NS = "{http://www.opengis.net/kml/2.2}"

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_IN = os.path.join(HERE, "..", "Farm-Map", "Truleigh_Manor_Farm_Field_Maps.kml")
DEFAULT_OUT = os.path.join(HERE, "..", "Farm-Map", "truleigh-manor-farm-map")


def local(tag):
    return tag.split("}", 1)[-1] if "}" in tag else tag


def parse_coords(text):
    pts = []
    for tok in text.split():
        bits = tok.split(",")
        if len(bits) >= 2:
            pts.append((float(bits[0]), float(bits[1])))
    return pts


def walk(elem, folder_path, out):
    """Recursively collect placemarks with their enclosing folder names."""
    for child in elem:
        tag = local(child.tag)
        if tag in ("Folder", "Document"):
            name_el = child.find(KML_NS + "name")
            fname = name_el.text.strip() if name_el is not None and name_el.text else ""
            walk(child, folder_path + [fname], out)
        elif tag == "Placemark":
            name_el = child.find(KML_NS + "name")
            pname = name_el.text.strip() if name_el is not None and name_el.text else ""
            for geom in child.iter():
                gtag = local(geom.tag)
                if gtag == "coordinates" and geom.text:
                    out.append({
                        "folder": list(folder_path),
                        "name": pname,
                        "coords": parse_coords(geom.text),
                        "geom": _geom_type(child),
                    })
                    break
        else:
            walk(child, folder_path, out)


def _geom_type(placemark):
    for el in placemark.iter():
        t = local(el.tag)
        if t in ("Polygon", "LineString", "Point"):
            return t
    return "Unknown"


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_IN
    out_base = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT

    tree = ET.parse(src)
    placemarks = []
    walk(tree.getroot(), [], placemarks)

    polygons, paths, farm_boundary, field_numbers = [], [], [], []
    for pm in placemarks:
        folder = " / ".join(pm["folder"]).lower()
        name = pm["name"]
        if pm["geom"] == "Polygon":
            if "farm boundary" in folder or name.lower() == "farm boundary":
                farm_boundary.append(pm)
            else:
                polygons.append(pm)
        elif pm["geom"] == "LineString":
            paths.append(pm)
        elif pm["geom"] == "Point":
            if "field numbers" in folder and re.fullmatch(r"\d+", name or ""):
                field_numbers.append(pm)

    # Bounding box across all geometry we will draw.
    all_pts = []
    for grp in (polygons, paths, farm_boundary):
        for pm in grp:
            all_pts.extend(pm["coords"])
    for pm in field_numbers:
        all_pts.extend(pm["coords"])
    if not all_pts:
        sys.exit("No coordinates found in KML.")

    lons = [p[0] for p in all_pts]
    lats = [p[1] for p in all_pts]
    lat0 = sum(lats) / len(lats)
    coslat = math.cos(math.radians(lat0))

    # Equirectangular projection to metres-ish, then to pixels.
    def project(lon, lat):
        x = (lon) * coslat
        y = (lat)
        return x, y

    proj = [project(*p) for p in all_pts]
    xs = [p[0] for p in proj]
    ys = [p[1] for p in proj]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)

    W = 1600
    margin = 60
    span_x = maxx - minx or 1e-9
    span_y = maxy - miny or 1e-9
    scale = (W - 2 * margin) / span_x
    H = int(span_y * scale + 2 * margin)

    def to_px(lon, lat):
        x, y = project(lon, lat)
        px = margin + (x - minx) * scale
        py = margin + (maxy - y) * scale  # flip y for SVG
        return px, py

    def poly_points(coords):
        return " ".join(f"{px:.1f},{py:.1f}" for px, py in (to_px(*c) for c in coords))

    svg = []
    svg.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
        f'viewBox="0 0 {W} {H}" font-family="Arial, Helvetica, sans-serif">'
    )
    svg.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="#ffffff"/>')

    # Title
    svg.append(
        f'<text x="{margin}" y="38" font-size="26" font-weight="bold" fill="#1b5e20">'
        f'Truleigh Manor Farm &#8212; Field Map</text>'
    )

    # Field polygons
    for pm in polygons:
        svg.append(
            f'<polygon points="{poly_points(pm["coords"])}" '
            f'fill="#e8f5e9" stroke="#66bb6a" stroke-width="1.2"/>'
        )
    # Farm boundary (drawn on top, bold)
    for pm in farm_boundary:
        svg.append(
            f'<polygon points="{poly_points(pm["coords"])}" '
            f'fill="none" stroke="#1b5e20" stroke-width="3"/>'
        )
    # Paths / walkways / footpaths
    for pm in paths:
        svg.append(
            f'<polyline points="{poly_points(pm["coords"])}" '
            f'fill="none" stroke="#8d6e63" stroke-width="1.6" stroke-dasharray="6,4"/>'
        )
    # Field number labels
    for pm in field_numbers:
        if not pm["coords"]:
            continue
        px, py = to_px(*pm["coords"][0])
        svg.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="12" fill="#ffffff" stroke="#1b5e20" stroke-width="1.5"/>')
        svg.append(
            f'<text x="{px:.1f}" y="{py + 4:.1f}" font-size="14" font-weight="bold" '
            f'fill="#1b5e20" text-anchor="middle">{pm["name"]}</text>'
        )

    # Simple north arrow
    nax = W - margin - 10
    svg.append(f'<line x1="{nax}" y1="70" x2="{nax}" y2="40" stroke="#333" stroke-width="2"/>')
    svg.append(f'<polygon points="{nax-5},45 {nax+5},45 {nax},35" fill="#333"/>')
    svg.append(f'<text x="{nax}" y="88" font-size="13" fill="#333" text-anchor="middle">N</text>')

    # Legend
    ly = H - 70
    svg.append(f'<rect x="{margin}" y="{ly-22}" width="430" height="64" fill="#ffffff" stroke="#bbb" stroke-width="1"/>')
    svg.append(f'<rect x="{margin+12}" y="{ly-10}" width="22" height="14" fill="#e8f5e9" stroke="#66bb6a"/>')
    svg.append(f'<text x="{margin+42}" y="{ly+2}" font-size="13" fill="#333">Field</text>')
    svg.append(f'<line x1="{margin+120}" y1="{ly-3}" x2="{margin+150}" y2="{ly-3}" stroke="#1b5e20" stroke-width="3"/>')
    svg.append(f'<text x="{margin+158}" y="{ly+2}" font-size="13" fill="#333">Farm boundary</text>')
    svg.append(f'<line x1="{margin+285}" y1="{ly-3}" x2="{margin+315}" y2="{ly-3}" stroke="#8d6e63" stroke-width="1.6" stroke-dasharray="6,4"/>')
    svg.append(f'<text x="{margin+323}" y="{ly+2}" font-size="13" fill="#333">Path / footpath</text>')
    svg.append(f'<text x="{margin+12}" y="{ly+26}" font-size="12" fill="#666">Numbers 1&#8211;33 = fields (see key). Print and mark hazards: power lines, slopes, water, gates, routes.</text>')

    svg.append("</svg>")
    svg_text = "\n".join(svg)

    svg_path = out_base + ".svg"
    with open(svg_path, "w") as f:
        f.write(svg_text)
    print(f"Wrote {svg_path}  ({W}x{H}px, {len(polygons)} fields, {len(field_numbers)} labels, {len(paths)} paths)")

    # Optional PNG export
    try:
        import cairosvg
        png_path = out_base + ".png"
        cairosvg.svg2png(bytestring=svg_text.encode("utf-8"), write_to=png_path, output_width=W, output_height=H)
        print(f"Wrote {png_path}")
    except Exception as e:  # pragma: no cover
        print(f"PNG export skipped ({e}). SVG is usable on its own.")


if __name__ == "__main__":
    main()
