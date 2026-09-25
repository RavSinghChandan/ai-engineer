"""Build a KDP-ready EPUB 3 by hand.

No pandoc or calibre on this machine, so the container is assembled directly.
KDP accepts EPUB (.epub) as its preferred reflowable format; it converts to
KFX on upload. Requirements honoured here:
  - mimetype stored FIRST and UNCOMPRESSED (the one hard rule in the spec)
  - a nav document with epub:type="toc" (EPUB 3 requirement)
  - an NCX as well, for older Kindle pipelines
  - cover declared via <meta name="cover"> AND properties="cover-image"
  - no fixed fonts or absolute sizes, so the reader's font settings win
"""
import os, re, zipfile, html, pathlib, datetime, shutil, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT  = ROOT / "build"
TITLE  = "The Cost of the Vedas"
AUTHOR = "Chandan Kumar"
UUID   = "urn:uuid:8f14e45f-ceea-467a-9a3c-1f0d2b7c5a90"
LANG   = "en"

CSS = """
/* Reflowable, reader-respecting. No absolute font sizes, no fixed fonts:
   on Kindle the reader's own typeface and size must always win. */
body { margin: 0 1em; line-height: 1.5; text-align: left; }
h1 { font-size: 1.6em; line-height: 1.25; margin: 2em 0 0.2em; text-align: left;
     page-break-before: always; font-weight: normal; }
h2 { font-size: 1.12em; margin: 1.8em 0 0.5em; font-weight: bold; }
p  { margin: 0 0 0.85em; text-indent: 0; }
blockquote { margin: 1.2em 1.4em; font-style: italic; }
.chapno { font-size: 0.82em; letter-spacing: 0.16em; text-transform: uppercase;
          margin: 0 0 0.1em; }
.sub { font-style: italic; margin: 0 0 1.4em; }
.swot { margin: 1.6em 0; text-align: center; page-break-inside: avoid; }
.swot img { max-width: 100%; height: auto; }
.swot .cap { font-size: 0.82em; margin-top: 0.4em; }
.tp-title { font-size: 2.1em; margin: 3em 0 0.1em; text-align: center; font-weight: normal; }
.tp-sub { text-align: center; font-style: italic; margin: 0 0 2.5em; }
.tp-auth { text-align: center; font-size: 1.15em; letter-spacing: 0.12em; }
.front p { text-align: left; }
hr.sep { border: 0; border-top: 1px solid currentColor; width: 25%;
         margin: 2em auto; opacity: 0.4; }
.note { font-size: 0.9em; }
"""

def md_to_xhtml(md, swot_img=None):
    """Convert the subset of Markdown actually used in this manuscript.

    Deliberately small: headings, paragraphs, blockquotes, **bold**, *italic*,
    and the @swot marker. Anything else would be a silent formatting bug in a
    published book, so unknown constructs pass through as plain text.
    """
    out, lines, i = [], md.split("\n"), 0
    para = []

    def flush():
        if not para:
            return
        t = " ".join(para).strip()
        para.clear()
        if t:
            out.append("<p>%s</p>" % inline(t))

    def inline(t):
        t = html.escape(t, quote=False)
        t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
        t = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"<em>\1</em>", t)
        return t

    while i < len(lines):
        ln = lines[i].rstrip()
        if ln.startswith("# "):
            flush()
            title = ln[2:].strip()
            m = re.match(r"Chapter (\d+)\s*[—-]\s*(.+)", title)
            if m:
                out.append('<p class="chapno">Chapter %s</p>' % m.group(1))
                out.append("<h1>%s</h1>" % inline(m.group(2)))
            else:
                out.append("<h1>%s</h1>" % inline(title))
        elif ln.startswith("## "):
            flush(); out.append("<h2>%s</h2>" % inline(ln[3:].strip()))
        elif ln.startswith("> "):
            flush()
            q = [ln[2:].strip()]
            while i + 1 < len(lines) and lines[i + 1].startswith("> "):
                i += 1; q.append(lines[i][2:].strip())
            out.append("<blockquote><p>%s</p></blockquote>" % inline(" ".join(q)))
        elif ln.strip() == "@swot":
            flush()
            if swot_img:
                out.append(
                    '<div class="swot"><img src="../images/%s" alt="SWOT analysis"/>'
                    '<p class="cap">SWOT: this dimension at a glance</p></div>' % swot_img)
        elif ln.strip().startswith("*") and ln.strip().endswith("*") and len(ln.strip()) > 2 and "**" not in ln:
            flush(); out.append('<p class="sub">%s</p>' % inline(ln.strip()[1:-1]))
        elif not ln.strip():
            flush()
        else:
            para.append(ln.strip())
        i += 1
    flush()
    return "\n".join(out)


