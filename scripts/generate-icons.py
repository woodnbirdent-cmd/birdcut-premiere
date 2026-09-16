#!/usr/bin/env python3
"""Generate simple BirdCut PNG icons (no third-party deps)."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, size: int, rgba_at) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(rgba_at(x, y, size))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def icon_pixel(x: int, y: int, size: int) -> bytes:
    nx = x / (size - 1)
    ny = y / (size - 1)
    # dark rounded square
    edge = 0.06
    if nx < edge or ny < edge or nx > 1 - edge or ny > 1 - edge:
        return bytes((20, 22, 28, 255))
    # gold beak / slash
    slash = abs((nx - ny) - 0.08) < 0.11 and 0.18 < nx < 0.86
    body = ((nx - 0.42) ** 2) / 0.12 + ((ny - 0.52) ** 2) / 0.18 < 1 and nx < 0.62
    wing = ((nx - 0.58) ** 2) / 0.08 + ((ny - 0.38) ** 2) / 0.05 < 1
    mint = abs((nx + ny) - 1.12) < 0.08 and 0.35 < nx < 0.9
    if slash:
        return bytes((232, 184, 109, 255))
    if mint:
        return bytes((110, 231, 183, 255))
    if body or wing:
        return bytes((124, 156, 255, 255))
    return bytes((28, 32, 40, 255))


def main() -> None:
    icons = Path(__file__).resolve().parents[1] / "icons"
    icons.mkdir(exist_ok=True)
    write_png(icons / "icon.png", 46, icon_pixel)
    write_png(icons / "icon@2x.png", 92, icon_pixel)
    write_png(icons / "plugin.png", 96, icon_pixel)
    write_png(icons / "plugin@2x.png", 192, icon_pixel)
    print(f"wrote icons in {icons}")


if __name__ == "__main__":
    main()
