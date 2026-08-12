from PIL import Image
from pathlib import Path


def remove_white_bg(src: Path, dst: Path, threshold: int = 245, soft: int = 30) -> None:
    img = Image.open(src).convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (r, g, b, 0)
            elif r >= threshold - soft and g >= threshold - soft and b >= threshold - soft:
                whiteness = min(r, g, b)
                alpha = int(max(0, min(255, (threshold - whiteness) * (255 / soft))))
                pixels[x, y] = (r, g, b, min(a, alpha))
    img.save(dst, "PNG")
    print(f"ok {dst.name} ({w}x{h})")


def main() -> None:
    brand = Path(r"C:\dev\WAZEN\public\brand")
    # Only logos that should sit on transparent website surfaces
    targets = [
        "wazen-lockup.png",
        "wazen-mark.png",
        "wazen-lockup-official.png",
        "wazen-logo-source.png",
    ]
    for name in targets:
        src = brand / name
        if not src.exists():
            continue
        bak = brand / f"{src.stem}-with-bg.png"
        if not bak.exists():
            Image.open(src).convert("RGBA").save(bak)
            print(f"backup {bak.name}")
        remove_white_bg(bak, src)


if __name__ == "__main__":
    main()
