"""Validation for the EPUB. Checks the things KDP and EPUBCheck actually reject."""
import zipfile, sys, re, pathlib
from xml.etree import ElementTree as ET

EPUB = pathlib.Path("build/the-cost-of-the-vedas.epub")
fails, warns = [], []
def ok(c, m):  (fails.append(m) if not c else None)
def warn(c,m): (warns.append(m) if not c else None)

z = zipfile.ZipFile(EPUB)
names = z.namelist()

# 1. mimetype first, stored, exact bytes
info = z.infolist()[0]
ok(info.filename == "mimetype", "mimetype must be the FIRST zip entry")
ok(info.compress_type == zipfile.ZIP_STORED, "mimetype must be STORED, not deflated")
ok(z.read("mimetype") == b"application/epub+zip", "mimetype content wrong")

# 2. container points at a real OPF
ok("META-INF/container.xml" in names, "META-INF/container.xml missing")
cx = ET.fromstring(z.read("META-INF/container.xml"))
rf = cx.find(".//{urn:oasis:names:tc:opendocument:xmlns:container}rootfile")
opf_path = rf.get("full-path")
ok(opf_path in names, f"OPF {opf_path} not in archive")

# 3. OPF parses; every manifest href resolves
OPF = "{http://www.idpf.org/2007/opf}"
DC  = "{http://purl.org/dc/elements/1.1/}"
op = ET.fromstring(z.read(opf_path))
base = str(pathlib.PurePosixPath(opf_path).parent)
items = {}
for it in op.iter(f"{OPF}item"):
    iid, href = it.get("id"), it.get("href")
    items[iid] = it
    full = str(pathlib.PurePosixPath(base) / href)
    ok(full in names, f"manifest item {iid} -> {href} MISSING from archive")

# 4. required metadata
for tag in ("title", "creator", "language", "identifier"):
    ok(op.find(f".//{DC}{tag}") is not None, f"dc:{tag} missing")
ok(op.find(f".//{OPF}meta[@property='dcterms:modified']") is not None,
   "dcterms:modified required by EPUB 3")

# 5. cover, both ways Kindle looks for it
cov = [i for i in op.iter(f"{OPF}item") if (i.get("properties") or "").find("cover-image") >= 0]
ok(len(cov) == 1, "exactly one item must have properties='cover-image'")
ok(op.find(f".//{OPF}meta[@name='cover']") is not None,
   "legacy <meta name='cover'> missing (older Kindle pipelines need it)")

# 6. nav document with epub:type=toc
nav = [i for i in op.iter(f"{OPF}item") if (i.get("properties") or "").find("nav") >= 0]
ok(len(nav) == 1, "EPUB 3 requires exactly one nav document")
if nav:
    navsrc = z.read(str(pathlib.PurePosixPath(base) / nav[0].get("href"))).decode()
    ok('epub:type="toc"' in navsrc, "nav must carry epub:type='toc'")

# 7. spine references only real manifest ids, and has the right count
spine_ids = [r.get("idref") for r in op.iter(f"{OPF}itemref")]
for sid in spine_ids:
    ok(sid in items, f"spine references unknown id {sid}")
ok(len(spine_ids) == 1 + 3 + 14, f"expected 18 spine items (cover+3 front+14 ch), got {len(spine_ids)}")

# 8. every XHTML parses as XML (Kindle is strict)
xhtml = [n for n in names if n.endswith(".xhtml")]
ok(len(xhtml) >= 18, f"expected >=18 xhtml files, got {len(xhtml)}")
for n in xhtml:
    try:
        ET.fromstring(z.read(n))
    except ET.ParseError as e:
        fails.append(f"{n} is not well-formed XML: {e}")

# 9. every <img src> resolves
for n in xhtml:
    body = z.read(n).decode()
    for src in re.findall(r'<img[^>]+src="([^"]+)"', body):
        resolved = str((pathlib.PurePosixPath(n).parent / src).as_posix())
        resolved = str(pathlib.PurePosixPath(resolved))
        while "/../" in resolved:
            resolved = re.sub(r"[^/]+/\.\./", "", resolved, count=1)
        ok(resolved in names, f"{n}: <img src='{src}'> -> {resolved} MISSING")

# 10. content sanity: no unconverted markdown or placeholders leaked through
allbody = "".join(z.read(n).decode() for n in xhtml)
ok("@swot" not in allbody, "literal '@swot' marker leaked into output")
ok("[[FILL" not in allbody, "scaffold placeholder [[FILL]] leaked into a published file")
ok("SCAFFOLD" not in allbody, "SCAFFOLD text leaked into output")
warn("**" not in allbody, "unconverted '**' bold markers present")

# 11. all 14 SWOT images actually referenced
for i in range(1, 15):
    ok(f"ch{i:02d}-swot.png" in "".join(names), f"SWOT image for chapter {i} not packaged")
    ok(f"ch{i:02d}-swot.png" in allbody, f"SWOT image for chapter {i} not referenced in text")

# 12. word count
import html as H
text = re.sub(r"<[^>]+>", " ", allbody)
words = len(H.unescape(text).split())
print(f"  word count (incl. front matter): ~{words:,}")
warn(words > 15000, f"only {words} words — thin for a paid non-fiction title")

print(f"\n  archive entries: {len(names)}   size: {EPUB.stat().st_size/1024/1024:.2f} MB")
print(f"  xhtml docs: {len(xhtml)}   spine items: {len(spine_ids)}")
for w in warns: print(f"  WARN  {w}")
if fails:
    print(f"\n  {len(fails)} FAILURE(S):")
    for f in fails: print(f"    ✗ {f}")
    sys.exit(1)
print("\n  ALL CHECKS PASSED")
