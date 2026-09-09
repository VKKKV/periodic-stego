import type { StereogramResult } from "../core/types";

export function disparityCanvas(result: StereogramResult, gamma: number) {
  const canvas = document.createElement("canvas");
  canvas.width = result.width;
  canvas.height = result.height;
  const ctx = canvas.getContext("2d")!;
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  const minimum = result.period - result.maxSeparation,
    range = result.maxSeparation - result.minSeparation;
  for (let i = 0; i < result.disparity.length; i++) {
    const d = result.disparity[i];
    const value = Math.round(
      255 * Math.max(0, Math.min(1, (d - minimum) / range)) ** (1 / gamma),
    );
    const k = i * 4;
    // Unsupported border/ambiguous matches are blue, not fabricated depth.
    pixels.data[k] = Number.isFinite(d) ? value : 20;
    pixels.data[k + 1] = Number.isFinite(d) ? value : 40;
    pixels.data[k + 2] = Number.isFinite(d) ? value : 60;
    pixels.data[k + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
