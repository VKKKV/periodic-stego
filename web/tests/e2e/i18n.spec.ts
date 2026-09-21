import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_ANALYSIS, DEFAULT_DISPLAY } from "../../src/state";
const fixture = path.resolve("tests/fixtures/rgb.png");
async function ready(page: Page) {
  await expect(page.locator("#app")).toHaveAttribute("data-current", "true");
  await expect(page.locator("#app")).toHaveAttribute("data-busy", "false");
}
async function report(page: Page) {
  await page.locator("#export-select").selectOption("report");
  const pending = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}
test("locale switching preserves source, ROI, controls, jobs and canonical reports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.locator("#image-file").setInputFiles(fixture);
  await ready(page);
  await page.locator("#preset-file").setInputFiles({
    name: "roi.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schema: "periodic-stego-preset/v1",
        analysis: {
          ...DEFAULT_ANALYSIS,
          roi: { x: 0, y: 0, width: 128, height: 128 },
        },
        display: { ...DEFAULT_DISPLAY, gamma: 1.75, frequencyZoom: 1.5 },
      }),
    ),
  });
  await expect(page.locator("#stats")).toContainText("128 × 128");
  await ready(page);
  await page.locator('[data-view="fft"]').click();
  await page
    .locator("#parameters details")
    .evaluateAll((els) =>
      els.forEach((e) => ((e as HTMLDetailsElement).open = true)),
    );
  await page
    .locator("#candidates details")
    .first()
    .evaluate((el: HTMLDetailsElement) => {
      el.open = true;
    });
  const before = await report(page);
  const job = await page.locator("#app").getAttribute("data-job-id");
  const png = await page
    .locator("#profile-canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.locator("#language").selectOption("zh-CN");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByLabel("通道", { exact: true })).toHaveValue(
    "luminance",
  );
  await expect(page.locator("#status")).toContainText("就绪 · 任务");
  await expect(page.locator("#warnings")).toContainText("循环自相关");
  await expect(page.locator("#verdict")).toContainText("重复结构");
  await expect(page.locator("#candidates")).toContainText("信号分数");
  await expect(page.locator("#candidates details").first()).toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator('[name="gamma"]')).toHaveValue("1.75");
  await expect(page.locator('[name="frequencyZoom"]')).toHaveValue("1.5");
  await expect(page.locator('[data-view="fft"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await page.locator("#parameters details:not([open])").count()).toBe(0);
  expect(
    await page
      .locator("#profile-canvas")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).not.toBe(png);
  const after = await report(page);
  delete before.timestamp;
  delete after.timestamp;
  expect(after).toEqual(before);
  await expect(page.locator("#app")).toHaveAttribute("data-job-id", job!);
  await page.locator("#language").selectOption("en");
  await expect(page.getByLabel("Channel", { exact: true })).toBeVisible();
  await expect(page.locator("#status")).toContainText("Ready · job");
  await expect(page.locator("#app")).toHaveAttribute("data-job-id", job!);
  await expect(page.locator("#candidates details").first()).toHaveAttribute(
    "open",
    "",
  );
  expect(errors).toEqual([]);
});
test("Chinese preference survives reload and errors relocalize without translating filenames", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#language").selectOption("zh-CN");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.locator("#image-file").setInputFiles({
    name: "empty.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(0),
  });
  await expect(page.locator("#error")).toHaveText("图像文件为空。");
  await page.locator("#language").selectOption("en");
  await expect(page.locator("#error")).toHaveText("The image file is empty.");
  await page.locator("#image-file").setInputFiles({
    name: "<img src=x onerror=alert(1)>Original.png",
    mimeType: "image/png",
    buffer: await readFile(fixture),
  });
  await ready(page);
  await page.locator("#language").selectOption("zh-CN");
  await expect(page.locator("#image-meta")).toContainText(
    "<img src=x onerror=alert(1)>Original.png",
  );
  expect(await page.locator("#image-meta img").count()).toBe(0);
  await page.locator("#preset-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{bad"),
  });
  await expect(page.locator("#error")).toHaveText("预设不是有效的 JSON。");
});
test("locale switches and preset errors preserve an in-flight Worker", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#image-file").setInputFiles(fixture);
  await ready(page);
  await page.evaluate(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      ...args: Parameters<Worker["postMessage"]>
    ) {
      (window as unknown as { releaseLocaleJob: () => void }).releaseLocaleJob =
        () => send.apply(this, args);
    };
  });
  await page.locator('[name="window"]').selectOption("blackman");
  await expect(page.locator("#status")).toContainText("preparing analysis");
  const pending = await page.locator("#status").textContent();
  await page.locator("#language").selectOption("zh-CN");
  await expect(page.locator("#status")).toContainText("准备分析");
  await expect(page.locator("#app")).toHaveAttribute("data-busy", "true");
  await page.locator("#preset-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{bad"),
  });
  await expect(page.locator("#error")).toHaveText("预设不是有效的 JSON。");
  await expect(page.locator("#app")).toHaveAttribute("data-busy", "true");
  await page.locator("#language").selectOption("en");
  await expect(page.locator("#status")).toHaveText(pending!);
  await expect(page.locator("#error")).toHaveText("Invalid preset JSON.");
  await page.locator("#language").selectOption("zh-CN");
  await page.evaluate(() =>
    (window as unknown as { releaseLocaleJob: () => void }).releaseLocaleJob(),
  );
  await ready(page);
  await expect(page.locator("#status")).toContainText("就绪 · 任务");
  await expect(page.locator("#app")).toHaveAttribute(
    "data-result-window",
    "blackman",
  );
  await expect(page.locator("#error")).toBeHidden();
});
test("Chinese browser default works with blocked storage and narrow layout", async ({
  browser,
}) => {
  const context = await browser.newContext({
    locale: "zh-CN",
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  await page.goto(test.info().project.use.baseURL!);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.getByRole("button", { name: "试用示例", exact: true }).click();
  await ready(page);
  await page.getByRole("button", { name: "参数", exact: true }).click();
  await expect(page.locator("#parameters")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#parameters")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("workstation-zh-mobile.png"),
    fullPage: true,
  });
  await page.locator("#language").selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#status")).toContainText("Ready · job");
  await context.close();
});
