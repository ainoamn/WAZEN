from pathlib import Path
import base64
import io

from PIL import Image, ImageDraw

mark = Image.open(r"public/brand/wazen-mark.png").convert("RGBA")
bbox = mark.getbbox()
mark = mark.crop(bbox)


def make_icon(size: int, bg=(15, 23, 42, 255), pad_ratio: float = 0.12) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    max_w = int(size * (1 - 2 * pad_ratio))
    max_h = int(size * (1 - 2 * pad_ratio))
    ratio = min(max_w / mark.width, max_h / mark.height)
    nw = max(1, int(mark.width * ratio))
    nh = max(1, int(mark.height * ratio))
    resized = mark.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def write_svg(path: Path, size: int, pad_ratio: float = 0.1) -> None:
    buf = io.BytesIO()
    make_icon(size, pad_ratio=pad_ratio).save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    path.write_text(
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
            'role="img" aria-label="WAZEN">\n'
            f'  <image href="data:image/png;base64,{b64}" width="{size}" height="{size}"/>\n'
            "</svg>\n"
        ),
        encoding="utf-8",
    )


Path("app").mkdir(exist_ok=True)
make_icon(512, pad_ratio=0.11).save(r"app/icon.png")
make_icon(180, pad_ratio=0.11).save(r"app/apple-icon.png")

sizes = [16, 32, 48]
imgs = [make_icon(s, pad_ratio=0.08) for s in sizes]
imgs[0].save(
    r"public/favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=imgs[1:],
)

write_svg(Path(r"public/favicon.svg"), 128, pad_ratio=0.1)
write_svg(Path(r"public/brand/wazen-app-icon.svg"), 256, pad_ratio=0.12)

for s in (16, 32, 48, 180, 192, 512):
    make_icon(s, pad_ratio=0.1 if s >= 32 else 0.06).save(f"public/brand/favicon-{s}.png")

app = make_icon(1024, pad_ratio=0.12)
mask = Image.new("L", app.size, 0)
radius = int(min(app.size) * 0.22)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, *app.size), radius=radius, fill=255)
rounded = Image.new("RGBA", app.size, (0, 0, 0, 0))
rounded.paste(app, (0, 0))
rounded.putalpha(mask)
rounded.save(r"public/brand/wazen-app-icon.png")
make_icon(32, pad_ratio=0.08).save(r"public/favicon.png")
print("icon", Image.open(r"app/icon.png").size)
print("ok")
