import { expect, it } from "vitest";
import { fft2dPeaks, fftProfilePeaks } from "../src/core/peaks";
import { DEFAULT_ANALYSIS } from "../src/state";
it("2D background estimates do not alias with grid orientation", () => {
  const size = 256;
  const results = ["x", "y"].map((axis) => {
    const power = Float64Array.from({ length: size * size }, (_, i) =>
      (axis === "x" ? i % size : Math.floor(i / size)) % 8 === 0 ? 100 : 1,
    );
    power[128 * size + 96] = 1000;
    power[128 * size + 160] = 1000;
    if (axis === "y") {
      power[128 * size + 96] = 100;
      power[128 * size + 160] = 100;
      power[96 * size + 128] = 1000;
      power[160 * size + 128] = 1000;
    }
    return fft2dPeaks(power, size, size, {
      ...DEFAULT_ANALYSIS,
      dcRadius: 0,
      relativeThreshold: 1,
    })[0];
  });
  expect(results[0].relativePower).toBe(1000);
  expect(results[1].relativePower).toBe(results[0].relativePower);
  expect(results[1].confidence).toBeCloseTo(results[0].confidence, 12);
});

it("exact median matches a sorted oracle without mutating input", () => {
  let seed = 19;
  for (const n of [31, 256, 8193]) {
    for (const dcRadius of [0, 3, 10]) {
      const center = Math.floor(n / 2);
      const values = Float64Array.from({ length: n }, (_, i) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return n === 256 ? i % 7 : 1 + (seed % 997);
      });
      values[center + 12] = 1e8;
      const before = values.slice();
      const sorted = Array.from(values)
        .filter((_, i) => Math.abs(i - center) > dcRadius)
        .sort((a, b) => a - b);
      const median = Math.max(sorted[Math.floor(sorted.length / 2)], 1e-18);
      const peaks = fftProfilePeaks(values, "x", {
        ...DEFAULT_ANALYSIS,
        dcRadius,
        relativeThreshold: 1,
      });
      expect(peaks.length).toBeGreaterThan(0);
      for (const peak of peaks)
        expect(peak.relativePower).toBe(peak.power / median);
      expect(values).toEqual(before);
    }
  }
});
