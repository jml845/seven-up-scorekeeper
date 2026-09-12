from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
NAVY = "#071536"
CYAN = "#35d9ff"
WHITE = "#ffffff"


def font(size, bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", size)


def contain(im, box):
    copy = im.copy()
    copy.thumbnail(box, Image.Resampling.LANCZOS)
    return copy


def phone_asset(source, title, subtitle, output):
    canvas = Image.new("RGB", (1080, 1920), NAVY)
    draw = ImageDraw.Draw(canvas)
    draw.text((72, 90), title, fill=WHITE, font=font(66, True))
    draw.text((72, 180), subtitle, fill=CYAN, font=font(35))
    shot = contain(Image.open(source).convert("RGB"), (780, 1540))
    x = (1080 - shot.width) // 2
    y = 300
    draw.rounded_rectangle((x - 18, y - 18, x + shot.width + 18, y + shot.height + 18), 34, fill="#10285a")
    canvas.paste(shot, (x, y))
    canvas.save(OUT / output, optimize=True)


logo = Image.open(ROOT / "icon-512.png").convert("RGBA")
logo.save(OUT / "app-icon-512.png", optimize=True)

feature = Image.new("RGB", (1024, 500), NAVY)
draw = ImageDraw.Draw(feature)
mark = contain(logo, (310, 310))
feature.paste(mark, (65, 95), mark)
draw.text((415, 115), "FlipCast", fill=WHITE, font=font(76, True))
draw.text((418, 220), "Score fast.", fill=CYAN, font=font(39, True))
draw.text((418, 272), "See it live on TV.", fill=WHITE, font=font(39))
feature.save(OUT / "feature-graphic-1024x500.png", optimize=True)

shots = ROOT / "promo" / "rendered"
phone_asset(shots / "phone-home.png", "Start in seconds", "No account required", "phone-01-home.png")
phone_asset(shots / "phone-game.png", "Keep every round moving", "Fast scoring for up to 18 players", "phone-02-game.png")
phone_asset(shots / "phone-score.png", "Built-in card calculator", "Classic and Vengeance editions", "phone-03-score.png")
phone_asset(shots / "phone-history.png", "Remember every game", "On-device game history", "phone-04-history.png")
phone_asset(shots / "phone-stats.png", "Settle the rivalry", "All-time player statistics", "phone-05-stats.png")

print("Generated Google Play assets in", OUT)
