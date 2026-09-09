from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from .analysis import analyze_array
from .synthetic import periodic_sample


def _load(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        if image.mode in {"L", "I", "F"} or image.mode.startswith("I;16"):
            return np.asarray(image)
        return np.asarray(image.convert("L" if image.mode == "1" else "RGB"))


def _write_diagnostics(report: dict, directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    fft = report["_diagnostics"]["fft_log_power"]
    ac = report["_diagnostics"]["autocorrelation"]
    for name, array in (("fft-log-power.png", fft), ("autocorrelation.png", ac)):
        normalized = (array - array.min()) / max(float(array.max() - array.min()), 1e-18)
        Image.fromarray(np.clip(normalized * 255, 0, 255).astype(np.uint8), mode="L").save(directory / name)


def _clean_report(report: dict) -> dict:
    return {key: value for key, value in report.items() if key != "_diagnostics"}


def _analyze(path: Path, output_json: Path | None, diagnostics: Path | None) -> int:
    report = analyze_array(_load(path))
    if diagnostics:
        _write_diagnostics(report, diagnostics)
    encoded = json.dumps(_clean_report(report), ensure_ascii=False, indent=2)
    if output_json:
        output_json.write_text(encoded + "\n", encoding="utf-8")
    else:
        print(encoded)
    return 0


def _demo(directory: Path) -> int:
    directory.mkdir(parents=True, exist_ok=True)
    image = periodic_sample(width=256, height=192, period=16, orientation="vertical", seed=7)
    image_path = directory / "synthetic-period-16.png"
    Image.fromarray(image, mode="L").save(image_path)
    return _analyze(image_path, directory / "report.json", directory / "diagnostics")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="periodic-stego")
    sub = parser.add_subparsers(dest="command", required=True)
    analyze = sub.add_parser("analyze", help="analyze an image with FFT and autocorrelation")
    analyze.add_argument("image", type=Path)
    analyze.add_argument("--json", dest="output_json", type=Path)
    analyze.add_argument("--diagnostics", type=Path)
    demo = sub.add_parser("demo", help="generate and analyze a synthetic periodic sample")
    demo.add_argument("--output", type=Path, default=Path("periodic-stego-demo"))
    args = parser.parse_args(argv)
    if args.command == "analyze":
        return _analyze(args.image, args.output_json, args.diagnostics)
    return _demo(args.output)


if __name__ == "__main__":
    raise SystemExit(main())
