from pathlib import Path

import numpy as np
from PIL import Image

from periodic_stego.analysis import analyze_array
from periodic_stego.synthetic import periodic_sample


def test_detects_vertical_periodic_signal():
    image = periodic_sample(width=256, height=192, period=16, orientation="vertical", seed=7)
    report = analyze_array(image)

    assert report["image"]["width"] == 256
    assert report["image"]["height"] == 192
    assert report["periodic_signal_detected"] is True
    periods = [x["period_pixels"] for x in report["spectral_profiles"]["x"]]
    assert any(abs(p - 16) <= 1 for p in periods)


def test_detects_horizontal_periodic_signal():
    image = periodic_sample(width=192, height=256, period=12, orientation="horizontal", seed=9)
    report = analyze_array(image)

    periods = [x["period_pixels"] for x in report["spectral_profiles"]["y"]]
    assert any(abs(p - 12) <= 1 for p in periods)


def test_round_trip_png(tmp_path: Path):
    image = periodic_sample(width=96, height=80, period=8, orientation="vertical", seed=3)
    path = tmp_path / "sample.png"
    Image.fromarray(image, mode="L").save(path)
    loaded = np.asarray(Image.open(path).convert("L"))
    report = analyze_array(loaded)
    assert report["image"]["channels"] == 1
    assert report["image"]["width"] == 96
