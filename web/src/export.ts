import {
  FFT_CONVENTION,
  TOOL_VERSION,
  type AnalysisResult,
  type DisplayParams,
} from "./core/types";
import type { LocalImage } from "./image";
export function createReport(
  image: LocalImage,
  result: AnalysisResult,
  display: DisplayParams,
) {
  return {
    schema: "periodic-stego-report/v1",
    toolVersion: TOOL_VERSION,
    timestamp: new Date().toISOString(),
    image: image.meta,
    parameters: { analysis: result.params, display },
    preprocessing: {
      ...result.params,
      luminanceWeights: [0.2126, 0.7152, 0.0722],
      precision: "float64",
      processedWidth: result.processedWidth,
      processedHeight: result.processedHeight,
      transformWidth: result.width,
      transformHeight: result.height,
      scaleX: result.scaleX,
      scaleY: result.scaleY,
      units:
        "analyzed pixels; multiply periods by scaleX/scaleY for original-image pixels",
    },
    fftConvention: FFT_CONVENTION,
    candidates: result.candidates,
    warnings: result.warnings,
    stats: result.stats,
    caveats: [
      "Repeated structure is not proof of hidden text.",
      "JPEG blocks, resizing, scanlines, moire and ordinary textures may produce peaks.",
      "Confidence is an uncalibrated signal-strength heuristic, not a probability of steganography.",
    ],
  };
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadJSON(value: unknown, name: string) {
  downloadBlob(
    new Blob([JSON.stringify(value, null, 2) + "\n"], {
      type: "application/json",
    }),
    name,
  );
}
export async function downloadPNG(canvas: HTMLCanvasElement, name: string) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG export failed."))),
      "image/png",
    ),
  );
  downloadBlob(blob, name);
}
