import { test, expect } from "@playwright/test";
import path from "node:path";
import { DEFAULT_ANALYSIS, DEFAULT_DISPLAY } from "../../src/state";
const fixture = path.resolve("tests/fixtures/rgb.png");
test("delayed demo cannot replace a newer local image", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...rest) {
      (window as any).releaseDemo = () =>
        original.call(this, callback, ...rest);
    };
  });
  await page.getByRole("button", { name: "Run demo" }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean((window as any).releaseDemo)))
    .toBe(true);
  await page.locator("#image-file").setInputFiles(fixture);
  await expect(page.locator("#status")).toContainText("Ready · job");
  await page.evaluate(() => (window as any).releaseDemo());
  await page.waitForTimeout(300);
  await expect(page.locator("#image-meta")).toContainText("rgb.png");
});
test("delayed preset cannot overwrite reset or a newer edit", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (!this.name.endsWith(".json")) return original.call(this);
      return new Promise((resolve) => {
        (window as any).releasePreset = () => original.call(this).then(resolve);
      });
    };
  });
  const params = {
    schema: "periodic-stego-preset/v1",
    analysis: { ...DEFAULT_ANALYSIS, window: "blackman" },
    display: DEFAULT_DISPLAY,
  };
  await page.locator("#preset-file").setInputFiles({
    name: "slow.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(params)),
  });
  await expect
    .poll(() => page.evaluate(() => Boolean((window as any).releasePreset)))
    .toBe(true);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.evaluate(() => (window as any).releasePreset());
  await page.waitForTimeout(200);
  await expect(page.getByLabel("Window function")).toHaveValue("hann");
});
test("decode queue skips superseded full pixel reads", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => {
    const original = window.createImageBitmap.bind(window);
    let first = true;
    (window as any).readbacks = 0;
    const read = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (
      ...args: any[]
    ) {
      (window as any).readbacks++;
      return read.apply(this, args as any);
    };
    window.createImageBitmap = ((...args: any[]) => {
      if (first) {
        first = false;
        return new Promise((resolve) => {
          (window as any).releaseDecode = () =>
            original(...(args as [any])).then(resolve);
        });
      }
      return original(...(args as [any]));
    }) as typeof createImageBitmap;
  });
  await page.locator("#image-file").setInputFiles(fixture);
  await expect
    .poll(() => page.evaluate(() => Boolean((window as any).releaseDecode)))
    .toBe(true);
  for (let i = 0; i < 5; i++)
    await page.locator("#image-file").setInputFiles(fixture);
  await page.evaluate(() => (window as any).releaseDecode());
  await expect(page.locator("#status")).toContainText("Ready · job");
  expect(await page.evaluate(() => (window as any).readbacks)).toBe(1);
});
test("blank-margin click does not create ROI; 100% can scroll to image edges", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .locator("#image-file")
    .setInputFiles(path.resolve("tests/fixtures/large.png"));
  await expect(page.locator("#status")).toContainText("Ready · job");
  const id = await page.locator("#app").getAttribute("data-job-id");
  await page.locator("#main-canvas").click({ position: { x: 2, y: 2 } });
  await page.waitForTimeout(300);
  expect(await page.locator("#app").getAttribute("data-job-id")).toBe(id);
  await page
    .locator("summary")
    .filter({ hasText: "Display only" })
    .evaluate((el) => ((el.parentElement as HTMLDetailsElement).open = true));
  await page.getByLabel("Image scale").selectOption("100%");
  expect(
    await page
      .locator(".canvas-stage")
      .evaluate(
        (el) =>
          el.scrollWidth > el.clientWidth && el.scrollHeight > el.clientHeight,
      ),
  ).toBe(true);
  await page.locator(".canvas-stage").evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    el.scrollTop = el.scrollHeight;
  });
  expect(
    await page
      .locator(".canvas-stage")
      .evaluate((el) => el.scrollLeft > 0 && el.scrollTop > 0),
  ).toBe(true);
});
