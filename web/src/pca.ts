export interface PCAAnalysis {
  /** Three independently min/max-scaled maps, one grayscale byte per pixel. */
  components: Uint8ClampedArray[];
  /** Descending population-covariance eigenvalues (denominator N, not N - 1). */
  eigenvalues: number[];
  /** Unit RGB vectors, one per component; largest-magnitude entry is positive. */
  eigenvectors: number[][];
  explainedVariance: number[];
  mean: number[];
  /** Centered projection extrema before scaling; a numerically null map is [0, 0]. */
  ranges: { min: number; max: number }[];
}

/** Symmetric Jacobi rotations, with fixed pivot order to resolve ties reproducibly. */
function eigensystem(covariance: number[][]) {
  const a = covariance.map((row) => row.slice());
  const vectors = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const trace = a[0][0] + a[1][1] + a[2][2];
  const tolerance = 8 * Number.EPSILON * trace;
  for (let iteration = 0; iteration < 64; iteration++) {
    let p = 0;
    let q = 1;
    for (const [i, j] of [
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[i][j]) > Math.abs(a[p][q])) {
        p = i;
        q = j;
      }
    }
    if (Math.abs(a[p][q]) <= tolerance) break;

    const off = a[p][q];
    const tau = (a[q][q] - a[p][p]) / (2 * off);
    const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.hypot(1, tau));
    const c = 1 / Math.hypot(1, t);
    const s = t * c;
    a[p][p] -= t * off;
    a[q][q] += t * off;
    a[p][q] = a[q][p] = 0;
    for (let k = 0; k < 3; k++) {
      if (k !== p && k !== q) {
        const kp = a[k][p];
        const kq = a[k][q];
        a[k][p] = a[p][k] = c * kp - s * kq;
        a[k][q] = a[q][k] = s * kp + c * kq;
      }
      const vp = vectors[k][p];
      const vq = vectors[k][q];
      vectors[k][p] = c * vp - s * vq;
      vectors[k][q] = s * vp + c * vq;
    }
  }

  return [0, 1, 2]
    .map((index) => {
      const vector = vectors.map((row) => row[index]);
      const length = Math.hypot(...vector);
      let pivot = 0;
      for (let i = 1; i < 3; i++) {
        if (Math.abs(vector[i]) > Math.abs(vector[pivot])) pivot = i;
      }
      const sign = vector[pivot] < 0 ? -1 : 1;
      return {
        // Remove roundoff-sized eigenvalues, including small negative PSD errors.
        value:
          a[index][index] <= 32 * Number.EPSILON * trace ? 0 : a[index][index],
        vector: vector.map((value) =>
          value === 0 ? 0 : (sign * value) / length,
        ),
        index,
      };
    })
    .sort(
      (left, right) => right.value - left.value || left.index - right.index,
    );
}

/**
 * Pure RGB PCA of tightly packed RGBA bytes. Alpha is ignored (no compositing or
 * weighting); the input is never changed. Requires positive integer dimensions,
 * at most 2048 per axis / 4194304 pixels and exactly width * height * 4 bytes.
 * Each non-null centered projection maps its own min to 0 and max to 255 using
 * Math.round. Roundoff-only/constant components are black with range [0, 0].
 * These exploratory contrast maps are not authentication or hidden-payload proof.
 */
export function analyzePCA(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): PCAAnalysis {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 2048 ||
    height > 2048 ||
    width * height > 4194304
  ) {
    throw new RangeError(
      "PCA dimensions must be integers in 1..2048 (at most 4194304 pixels)",
    );
  }
  const count = width * height;
  if (!(data instanceof Uint8ClampedArray) || data.length !== count * 4) {
    throw new RangeError(
      "PCA requires exactly width * height * 4 RGBA bytes in a Uint8ClampedArray",
    );
  }

  // Byte sums are exact at the supported image sizes.
  const mean = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    mean[0] += data[i];
    mean[1] += data[i + 1];
    mean[2] += data[i + 2];
  }
  for (let channel = 0; channel < 3; channel++) mean[channel] /= count;

  // Center first, then accumulate the six unique covariance entries with Kahan
  // compensation, avoiding cancellation in E[XX'] - E[X]E[X]' near constants.
  const sums = [0, 0, 0, 0, 0, 0];
  const corrections = [0, 0, 0, 0, 0, 0];
  const products = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] - mean[0];
    const g = data[i + 1] - mean[1];
    const b = data[i + 2] - mean[2];
    products[0] = r * r;
    products[1] = r * g;
    products[2] = r * b;
    products[3] = g * g;
    products[4] = g * b;
    products[5] = b * b;
    for (let j = 0; j < 6; j++) {
      const adjusted = products[j] - corrections[j];
      const next = sums[j] + adjusted;
      corrections[j] = next - sums[j] - adjusted;
      sums[j] = next;
    }
  }
  const [rr, rg, rb, gg, gb, bb] = sums.map((value) => value / count);
  const pairs = eigensystem([
    [rr, rg, rb],
    [rg, gg, gb],
    [rb, gb, bb],
  ]);
  const eigenvalues = pairs.map((pair) => pair.value);
  const eigenvectors = pairs.map((pair) => pair.vector);
  const total = eigenvalues.reduce((sum, value) => sum + value, 0);
  const explainedVariance = eigenvalues.map((value) =>
    total > 0 ? value / total : 0,
  );
  const ranges = eigenvalues.map(() => ({ min: Infinity, max: -Infinity }));

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] - mean[0];
    const g = data[i + 1] - mean[1];
    const b = data[i + 2] - mean[2];
    for (let j = 0; j < 3; j++) {
      const v = eigenvectors[j];
      const value = r * v[0] + g * v[1] + b * v[2];
      ranges[j].min = Math.min(ranges[j].min, value);
      ranges[j].max = Math.max(ranges[j].max, value);
    }
  }
  // Do not amplify dot-product roundoff in null spaces into visible patterns.
  const projectionTolerance = 32 * Number.EPSILON * 255 * Math.sqrt(3);
  const scales = ranges.map((range) => {
    if (range.max - range.min <= projectionTolerance) {
      range.min = range.max = 0;
      return 0;
    }
    return 255 / (range.max - range.min);
  });
  const components = eigenvalues.map(() => new Uint8ClampedArray(count));
  for (let pixel = 0; pixel < count; pixel++) {
    const i = pixel * 4;
    const r = data[i] - mean[0];
    const g = data[i + 1] - mean[1];
    const b = data[i + 2] - mean[2];
    for (let j = 0; j < 3; j++) {
      if (scales[j] === 0) continue;
      const v = eigenvectors[j];
      const value = r * v[0] + g * v[1] + b * v[2];
      components[j][pixel] = Math.round((value - ranges[j].min) * scales[j]);
    }
  }
  return {
    components,
    eigenvalues,
    eigenvectors,
    explainedVariance,
    mean,
    ranges,
  };
}
