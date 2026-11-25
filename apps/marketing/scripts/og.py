"""Generate public/og.png (1200x630) from brand tokens. Run: python3 scripts/og.py."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "og.png"

W, H = 1200, 630
CREAM = (251, 245, 236)
INK = (43, 26, 22)
BERRY = (166, 43, 82)
MUTED = (122, 96, 88)

SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SERIF_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
SANS = "/System/Library/Fonts/Helvetica.ttc"


def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except OSError:
        return ImageFont.load_default()


img = Image.new("RGB", (W, H), CREAM)
d = ImageDraw.Draw(img)

# Hairline frame, echoing the page's .frame border.
d.rectangle([24, 24, W - 24, H - 24], outline=(228, 214, 200), width=2)

d.text((90, 120), "FreshSkin", font=font(SERIF_BOLD, 120), fill=INK)
d.text(
    (92, 270),
    "Skincare and scent that actually fits you.",
    font=font(SERIF, 52),
    fill=INK,
)
d.text(
    (92, 360),
    "Photograph your skin, scan any label — every",
    font=font(SANS, 34),
    fill=MUTED,
)
d.text(
    (92, 405),
    "recommendation comes with its reason.",
    font=font(SANS, 34),
    fill=MUTED,
)

# Berry pill echoing the CTA.
pill = [90, 490, 420, 556]
d.rounded_rectangle(pill, radius=33, fill=BERRY)
d.text((140, 502), "Open the app  →", font=font(SANS, 30), fill=CREAM)

# Ghost numeral, echoing the page's oversized section type.
d.text((880, 330), "01", font=font(SERIF_BOLD, 300), fill=(238, 226, 210))

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT, "PNG", optimize=True)
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
