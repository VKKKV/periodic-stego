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
  const legacyAnalysis = { ...DEFAULT_ANALYSIS } as Record<string, unknown>;
  for (const key of [
    "stereogramMinPeriodPx",
    "stereogramMaxPeriodPx",
    "stereogramMinSeparationRatio",
    "stereogramMaxSeparationRatio",
  ])
    delete legacyAnalysis[key];
  expect(
    parsePreset(JSON.stringify({ ...value, analysis: legacyAnalysis }))
      .analysis,
  ).toEqual(DEFAULT_ANALYSIS);
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

it("strictly validates stereogram period and local separation ranges", () => {
  expect(DEFAULT_ANALYSIS).toMatchObject({
    stereogramMinPeriodPx: 8,
    stereogramMaxPeriodPx: 0,
    stereogramMinSeparationRatio: 0.55,
    stereogramMaxSeparationRatio: 1.05,
  });
  expect(() =>
    validateAnalysis({ ...DEFAULT_ANALYSIS, stereogramMinPeriodPx: 8.5 }),
  ).toThrow(/stereogramMinPeriodPx/);
  expect(() =>
    validateAnalysis({ ...DEFAULT_ANALYSIS, stereogramMaxPeriodPx: -1 }),
  ).toThrow(/stereogramMaxPeriodPx/);
  expect(() =>
    validateAnalysis({
      ...DEFAULT_ANALYSIS,
      stereogramMinPeriodPx: 100,
      stereogramMaxPeriodPx: 99,
    }),
  ).toThrow(/period range/);
  expect(() =>
    validateAnalysis({
      ...DEFAULT_ANALYSIS,
      stereogramMinSeparationRatio: 1.1,
      stereogramMaxSeparationRatio: 1.05,
    }),
  ).toThrow(/separation range/);
  expect(() =>
    validateAnalysis({
      ...DEFAULT_ANALYSIS,
      stereogramMinSeparationRatio: NaN,
    }),
  ).toThrow(/stereogramMinSeparationRatio/);
});
