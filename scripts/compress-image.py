#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "Pillow>=11,<12",
# ]
# ///

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "docs/assets/overview.png"
DEFAULT_OUTPUT = ROOT / "docs/assets/overview.webp"


def compress_image(source: Path, target: Path, quality: int) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(source) as image:
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")

        image.save(target, format="WEBP", quality=quality, method=6)

    source_size = source.stat().st_size
    target_size = target.stat().st_size
    reduction = (1 - target_size / source_size) * 100
    print(f"Converted {source} -> {target}")
    print(f"Size: {source_size:,} -> {target_size:,} bytes ({reduction:.1f}% smaller)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Compress an image as WebP.")
    parser.add_argument("source", nargs="?", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("target", nargs="?", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--quality", type=int, default=85, choices=range(1, 101))
    args = parser.parse_args()

    source = args.source if args.source.is_absolute() else ROOT / args.source
    target = args.target if args.target.is_absolute() else ROOT / args.target
    compress_image(source, target, args.quality)


if __name__ == "__main__":
    main()
