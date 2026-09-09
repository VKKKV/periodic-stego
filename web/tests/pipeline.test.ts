import { describe, it, expect } from "vitest";
import { analyze } from "../src/core/pipeline";
import { DEFAULT_ANALYSIS, preset } from "../src/state";
import type { AnalysisParams } from "../src/core/types";
function sample(
  w: number,
  h: number,
  kind = "vertical",
  period = 16,
  seed = 7,
) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      let v = 128 + (seed / 4294967296 - 0.5) * 70;
      if (kind === "constant") v = 128;
      if (kind === "vertical" || kind === "both")
        v += 55 * Math.sin((2 * Math.PI * x) / period);
      if (kind === "horizontal" || kind === "both")
        v += 55 * Math.sin((2 * Math.PI * y) / period);
      const i = (y * w + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  return { rgba, width: w, height: h };
}
const run = (
  image: ReturnType<typeof sample>,
  p: Partial<AnalysisParams> = {},
) => analyze({ ...image, params: { ...DEFAULT_ANALYSIS, ...p } });
describe("periodic pipeline acceptance", () => {
  for (const period of [8, 16, 32])
    it(`detects vertical ${period}`, () => {
      const r = run(sample(256, 192, "vertical", period));
      expect(r.stats.strongPeriodicity).toBe(true);
      expect(
        r.candidates.some(
          (c) =>
            c.source === "fft-profile" &&
            c.axis === "x" &&
            Math.abs(c.periodX! - period) < 0.6,
        ),
      ).toBe(true);
    });
  for (const kind of ["horizontal", "both"])
    it(`detects ${kind}`, () => {
      const r = run(sample(256, 192, kind));
      expect(
        r.candidates.some(
          (c) =>
            c.source === "fft-profile" &&
            c.axis === "y" &&
            Math.abs(c.periodY! - 16) < 0.6,
        ),
      ).toBe(true);
    });
  for (const seed of [1, 7, 123, 999])
    it(`does not make noise strong seed ${seed}`, () => {
      const r = run(
        sample(256, 192, "noise", 16, seed),
        preset("conservative"),
      );
      expect(r.stats.strongPeriodicity).toBe(false);
      expect(
        r.candidates.filter(
          (c) => c.source !== "autocorrelation" && c.confidence >= 0.75,
        ),
      ).toHaveLength(0);
    });
  it("constant signal and padding cannot manufacture useful data", () => {
    for (const padding of ["none", "power2", "explicit"] as const) {
      const r = run(sample(97, 81, "constant"), { padding, paddingSize: 256 });
      expect(r.stats.usefulSignal).toBe(false);
      expect(r.candidates).toHaveLength(0);
    }
  });
  it("odd nonpower dimensions retain real frequencies", () => {
    const r = run(sample(255, 191));
    expect(r.width).toBe(255);
    expect(r.height).toBe(191);
    expect(
      r.candidates.some(
        (c) => c.source === "fft-profile" && Math.abs(c.periodX! - 16) < 1,
      ),
    ).toBe(true);
  });
  it("downsampling uses analyzed pixel periods and records scale", () => {
    const r = run(sample(1024, 768, "vertical", 32), { maxDimension: 256 });
    expect(r.processedWidth).toBe(256);
    expect(r.scaleX).toBe(4);
    expect(
      r.candidates.some(
        (c) => c.source === "fft-profile" && Math.abs(c.periodX! - 8) < 0.6,
      ),
    ).toBe(true);
  });
  it("crop can remove a periodic region", () => {
    const image = sample(128, 64);
    for (let y = 0; y < 64; y++)
      for (let x = 64; x < 128; x++) {
        const i = (y * 128 + x) * 4;
        image.rgba[i] = image.rgba[i + 1] = image.rgba[i + 2] = 128;
      }
    const before = run(image);
    const after = run(image, { roi: { x: 64, y: 0, width: 64, height: 64 } });
    expect(before.stats.strongPeriodicity).toBe(true);
    expect(after.stats.usefulSignal).toBe(false);
  });
  it("direct and FFT autocorrelation agree and lags are real pixels", () => {
    const image = sample(32, 24, "vertical", 8);
    const fft = run(image, { window: "none", acMethod: "fft" }),
      direct = run(image, { window: "none", acMethod: "direct" });
    for (let i = 0; i < fft.autocorrelation.length; i++)
      expect(fft.autocorrelation[i]).toBeCloseTo(direct.autocorrelation[i], 9);
    expect(
      fft.candidates.some(
        (c) =>
          c.source === "autocorrelation" && c.lagX === 8 && c.periodX === 8,
      ),
    ).toBe(true);
    expect(() => run(sample(64, 64), { acMethod: "direct" })).toThrow(/32/);
  });
  it("RGB channels and alpha drive separate analyses", () => {
    const image = sample(64, 64, "vertical", 8);
    for (let i = 0; i < image.rgba.length; i += 4) {
      image.rgba[i + 1] = 128;
      image.rgba[i + 2] = 128;
      image.rgba[i + 3] = image.rgba[i];
    }
    expect(run(image, { channel: "g" }).stats.usefulSignal).toBe(false);
    expect(run(image, { channel: "r" }).stats.strongPeriodicity).toBe(true);
    expect(run(image, { channel: "alpha" }).stats.strongPeriodicity).toBe(true);
  });
  it("power2 padding does not elevate conservative noise", () => {
    expect(
      run(sample(93, 71, "noise"), {
        ...preset("conservative"),
        padding: "power2",
      }).stats.strongPeriodicity,
    ).toBe(false);
  });
});
