import { expect, it, vi } from "vitest";
import { analyze } from "../src/core/pipeline";
import { analyzeStereogram } from "../src/core/stereogram";
import { createReport } from "../src/export";
import { DEFAULT_DISPLAY } from "../src/state";
import type { LocalImage } from "../src/image";
import { randomDotInput } from "./stereogram-fixture";
import { disparityCanvas } from "../src/render/disparity";

it("detects a broadband random-dot repeat without relaxing FFT concentration", () => {
  const r = analyze(randomDotInput());
  expect(r.stats.strongPeriodicity).toBe(true);
  expect(r.stereogram?.period).toBe(120);
  expect(r.stereogram!.correlation).toBeGreaterThan(0.7);
  expect(
    r.candidates.some(
      (c) => c.source !== "autocorrelation" && c.confidence >= 0.75,
    ),
  ).toBe(false);
});
it.each([8, 31, 120, 213])(
  "uses original pixels and avoids harmonic selection: period %i",
  (period) => {
    const input = randomDotInput(1283, 96, period, 0);
    expect(analyzeStereogram(input)?.period).toBe(period);
  },
);
it.each([20, 48, -4])(
  "recovers local disparity %i, with unsupported borders masked",
  (depth) => {
    const r = analyzeStereogram(randomDotInput(960, 240, 120, depth))!;
    const sample = (x: number, y: number) =>
      r.disparity[
        Math.floor(y / r.scaleY) * r.width + Math.floor(x / r.scaleX)
      ];
    expect(sample(520, 120)).toBe(depth);
    expect(sample(250, 120)).toBe(0);
    expect(Number.isNaN(sample(10, 120))).toBe(true);
    expect(r.matchedFraction).toBeGreaterThan(0.6);
  },
);
it("does not lose random dots when FFT area averaging cancels the entire signal", () => {
  const input = randomDotInput(1024, 64, 64, 0);
  // Pair every random value with its complement: 8x8 area averages are constant.
  for (let y = 0; y < input.height; y++)
    for (let x = 0; x < input.width; x += 2) {
      const i = (y * input.width + x) * 4;
      for (let c = 0; c < 3; c++)
        input.rgba[i + 4 + c] = 255 - input.rgba[i + c];
    }
  input.params.maxDimension = 128;
  const r = analyze(input);
  expect(r.stats.stddev).toBeLessThan(1e-10);
  expect(r.stats.usefulSignal).toBe(true);
  expect(r.stats.strongPeriodicity).toBe(true);
  expect(r.stereogram?.period).toBe(64);
});
it("respects native ROI/channel but is invariant to unrelated FFT controls", () => {
  const input = randomDotInput(960, 120, 120, 0);
  input.params.roi = { x: 100, y: 10, width: 700, height: 100 };
  const a = analyze(input);
  const b = analyze({
    ...input,
    params: {
      ...input.params,
      maxDimension: 256,
      window: "blackman",
      padding: "power2",
      detrend: "row",
      analysisGamma: 2,
    },
  });
  expect(b.stereogram).toEqual(a.stereogram);
  expect(a.stereogram?.period).toBe(120);
  expect(
    analyzeStereogram({
      ...input,
      params: { ...input.params, channel: "alpha" },
    }),
  ).toBeNull();
});
it.each([1, 137, 9999, 99991])("rejects independent noise seed %i", (seed) => {
  expect(analyzeStereogram(randomDotInput(640, 96, 0, 0, seed))).toBeNull();
});
it("rejects constant, gradient, single edge and monotonic correlated texture", () => {
  for (const mode of ["constant", "gradient", "edge", "smooth"]) {
    const input = randomDotInput(640, 96, 0);
    for (let y = 0; y < input.height; y++) {
      let value = 128;
      for (let x = 0; x < input.width; x++) {
        const i = (y * input.width + x) * 4;
        value =
          mode === "constant"
            ? 128
            : mode === "gradient"
              ? Math.floor(x / 3)
              : mode === "edge"
                ? x < 320
                  ? 0
                  : 255
                : 0.95 * value + 0.05 * input.rgba[i];
        input.rgba[i] =
          input.rgba[i + 1] =
          input.rgba[i + 2] =
            Math.round(value);
      }
    }
    expect(analyzeStereogram(input)?.period ?? null, mode).toBeNull();
  }
});
it("does not infer horizontal structure from vertically repeated noise", () => {
  const input = randomDotInput(640, 96, 0);
  for (let y = 12; y < input.height; y++)
    input.rgba.copyWithin(
      y * 640 * 4,
      (y % 12) * 640 * 4,
      ((y % 12) + 1) * 640 * 4,
    );
  expect(analyzeStereogram(input)).toBeNull();
});
it("limits native scan/matching work on wide images", () => {
  const r = analyzeStereogram(randomDotInput(16384, 8, 1024, 0))!;
  expect(r.period).toBe(1024);
  expect(r.width).toBeLessThanOrEqual(512);
  expect(r.height).toBe(1);
  expect(r.disparity.length).toBe(r.width);
});
it("exports numerical evidence without source pixels or disparity buffers", () => {
  const input = randomDotInput();
  const result = analyze(input);
  const image = {
    meta: { name: "synthetic.png", width: input.width, height: input.height },
  } as LocalImage;
  const report = JSON.parse(
    JSON.stringify(createReport(image, result, DEFAULT_DISPLAY)),
  );
  expect(report.stereogram.period).toBe(120);
  expect(report.stereogram.units).toContain("original ROI pixels");
  expect(report.stereogram.disparity).not.toHaveProperty("disparity");
  expect(report.stereogram).not.toHaveProperty("matchConfidence");
});

it("renders negative, zero and positive disparity distinctly, preserving the invalid mask", () => {
  const result = analyzeStereogram(randomDotInput())!;
  const pixels = { data: new Uint8ClampedArray(4 * 4) };
  const putImageData = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ createImageData: () => pixels, putImageData }),
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  try {
    for (const gamma of [0.5, 1, 2]) {
      disparityCanvas(
        {
          ...result,
          width: 4,
          height: 1,
          disparity: new Float64Array([-4, 0, 20, NaN]),
        },
        gamma,
      );
      expect(pixels.data[0]).toBeLessThan(pixels.data[4]);
      expect(pixels.data[4]).toBeLessThan(pixels.data[8]);
      expect([...pixels.data.slice(12)]).toEqual([20, 40, 60, 255]);
      expect(putImageData).toHaveBeenCalledWith(pixels, 0, 0);
    }
  } finally {
    vi.unstubAllGlobals();
  }
});
