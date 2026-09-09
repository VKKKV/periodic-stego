import { validateAnalysis } from "../state";
import type { AnalysisInput, AnalysisParams } from "./types";
export function preprocess(input: AnalysisInput) {
  const { width: iw, height: ih, rgba } = input,
    p = validateAnalysis(input.params);
  if (
    !Number.isInteger(iw) ||
    !Number.isInteger(ih) ||
    iw < 1 ||
    ih < 1 ||
    iw > 16384 ||
    ih > 16384 ||
    iw * ih > 16777216 ||
    !(rgba instanceof Uint8ClampedArray) ||
    rgba.length !== iw * ih * 4
  )
    throw new Error(
      "Invalid image dimensions or RGBA buffer; maximum 16 megapixels.",
    );
  const roi = p.roi ?? { x: 0, y: 0, width: iw, height: ih };
  if (roi.x + roi.width > iw || roi.y + roi.height > ih)
    throw new Error("ROI extends beyond the original image.");
  const factor = Math.min(1, p.maxDimension / Math.max(roi.width, roi.height));
  const pw = Math.max(1, Math.floor(roi.width * factor)),
    ph = Math.max(1, Math.floor(roi.height * factor));
  const scaleX = roi.width / pw,
    scaleY = roi.height / ph,
    warnings: string[] = [];
  if (factor < 1)
    warnings.push(
      `Downsampled ${roi.width} × ${roi.height} ROI to ${pw} × ${ph}. Periods use analyzed pixels; multiply by scale X ${scaleX.toFixed(4)} / Y ${scaleY.toFixed(4)} for original pixels. Anti-alias averaging can weaken high-frequency structure.`,
    );
  const work = new Float64Array(pw * ph);
  const channel = (x: number, y: number) => {
    const i = ((roi.y + y) * iw + roi.x + x) * 4;
    return (
      (p.channel === "luminance"
        ? 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]
        : rgba[i + { r: 0, g: 1, b: 2, alpha: 3 }[p.channel]]) / 255
    );
  };
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      const x0 = x * scaleX,
        x1 = (x + 1) * scaleX,
        y0 = y * scaleY,
        y1 = (y + 1) * scaleY;
      let sum = 0,
        weight = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++)
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          if (sx >= roi.width || sy >= roi.height) continue;
          const area =
            (Math.min(x1, sx + 1) - Math.max(x0, sx)) *
            (Math.min(y1, sy + 1) - Math.max(y0, sy));
          sum += channel(sx, sy) * area;
          weight += area;
        }
      work[y * pw + x] = (sum / weight) ** p.analysisGamma;
    }
  if (p.normalize) {
    let min = Infinity,
      max = -Infinity;
    for (const v of work) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    if (max - min > 1e-10)
      for (let i = 0; i < work.length; i++)
        work[i] = (work[i] - min) / (max - min);
  }
  detrend(work, pw, ph, p.detrend);
  let mean = 0;
  for (const v of work) mean += v;
  mean /= work.length;
  let variance = 0;
  for (const v of work) variance += (v - mean) ** 2;
  const stddev = Math.sqrt(variance / work.length);
  if (p.removeMean)
    for (let i = 0; i < work.length; i++)
      work[i] = stddev < 1e-14 ? 0 : work[i] - mean;
  const wx = windowValues(pw, p.window),
    wy = windowValues(ph, p.window);
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) work[y * pw + x] *= wx[x] * wy[y];
  const next = (n: number) => 2 ** Math.ceil(Math.log2(n));
  const width =
    p.padding === "power2"
      ? next(pw)
      : p.padding === "explicit"
        ? p.paddingSize
        : pw;
  const height =
    p.padding === "power2"
      ? next(ph)
      : p.padding === "explicit"
        ? p.paddingSize
        : ph;
  if (width < pw || height < ph)
    throw new Error(
      "Explicit padding size must fit both processed dimensions; it cannot crop the image.",
    );
  if (width > 2048 || height > 2048)
    throw new Error("Padded FFT dimensions exceed 2048.");
  if (width !== pw || height !== ph)
    warnings.push(
      "Zero padding interpolates the frequency grid; it does not improve true frequency resolution. AC wraps on the padded dimensions.",
    );
  const data = new Float64Array(width * height);
  for (let y = 0; y < ph; y++)
    data.set(work.subarray(y * pw, (y + 1) * pw), y * width);
  if (p.window !== "none" && (pw <= 2 || ph <= 2))
    warnings.push(
      "Very short dimensions may be suppressed by the selected window.",
    );
  return {
    data,
    width,
    height,
    processedWidth: pw,
    processedHeight: ph,
    scaleX,
    scaleY,
    mean,
    stddev,
    warnings,
  };
}
function detrend(
  data: Float64Array,
  w: number,
  h: number,
  mode: AnalysisParams["detrend"],
) {
  if (mode === "none") return;
  if (mode === "row")
    for (let y = 0; y < h; y++) {
      let mean = 0;
      for (let x = 0; x < w; x++) mean += data[y * w + x] / w;
      for (let x = 0; x < w; x++) data[y * w + x] -= mean;
    }
  if (mode === "column")
    for (let x = 0; x < w; x++) {
      let mean = 0;
      for (let y = 0; y < h; y++) mean += data[y * w + x] / h;
      for (let y = 0; y < h; y++) data[y * w + x] -= mean;
    }
  if (mode === "plane") {
    const cx = (w - 1) / 2,
      cy = (h - 1) / 2;
    let mean = 0,
      sx = 0,
      sy = 0,
      xx = 0,
      yy = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = data[y * w + x];
        mean += v / data.length;
        sx += (x - cx) * v;
        sy += (y - cy) * v;
        xx += (x - cx) ** 2;
        yy += (y - cy) ** 2;
      }
    const bx = xx ? sx / xx : 0,
      by = yy ? sy / yy : 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        data[y * w + x] -= mean + bx * (x - cx) + by * (y - cy);
  }
}
function windowValues(n: number, name: AnalysisParams["window"]) {
  return Float64Array.from({ length: n }, (_, i) => {
    if (name === "none" || n === 1) return 1;
    const t = (2 * Math.PI * i) / (n - 1);
    return name === "hann"
      ? 0.5 - 0.5 * Math.cos(t)
      : name === "hamming"
        ? 0.54 - 0.46 * Math.cos(t)
        : 0.42 - 0.5 * Math.cos(t) + 0.08 * Math.cos(2 * t);
  });
}