def page(title, body, cls=""):
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="{LANG}" xml:lang="{LANG}">
<head><meta charset="utf-8"/><title>{html.escape(title)}</title>
<link rel="stylesheet" type="text/css" href="../css/style.css"/></head>
<body{f' class="{cls}"' if cls else ''}>
{body}
</body></html>
"""


def build(chapters, front_matter, out_path):
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "OEBPS" / "text").mkdir(parents=True)
    (OUT / "OEBPS" / "css").mkdir(parents=True)
    (OUT / "OEBPS" / "images").mkdir(parents=True)
    (OUT / "META-INF").mkdir(parents=True)

    (OUT / "OEBPS" / "css" / "style.css").write_text(CSS)

    manifest, spine, navlis, ncxpts = [], [], [], []
    play = 1

    # cover image
    shutil.copy(ROOT / "cover" / "front-cover.jpg", OUT / "OEBPS" / "images" / "cover.jpg")
    manifest.append('<item id="cover-image" href="images/cover.jpg" '
                    'media-type="image/jpeg" properties="cover-image"/>')

    cover_xhtml = page("Cover",
        '<div style="text-align:center;margin:0;padding:0;">'
        '<img src="../images/cover.jpg" alt="The Cost of the Vedas" '
        'style="max-width:100%;height:auto;"/></div>')
    (OUT / "OEBPS" / "text" / "cover.xhtml").write_text(cover_xhtml)
    manifest.append('<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>')
    spine.append('<itemref idref="cover" linear="yes"/>')

    for idx, (fid, title, body, cls) in enumerate(front_matter):
        fn = f"{fid}.xhtml"
        (OUT / "OEBPS" / "text" / fn).write_text(page(title, body, cls))
        manifest.append(f'<item id="{fid}" href="text/{fn}" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="{fid}"/>')
        if fid != "titlepage":
            navlis.append(f'<li><a href="text/{fn}">{html.escape(title)}</a></li>')
            ncxpts.append((play, title, f"text/{fn}")); play += 1

    for n, (src, swot_img, nav_title) in enumerate(chapters, start=1):
        md = (ROOT / "manuscript" / src).read_text()
        if swot_img:
            shutil.copy(ROOT / "images" / swot_img, OUT / "OEBPS" / "images" / swot_img)
            manifest.append(f'<item id="img{n}" href="images/{swot_img}" media-type="image/png"/>')
        cid = f"ch{n:02d}"
        fn = f"{cid}.xhtml"
        (OUT / "OEBPS" / "text" / fn).write_text(page(nav_title, md_to_xhtml(md, swot_img)))
        manifest.append(f'<item id="{cid}" href="text/{fn}" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="{cid}"/>')
        navlis.append(f'<li><a href="text/{fn}">{html.escape(nav_title)}</a></li>')
        ncxpts.append((play, nav_title, f"text/{fn}")); play += 1

    nav = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="{LANG}" xml:lang="{LANG}">
<head><meta charset="utf-8"/><title>Contents</title>
<link rel="stylesheet" type="text/css" href="../css/style.css"/></head>
<body>
<nav epub:type="toc" id="toc"><h1>Contents</h1>
<ol>
{chr(10).join(navlis)}
</ol></nav>
<nav epub:type="landmarks" hidden="hidden">
<ol><li><a epub:type="cover" href="text/cover.xhtml">Cover</a></li>
<li><a epub:type="bodymatter" href="text/ch01.xhtml">Begin Reading</a></li></ol>
</nav>
</body></html>
"""
    (OUT / "OEBPS" / "text" / "nav.xhtml").write_text(nav)
    manifest.append('<item id="nav" href="text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')

    navmap = "\n".join(
        f'<navPoint id="n{p}" playOrder="{p}"><navLabel><text>{html.escape(t)}</text></navLabel>'
        f'<content src="{s}"/></navPoint>' for p, t, s in ncxpts)
    ncx = f"""<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="{UUID}"/><meta name="dtb:depth" content="1"/>
<meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>{html.escape(TITLE)}</text></docTitle>
<navMap>
{navmap}
</navMap></ncx>
"""
    (OUT / "OEBPS" / "toc.ncx").write_text(ncx)
    manifest.append('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')

    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="{LANG}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
<dc:identifier id="bookid">{UUID}</dc:identifier>
<dc:title>{html.escape(TITLE)}</dc:title>
<dc:creator id="auth">{html.escape(AUTHOR)}</dc:creator>
<meta refines="#auth" property="role" scheme="marc:relators">aut</meta>
<dc:language>{LANG}</dc:language>
<dc:date>{today[:10]}</dc:date>
<dc:publisher>{html.escape(AUTHOR)}</dc:publisher>
<dc:description>A fourteen-dimension audit of the Vedic inheritance: what it gave, what it cost, and what can actually be verified.</dc:description>
<dc:subject>Religion</dc:subject><dc:subject>Hinduism</dc:subject>
<dc:subject>History</dc:subject><dc:subject>Cultural Studies</dc:subject>
<meta property="dcterms:modified">{today}</meta>
<meta name="cover" content="cover-image"/>
</metadata>
<manifest>
{chr(10).join(manifest)}
</manifest>
<spine toc="ncx">
{chr(10).join(spine)}
</spine>
</package>
"""
    (OUT / "OEBPS" / "content.opf").write_text(opf)
    (OUT / "META-INF" / "container.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
        '<rootfiles><rootfile full-path="OEBPS/content.opf" '
        'media-type="application/oebps-package+xml"/></rootfiles></container>\n')
    (OUT / "mimetype").write_text("application/epub+zip")

    if out_path.exists():
        out_path.unlink()
    with zipfile.ZipFile(out_path, "w") as z:
        # mimetype MUST be first and stored uncompressed
        z.write(OUT / "mimetype", "mimetype", compress_type=zipfile.ZIP_STORED)
        for base, _, files in os.walk(OUT):
            for f in sorted(files):
                fp = pathlib.Path(base) / f
                rel = str(fp.relative_to(OUT))
                if rel == "mimetype":
                    continue
                z.write(fp, rel, compress_type=zipfile.ZIP_DEFLATED)
    return out_path
