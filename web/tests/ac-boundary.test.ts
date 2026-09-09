import { expect, it } from "vitest";
import { acPeaks } from "../src/core/peaks";
import { analyze } from "../src/core/pipeline";
import { DEFAULT_ANALYSIS } from "../src/state";

it.each(["x", "y"] as const)(
  "odd half-length AC lag survives conjugate roundoff on %s",
  (axis) => {
    const width = axis === "x" ? 31 : 5;
    const height = axis === "x" ? 5 : 31;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const coordinate = axis === "x" ? x : y;
        rgba[i] =
          rgba[i + 1] =
          rgba[i + 2] =
            128 + 100 * Math.cos((4 * Math.PI * coordinate) / 31 + 1);
        rgba[i + 3] = 255;
      }
    const results = (["fft", "direct"] as const).map((acMethod) =>
      analyze({
        rgba,
        width,
        height,
        params: {
          ...DEFAULT_ANALYSIS,
          window: "none",
          dcRadius: 0,
          minLag: 1,
          maxLagX: 64,
          maxLagY: 64,
          acMethod,
        },
      }),
    );
    const [fft, direct] = results;
    for (let i = 0; i < fft.autocorrelation.length; i++)
      expect(fft.autocorrelation[i]).toBeCloseTo(direct.autocorrelation[i], 12);
    for (const result of results) {
      const profile = axis === "x" ? result.profiles.acX : result.profiles.acY;
      expect(profile[30]).toBeCloseTo(profile[0], 12);
      expect(profile[30]).toBeGreaterThan(profile[29]);
      const lags = result.candidates
        .filter((c) => c.source === "autocorrelation" && c.axis === axis)
        .map((c) => (axis === "x" ? c.lagX : c.lagY));
      expect(lags).toEqual([15]);
    }
  },
);

it.each(["x", "y"] as const)("rejects flat AC profiles on %s", (axis) => {
  for (const scale of [1, 1e6]) {
    const values = new Float64Array(31).fill(scale);
    expect(acPeaks(values, axis, DEFAULT_ANALYSIS)).toEqual([]);
    values[30] += scale * 1e-14;
    expect(acPeaks(values, axis, DEFAULT_ANALYSIS)).toEqual([]);
  }
});

it("does not accept an AC boundary below its neighbor beyond tolerance", () => {
  const values = new Float64Array([0.80000001, 0, 0, 1, 0, 0.6, 0.8]);
  expect(acPeaks(values, "x", { ...DEFAULT_ANALYSIS, minLag: 3 })).toEqual([]);
});
