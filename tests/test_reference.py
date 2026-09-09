"""Independent numerical and CLI regressions for the Python reference."""

import json
from pathlib import Path
import subprocess
import sys
import warnings

import numpy as np
import pytest
from PIL import Image

from periodic_stego.analysis import _autocorrelation_peaks, _profile_peaks, _top_2d_peaks, analyze_array
from periodic_stego.cli import _load
from periodic_stego.synthetic import periodic_sample


@pytest.mark.parametrize("size", [31, 32])
@pytest.mark.parametrize("distance", [4, 15])
def test_spectral_profiles_include_endpoints_and_merge_conjugates(size, distance):
    if distance == 15:
        distance = size // 2
    profile = np.ones(size)
    center = size // 2
    profile[(center - distance) % size] = 100
    profile[(center + distance) % size] = 100
    peaks = _profile_peaks(profile)
    frequencies = [peak["frequency_cycles_per_pixel"] for peak in peaks]
    assert frequencies[0] == round(distance / size, 8)
    assert len(frequencies) == len(set(frequencies))
    assert peaks[0]["relative_power"] == 100


@pytest.mark.parametrize("size,phase", [(15, 0.5), (31, 1.25), (63, 0.0)])
def test_odd_length_endpoint_survives_conjugate_roundoff(size, phase):
    coordinate = np.arange(size)
    image = np.tile(0.5 + 0.2 * np.cos(2 * np.pi * (size // 2) * coordinate / size + phase), (16, 1))
    peaks = analyze_array(image)["spectral_profiles"]["x"]
    assert peaks[0]["period_pixels"] == round(size / (size // 2), 4)


def test_pure_nyquist_peak_preserves_existing_power_baseline():
    image = ((np.indices((32, 32))[1] % 2) * 255).astype(np.uint8)
    report = analyze_array(image)
    assert report["spectral_profiles"]["x"] == [{
        "frequency_cycles_per_pixel": 0.5,
        "period_pixels": 2.0,
        "relative_power": 1.0,
    }]
    # The existing median-of-positive-power heuristic is intentionally unchanged.
    assert report["periodic_signal_detected"] is False


@pytest.mark.parametrize("axis", [0, 1])
def test_nyquist_stripes_have_a_spectral_peak(axis):
    coordinate = np.indices((32, 32))[axis]
    image = (coordinate % 2) * 0.6 + np.random.default_rng(71).normal(0, 0.01, (32, 32))
    report = analyze_array(image)
    peaks = report["spectral_profiles"]["y" if axis == 0 else "x"]
    assert peaks[0]["period_pixels"] == 2.0
    assert report["periodic_signal_detected"] is True


@pytest.mark.parametrize("image", [
    np.empty((0, 8)), np.empty((8, 0)), np.empty((8, 8, 0)),
    np.full((8, 8), 1 + 2j), np.full((8, 8, 3), 1 + 2j),
])
def test_invalid_arrays_reject_without_warnings(image):
    with warnings.catch_warnings(record=True) as emitted:
        warnings.simplefilter("always")
        with pytest.raises(ValueError, match="empty|complex"):
            analyze_array(image)
    assert not emitted


@pytest.mark.parametrize("orientation,axis", [("vertical", "x"), ("horizontal", "y"), ("both", "x")])
def test_period_two_fixture_contains_nyquist_signal(orientation, axis):
    generated = periodic_sample(width=64, height=32, period=2, orientation=orientation, seed=7)
    report = analyze_array(generated)
    assert report["spectral_profiles"][axis][0]["period_pixels"] == 2.0
    assert report["periodic_signal_detected"]


def test_cli_preserves_16_bit_grayscale_png(tmp_path):
    image = periodic_sample(width=128, height=64, period=8, seed=7).astype(np.uint16) * 16 + 1000
    source = tmp_path / "periodic-16bit.png"
    Image.fromarray(image).save(source)
    np.testing.assert_array_equal(_load(source), image)
    expected = analyze_array(image)
    expected.pop("_diagnostics")
    completed = subprocess.run(
        [sys.executable, "-m", "periodic_stego", "analyze", str(source)],
        cwd=Path(__file__).resolve().parents[1], check=True, capture_output=True, text=True,
    )
    assert json.loads(completed.stdout) == expected
    assert expected["periodic_signal_detected"] is True


@pytest.mark.parametrize("orientation,period,width,height", [
    ("vertical", 8, 120, 35),
    ("vertical", 16, 192, 35),
    ("horizontal", 12, 35, 120),
    ("horizontal", 5, 35, 45),
])
def test_autocorrelation_reports_pixel_lags(orientation, period, width, height):
    yy, xx = np.indices((height, width))
    coordinate = xx if orientation == "vertical" else yy
    image = 0.5 + 0.2 * np.cos(2 * np.pi * coordinate / period)
    report = analyze_array(image)
    axis = "x" if orientation == "vertical" else "y"
    peaks = report["autocorrelation_lags"][axis]
    assert any(peak["lag_pixels"] == period for peak in peaks)
    assert len({peak["lag_pixels"] for peak in peaks}) == len(peaks)
    for peak in peaks:
        assert peak["period_pixels"] == peak["lag_pixels"]
        assert peak["lag_pixels"] % period == 0
        assert peak["normalized_correlation"] == pytest.approx(1.0)
        assert "frequency_cycles_per_pixel" not in peak
        assert "relative_power" not in peak


@pytest.mark.parametrize("size", [8, 9])
def test_autocorrelation_includes_half_length_lag_once(size):
    profile = np.zeros(size)
    center = size // 2
    profile[center] = 1
    profile[(center + size // 2) % size] = 0.75
    profile[(center - size // 2) % size] = 0.75
    assert _autocorrelation_peaks(profile) == [{
        "lag_pixels": size // 2,
        "period_pixels": size // 2,
        "normalized_correlation": 0.75,
    }]


@pytest.mark.parametrize("size", [1, 2, 17, 32])
def test_autocorrelation_flat_profiles_have_no_peaks(size):
    assert _autocorrelation_peaks(np.ones(size)) == []
    assert _autocorrelation_peaks(np.zeros(size)) == []


def test_constant_input_has_no_signal():
    report = analyze_array(np.full((9, 13, 3), 128, dtype=np.uint8))
    assert report["periodic_signal_detected"] is False
    assert report["spectral_profiles"] == {"x": [], "y": []}
    assert report["autocorrelation_lags"] == {"x": [], "y": []}
    assert np.isfinite(report["_diagnostics"]["autocorrelation"]).all()


def test_fft_autocorrelation_matches_direct_circular_sum():
    image = np.random.default_rng(2026).integers(0, 256, (7, 10), dtype=np.uint8)
    work = image.astype(np.float64) / 255
    work -= work.mean()
    expected = np.array([
        [np.sum(work * np.roll(work, (y, x), axis=(0, 1))) for x in range(10)]
        for y in range(7)
    ])
    expected /= expected[0, 0]
    actual = analyze_array(image)["_diagnostics"]["autocorrelation"]
    np.testing.assert_allclose(actual, np.fft.fftshift(expected), atol=1e-14)


@pytest.mark.parametrize("shape", [(17, 22), (64, 65)])
def test_top_2d_peaks_preserve_greedy_sorted_baseline(shape):
    # Integer-valued powers deliberately include ties to verify row-major order.
    power = np.random.default_rng(71).integers(0, 50, shape).astype(np.float64)
    before = power.copy()
    h, w = shape
    cy, cx = h // 2, w // 2
    yy, xx = np.ogrid[:h, :w]
    work = power.copy()
    work[(yy - cy) ** 2 + (xx - cx) ** 2 <= 9] = 0
    baseline = np.median(work[work > 0])
    candidates = sorted(np.argwhere(work > 0), key=lambda p: float(work[tuple(p)]), reverse=True)
    selected, expected = [], []
    radius = max(3, min(h, w) // 64)
    for y, x in candidates:
        if any((y - sy) ** 2 + (x - sx) ** 2 <= radius ** 2 for sy, sx in selected):
            continue
        selected.append((y, x))
        fy, fx = abs((y - cy) / h), abs((x - cx) / w)
        expected.append({
            "frequency_x_cycles_per_pixel": round(float(fx), 8),
            "frequency_y_cycles_per_pixel": round(float(fy), 8),
            "period_x_pixels": None if fx < 1e-12 else round(float(1 / fx), 4),
            "period_y_pixels": None if fy < 1e-12 else round(float(1 / fy), 4),
            "relative_power": round(float(work[y, x] / baseline), 4),
        })
        if len(expected) == 12:
            break
    assert _top_2d_peaks(power) == expected
    np.testing.assert_array_equal(power, before)


def test_module_entrypoint_demo_and_analyze(tmp_path: Path):
    repo = Path(__file__).resolve().parents[1]
    completed = subprocess.run(
        [sys.executable, "-m", "periodic_stego", "demo", "--output", str(tmp_path)],
        cwd=repo, check=True, capture_output=True, text=True,
    )
    assert completed.returncode == 0
    report = json.loads((tmp_path / "report.json").read_text())
    assert report["periodic_signal_detected"] is True
    assert "_diagnostics" not in report
    assert any(p["lag_pixels"] == 16 for p in report["autocorrelation_lags"]["x"])
    for path in [tmp_path / "synthetic-period-16.png", *sorted((tmp_path / "diagnostics").glob("*.png"))]:
        with Image.open(path) as image:
            image.load()
            assert image.size == (256, 192)
    assert len(list((tmp_path / "diagnostics").glob("*.png"))) == 2
    analyzed = subprocess.run(
        [sys.executable, "-m", "periodic_stego", "analyze", str(tmp_path / "synthetic-period-16.png")],
        cwd=repo, check=True, capture_output=True, text=True,
    )
    assert json.loads(analyzed.stdout) == report
