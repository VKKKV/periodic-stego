import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  resolveLocale,
  setLocale,
  t,
  getLocale,
  initLocale,
  LOCALE_KEY,
} from "../src/i18n";
import { zh } from "../src/i18n/catalog";
import { messages } from "../src/i18n/messages";
function browser(
  language = "en-US",
  storage: unknown = { getItem: () => null, setItem: () => {} },
) {
  vi.stubGlobal("document", { documentElement: { lang: "en" } });
  vi.stubGlobal("navigator", { language });
  vi.stubGlobal("localStorage", storage);
}
afterEach(() => {
  browser();
  setLocale("en");
  vi.unstubAllGlobals();
});
it("valid preference wins; Chinese browser locales choose Simplified Chinese", () => {
  expect(resolveLocale("en", "zh-CN")).toBe("en");
  expect(resolveLocale("zh-CN", "en-US")).toBe("zh-CN");
  for (const locale of ["zh", "zh-TW", "zh-Hant-HK", "ZH-cn"])
    expect(resolveLocale("invalid", locale)).toBe("zh-CN");
  expect(resolveLocale(null, "fr-FR")).toBe("en");
  expect(resolveLocale(null, "zho")).toBe("en");
});
it("optional storage handles blocked reads/writes and rejects invalid preference", () => {
  browser("zh-CN", {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  });
  expect(initLocale()).toBe("zh-CN");
  expect(() => setLocale("en")).not.toThrow();
  setLocale("fr");
  expect(getLocale()).toBe("en");
  const storage = { getItem: vi.fn(() => "en"), setItem: vi.fn() };
  browser("zh-CN", storage);
  initLocale();
  setLocale("zh-CN");
  expect(storage.setItem).toHaveBeenCalledWith(LOCALE_KEY, "zh-CN");
});
it("canonical messages have reversible nonempty translations", () => {
  browser();
  for (const [en, cn] of Object.entries({ ...zh, ...messages })) {
    setLocale("zh-CN");
    expect(t(en)).toBe(cn);
    expect(cn.trim()).not.toBe("");
    setLocale("en");
    expect(t(en)).toBe(en);
  }
});
it("dynamic warnings, errors, statuses and readouts preserve values", () => {
  browser();
  setLocale("zh-CN");
  expect(t("Updating · job 12 · Peak detection · 80%")).toBe(
    "更新中 · 任务 12 · 峰值检测 · 80%",
  );
  expect(t("Error · The image file is empty.")).toBe("错误 · 图像文件为空。");
  expect(t("Invalid maxDimension: expected 8–1024.")).toContain("8–1024");
  expect(t("No fft diagnostic is available.")).toContain("FFT");
  expect(t("Outside image")).toBe("图像范围外");
  expect(t("x 12 · y 8 original px")).toBe("x 12 · y 8 原图像素");
  expect(
    t(
      "Downsampled 1024 × 768 ROI to 512 × 384. Periods use analyzed pixels; multiply by scale X 2.0000 / Y 2.0000 for original pixels. Anti-alias averaging can weaken high-frequency structure.",
    ),
  ).toContain("乘以 X 比例 2.0000 / Y 比例 2.0000");
});
it("all literal errors and warnings on reachable input/pipeline paths have translations", () => {
  browser();
  setLocale("zh-CN");
  for (const name of [
    "image.ts",
    "jobs.ts",
    "state.ts",
    "export.ts",
    "main.ts",
    "core/preprocess.ts",
    "core/pipeline.ts",
    "core/peaks.ts",
  ]) {
    const source = readFileSync(
      new URL(`../src/${name}`, import.meta.url),
      "utf8",
    );
    for (const match of source.matchAll(/"([^"\n]{15,}[.!])"/g))
      expect(t(match[1]), `${name}: ${match[1]}`).not.toBe(match[1]);
  }
});
