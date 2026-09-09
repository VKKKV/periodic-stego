import { it, expect } from "vitest";
import { analyze } from "../src/core/pipeline";
import { DEFAULT_ANALYSIS, preset } from "../src/state";
function image(w: number, h: number, value: (x: number, y: number) => number) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = value(x, y);
      rgba[i + 3] = 255;
    }
  return { rgba, width: w, height: h };
}
it("constant downsample + normalization cannot amplify rounding into a signal", () => {
  const r = analyze({
    ...image(1000, 777, () => 128),
    params: { ...DEFAULT_ANALYSIS, maxDimension: 64, normalize: true },
  });
  expect(r.stats.usefulSignal).toBe(false);
  expect(r.stats.strongPeriodicity).toBe(false);
  expect(r.candidates).toHaveLength(0);
});
it("padding preserves clear periodic evidence but not conservative noise", () => {
  const r = analyze({
    ...image(64, 64, (x) => 128 + 55 * Math.sin((2 * Math.PI * x) / 8)),
    params: { ...DEFAULT_ANALYSIS, padding: "explicit", paddingSize: 2048 },
  });
  expect(r.stats.strongPeriodicity).toBe(true);
  let seed = 7;
  const noise = image(64, 64, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return 128 + (seed / 4294967296 - 0.5) * 70;
  });
  expect(
    analyze({
      ...noise,
      params: {
        ...preset("conservative"),
        padding: "explicit",
        paddingSize: 1024,
      },
    }).stats.strongPeriodicity,
  ).toBe(false);
});
it("odd near-Nyquist conjugate roundoff does not discard the 2D peak", () => {
  const r = analyze({
    ...image(
      63,
      63,
      (x, y) => 128 + 100 * Math.cos((2 * Math.PI * 31 * (x + y)) / 63),
    ),
    params: { ...DEFAULT_ANALYSIS, window: "none" },
  });
  expect(
    r.candidates.some(
      (c) =>
        c.source === "fft-2d" &&
        Math.abs(Math.abs(c.frequencyX!) - 31 / 63) < 1e-10 &&
        Math.abs(Math.abs(c.frequencyY!) - 31 / 63) < 1e-10,
    ),
  ).toBe(true);
});
it("odd near-Nyquist profile survives conjugate roundoff", () => {
  for (const n of [31, 127])
    for (const phase of [0, 0.5, 1]) {
      const f = Math.floor(n / 2) / n;
      const r = analyze({
        ...image(
          n,
          n,
          (x) => 128 + 100 * Math.cos(2 * Math.PI * f * x + phase),
        ),
        params: { ...DEFAULT_ANALYSIS, window: "none" },
      });
      expect(
        r.candidates.some(
          (c) =>
            c.source === "fft-profile" &&
            c.axis === "x" &&
            Math.abs(c.frequencyX! - f) < 1e-10,
        ),
      ).toBe(true);
    }
});
it("even AC includes the unique half-length lag", () => {
  const r = analyze({
    ...image(32, 32, (x) => 128 + 100 * Math.cos((2 * Math.PI * x) / 16)),
    params: { ...DEFAULT_ANALYSIS, window: "none", dcRadius: 0, maxLagX: 16 },
  });
  expect(
    r.candidates.some((c) => c.source === "autocorrelation" && c.lagX === 16),
  ).toBe(true);
});
