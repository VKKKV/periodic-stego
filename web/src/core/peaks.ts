import type { AnalysisParams, PeriodCandidate } from "./types";
const blank = {
  frequencyX: null,
  frequencyY: null,
  periodX: null,
  periodY: null,
};
function background(values: Float64Array, accept: (i: number) => boolean) {
  // Sampling a flattened grid at fixed strides aliases with rows/columns.
  // Select the exact median in a private buffer; never mutate the spectrum.
  const sample = new Float64Array(values.length);
  let count = 0;
  for (let i = 0; i < values.length; i++)
    if (accept(i)) sample[count++] = values[i];
  if (!count) return 1e-18;
  const target = Math.floor(count / 2);
  let lo = 0,
    hi = count - 1;
  const swap = (a: number, b: number) => {
    const value = sample[a];
    sample[a] = sample[b];
    sample[b] = value;
  };
  let budget = 2 * Math.ceil(Math.log2(count + 1));
  while (lo < hi) {
    if (--budget < 0) {
      sample.subarray(lo, hi + 1).sort();
      break;
    }
    const mid = Math.floor((lo + hi) / 2);
    const pivot = [sample[lo], sample[mid], sample[hi]].sort(
      (a, b) => a - b,
    )[1];
    let less = lo,
      i = lo,
      greater = hi;
    while (i <= greater) {
      if (sample[i] < pivot) swap(less++, i++);
      else if (sample[i] > pivot) swap(i, greater--);
      else i++;
    }
    if (target < less) hi = less - 1;
    else if (target > greater) lo = greater + 1;
    else break;
  }
  return Math.max(sample[target], 1e-18);
}
function confidence(relative: number, fraction: number) {
  return Math.min(
    1,
    Math.max(
      0,
      (Math.log10(Math.max(1, relative)) / 2) * Math.min(1, fraction / 0.05),
    ),
  );
}
export function fftProfilePeaks(
  values: Float64Array,
  axis: "x" | "y",
  p: AnalysisParams,
  paddingFactor = 1,
): PeriodCandidate[] {
  const n = values.length,
    center = Math.floor(n / 2);
  const baseline = background(values, (i) => Math.abs(i - center) > p.dcRadius);
  let total = 0;
  for (const v of values) total += v;
  const peaks: { index: number; value: number }[] = [];
  // Positive half plus the unique even-length Nyquist sample at index zero.
  for (let i = 0; i < n; i++) {
    const k = i - center;
    if (!(
      k > p.dcRadius ||
      (i === 0 && n % 2 === 0 && Math.abs(k) > p.dcRadius)
    ))
      continue;
    const v = values[i];
    if (v <= 1e-18 || v / baseline < p.relativeThreshold) continue;
    const left = values[(i + n - 1) % n];
    const right = values[(i + 1) % n];
    const tolerance = Math.max(v, left, right) * 1e-12;
    if (
      v < left - tolerance ||
      v < right - tolerance ||
      (v <= left + tolerance && v <= right + tolerance)
    )
      continue;
    peaks.push({ index: i, value: v });
  }
  peaks.sort((a, b) => b.value - a.value);
  const selected: PeriodCandidate[] = [];
  const bins: number[] = [];
  for (const peak of peaks) {
    const k = Math.abs(peak.index - center);
    if (bins.some((b) => Math.abs(b - k) < p.peakSeparation)) continue;
    bins.push(k);
    const f = k / n,
      relative = peak.value / baseline;
    const caveats = [
      "Signal-strength heuristic, not evidence of a hidden message.",
    ];
    if (k <= p.dcRadius + 1)
      caveats.push(
        "Near the excluded DC region; sensitive to trends/windowing.",
      );
    if (f >= 0.45)
      caveats.push(
        "Near Nyquist; undersampling or aliasing may affect interpretation.",
      );
    selected.push({
      ...blank,
      axis,
      source: "fft-profile",
      [axis === "x" ? "frequencyX" : "frequencyY"]: f,
      [axis === "x" ? "periodX" : "periodY"]: 1 / f,
      power: peak.value,
      relativePower: relative,
      confidence: confidence(
        relative,
        (paddingFactor * peak.value) / Math.max(total, 1e-18),
      ),
      caveats,
    });
    if (selected.length >= p.peakCount) break;
  }
  return selected;
}
export function fft2dPeaks(
  power: Float64Array,
  w: number,
  h: number,
  p: AnalysisParams,
  paddingFactor = 1,
): PeriodCandidate[] {
  const cx = Math.floor(w / 2),
    cy = Math.floor(h / 2);
  const radius2 = p.dcRadius * p.dcRadius;
  const baseline = background(
    power,
    (i) => ((i % w) - cx) ** 2 + (Math.floor(i / w) - cy) ** 2 > radius2,
  );
  let total = 0;
  for (const v of power) total += v;
  const peaks: { x: number; y: number; value: number }[] = [];
  const index = (x: number, y: number) => ((y + h) % h) * w + ((x + w) % w);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const kx = x - cx,
        ky = y - cy;
      if (kx * kx + ky * ky <= radius2) continue;
      // Canonical representative of a conjugate pair, including Nyquist lines.
      const conjugateX = (((2 * cx - x) % w) + w) % w,
        conjugateY = (((2 * cy - y) % h) + h) % h;
      if (y * w + x > conjugateY * w + conjugateX) continue;
      const v = power[y * w + x];
      if (v <= 1e-18 || v / baseline < p.relativeThreshold) continue;
      let maximum = true,
        strict = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (dx || dy) {
            const neighbor = power[index(x + dx, y + dy)];
            if (
              v <
              neighbor - Math.max(Math.abs(v), Math.abs(neighbor)) * 1e-12
            )
              maximum = false;
            if (v > neighbor) strict = true;
          }
      if (maximum && strict) peaks.push({ x, y, value: v });
    }
  peaks.sort((a, b) => b.value - a.value);
  const selected: PeriodCandidate[] = [];
  const distance = (a: number, b: number, n: number) =>
    Math.min(Math.abs(a - b), n - Math.abs(a - b));
  for (const peak of peaks) {
    if (
      selected.some((s) => {
        const x = s.binX!,
          y = s.binY!;
        const qx = (((2 * cx - x) % w) + w) % w,
          qy = (((2 * cy - y) % h) + h) % h;
        return (
          Math.hypot(distance(peak.x, x, w), distance(peak.y, y, h)) <
            p.peakSeparation ||
          Math.hypot(distance(peak.x, qx, w), distance(peak.y, qy, h)) <
            p.peakSeparation
        );
      })
    )
      continue;
    const fx = (peak.x - cx) / w,
      fy = (peak.y - cy) / h,
      relative = peak.value / baseline;
    const caveats = [
      "Conjugate peaks are one candidate; ordinary texture can produce the same evidence.",
    ];
    if (Math.abs(fx) >= 0.45 || Math.abs(fy) >= 0.45)
      caveats.push("Near Nyquist; aliasing is possible.");
    if (Math.hypot(peak.x - cx, peak.y - cy) <= p.dcRadius + 1)
      caveats.push("Near DC; inspect trends and window leakage.");
    selected.push({
      axis: fx === 0 ? "y" : fy === 0 ? "x" : "2d",
      source: "fft-2d",
      frequencyX: fx,
      frequencyY: fy,
      periodX: fx === 0 ? null : 1 / Math.abs(fx),
      periodY: fy === 0 ? null : 1 / Math.abs(fy),
      power: peak.value,
      relativePower: relative,
      confidence: confidence(
        relative,
        (paddingFactor * peak.value) / Math.max(total, 1e-18),
      ),
      caveats,
      binX: peak.x,
      binY: peak.y,
    });
    if (selected.length >= p.peakCount) break;
  }
  return selected;
}
export function acPeaks(
  values: Float64Array,
  axis: "x" | "y",
  p: AnalysisParams,
): PeriodCandidate[] {
  const center = Math.floor(values.length / 2),
    zero = values[center];
  if (zero <= 1e-18) return [];
  const maxLag = Math.min(
    axis === "x" ? p.maxLagX : p.maxLagY,
    Math.floor(values.length / 2),
  );
  const peaks: { lag: number; value: number }[] = [];
  for (let lag = p.minLag; lag <= maxLag; lag++) {
    const i = (center + lag) % values.length,
      v = values[i] / zero;
    if (v < p.acThreshold || v <= 0) continue;
    const before = values[(i - 1 + values.length) % values.length] / zero,
      after = values[(i + 1) % values.length] / zero;
    // Conjugate lags can be adjacent across an odd-length wrap boundary.
    const tolerance =
      Math.max(Math.abs(v), Math.abs(before), Math.abs(after)) * 1e-12;
    if (
      v >= before - tolerance &&
      v >= after - tolerance &&
      (v > before + tolerance || v > after + tolerance)
    )
      peaks.push({ lag, value: v });
  }
  peaks.sort((a, b) => b.value - a.value || a.lag - b.lag);
  const selected: PeriodCandidate[] = [];
  for (const peak of peaks) {
    if (
      selected.some(
        (s) =>
          Math.abs((axis === "x" ? s.lagX! : s.lagY!) - peak.lag) <
          p.acSeparation,
      )
    )
      continue;
    selected.push({
      ...blank,
      axis,
      source: "autocorrelation",
      [axis === "x" ? "periodX" : "periodY"]: peak.lag,
      [axis === "x" ? "lagX" : "lagY"]: peak.lag,
      power: values[(center + peak.lag) % values.length],
      relativePower: peak.value,
      confidence: Math.min(1, peak.value),
      caveats: [
        "Circular lag, not inverse-frequency bin. Multiples/harmonics may not be the fundamental period.",
        "Autocorrelation alone does not establish periodicity or hidden content.",
      ],
    });
    if (selected.length >= p.peakCount) break;
  }
  return selected;
}
