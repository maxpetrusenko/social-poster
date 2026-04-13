from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/private/tmp/social-poster-assets/gauntlet-referral-source.jpg")
OUT_DIR = ROOT / "public" / "campaigns" / "referral"

W, H = 1080, 1920
BG = "#0f1419"
GOLD = "#f2c14e"
TEXT = "#f7f4ef"
MUTED = "#d7d3cc"
CHIP = (255, 255, 255, 34)
CHIP_BORDER = (255, 255, 255, 82)
CARD_STROKE = "#7c6847"
CARD_BG = "#171a1f"

FONT_AVENIR = "/System/Library/Fonts/Avenir.ttc"
FONT_AVENIR_NEXT = "/System/Library/Fonts/Avenir Next.ttc"
FONT_ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_ARIAL_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"

VARIANTS = [
    {
        "kicker": "AI FIRST ENGINEERS",
        "headline": "Gauntlet AI",
        "body1": "Austin. Apartment. Meals. Laundry. Room cleaning.",
        "body2": "Build hard with AI and aim at a $200k to $1m role.",
        "metaLeft": "$0 cost",
        "metaRight": "CCAT required",
        "sub": "Questions? DM me.",
        "cta": "Apply link",
        "footer": "Use my apply link. Questions welcome.",
    },
    {
        "kicker": "FOR SERIOUS BUILDERS",
        "headline": "Gauntlet AI",
        "body1": "Most programs talk. This one compresses reps.",
        "body2": "Austin, housing, meals, laundry, room cleaning, hard AI work.",
        "metaLeft": "$0 upfront",
        "metaRight": "CCAT required",
        "sub": "Want the candid version? DM me.",
        "cta": "Apply link",
        "footer": "If it fits, use my apply link.",
    },
    {
        "kicker": "ENGINEERS",
        "headline": "Gauntlet AI",
        "body1": "Housing handled. Meals handled. Laundry handled.",
        "body2": "Use the time to get much better at building with AI.",
        "metaLeft": "$0 cost",
        "metaRight": "Austin",
        "sub": "Questions? Talk to me.",
        "cta": "Apply link",
        "footer": "Referral link in the application.",
    },
    {
        "kicker": "HIGH INTENSITY PATH",
        "headline": "Gauntlet AI",
        "body1": "Not for everyone. Strong upside for the right engineer.",
        "body2": "AI reps plus a path toward a $200k to $1m role.",
        "metaLeft": "$0 cost",
        "metaRight": "CCAT required",
        "sub": "Message me if you want context.",
        "cta": "Apply link",
        "footer": "Use my apply link if you apply.",
    },
]


def font(path: str, size: int):
    return ImageFont.truetype(path, size=size)


def draw_wrapped(draw, text, xy, font_obj, fill, max_width, line_gap=10):
    x, y = xy
    words = text.split()
    lines = []
    line = ""
    for word in words:
        test = word if not line else line + " " + word
        if draw.textbbox((0, 0), test, font=font_obj)[2] <= max_width:
            line = test
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)

    yy = y
    for line in lines:
        draw.text((x, yy), line, font=font_obj, fill=fill)
        bbox = draw.textbbox((x, yy), line, font=font_obj)
        yy += (bbox[3] - bbox[1]) + line_gap
    return yy


