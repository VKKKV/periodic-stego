import { it, expect } from "vitest";
import {
  DEFAULT_ANALYSIS,
  DEFAULT_DISPLAY,
  parsePreset,
  preset,
  validateAnalysis,
  validateDisplay,
} from "../src/state";
it("roundtrips a complete preset and rejects unsafe imported values", () => {
  const value = {
    schema: "periodic-stego-preset/v1",
    analysis: DEFAULT_ANALYSIS,
    display: DEFAULT_DISPLAY,
  };
  expect(parsePreset(JSON.stringify(value))).toEqual({
    analysis: DEFAULT_ANALYSIS,
    display: DEFAULT_DISPLAY,
  });
  expect(() => parsePreset("{}")).toThrow();
  expect(() =>
    validateAnalysis({ ...DEFAULT_ANALYSIS, maxDimension: 100000 }),
  ).toThrow();
  expect(() =>
    validateAnalysis({
      ...DEFAULT_ANALYSIS,
      roi: { x: -1, y: 0, width: 8, height: 8 },
    }),
  ).toThrow();
  expect(() => validateDisplay({ ...DEFAULT_DISPLAY, gamma: NaN })).toThrow();
  expect(preset("conservative").relativeThreshold).toBe(20);
});
