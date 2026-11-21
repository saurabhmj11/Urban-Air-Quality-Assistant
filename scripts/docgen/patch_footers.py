#!/usr/bin/env python3
"""Post-process footers per docx skill toc.md:
- Roman footer instrText -> PAGE \\* ROMAN \\* MERGEFORMAT
- Arabic footer instrText -> PAGE \\* arabic \\* MERGEFORMAT
- Strip empty <w:pgNumType/> elements (docx-js artifact confusing WPS)
"""
import re
import shutil
import sys
import zipfile
from pathlib import Path

path = Path(sys.argv[1])
tmp = path.with_suffix(".tmp.docx")

with zipfile.ZipFile(path, "r") as zin:
    names = zin.namelist()
    items = {n: zin.read(n) for n in names}

# Determine which footer files belong to which section by scanning document.xml
doc = items["word/document.xml"].decode("utf-8")

# Map footer rIds in order of appearance, tagged with the section numbering format
# Sections appear in order; each sectPr may reference a footer via r:id.
sect_prs = re.findall(r"<w:sectPr.*?</w:sectPr>", doc, re.S)
footer_fmt = {}  # filename -> "roman" | "arabic"
rid_to_file = {}
for n in names:
    m = re.match(r"word/_rels/document\.xml\.rels", n)
if "word/_rels/document.xml.rels" in items:
    rels = items["word/_rels/document.xml.rels"].decode("utf-8")
    for rid, target in re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', rels):
        rid_to_file[rid] = target.replace("footer", "footer")  # footer1.xml etc.

for sp in sect_prs:
    fmt = None
    m = re.search(r'<w:pgNumType[^>]*w:fmt="([^"]+)"', sp)
    if m:
        fmt = "roman" if "Roman" in m.group(1) or "roman" in m.group(1) else "arabic"
    for rid in re.findall(r'<w:footerReference[^>]*r:id="(rId\d+)"', sp):
        f = rid_to_file.get(rid)
        if f and fmt:
            footer_fmt["word/" + f.lstrip("/")] = fmt

patched = 0
for fname, fmt in footer_fmt.items():
    if fname not in items:
        continue
    xml = items[fname].decode("utf-8")
    switch = "ROMAN" if fmt == "roman" else "arabic"
    new_xml, n = re.subn(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        r"\1 PAGE \\* " + switch + r" \\* MERGEFORMAT \2",
        xml,
    )
    if n:
        items[fname] = new_xml.encode("utf-8")
        patched += n
        print(f"patched {fname} -> {switch} ({n} field(s))")

# Strip empty pgNumType (cover section artifact)
doc2, removed = re.subn(r"<w:pgNumType/>", "", doc)
if removed:
    items["word/document.xml"] = doc2.encode("utf-8")
    print(f"removed {removed} empty pgNumType element(s)")

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, items[n])
shutil.move(tmp, path)
print(f"OK: {patched} footer field(s) patched, {removed} pgNumType removed")
