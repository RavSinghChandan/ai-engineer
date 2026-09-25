"""Cover art for 'The Cost of the Vedas'.

Design brief, and why each decision was made:

  The book's thesis is that one late verse (Rigveda 10.90.12) was made to bear
  the weight of a civilisation, while the hymn beside it (10.129) admitted it
  did not know. The cover has to carry *weight* and *fracture* at once.

  So: a vertical column of Devanagari-suggesting strata — the layered corpus —
  with a single hairline fracture running through it. Not a lotus, not an Om,
  not a saffron gradient. Those signal devotional; this book is an audit.

  Palette is ink-on-parchment with a single oxidised-gold seam, because the
  cover must still read at 100px in a Kindle store grid AND in greyscale on
  an e-ink device.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1600, 2560

INK        = (22, 20, 18)
INK_SOFT   = (54, 49, 44)
PARCH      = (238, 231, 217)
PARCH_DEEP = (223, 213, 195)
GOLD       = (176, 132, 54)
GOLD_PALE  = (214, 178, 104)
CRIMSON    = (124, 42, 38)

FONT_DIRS = ["/System/Library/Fonts/Supplemental/", "/System/Library/Fonts/", "/Library/Fonts/"]

def font(name, size):
    import os
    for d in FONT_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    raise FileNotFoundError(name)

def parchment(w, h):
    """Aged-paper ground with fibre grain — never a flat fill."""
    rng = np.random.default_rng(1090)          # seeded: the verse in question
    base = np.zeros((h, w, 3), dtype=np.float64)
    top, bot = np.array(PARCH, float), np.array(PARCH_DEEP, float)
    for y in range(h):
        base[y, :, :] = top + (bot - top) * (y / h) ** 1.3
    grain = rng.normal(0, 4.2, (h, w, 1))
    base += grain
    # broad tonal clouding so the paper is not mechanically even
    small = rng.normal(0, 1.0, (h // 40, w // 40, 1))
    cloud = np.array(Image.fromarray(
        np.clip(small * 40 + 128, 0, 255).astype(np.uint8).squeeze()
    ).resize((w, h), Image.BICUBIC), dtype=np.float64)
    base += (cloud[:, :, None] - 128) * 0.16
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")

def vignette(img, strength=0.13):
    """A whisper of edge-darkening only.

    Heavy vignetting turns parchment muddy and, at store-thumbnail size, reads
    as a badly-scanned photograph. The corners stay clearly paper-coloured.
    """
    w, h = img.size
    y, x = np.mgrid[0:h, 0:w]
    cx, cy = w / 2, h / 2
    r = np.sqrt(((x - cx) / cx) ** 2 + ((y - cy) / cy) ** 2)
    m = np.clip(1 - strength * np.clip(r - 0.62, 0, None) ** 1.4, 0, 1)
    a = np.array(img, float) * m[:, :, None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB")


def strata(draw, x0, x1, y0, y1, n=34):
    """The corpus as sedimentary layers: dense, ruled, textual.

    Each band is a hymn-layer. Density increases downward (later layers are
    thicker in the Rigveda's own structure), and the bands are ruled with
    short ticks that read as script at distance without imitating any real
    Devanagari — the book must not appear to quote a text it cannot set.
    """
    rng = np.random.default_rng(10129)
    ys = np.linspace(y0, y1, n + 1)
    for i in range(n):
        a, b = ys[i], ys[i + 1]
        depth = i / (n - 1)
        col = tuple(int(INK_SOFT[c] + (PARCH_DEEP[c] - INK_SOFT[c]) * (0.46 - 0.30 * depth))
                    for c in range(3))
        draw.rectangle([x0, a, x1, a + 2.8], fill=col)
        # tick marks standing in for text, denser lower down
        ticks = int(16 + 30 * depth)
        cw = (x1 - x0) / ticks
        for t in range(ticks):
            if rng.random() < 0.20:
                continue
            tx = x0 + t * cw + cw * 0.18
            tw = cw * rng.uniform(0.34, 0.66)
            th = (b - a) * rng.uniform(0.24, 0.42)
            ty = a + (b - a) * 0.46
            draw.rectangle([tx, ty, tx + tw, ty + th], fill=col)


def fracture(img, x_top, x_bot, y0, y1):
    """A single hairline fissure through the strata.

    One fracture, not a shatter: the argument of the book is that one verse
    split the tradition's authority from its content, not that the corpus
    fell apart.
    """
    d = ImageDraw.Draw(img, "RGBA")
    rng = np.random.default_rng(7)
    n = 260
    ys = np.linspace(y0, y1, n)
    xs = np.linspace(x_top, x_bot, n) + np.cumsum(rng.normal(0, 2.6, n))
    xs = xs - np.linspace(0, xs[-1] - x_bot, n)      # re-anchor the endpoint
    pts = list(zip(xs, ys))
    # gold seam, wide soft pass then tight bright pass
    for wdt, col in ((26, (*GOLD, 34)), (14, (*GOLD, 88)), (7, (*GOLD, 168)), (3, (*GOLD_PALE, 255))):
        d.line(pts, fill=col, width=wdt, joint="curve")
    # a few short branches, upper third only
    for i in range(6, n // 3, 14):
        bx, by = xs[i], ys[i]
        d.line([(bx, by), (bx + rng.uniform(-46, 46), by + rng.uniform(16, 42))],
               fill=(*GOLD, 150), width=4)
    return img


def front():
    img = parchment(W, H)
    d = ImageDraw.Draw(img)

    m = 150
    # --- rule above title ---
    d.rectangle([m, 300, W - m, 303], fill=INK)

    f_title = font("Didot.ttc", 172)
    f_the   = font("Didot.ttc", 92)
    f_sub   = font("Optima.ttc", 46)
    f_auth  = font("Optima.ttc", 58)
    f_small = font("Optima.ttc", 38)

    def ctr(text, f, y, fill=INK, track=0):
        if track == 0:
            w = d.textlength(text, font=f)
            d.text(((W - w) / 2, y), text, font=f, fill=fill)
            return
        total = sum(d.textlength(c, font=f) for c in text) + track * (len(text) - 1)
        x = (W - total) / 2
        for c in text:
            d.text((x, y), c, font=f, fill=fill)
            x += d.textlength(c, font=f) + track

    ctr("THE COST", f_the, 350, INK_SOFT, track=14)
    ctr("OF THE", f_the, 470, INK_SOFT, track=14)
    ctr("VEDAS", f_title, 600, INK)

    d.rectangle([W / 2 - 110, 830, W / 2 + 110, 832], fill=GOLD)

    ctr("Fourteen dimensions of an inheritance", f_sub, 890, INK_SOFT)
    ctr("weighed honestly", f_sub, 950, INK_SOFT)

    # --- the strata block with its fracture ---
    sx0, sx1, sy0, sy1 = m + 60, W - m - 60, 1150, 1980
    strata(d, sx0, sx1, sy0, sy1)
    img = fracture(img, W * 0.44, W * 0.58, sy0 - 26, sy1 + 26)
    d = ImageDraw.Draw(img)

    # --- the two hymn numbers, the book's real subject ---
    f_ref = font("Optima.ttc", 34)
    d.text((sx0, sy1 + 40), "10.90", font=f_ref, fill=CRIMSON)
    rw = d.textlength("10.129", font=f_ref)
    d.text((sx1 - rw, sy1 + 40), "10.129", font=f_ref, fill=INK_SOFT)

    d.rectangle([m, 2250, W - m, 2252], fill=INK)
    ctr("CHANDAN KUMAR", f_auth, 2300, INK, track=8)
    ctr("R I G  ·  Y A J U R  ·  S A M A  ·  A T H A R V A", f_small, 2420, INK_SOFT)

    return vignette(img)


if __name__ == "__main__":
    f = front()
    f.save("cover/front-cover.png", "PNG")
    f.convert("RGB").save("cover/front-cover.jpg", "JPEG", quality=95, subsampling=0)
    print("front:", f.size)


def back():
    """Back cover.

    Kindle ebooks have no back cover — KDP takes a single front image. This is
    built for the paperback edition and for social/marketing use, at the same
    trim so the two read as one object.
    """
    img = parchment(W, H)
    d = ImageDraw.Draw(img)
    m = 150

    f_h    = font("Didot.ttc", 62)
    f_body = font("Optima.ttc", 43)
    f_pull = font("Didot.ttc", 54)
    f_small= font("Optima.ttc", 34)

    def para(text, f, y, lead, fill=INK_SOFT, x=m, width=W - 2 * m, indent_first=False):
        words, line, lines = text.split(), "", []
        for w in words:
            t = (line + " " + w).strip()
            if d.textlength(t, font=f) <= width:
                line = t
            else:
                lines.append(line); line = w
        lines.append(line)
        for ln in lines:
            d.text((x, y), ln, font=f, fill=fill)
            y += lead
        return y

    y = 260
    d.rectangle([m, y, W - m, y + 3], fill=INK); y += 70

    # --- the pull quote: the book's actual argument ---
    for ln in ["“Or perhaps", "he does not know.”"]:
        w = d.textlength(ln, font=f_pull)
        d.text(((W - w) / 2, y), ln, font=f_pull, fill=INK); y += 72
    y += 12
    w = d.textlength("Rigveda 10.129", font=f_small)
    d.text(((W - w) / 2, y), "Rigveda 10.129", font=f_small, fill=GOLD); y += 110

    d.rectangle([W / 2 - 90, y, W / 2 + 90, y + 2], fill=GOLD); y += 80

    y = para("Four collections of hymns, composed three thousand years ago and "
             "carried since in human memory, shaped how a fifth of humanity "
             "marries, eats, mourns and thinks.", f_body, y, 62, INK)
    y += 34
    y = para("This book weighs that inheritance across fourteen dimensions of "
             "human life — knowledge, social order, women, language, science, "
             "medicine, ritual, ethics, nature, work, music, philosophy, "
             "diaspora, and the modern encounter — and gives each a plain "
             "accounting of what it gave and what it cost.", f_body, y, 62)
    y += 34
    y = para("The findings are not comfortable for anyone. The fourfold caste "
             "order appears in exactly one hymn out of more than a thousand, in "
             "the latest layer, in language a Victorian scholar could already "
             "tell was younger than its neighbours. Women are named as seers of "
             "the hymns — and later barred from reading them. The same final "
             "layer that gave hierarchy its verse gave humanity a hymn that "
             "refuses to claim it knows how anything began.", f_body, y, 62)
    y += 34
    y = para("Every claim is cited. Where the evidence runs out, this book says "
             "so rather than filling the gap.", f_body, y, 62, INK)

    y += 70
    d.rectangle([m, y, W - m, y + 2], fill=INK_SOFT); y += 50
    y = para("Chandan Kumar writes on inheritance, evidence and identity.",
             f_small, y, 48, INK_SOFT)

    # spine-ish footer band
    d.rectangle([m, H - 300, W - m, H - 298], fill=INK)
    t = "R I G   ·   Y A J U R   ·   S A M A   ·   A T H A R V A"
    w = d.textlength(t, font=f_small)
    d.text(((W - w) / 2, H - 250), t, font=f_small, fill=INK_SOFT)

    return vignette(img)
