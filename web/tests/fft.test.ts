import { it, expect } from "vitest";
import { fft1d, fft2d, shift2d } from "../src/core/fft";
import { analyze } from "../src/core/pipeline";
import { DEFAULT_ANALYSIS } from "../src/state";
import oracle from "./fixtures/numpy-reference.json";
for (const n of [1, 2, 3, 5, 7, 8, 15, 32])
  it(`complex FFT agrees with DFT at N=${n}`, () => {
    const re = Float64Array.from(
        { length: n },
        (_, i) => Math.sin(i * 1.37) + i * 0.03,
      ),
      im = Float64Array.from({ length: n }, (_, i) => Math.cos(i * 0.7));
    const originalRe = new Float64Array(re),
      originalIm = new Float64Array(im);
    const expectedRe = new Float64Array(n),
      expectedIm = new Float64Array(n);
    for (let k = 0; k < n; k++)
      for (let j = 0; j < n; j++) {
        const a = (-2 * Math.PI * j * k) / n,
          c = Math.cos(a),
          s = Math.sin(a);
        expectedRe[k] += re[j] * c - im[j] * s;
        expectedIm[k] += re[j] * s + im[j] * c;
      }
    fft1d(re, im);
    for (let i = 0; i < n; i++) {
      expect(re[i]).toBeCloseTo(expectedRe[i], 9);
      expect(im[i]).toBeCloseTo(expectedIm[i], 9);
    }
    fft1d(re, im, true);
    for (let i = 0; i < n; i++) {
      expect(re[i]).toBeCloseTo(originalRe[i], 9);
      expect(im[i]).toBeCloseTo(originalIm[i], 9);
    }
  });
it("odd rectangular 2D inverse and NumPy shift", () => {
  const re = Float64Array.from({ length: 15 }, (_, i) => i / 10),
    original = new Float64Array(re),
    im = new Float64Array(15);
  fft2d(re, im, 5, 3);
  fft2d(re, im, 5, 3, true);
  for (let i = 0; i < 15; i++) expect(re[i]).toBeCloseTo(original[i], 10);
  expect(
    Array.from(
      shift2d(
        Float64Array.from({ length: 15 }, (_, i) => i),
        5,
        3,
      ),
    ),
  ).toEqual([13, 14, 10, 11, 12, 3, 4, 0, 1, 2, 8, 9, 5, 6, 7]);
});
it("whole numerical pipeline matches independent NumPy Float64 oracle", () => {
  const r = analyze({
    rgba: new Uint8ClampedArray(oracle.rgba),
    width: oracle.width,
    height: oracle.height,
    params: { ...DEFAULT_ANALYSIS, window: "none" },
  });
  for (const key of ["preprocessed", "power", "autocorrelation"] as const)
    for (let i = 0; i < r[key].length; i++)
      expect(r[key][i]).toBeCloseTo(oracle[key][i], 9);
  for (const key of ["fftX", "fftY"] as const)
    for (let i = 0; i < r.profiles[key].length; i++)
      expect(r.profiles[key][i]).toBeCloseTo(oracle[key][i], 9);
});
