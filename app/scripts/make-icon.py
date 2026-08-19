"""从 assets/Aurora_Player_logo.png 生成多分辨率 Windows 图标 icon.ico。

用法：
    python make-icon.py
输出：app/build-resources/icon.ico
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "assets", "Aurora_Player_logo.png")
OUT = os.path.join(HERE, "..", "build-resources", "icon.ico")
SIZES = [16, 24, 32, 48, 64, 128, 256]


def main():
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    s = min(w, h)
    left = (w - s) // 2
    top = (h - s) // 2
    im = im.crop((left, top, left + s, top + s))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    im.save(OUT, format="ICO", sizes=[(sz, sz) for sz in SIZES])
    print("wrote", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
