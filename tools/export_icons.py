"""Export RepPulse icon assets from the designer masters in assets-src/icons.

Only technical preparation is performed (resize + PNG export). The artwork,
palette, composition and background are never modified.

Usage:  python tools/export_icons.py
Requires: Pillow
"""
import os
from PIL import Image

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

# Lite <image> renders bitmaps at their native size, so every on-screen size is exported.
IN_APP_SIZES = {
    "squat_icon": [28, 64, 96],
    "pushup_icon": [28, 64, 96],
    "reppulse_app_icon": [48, 104],
}

QA_SIZES = [1024, 512, 192, 96, 48]


def load(name):
    for ext in (".png", ".webp", ".svg"):
        path = os.path.join(SRC, name + ext)
        if os.path.exists(path):
            return Image.open(path).convert("RGBA")
    raise FileNotFoundError("missing master asset: " + name)


def save(img, size, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path, "PNG", optimize=True)
    print("wrote", os.path.relpath(path, ROOT))


def main():
    app = load("reppulse_app_icon")
    save(app, LAUNCHER_SIZE, os.path.join(MEDIA, "icon.png"))
    save(app, LAUNCHER_SMALL_SIZE, os.path.join(MEDIA, "icon_small.png"))
    for size in QA_SIZES:
        save(app, size, os.path.join(EXPORT, "reppulse_app_icon_%d.png" % size))

    for name, sizes in IN_APP_SIZES.items():
        img = load(name)
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
