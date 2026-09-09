import { fft2d, shift2d } from "./fft";
import { preprocess } from "./preprocess";
import { fftProfilePeaks, fft2dPeaks, acPeaks } from "./peaks";
import type { AnalysisInput, AnalysisResult } from "./types";
export function analyze(
  input: AnalysisInput,
  progress: (stage: string, progress: number) => void = () => {},
): AnalysisResult {
  const start = performance.now();
  progress("Preprocessing", 0.05);
  const prepared = preprocess(input),
    { width: w, height: h, data, mean, stddev } = prepared;
  const p = structuredClone(input.params),
    n = w * h;
  if (p.acMethod === "direct" && (w > 32 || h > 32))
    throw new Error(
      "Direct autocorrelation is limited to 32 × 32 padded pixels. Use FFT or reduce max dimension.",
    );
  const usefulSignal = stddev > 1e-10;
  const re = new Float64Array(data),
    im = new Float64Array(n);
  progress("2D FFT", 0.25);
  fft2d(re, im, w, h);
  const rawPower = new Float64Array(n);
  for (let i = 0; i < n; i++) rawPower[i] = re[i] * re[i] + im[i] * im[i];
  const power = shift2d(rawPower, w, h);
  progress("Circular autocorrelation", 0.55);
  let rawAC: Float64Array;
  if (p.acMethod === "direct") {
    rawAC = new Float64Array(n);
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        let sum = 0;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            sum += data[y * w + x] * data[((y + dy) % h) * w + ((x + dx) % w)];
        rawAC[dy * w + dx] = sum;
      }
  } else {
    rawAC = new Float64Array(rawPower);
    fft2d(rawAC, new Float64Array(n), w, h, true);
  }
  const zero = rawAC[0];
  if (p.acNormalize === "center" && Math.abs(zero) > 1e-18)
    for (let i = 0; i < n; i++) rawAC[i] /= zero;
  const autocorrelation = shift2d(rawAC, w, h);
  const fftX = new Float64Array(w),
    fftY = new Float64Array(h),
    acX = new Float64Array(w),
    acY = new Float64Array(h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      fftX[x] += power[y * w + x] / h;
      fftY[y] += power[y * w + x] / w;
    }
  for (let x = 0; x < w; x++)
    acX[x] = autocorrelation[Math.floor(h / 2) * w + x];
  for (let y = 0; y < h; y++)
    acY[y] = autocorrelation[y * w + Math.floor(w / 2)];
  progress("Peak detection", 0.8);
  const candidates = usefulSignal
    ? [
        ...fftProfilePeaks(fftX, "x", p, w / prepared.processedWidth),
        ...fftProfilePeaks(fftY, "y", p, h / prepared.processedHeight),
        ...fft2dPeaks(
          power,
          w,
          h,
          p,
          (w * h) / (prepared.processedWidth * prepared.processedHeight),
        ),
        ...acPeaks(acX, "x", p),
        ...acPeaks(acY, "y", p),
      ]
    : [];
  const warnings = [
    ...prepared.warnings,
    "Circular autocorrelation wraps across the padded grid; edge lags can be misleading.",
    "Periodicity is repeated structure, not proof of hidden text. JPEG blocks, resampling, moire and normal textures also create peaks.",
    "Confidence is an uncalibrated signal-strength heuristic, not a probability.",
  ];
  if (!usefulSignal)
    warnings.unshift(
      "No useful signal: the processed image is constant or has negligible variance.",
    );
  if (!p.removeMean)
    warnings.push("Mean removal is disabled: DC/window leakage may dominate.");
  const strongPeriodicity =
    usefulSignal &&
    candidates.some(
      (c) =>
        c.source !== "autocorrelation" &&
        c.relativePower >= Math.max(8, p.relativeThreshold) &&
        c.confidence >= 0.75,
    );
  progress("Complete", 1);
  return {
    width: w,
    height: h,
    processedWidth: prepared.processedWidth,
    processedHeight: prepared.processedHeight,
    sourceWidth: input.width,
    sourceHeight: input.height,
    scaleX: prepared.scaleX,
    scaleY: prepared.scaleY,
    preprocessed: data,
    power,
    autocorrelation,
    profiles: { fftX, fftY, acX, acY },
    candidates,
    warnings,
    stats: {
      mean,
      stddev,
      usefulSignal,
      strongPeriodicity,
      elapsedMs: performance.now() - start,
    },
    params: p,
  };
}
