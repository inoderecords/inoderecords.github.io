"""
Subset Obel Mono down to what this page can actually put on screen.

    python font.py path/to/ObelMono-VF.woff2

WHY SUBSET AT ALL. Obel Mono ships 1,937 glyphs: Cyrillic, 256 Braille cells,
234 octants, box drawing, blocks, legacy graphics. It is a terminal typeface
and that range is the point of it. This page sets artist names and prices.
Shipping the whole thing costs 140 KB on a listings page whose audience is
somebody on mobile data deciding whether to trust a stranger on Marketplace.

Subset to Latin plus punctuation and currency, and the same file is 42 KB
while keeping the entire 100-900 weight axis. That is the size of the two
static JetBrains Mono files it replaced, for nine weights instead of two.

WHY RANGES AND NOT THE CHARACTERS ON THE PAGE. The tempting version of this
scans index.html and keeps exactly those codepoints. Then somebody adds a
record by Sigur Ros or Bjork, the accented letter is not in the font, and the
browser silently falls back to a different typeface mid-word. The saving is
not worth a shop that misspells an artist in a second font, so the ranges
cover Latin, Latin-1, Latin Extended-A and the punctuation and currency we
could plausibly reach for.

THE LICENCE HAS TO SURVIVE. pyftsubset drops name IDs 13 and 14, which is
where the OFL notice lives inside the file. The OFL requires that notice to
travel with the font, so this puts them back from the source rather than
relying on fonts/OFL.txt sitting next to it. Subsetting is explicitly
permitted ("Subset it, convert it, redraw it"); quietly stripping the licence
out of the binary while doing it is not.

Needs fonttools and brotli, neither of which the page needs:

    python -m pip install "fonttools[woff]"

The output is committed, so a fresh clone serves the page with nothing
installed. You only run this when the font is updated.
"""

import subprocess
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

OUT = Path("fonts/obel-mono-latin-vf.woff2")

# Basic Latin, Latin-1, Latin Extended-A, general punctuation, every currency
# sign (the peso is U+20B1), the trademark sign, arrows, minus, and the two
# codepoints a browser reaches for when something has gone wrong.
UNICODES = ",".join([
    "U+0000-00FF",
    "U+0100-017F",
    "U+2000-206F",
    "U+20A0-20BF",
    "U+2122",
    "U+2190-2193",
    "U+2212",
    "U+FEFF",
    "U+FFFD",
])

# Default features plus cv01, the dotted zero. Everything else stays out:
# ss02 (Handwritten) alone carries enough alternate glyphs to take the file
# from 42 KB to 88 KB, and nothing here sets it.
FEATURES = "cv01"


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2

    src = Path(sys.argv[1])
    if not src.exists():
        print(f"no such file: {src}", file=sys.stderr)
        print("Get it from https://typographic.systems/obel-mono (WOFF2 zip).", file=sys.stderr)
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)

    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset", str(src),
            f"--output-file={OUT}",
            "--flavor=woff2",
            f"--unicodes={UNICODES}",
            f"--layout-features+={FEATURES}",
            "--no-hinting",
            "--desubroutinize",
        ],
        check=True,
    )

    # Put the licence back. pyftsubset drops name IDs 13 and 14.
    source = TTFont(src)
    subset = TTFont(OUT)
    restored = []
    for nid in (0, 13, 14):
        for rec in source["name"].names:
            if rec.nameID == nid:
                subset["name"].setName(
                    rec.toUnicode(), nid, rec.platformID, rec.platEncID, rec.langID
                )
                restored.append(nid)
                break
    subset.save(OUT)

    axes = [(a.axisTag, a.minValue, a.maxValue) for a in subset["fvar"].axes]
    size = OUT.stat().st_size
    print(f"{OUT}  {size / 1024:.1f} KB  {len(subset.getGlyphOrder())} glyphs  axes={axes}")
    print(f"restored name IDs {sorted(set(restored))}: {subset['name'].getDebugName(13)}")
    if 13 not in restored:
        print("WARNING: no licence record in the source font. Check it by hand.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
