import { fft1d } from "./fft";
import type { AnalysisInput, StereogramResult } from "./types";

// A separate native-pixel pass: averaging random dots before matching destroys
// their correspondence. FFT windows/padding are intentionally not used here.
export function analyzeStereogram(
  input: AnalysisInput,
): StereogramResult | null {
  const roi = input.params.roi ?? {
    x: 0,
    y: 0,
    width: input.width,
    height: input.height,
  };
  const w = roi.width,
    h = roi.height,
    n = w - 1;
  const minPeriod = 8,
    maxPeriod = Math.min(1024, Math.floor(n / 3));
  if (maxPeriod < minPeriod || h < 8) return null;
  const readRow = (y: number) => {
    const row = new Float64Array(w);
    const channel = input.params.channel;
    for (let x = 0; x < w; x++) {
      const i = ((roi.y + y) * input.width + roi.x + x) * 4;
      row[x] =
        (channel === "luminance"
          ? 0.2126 * input.rgba[i] +
            0.7152 * input.rgba[i + 1] +
            0.0722 * input.rgba[i + 2]
          : input.rgba[i + { r: 0, g: 1, b: 2, alpha: 3 }[channel]]) / 255;
    }
    return row;
  };
  const sampledRows = Math.min(32, h),
    size = 2 ** Math.ceil(Math.log2(2 * n - 1));
  const correlations = new Float64Array(maxPeriod + 3),
    support = new Uint8Array(maxPeriod + 3);
  for (let y = 0; y < sampledRows; y++) {
    const row = readRow(Math.floor(((y + 0.5) * h) / sampledRows));
    const re = new Float64Array(size),
      im = new Float64Array(size);
    const sum = new Float64Array(w),
      squares = new Float64Array(w);
    for (let x = 0; x < n; x++) {
      const v = row[x + 1] - row[x];
      re[x] = v;
      sum[x + 1] = sum[x] + v;
      squares[x + 1] = squares[x] + v * v;
    }
    fft1d(re, im);
    for (let x = 0; x < size; x++) {
      re[x] = re[x] ** 2 + im[x] ** 2;
      im[x] = 0;
    }
    fft1d(re, im, true);
    for (let lag = minPeriod - 2; lag < correlations.length; lag++) {
      const count = n - lag,
        a = sum[count],
        b = sum[n] - sum[lag];
      const va = squares[count] - (a * a) / count,
        vb = squares[n] - squares[lag] - (b * b) / count;
      if (va / count < 1e-8 || vb / count < 1e-8) continue;
      const r = Math.max(
        -1,
        Math.min(1, (re[lag] - (a * b) / count) / Math.sqrt(va * vb)),
      );
      correlations[lag] += r / sampledRows;
      if (r >= 0.35) support[lag]++;
    }
  }
  const peaks: number[] = [];
  for (let lag = minPeriod; lag <= maxPeriod; lag++) {
    const value = correlations[lag];
    if (
      value >= 0.55 &&
      support[lag] / sampledRows >= 0.6 &&
      value > correlations[lag - 1] &&
      value >= correlations[lag + 1] &&
      value - Math.max(correlations[lag - 2], correlations[lag + 2]) >= 0.15
    )
      peaks.push(lag);
  }
  if (!peaks.length) return null;
  const strongest = Math.max(...peaks.map((lag) => correlations[lag]));
  const period = peaks.find((lag) => correlations[lag] >= 0.9 * strongest)!;
  const minSeparation = Math.max(2, Math.floor(period * 0.55)),
    maxSeparation = Math.ceil(period * 1.05);
  // Bound local matching work as well as output memory, including wide images.
  const rowBudget = Math.max(
    1,
    Math.floor(40_000_000 / (w * (maxSeparation - minSeparation + 1))),
  );
  const scale = Math.min(1, 512 / Math.max(w, h), rowBudget / h);
  const width = Math.max(1, Math.floor(w * scale)),
    height = Math.max(1, Math.floor(h * scale));
  const disparity = new Float64Array(width * height).fill(NaN);
  const matchConfidence = new Float64Array(width * height);
  const radius = 5,
    windowSize = radius * 2 + 1;
  let matched = 0;
  for (let y = 0; y < height; y++) {
    const row = readRow(Math.floor(((y + 0.5) * h) / height));
    const best = new Float64Array(width).fill(Infinity),
      second = new Float64Array(width).fill(Infinity);
    const lags = new Uint16Array(width),
      sums = new Float64Array(w + 1),
      squares = new Float64Array(w + 1);
    for (let x = 0; x < w; x++) {
      sums[x + 1] = sums[x] + row[x];
      squares[x + 1] = squares[x] + row[x] ** 2;
    }
    for (let lag = minSeparation; lag <= maxSeparation; lag++) {
      const cost = new Float64Array(w + 1);
      for (let x = maxSeparation; x < w; x++)
        cost[x + 1] = cost[x] + (row[x] - row[x - lag]) ** 2;
      for (let x = 0; x < width; x++) {
        const sx = Math.floor(((x + 0.5) * w) / width);
        if (sx < maxSeparation + radius || sx + radius >= w) continue;
        const value = (cost[sx + radius + 1] - cost[sx - radius]) / windowSize;
        if (value < best[x]) {
          second[x] = best[x];
          best[x] = value;
          lags[x] = lag;
        } else if (value < second[x]) second[x] = value;
      }
    }
    for (let x = 0; x < width; x++) {
      const sx = Math.floor(((x + 0.5) * w) / width);
      if (!Number.isFinite(best[x])) continue;
      const mean = (sums[sx + radius + 1] - sums[sx - radius]) / windowSize;
      const variance =
        (squares[sx + radius + 1] - squares[sx - radius]) / windowSize -
        mean * mean;
      const uniqueness = (second[x] - best[x]) / Math.max(second[x], 1e-12);
      if (variance < 1e-8 || best[x] > variance || uniqueness < 0.15) continue;
      disparity[y * width + x] = period - lags[x];
      matchConfidence[y * width + x] = uniqueness;
      matched++;
    }
  }
  // Gradient quantization can repeat without the pixels themselves matching.
  // Require local photometric matches, not just repeated derivatives.
  if (matched / disparity.length < 0.25) return null;
  return {
    period,
    correlation: correlations[period],
    prominence:
      correlations[period] -
      Math.max(correlations[period - 2], correlations[period + 2]),
    rowSupport: support[period] / sampledRows,
    sampledRows,
    minPeriod,
    maxPeriod,
    minSeparation,
    maxSeparation,
    width,
    height,
    scaleX: w / width,
    scaleY: h / height,
    matchedFraction: matched / disparity.length,
    disparity,
    matchConfidence,
  };
}
