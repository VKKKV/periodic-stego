import type { AnalysisInput } from "../src/core/types";
import { DEFAULT_ANALYSIS } from "../src/state";

// Independent copy-constraint generator, not a Fourier stripe. Local distance
// shrinks inside a rectangle, as in a random-dot autostereogram.
export function randomDotInput(
  width = 960,
  height = 240,
  period = 120,
  depth = 20,
  seed = 137,
): AnalysisInput {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 24;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inside =
        x > width * 0.4 &&
        x < width * 0.65 &&
        y > height * 0.3 &&
        y < height * 0.7;
      const distance = period - (inside ? depth : 0),
        i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++)
        rgba[i + c] =
          period && x >= period ? rgba[i - distance * 4 + c] : random();
      rgba[i + 3] = 255;
    }
  return { rgba, width, height, params: { ...DEFAULT_ANALYSIS } };
}