def build_story(source: Image.Image, payload: dict, out_path: Path):
    canvas = Image.new("RGBA", (W, H), BG)

    cover = source.copy()
    cover_ratio = max(W / cover.width, H / cover.height)
    cover = cover.resize(
        (int(cover.width * cover_ratio), int(cover.height * cover_ratio))
    )
    left = (cover.width - W) // 2
    upper = (cover.height - H) // 2
    cover = cover.crop((left, upper, left + W, upper + H)).filter(
        ImageFilter.GaussianBlur(18)
    )
    cover = Image.blend(cover, Image.new("RGB", (W, H), "#1a1611"), 0.42)
    canvas.alpha_composite(cover.convert("RGBA"))

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for i in range(940):
        alpha = int(176 * (i / 940))
        od.rectangle([0, H - 940 + i, W, H - 940 + i + 1], fill=(8, 10, 12, alpha))
    for i in range(420):
        alpha = int(150 * (1 - i / 420))
        od.rectangle([0, i, W, i + 1], fill=(8, 10, 12, alpha))
    canvas.alpha_composite(overlay)

    f_kicker = font(FONT_ARIAL_BOLD, 38)
    f_head = font(FONT_ARIAL_BLACK, 84)
    f_sub = font(FONT_AVENIR_NEXT, 50)
    f_meta = font(FONT_ARIAL_BOLD, 40)
    f_small = font(FONT_AVENIR, 34)
    f_chip = font(FONT_ARIAL_BOLD, 40)

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    x = 78
    y = 186

    d.text((x, y), payload["kicker"], font=f_kicker, fill=GOLD)
    y += 82
    y = draw_wrapped(d, payload["headline"], (x, y), f_head, TEXT, 650, line_gap=4)
    y += 12
    y = draw_wrapped(d, payload["body1"], (x, y), f_sub, MUTED, 710, line_gap=8)
    y += 24
    y = draw_wrapped(d, payload["body2"], (x, y), f_sub, TEXT, 710, line_gap=8)
    y += 24

    d.text((x, y), payload["metaLeft"], font=f_meta, fill=GOLD)
    d.text((x + 230, y), payload["metaRight"], font=f_meta, fill=TEXT)
    y += 72
    y = draw_wrapped(d, payload["sub"], (x, y), f_small, MUTED, 560, line_gap=6)

    chip_y = max(746, min(860, y + 30))
    chip_box = [x, chip_y, x + 344, chip_y + 88]
    d.rounded_rectangle(
        chip_box, radius=44, fill=CHIP, outline=CHIP_BORDER, width=2
    )
    icon_cx = x + 42
    icon_cy = chip_y + 44
    d.line((icon_cx - 10, icon_cy, icon_cx + 18, icon_cy), fill=TEXT, width=6)
    d.line((icon_cx + 2, icon_cy - 14, icon_cx + 18, icon_cy), fill=TEXT, width=6)
    d.line((icon_cx + 2, icon_cy + 14, icon_cx + 18, icon_cy), fill=TEXT, width=6)
    d.text((x + 76, chip_y + 22), payload["cta"], font=f_chip, fill=TEXT)

    card_w, card_h = 920, 620
    card_x = (W - card_w) // 2
    card_y = 1060
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        [card_x + 8, card_y + 18, card_x + card_w + 8, card_y + card_h + 18],
        radius=42,
        fill=(0, 0, 0, 108),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    canvas.alpha_composite(shadow)

    card = Image.new("RGBA", (card_w, card_h), CARD_BG)
    card_draw = ImageDraw.Draw(card)
    card_draw.rounded_rectangle(
        [0, 0, card_w, card_h], radius=40, fill=CARD_BG, outline=CARD_STROKE, width=3
    )

    main = source.copy()
    ratio = max((card_w - 24) / main.width, (card_h - 24) / main.height)
    main = main.resize((int(main.width * ratio), int(main.height * ratio)))
    left = (main.width - (card_w - 24)) // 2
    upper = (main.height - (card_h - 24)) // 2
    main = main.crop((left, upper, left + card_w - 24, upper + card_h - 24))
    mask = Image.new("L", (card_w - 24, card_h - 24), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, card_w - 24, card_h - 24], radius=34, fill=255)
    card.paste(main, (12, 12), mask)
    canvas.alpha_composite(card, (card_x, card_y))

    footer = payload["footer"]
    fb = d.textbbox((0, 0), footer, font=f_small)
    fw = fb[2] - fb[0]
    d.text(((W - fw) // 2, 1772), footer, font=f_small, fill=(230, 225, 215, 205))

    canvas.alpha_composite(layer)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(out_path, quality=95)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SRC).convert("RGB")
    for index, payload in enumerate(VARIANTS, start=1):
        build_story(source, payload, OUT_DIR / f"story-{index:02d}.png")
    print(f"Rendered {len(VARIANTS)} referral story assets into {OUT_DIR}")


if __name__ == "__main__":
    main()
