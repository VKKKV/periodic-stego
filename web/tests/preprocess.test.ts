import { it, expect } from "vitest";
import { preprocess } from "../src/core/preprocess";
import { DEFAULT_ANALYSIS } from "../src/state";
import type { AnalysisParams } from "../src/core/types";
const image = (w = 8, h = 8) => ({
  rgba: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) =>
    i % 4 === 3
      ? 255
      : (Math.floor(i / 4) % w) * 16 + Math.floor(Math.floor(i / 4) / w) * 8,
  ),
  width: w,
  height: h,
});
const run = (p: Partial<AnalysisParams> = {}) =>
  preprocess({
    ...image(),
    params: { ...DEFAULT_ANALYSIS, window: "none", ...p },
  });
it("plane and row/column detrending remove appropriate structure", () => {
  expect(run({ detrend: "plane" }).stddev).toBeLessThan(1e-12);
  const row = run({ detrend: "row", removeMean: false });
  for (let y = 0; y < 8; y++)
    expect(
      row.data.slice(y * 8, y * 8 + 8).reduce((a, b) => a + b, 0),
    ).toBeCloseTo(0, 10);
  const col = run({ detrend: "column", removeMean: false });
  for (let x = 0; x < 8; x++) {
    let sum = 0;
    for (let y = 0; y < 8; y++) sum += col.data[y * 8 + x];
    expect(sum).toBeCloseTo(0, 10);
  }
});
it("normalization, gamma and all windows produce finite distinct data", () => {
  expect(run({ normalize: true, removeMean: false }).data[63]).toBeCloseTo(1);
  expect(run({ analysisGamma: 2 }).data).not.toEqual(run().data);
  for (const window of ["none", "hann", "hamming", "blackman"] as const)
    expect(Array.from(run({ window }).data).every(Number.isFinite)).toBe(true);
});
it("bounded ROI and padding cannot overallocate or silently truncate", () => {
  expect(() => run({ roi: { x: 7, y: 0, width: 8, height: 8 } })).toThrow(
    /ROI/,
  );
  expect(() =>
    preprocess({
      ...image(16, 16),
      params: { ...DEFAULT_ANALYSIS, padding: "explicit", paddingSize: 8 },
    }),
  ).toThrow(/padding/);
  expect(() =>
    preprocess({ ...image(), width: NaN, params: DEFAULT_ANALYSIS }),
  ).toThrow();
  expect(() => run({ maxDimension: 999999 })).toThrow();
});
