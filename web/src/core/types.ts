export const TOOL_VERSION = "1.0.0";
export const FFT_CONVENTION =
  "Float64; forward exp(-2πikn/N), unscaled; inverse exp(+2πikn/N)/(width*height); fftshift=floor(N/2). Zero padding follows ROI/resampling/windowing. Frequencies and periods use analyzed pixels, not original pixels. AC is circular on the padded grid.";
export type Channel = "luminance" | "r" | "g" | "b" | "alpha";
export interface AnalysisParams {
  channel: Channel;
  normalize: boolean;
  removeMean: boolean;
  detrend: "none" | "row" | "column" | "plane";
  analysisGamma: number;
  roi: { x: number; y: number; width: number; height: number } | null;
  maxDimension: number;
  padding: "none" | "power2" | "explicit";
  paddingSize: number;
  window: "none" | "hann" | "hamming" | "blackman";
  dcRadius: number;
  peakCount: number;
  peakSeparation: number;
  relativeThreshold: number;
  acMethod: "fft" | "direct";
  acNormalize: "none" | "center";
  maxLagX: number;
  maxLagY: number;
  minLag: number;
  acThreshold: number;
  acSeparation: number;
}
export interface DisplayParams {
  spectrum: "magnitude" | "power" | "log-power";
  gamma: number;
  conjugates: boolean;
  grid: boolean;
  labels: boolean;
  wrapWarning: boolean;
  interpolation: "nearest" | "bilinear";
  imageZoom: "fit" | "100%";
  frequencyZoom: number;
  profileUnits: "frequency" | "period";
  profileZoom: number;
  profilePan: number;
}
export interface PeriodCandidate {
  axis: "x" | "y" | "2d";
  source: "fft-profile" | "fft-2d" | "autocorrelation";
  frequencyX: number | null;
  frequencyY: number | null;
  periodX: number | null;
  periodY: number | null;
  power: number;
  relativePower: number;
  confidence: number;
  caveats: string[];
  binX?: number;
  binY?: number;
  lagX?: number;
  lagY?: number;
}
export interface AnalysisInput {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  params: AnalysisParams;
}
export interface StereogramResult {
  period: number;
  correlation: number;
  prominence: number;
  rowSupport: number;
  sampledRows: number;
  minPeriod: number;
  maxPeriod: number;
  minSeparation: number;
  maxSeparation: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  matchedFraction: number;
  // Original ROI pixel units. NaN marks unsupported/ambiguous matches.
  disparity: Float64Array;
  matchConfidence: Float64Array;
}
export interface AnalysisResult {
  width: number;
  height: number;
  processedWidth: number;
  processedHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  scaleX: number;
  scaleY: number;
  preprocessed: Float64Array;
  power: Float64Array;
  autocorrelation: Float64Array;
  profiles: {
    fftX: Float64Array;
    fftY: Float64Array;
    acX: Float64Array;
    acY: Float64Array;
  };
  candidates: PeriodCandidate[];
  stereogram: StereogramResult | null;
  warnings: string[];
  stats: {
    mean: number;
    stddev: number;
    usefulSignal: boolean;
    strongPeriodicity: boolean;
    elapsedMs: number;
  };
  params: AnalysisParams;
}
export interface WorkerRequest {
  id: number;
  input: AnalysisInput;
}
export type WorkerResponse =
  | { id: number; type: "progress"; stage: string; progress: number }
  | { id: number; type: "result"; result: AnalysisResult }
  | { id: number; type: "error"; error: string };
