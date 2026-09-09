"""Numerical analysis for periodic image structure."""

from __future__ import annotations

from typing import Any

import numpy as np


def _luminance(image: np.ndarray) -> np.ndarray:
    array = np.asarray(image)
    if array.size == 0:
        raise ValueError("image must not be empty")
    if np.iscomplexobj(array):
        raise ValueError("image must not contain complex values")
    if array.ndim == 3:
        if array.shape[2] >= 3:
            array = 0.2126 * array[..., 0] + 0.7152 * array[..., 1] + 0.0722 * array[..., 2]
        else:
            array = array[..., 0]
    if array.ndim != 2:
        raise ValueError("image must be a 2D grayscale or 3D channel-last array")
    result = array.astype(np.float64, copy=False)
    if not np.isfinite(result).all():
        raise ValueError("image contains NaN or infinite values")
    if result.max(initial=0) > 1.5:
        result = result / 255.0
    return result


def _period_from_frequency(freq: float) -> float | None:
    frequency = abs(float(freq))
    if frequency <= 1e-12:
        return None
    return 1.0 / frequency


def _profile_peaks(profile: np.ndarray, *, max_items: int = 8) -> list[dict[str, float]]:
    n = len(profile)
    center = n // 2
    values = np.asarray(profile, dtype=np.float64).copy()
    values[max(0, center - 1): min(n, center + 2)] = 0
    candidates: list[tuple[float, int]] = []
    # Real-image spectra are conjugate symmetric. Use the nonpositive half,
    # including index zero (Nyquist for even lengths). At the boundary compare
    # only inward, avoiding roundoff differences between odd-length conjugates.
    for index in range(max(0, center - 1)):
        if values[index] <= 0:
            continue
        left = values[index - 1] if index else values[index]
        if values[index] >= left and values[index] >= values[index + 1]:
            candidates.append((float(values[index]), index))
    candidates.sort(reverse=True)
    selected: list[tuple[float, int]] = []
    min_distance = max(2, n // 128)
    for score, index in candidates:
        if all(abs(index - other) >= min_distance for _, other in selected):
            selected.append((score, index))
        if len(selected) >= max_items:
            break
    baseline = float(np.median(values[values > 0])) if np.any(values > 0) else 1.0
    result = []
    for score, index in selected:
        frequency = abs(index - center) / n
        period = _period_from_frequency(frequency)
        if period is not None:
            result.append({
                "frequency_cycles_per_pixel": round(frequency, 8),
                "period_pixels": round(period, 4),
                "relative_power": round(score / max(baseline, 1e-18), 4),
            })
    return result


def _autocorrelation_peaks(
    profile: np.ndarray, *, max_items: int = 8, min_lag: int = 2
) -> list[dict[str, float | int]]:
    """Select positive circular lags, not reciprocal FFT-bin distances.

    The profile is fftshifted and center-normalized. Opposite signed lags
    describe the same correlation, so report only 1..floor(n/2), including
    the unique half-length lag at index zero for even-sized profiles.
    """
    values = np.asarray(profile, dtype=np.float64)
    n = len(values)
    if n < 3 or max_items <= 0:
        return []
    center = n // 2
    candidates = []
    for lag in range(max(1, min_lag), n // 2 + 1):
        index = (center + lag) % n
        score = float(values[index])
        left, right = values[(index - 1) % n], values[(index + 1) % n]
        if score > 0 and score >= left and score >= right and (score > left or score > right):
            candidates.append((score, lag))
    candidates.sort(key=lambda item: (-item[0], item[1]))
    selected: list[dict[str, float | int]] = []
    min_distance = max(2, n // 128)
    for score, lag in candidates:
        if all(abs(lag - item["lag_pixels"]) >= min_distance for item in selected):
            selected.append({
                "lag_pixels": lag,
                "period_pixels": lag,
                "normalized_correlation": round(score, 8),
            })
        if len(selected) >= max_items:
            break
    return selected


def _top_2d_peaks(power: np.ndarray, *, max_items: int = 12) -> list[dict[str, float]]:
    h, w = power.shape
    cy, cx = h // 2, w // 2
    work = power.copy()
    yy, xx = np.ogrid[:h, :w]
    work[(yy - cy) ** 2 + (xx - cx) ** 2 <= 9] = 0
    baseline = float(np.median(work[work > 0])) if np.any(work > 0) else 1.0
    result = []
    radius = max(3, min(h, w) // 64)
    # Repeated vectorized maxima preserve the greedy ranking (including
    # row-major ties) without sorting every image pixel as Python objects.
    for _ in range(max_items):
        y, x = np.unravel_index(np.argmax(work), work.shape)
        score = float(work[y, x])
        if score <= 0:
            break
        fy = (int(y) - cy) / h
        fx = (int(x) - cx) / w
        result.append({
            "frequency_x_cycles_per_pixel": round(abs(fx), 8),
            "frequency_y_cycles_per_pixel": round(abs(fy), 8),
            "period_x_pixels": None if abs(fx) < 1e-12 else round(1 / abs(fx), 4),
            "period_y_pixels": None if abs(fy) < 1e-12 else round(1 / abs(fy), 4),
            "relative_power": round(score / max(baseline, 1e-18), 4),
        })
        y0, y1 = max(0, y - radius), min(h, y + radius + 1)
        x0, x1 = max(0, x - radius), min(w, x + radius + 1)
        local_y, local_x = np.ogrid[y0:y1, x0:x1]
        work[y0:y1, x0:x1][(local_y - y) ** 2 + (local_x - x) ** 2 <= radius ** 2] = 0
    return result


def analyze_array(image: np.ndarray) -> dict[str, Any]:
    """Return report fields plus NumPy arrays under the private _diagnostics key."""
    gray = _luminance(image)
    height, width = gray.shape
    work = gray - gray.mean()
    if np.ptp(gray) == 0:
        work.fill(0.0)  # A rounded mean must not invent energy in a constant image.
    spectrum = np.fft.fftshift(np.fft.fft2(work))
    power = np.abs(spectrum) ** 2
    log_power = np.log1p(power)

    autocorrelation = np.fft.fftshift(np.fft.ifft2(np.fft.ifftshift(power)).real)
    ac_center = float(autocorrelation[height // 2, width // 2])
    normalized_ac = autocorrelation / max(abs(ac_center), 1e-18)
    ac_x = normalized_ac[height // 2, :]
    ac_y = normalized_ac[:, width // 2]

    x_profile = power.mean(axis=0)
    y_profile = power.mean(axis=1)
    # `power` and `autocorrelation` are already centered with fftshift.
    # Shifting the 1D slices a second time moves real peaks to the wrong period.
    x_peaks = _profile_peaks(x_profile)
    y_peaks = _profile_peaks(y_profile)
    two_d = _top_2d_peaks(power)
    ac_x_peaks = _autocorrelation_peaks(ac_x, max_items=8)
    ac_y_peaks = _autocorrelation_peaks(ac_y, max_items=8)

    strongest_profile = max(
        [*(p["relative_power"] for p in x_peaks), *(p["relative_power"] for p in y_peaks)],
        default=0.0,
    )
    detected = strongest_profile >= 8.0 and bool(x_peaks or y_peaks)
    return {
        "image": {
            "width": int(width),
            "height": int(height),
            "channels": 1 if np.asarray(image).ndim == 2 else int(np.asarray(image).shape[2]),
            "mean": round(float(gray.mean()), 6),
            "stddev": round(float(gray.std()), 6),
        },
        "periodic_signal_detected": bool(detected),
        "thresholds": {"profile_relative_power": 8.0},
        "spectral_profiles": {"x": x_peaks, "y": y_peaks},
        "fft_peaks_2d": two_d,
        "autocorrelation_lags": {"x": ac_x_peaks, "y": ac_y_peaks},
        "notes": [
            "A periodic peak is not proof of hidden text.",
            "JPEG artifacts, resize patterns, moire, scanlines, and normal textures can also create peaks.",
            "Autocorrelation is circular: opposite lags are merged; edge wraparound and period multiples can create lag peaks.",
            "Payload extraction requires a separate encoding model and is intentionally not guessed here.",
        ],
        "_diagnostics": {"fft_log_power": log_power, "autocorrelation": normalized_ac},
    }
