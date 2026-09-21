import { describe, expect, it } from "vitest";
import { analyzePCA, type PCAAnalysis } from "../src/pca";

type RGB = [number, number, number];
const rgba = (pixels: RGB[]) =>
  new Uint8ClampedArray(pixels.flatMap((pixel) => [...pixel, 255]));
const dot = (a: number[], b: number[]) =>
  a.reduce((sum, value, i) => sum + value * b[i], 0);

// Independent population covariance identity: sum over unordered pixel-pair
// differences / N². Does not reuse the production centered accumulation.
function referenceCovariance(pixels: RGB[]) {
  const covariance = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let i = 0; i < pixels.length; i++) {
    for (let j = 0; j < i; j++) {
      const difference = pixels[i].map((value, c) => value - pixels[j][c]);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          covariance[r][c] +=
            (difference[r] * difference[c]) / pixels.length ** 2;
        }
      }
    }
  }
  return covariance;
}

function checkInvariants(pixels: RGB[], result: PCAAnalysis) {
  const covariance = referenceCovariance(pixels);
  const trace = covariance.reduce((sum, row, i) => sum + row[i], 0);
  const tolerance = Math.max(1, trace) * 1e-11;
  const sum = result.eigenvalues.reduce((total, value) => total + value, 0);
  expect(Math.abs(sum - trace)).toBeLessThan(tolerance);
  expect(result.eigenvalues).toHaveLength(3);
  expect(result.eigenvectors).toHaveLength(3);
  expect(result.components).toHaveLength(3);
  expect(result.ranges).toHaveLength(3);
  expect(result.explainedVariance).toHaveLength(3);
  expect(result.mean).toHaveLength(3);
  for (let c = 0; c < 3; c++) {
    const mean =
      pixels.reduce((sum, pixel) => sum + pixel[c], 0) / pixels.length;
    expect(result.mean[c]).toBeCloseTo(mean, 12);
    const v = result.eigenvectors[c];
    expect(v).toHaveLength(3);
    expect(v.every(Number.isFinite)).toBe(true);
    expect(result.eigenvalues[c]).toBeGreaterThanOrEqual(0);
    if (c > 0)
      expect(result.eigenvalues[c - 1]).toBeGreaterThanOrEqual(
        result.eigenvalues[c],
      );
    let pivot = 0;
    for (let k = 1; k < 3; k++)
      if (Math.abs(v[k]) > Math.abs(v[pivot])) pivot = k;
    expect(v[pivot]).toBeGreaterThan(0);
    for (let k = 0; k < 3; k++) {
      expect(dot(v, result.eigenvectors[k])).toBeCloseTo(c === k ? 1 : 0, 12);
      expect(
        Math.abs(dot(covariance[k], v) - result.eigenvalues[c] * v[k]),
      ).toBeLessThan(tolerance);
    }
    const projections = pixels.map((pixel) =>
      dot(
        pixel.map((value, i) => value - result.mean[i]),
        v,
      ),
    );
    const power =
      projections.reduce((sum, value) => sum + value * value, 0) /
      pixels.length;
    expect(Math.abs(power - result.eigenvalues[c])).toBeLessThan(tolerance);
    expect(
      Math.abs(projections.reduce((sum, value) => sum + value, 0)),
    ).toBeLessThan(1e-9);
    expect(result.explainedVariance[c]).toBeCloseTo(
      trace > 0 ? result.eigenvalues[c] / trace : 0,
      12,
    );
    const range = result.ranges[c];
    expect(Number.isFinite(range.min) && Number.isFinite(range.max)).toBe(true);
    expect(result.components[c]).toBeInstanceOf(Uint8ClampedArray);
    expect(result.components[c]).toHaveLength(pixels.length);
    if (range.min === range.max) {
      expect(range).toEqual({ min: 0, max: 0 });
      expect(Math.max(...projections.map(Math.abs))).toBeLessThan(1e-9);
      expect(Array.from(result.components[c])).toEqual(pixels.map(() => 0));
    } else {
      expect(range.min).toBeCloseTo(Math.min(...projections), 10);
      expect(range.max).toBeCloseTo(Math.max(...projections), 10);
      expect(Math.min(...result.components[c])).toBe(0);
      expect(Math.max(...result.components[c])).toBe(255);
      for (let i = 0; i < pixels.length; i++) {
        // Quantization error measured back in raw centered projection units.
        const restored =
          range.min + (result.components[c][i] / 255) * (range.max - range.min);
        expect(Math.abs(restored - projections[i])).toBeLessThanOrEqual(
          (range.max - range.min) / 510 + 1e-10,
        );
      }
    }
  }
  // Full covariance reconstruction also detects accidental row/column reversal.
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const reconstructed = result.eigenvalues.reduce(
        (sum, value, k) =>
          sum + value * result.eigenvectors[k][r] * result.eigenvectors[k][c],
        0,
      );
      expect(Math.abs(reconstructed - covariance[r][c])).toBeLessThan(
        tolerance,
      );
    }
  }
}

