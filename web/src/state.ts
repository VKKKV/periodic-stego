import type { AnalysisParams, DisplayParams } from "./core/types";

export const DEFAULT_ANALYSIS: AnalysisParams = {
  channel: "luminance",
  normalize: false,
  removeMean: true,
  detrend: "none",
  analysisGamma: 1,
  roi: null,
  maxDimension: 512,
  padding: "none",
  paddingSize: 512,
  window: "hann",
  dcRadius: 3,
  peakCount: 8,
  peakSeparation: 3,
  relativeThreshold: 8,
  acMethod: "fft",
  acNormalize: "center",
  maxLagX: 64,
  maxLagY: 64,
  minLag: 2,
  acThreshold: 0.25,
  acSeparation: 3,
};
export const DEFAULT_DISPLAY: DisplayParams = {
  spectrum: "log-power",
  gamma: 1,
  conjugates: false,
  grid: true,
  labels: true,
  wrapWarning: true,
  interpolation: "nearest",
  imageZoom: "fit",
  frequencyZoom: 1,
  profileUnits: "frequency",
  profileZoom: 1,
  profilePan: 0,
};
export const PRESETS: Record<string, Partial<AnalysisParams>> = {
  default: {},
  stripe: { window: "none", relativeThreshold: 8, acThreshold: 0.4 },
  subtle: {
    window: "hann",
    relativeThreshold: 5,
    peakCount: 12,
    acThreshold: 0.15,
  },
  ctf: { channel: "b", window: "none", relativeThreshold: 6, dcRadius: 2 },
  jpeg: {
    window: "hann",
    minLag: 4,
    maxLagX: 32,
    maxLagY: 32,
    relativeThreshold: 6,
  },
  conservative: {
    window: "hann",
    relativeThreshold: 20,
    acThreshold: 0.5,
    peakCount: 5,
  },
};
export function preset(name: string): AnalysisParams {
  if (!Object.hasOwn(PRESETS, name)) throw new Error("Unknown preset.");
  return { ...DEFAULT_ANALYSIS, ...PRESETS[name] };
}

const analysisEnums: Record<string, readonly string[]> = {
  channel: ["luminance", "r", "g", "b", "alpha"],
  detrend: ["none", "row", "column", "plane"],
  padding: ["none", "power2", "explicit"],
  window: ["none", "hann", "hamming", "blackman"],
  acMethod: ["fft", "direct"],
  acNormalize: ["none", "center"],
};
const displayEnums: Record<string, readonly string[]> = {
  spectrum: ["magnitude", "power", "log-power"],
  interpolation: ["nearest", "bilinear"],
  imageZoom: ["fit", "100%"],
  profileUnits: ["frequency", "period"],
};
const analysisBounds: Record<string, [number, number, boolean?]> = {
  analysisGamma: [0.1, 5],
  maxDimension: [8, 1024, true],
  paddingSize: [8, 2048, true],
  dcRadius: [0, 128],
  peakCount: [1, 32, true],
  peakSeparation: [1, 128],
  relativeThreshold: [1, 1000],
  maxLagX: [1, 1024, true],
  maxLagY: [1, 1024, true],
  minLag: [1, 1024, true],
  acThreshold: [0, 1],
  acSeparation: [1, 128],
};
const displayBounds: Record<string, [number, number]> = {
  gamma: [0.1, 5],
  frequencyZoom: [1, 16],
  profileZoom: [1, 16],
  profilePan: [0, 1],
};
function validateFields<T extends object>(
  value: unknown,
  defaults: T,
  enums: Record<string, readonly string[]>,
  bounds: Record<string, [number, number, boolean?]>,
): T {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid parameter object.");
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!Object.hasOwn(source, key))
      throw new Error(`Missing parameter: ${key}`);
    const v = source[key];
    if (key === "roi") {
      if (v === null) {
        out[key] = null;
        continue;
      }
      if (!v || typeof v !== "object" || Array.isArray(v))
        throw new Error("Invalid ROI.");
      const roi = v as Record<string, unknown>;
      out[key] = Object.fromEntries(
        ["x", "y", "width", "height"].map((k) => {
          const n = roi[k];
          if (
            typeof n !== "number" ||
            !Number.isSafeInteger(n) ||
            n < (k === "x" || k === "y" ? 0 : 1) ||
            n > 16384
          )
            throw new Error(`Invalid ROI ${k}.`);
          return [k, n];
        }),
      );
    } else if (enums[key]) {
      if (typeof v !== "string" || !enums[key].includes(v))
        throw new Error(`Invalid ${key}.`);
      out[key] = v;
    } else if (typeof defaultValue === "boolean") {
      if (typeof v !== "boolean") throw new Error(`Invalid ${key}.`);
      out[key] = v;
    } else {
      const bound = bounds[key];
      if (
        !bound ||
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < bound[0] ||
        v > bound[1] ||
        (bound[2] && !Number.isInteger(v))
      )
        throw new Error(
          `Invalid ${key}: expected ${bound?.[0]}–${bound?.[1]}.`,
        );
      out[key] = v;
    }
  }
  return out as T;
}
export function validateAnalysis(value: unknown): AnalysisParams {
  return validateFields(value, DEFAULT_ANALYSIS, analysisEnums, analysisBounds);
}
export function validateDisplay(value: unknown): DisplayParams {
  return validateFields(value, DEFAULT_DISPLAY, displayEnums, displayBounds);
}
export function parsePreset(text: string): {
  analysis: AnalysisParams;
  display: DisplayParams;
} {
  if (text.length > 65536) throw new Error("Preset exceeds 64 KiB.");
  const value = JSON.parse(text);
  if (!value || value.schema !== "periodic-stego-preset/v1")
    throw new Error("Unsupported preset schema.");
  return {
    analysis: validateAnalysis(value.analysis),
    display: validateDisplay(value.display),
  };
}
