"""Repeatable synthetic fixtures for detector development."""

from __future__ import annotations

import numpy as np


def periodic_sample(
    *,
    width: int,
    height: int,
    period: int,
    orientation: str = "vertical",
    amplitude: float = 0.22,
    seed: int = 0,
) -> np.ndarray:
    """Return an 8-bit noisy image with a sinusoidal periodic signal."""
    if width < 16 or height < 16:
        raise ValueError("width and height must be at least 16")
    if period < 2 or period > max(width, height) // 2:
        raise ValueError("period must be between 2 and half the largest dimension")
    if orientation not in {"vertical", "horizontal", "both"}:
        raise ValueError("orientation must be vertical, horizontal, or both")
    if not 0 < amplitude < 1:
        raise ValueError("amplitude must be between 0 and 1")

    rng = np.random.default_rng(seed)
    image = rng.normal(0.5, 0.08, size=(height, width))
    x = np.arange(width)[None, :]
    y = np.arange(height)[:, None]
    signal = np.zeros_like(image)
    if orientation in {"vertical", "both"}:
        signal += np.sin(2 * np.pi * x / period)
    if orientation in {"horizontal", "both"}:
        signal += np.sin(2 * np.pi * y / period)
    image += amplitude * signal
    return np.clip(image * 255, 0, 255).astype(np.uint8)