const referencePixels: RGB[] = [
  [12, 91, 34],
  [140, 22, 81],
  [67, 180, 230],
  [220, 40, 15],
  [35, 77, 145],
  [175, 205, 60],
  [91, 11, 199],
];

// Independently generated with NumPy 2.5.3:
// x = np.array(referencePixels, dtype=float); z = x - x.mean(axis=0)
// w, v = np.linalg.eigh(z.T @ z / len(x)); w = w[::-1]; v = v[:, ::-1].T
// Orient each row so its largest absolute entry is positive; project z @ v.T.
const numpyReference = {
  mean: [105.71428571428571, 89.42857142857143, 109.14285714285714],
  eigenvalues: [7996.421504362223, 4878.001307214662, 2993.5771884231126],
  eigenvectors: [
    [-0.6096389012494957, 0.19832468934801173, 0.7674683887159925],
    [0.20694193736097552, 0.9744393237932197, -0.08742447487230565],
    [0.7651898095535473, -0.10552403442072744, 0.6350978141317916],
  ],
  explainedVariance: [
    0.5039337978549422, 0.307411224301403, 0.1886549778436547,
  ],
  ranges: [
    { min: -151.72759023969252, max: 134.31832173414034 },
    { min: -87.32460042933405, max: 131.25175313212299 },
    { min: -119.59810423986819, max: 54.08495280026585 },
  ],
  components: [
    [135, 85, 255, 0, 196, 84, 191],
    [89, 36, 183, 83, 67, 255, 0],
    [0, 198, 231, 224, 132, 190, 255],
  ],
};

