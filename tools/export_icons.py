"""Export RepPulse icon assets from the designer masters in assets-src/icons.

Only technical preparation is performed (resize + PNG export). The artwork,
palette, composition and background are never modified.

Usage:  python tools/export_icons.py
Requires: Pillow
"""
import os
from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets-src", "icons")
MEDIA = os.path.join(ROOT, "entry", "src", "main", "resources", "base", "media")
IN_APP = os.path.join(ROOT, "entry", "src", "main", "js", "MainAbility", "common", "icons")
EXPORT = os.path.join(ROOT, "assets-src", "export")

# Lite wearable installer (GtBundleParser) hard-requires the ability icon to be exactly
# "$media:icon" and both media/icon.png and media/icon_small.png to exist, otherwise the
# install fails with error 40. Sizes match the BreathTrainer HAP proven on Watch Fit 4 Pro.
LAUNCHER_SIZE = 104
LAUNCHER_SMALL_SIZE = 92

# Lite <image> renders bitmaps at their native size, so every on-screen size is exported --
# and nothing else: each bitmap ships as PNG + converted .bin, and the HAP travels over Bluetooth.
IN_APP_SIZES = {
    "squat_icon": [28, 64],
    "pushup_icon": [28, 64],
    "reppulse_app_icon": [48],
}

QA_SIZES = [1024, 512, 192, 96, 48]

# Masters drawn as a disc on a black square: the corners become transparent (a technical
# transparency step the spec allows); every pixel inside the disc is kept as is.
ROUND_MASTERS = {"reppulse_app_icon"}
DISC_THRESHOLD = 40  # R+G+B above this is the disc, below is the black corner field


def load(name):
    for ext in (".png", ".webp", ".svg"):
        path = os.path.join(SRC, name + ext)
        if os.path.exists(path):
            return Image.open(path).convert("RGBA")
    raise FileNotFoundError("missing master asset: " + name)


def find_disc(img):
    """Centre and radius of the disc, measured along the middle row and column."""
    w, h = img.size
    row = [sum(img.getpixel((x, h // 2))[:3]) for x in range(w)]
    col = [sum(img.getpixel((w // 2, y))[:3]) for y in range(h)]
    left = next(x for x in range(w) if row[x] > DISC_THRESHOLD)
    right = next(x for x in range(w - 1, -1, -1) if row[x] > DISC_THRESHOLD)
    top = next(y for y in range(h) if col[y] > DISC_THRESHOLD)
    bottom = next(y for y in range(h - 1, -1, -1) if col[y] > DISC_THRESHOLD)
    radius = max(right - left, bottom - top) / 2.0 + 2
    return (left + right) / 2.0, (top + bottom) / 2.0, radius


def round_alpha(img):
    """Transparent outside the disc; drawn 4x larger and scaled down for a smooth edge."""
    cx, cy, r = find_disc(img)
    k = 4
    mask = Image.new("L", (img.width * k, img.height * k), 0)
    ImageDraw.Draw(mask).ellipse(((cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k), fill=255)
    mask = mask.resize(img.size, Image.LANCZOS)
    out = img.copy()
    out.putalpha(ImageChops.multiply(img.getchannel("A"), mask))
    return out


def save(img, size, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path, "PNG", optimize=True)
    print("wrote", os.path.relpath(path, ROOT))


def main():
    app = load("reppulse_app_icon")
    if "reppulse_app_icon" in ROUND_MASTERS:
        app = round_alpha(app)
    save(app, LAUNCHER_SIZE, os.path.join(MEDIA, "icon.png"))
    save(app, LAUNCHER_SMALL_SIZE, os.path.join(MEDIA, "icon_small.png"))
    for size in QA_SIZES:
        save(app, size, os.path.join(EXPORT, "reppulse_app_icon_%d.png" % size))

    for name, sizes in IN_APP_SIZES.items():
        img = load(name)
        if name in ROUND_MASTERS:
            img = round_alpha(img)
        for size in sizes:
            save(img, size, os.path.join(IN_APP, "%s_%d.png" % (name, size)))

    # history_icon: master not delivered yet -> UI uses the neutral "—" placeholder.
    if os.path.exists(os.path.join(SRC, "history_icon.webp")) or os.path.exists(
        os.path.join(SRC, "history_icon.png")
    ):
        img = load("history_icon")
        for size in (28, 64):
            save(img, size, os.path.join(IN_APP, "history_icon_%d.png" % size))
    else:
        print("history_icon master not found - placeholder will be used")


if __name__ == "__main__":
    main()