describe("pure RGB PCA", () => {
  it("matches independent NumPy full-rank eigenpairs and all three scaled maps", () => {
    const result = analyzePCA(rgba(referencePixels), 7, 1);
    for (let c = 0; c < 3; c++) {
      expect(result.mean[c]).toBeCloseTo(numpyReference.mean[c], 12);
      expect(result.eigenvalues[c]).toBeCloseTo(
        numpyReference.eigenvalues[c],
        8,
      );
      expect(result.explainedVariance[c]).toBeCloseTo(
        numpyReference.explainedVariance[c],
        12,
      );
      for (let k = 0; k < 3; k++)
        expect(result.eigenvectors[c][k]).toBeCloseTo(
          numpyReference.eigenvectors[c][k],
          12,
        );
      expect(result.ranges[c].min).toBeCloseTo(
        numpyReference.ranges[c].min,
        10,
      );
      expect(result.ranges[c].max).toBeCloseTo(
        numpyReference.ranges[c].max,
        10,
      );
      expect(Array.from(result.components[c])).toEqual(
        numpyReference.components[c],
      );
    }
    checkInvariants(referencePixels, result);
  });

  it("matches an analytic rotated basis with known eigenvalues 108, 27, 12", () => {
    // Symmetric ± offsets of lengths 18, 9, 6 along mutually orthogonal axes.
    const pixels: RGB[] = [
      [122, 88, 78],
      [134, 112, 102],
      [122, 97, 96],
      [134, 103, 84],
      [124, 104, 88],
      [132, 96, 92],
    ];
    const result = analyzePCA(rgba(pixels), 3, 2);
    const vectors = [
      [1, 2, 2],
      [2, 1, -2],
      [2, -2, 1],
    ].map((v) => v.map((value) => value / 3));
    for (let c = 0; c < 3; c++) {
      expect(result.eigenvalues[c]).toBeCloseTo([108, 27, 12][c], 11);
      expect(Math.abs(dot(result.eigenvectors[c], vectors[c]))).toBeCloseTo(
        1,
        12,
      );
      expect(result.ranges[c].min).toBeCloseTo([-18, -9, -6][c], 11);
      expect(result.ranges[c].max).toBeCloseTo([18, 9, 6][c], 11);
    }
    checkInvariants(pixels, result);
  });

  it.each([
    [0, 0, 0],
    [255, 255, 255],
    [39, 147, 201],
  ] as RGB[])(
    "returns black finite maps for constant RGB (%i, %i, %i)",
    (r, g, b) => {
      const pixels: RGB[] = Array.from({ length: 9 }, () => [r, g, b]);
      const result = analyzePCA(rgba(pixels), 3, 3);
      expect(result.eigenvalues).toEqual([0, 0, 0]);
      expect(result.explainedVariance).toEqual([0, 0, 0]);
      expect(result.eigenvectors).toEqual([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]);
      checkInvariants(pixels, result);
    },
  );

  it("handles a single pixel with population covariance and no divide-by-zero", () => {
    const pixels: RGB[] = [[18, 250, 94]];
    const result = analyzePCA(rgba(pixels), 1, 1);
    expect(result.mean).toEqual(pixels[0]);
    expect(result.eigenvalues).toEqual([0, 0, 0]);
    checkInvariants(pixels, result);
  });

  it("does not amplify floating-point noise in grayscale null components", () => {
    const levels = [0, 1, 7, 63, 128, 204, 255];
    const pixels: RGB[] = levels.map((v) => [v, v, v]);
    const result = analyzePCA(rgba(pixels), 7, 1);
    expect(Array.from(result.components[0])).toEqual(levels);
    expect(result.eigenvalues.slice(1)).toEqual([0, 0]);
    expect(result.explainedVariance).toEqual([1, 0, 0]);
    expect(result.ranges.slice(1)).toEqual([
      { min: 0, max: 0 },
      { min: 0, max: 0 },
    ]);
    checkInvariants(pixels, result);
  });

  it("retains a non-gray rank-one signal and orthogonal null basis", () => {
    const pixels: RGB[] = [0, 1, 3, 9, 23].map((v) => [
      100 + v,
      90 - 2 * v,
      20 + 3 * v,
    ]);
    const result = analyzePCA(rgba(pixels), 5, 1);
    expect(result.eigenvalues.slice(1)).toEqual([0, 0]);
    expect(result.ranges.slice(1)).toEqual([
      { min: 0, max: 0 },
      { min: 0, max: 0 },
    ]);
    checkInvariants(pixels, result);
  });

  it("handles a rank-two color plane without inventing third-component contrast", () => {
    const pixels: RGB[] = [
      [20, 40, 60],
      [31, 9, 40],
      [75, 80, 155],
      [13, 110, 123],
      [60, 16, 76],
    ];
    const result = analyzePCA(rgba(pixels), 5, 1);
    expect(result.eigenvalues[1]).toBeGreaterThan(0);
    expect(result.eigenvalues[2]).toBe(0);
    expect(result.ranges[2]).toEqual({ min: 0, max: 0 });
    checkInvariants(pixels, result);
  });

  it("resolves an isotropic repeated spectrum deterministically", () => {
    const pixels: RGB[] = [
      [131, 128, 128],
      [125, 128, 128],
      [128, 131, 128],
      [128, 125, 128],
      [128, 128, 131],
      [128, 128, 125],
    ];
    const result = analyzePCA(rgba(pixels), 2, 3);
    expect(result.eigenvalues).toEqual([3, 3, 3]);
    expect(result.eigenvectors).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(analyzePCA(rgba(pixels), 2, 3)).toEqual(result);
    checkInvariants(pixels, result);
  });

  it("preserves very small but real variance in nearly constant RGB", () => {
    const pixels: RGB[] = Array.from({ length: 31 }, () => [254, 253, 252]);
    pixels.push([255, 253, 252], [254, 254, 252], [254, 253, 253]);
    const result = analyzePCA(rgba(pixels), 17, 2);
    expect(result.eigenvalues.every((value) => value > 0)).toBe(true);
    checkInvariants(pixels, result);
  });

  it.each([1, 17, 984, 20260921, 0xffffffff])(
    "satisfies residual, orthogonality, trace and projection power for seed %i",
    (seed) => {
      let state = seed >>> 0;
      const byte = () => {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        return state >>> 24;
      };
      const pixels: RGB[] = Array.from({ length: 23 }, () => [
        byte(),
        byte(),
        byte(),
      ]);
      const result = analyzePCA(rgba(pixels), 23, 1);
      checkInvariants(pixels, result);
      expect(analyzePCA(rgba(pixels), 23, 1)).toEqual(result);
    },
  );

  it("ignores alpha, respects typed-array subviews, preserves input, and needs no DOM", () => {
    expect(typeof document).toBe("undefined");
    const original = rgba(referencePixels);
    const backing = new Uint8ClampedArray(original.length + 8).fill(77);
    backing.set(original, 4);
    const view = backing.subarray(4, 4 + original.length);
    for (let i = 3; i < view.length; i += 4)
      view[i] = ((i - 3) / 4) % 2 ? 0 : 127;
    const before = backing.slice();
    const result = analyzePCA(view, 1, 7);
    expect(result).toEqual(analyzePCA(original, 7, 1));
    expect(backing).toEqual(before);
    result.components[0][0] = 0;
    expect(backing).toEqual(before);
    expect(result.components[0].buffer).not.toBe(result.components[1].buffer);
  });

  it.each([
    [0, 1],
    [1, 0],
    [-1, 1],
    [1, -1],
    [1.5, 1],
    [1, 1.5],
    [NaN, 1],
    [1, NaN],
    [Infinity, 1],
    [1, Infinity],
    [2049, 1],
    [1, 2049],
    [2048, 2049],
    [Number.MAX_SAFE_INTEGER, 1],
  ])(
    "rejects invalid dimensions %s × %s before allocation",
    (width, height) => {
      expect(() => analyzePCA(new Uint8ClampedArray(), width, height)).toThrow(
        /dimensions/,
      );
    },
  );

  it.each([0, 3, 5, 7, 9])("rejects mismatched RGBA length %i", (length) => {
    expect(() => analyzePCA(new Uint8ClampedArray(length), 2, 1)).toThrow(
      /RGBA bytes/,
    );
  });

  it("rejects a non-clamped input at runtime", () => {
    expect(() =>
      analyzePCA(new Uint8Array(4) as unknown as Uint8ClampedArray, 1, 1),
    ).toThrow(/Uint8ClampedArray/);
  });

  it("accepts both maximum axes and exactly 4194304 pixels", () => {
    const count = 2048 * 2048;
    const result = analyzePCA(new Uint8ClampedArray(count * 4), 2048, 2048);
    expect(result.eigenvalues).toEqual([0, 0, 0]);
    expect(result.ranges).toEqual(
      Array.from({ length: 3 }, () => ({ min: 0, max: 0 })),
    );
    for (const map of result.components) {
      expect(map.length).toBe(count);
      expect(map.every((value) => value === 0)).toBe(true);
    }
  }, 20000);
});
