import { test, expect } from "@playwright/test";
import path from "node:path";

import { DEFAULT_ANALYSIS, DEFAULT_DISPLAY } from "../../src/state";
const fixture = path.resolve("tests/fixtures/rgb.png");
test.use({ locale: "en-US" });

test("original-image margin readout does not report nonexistent pixels", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#image-file").setInputFiles(fixture);
  await expect(page.locator("#status")).toContainText("Ready · job");
  await page.locator("#main-canvas").hover({ position: { x: 1, y: 1 } });
  await expect(page.locator("#cursor")).toHaveText("Outside image");
});

test("premature export cannot mark a running analysis idle", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#image-file").setInputFiles(fixture);
  await expect(page.locator("#status")).toContainText("Ready · job");
  const before = await page.locator("#app").getAttribute("data-job-id");
  await page.evaluate(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      ...args: Parameters<Worker["postMessage"]>
    ) {
      (window as unknown as { releaseReviewJob: () => void }).releaseReviewJob =
        () => original.apply(this, args);
    };
  });
  await page.locator('[name="window"]').selectOption("blackman");
  await expect(page.locator("#status")).toContainText("preparing analysis");
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  const button = page.locator("#export-button");
  if (await button.isEnabled()) await button.click();
  await expect(page.locator("#app")).toHaveAttribute("data-busy", "true");
  expect(downloads).toEqual([]);
  await page.evaluate(() =>
    (window as unknown as { releaseReviewJob: () => void }).releaseReviewJob(),
  );
  await expect(page.locator("#app")).not.toHaveAttribute(
    "data-job-id",
    before!,
  );
  await expect(page.locator("#status")).toContainText("Ready · job");
  await expect(page.locator("#app")).toHaveAttribute("data-busy", "false");
});

test("clearing a numeric field is invalid rather than silently becoming zero", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#image-file").setInputFiles(fixture);
  await expect(page.locator("#status")).toContainText("Ready · job");
  await page.locator('[name="dcRadius"]').evaluate((el: HTMLInputElement) => {
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#error")).toContainText("Invalid dcRadius");
  await expect(page.locator("#export-button")).toBeDisabled();
  await expect(page.locator("#result-note")).toBeVisible();
});

test("replacement failure cannot show previous-image findings", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#image-file").setInputFiles(fixture);
  await expect(page.locator("#status")).toContainText("Ready · job");
  await page.locator("#preset-file").setInputFiles({
    name: "direct.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schema: "periodic-stego-preset/v1",
        analysis: {
          ...DEFAULT_ANALYSIS,
          roi: { x: 0, y: 0, width: 32, height: 32 },
          window: "none",
          acMethod: "direct",
        },
        display: DEFAULT_DISPLAY,
      }),
    ),
  });
  await expect(page.locator("#stats")).toContainText("32 × 32");
  await page
    .locator("#image-file")
    .setInputFiles(path.resolve("tests/fixtures/odd.png"));
  await expect(page.locator("#error")).toContainText(
    "Direct autocorrelation is limited",
  );
  await expect(page.locator("#stats")).toHaveText("");
  await expect(page.locator("#candidates")).toHaveText("");
  await expect(page.locator("#profile-canvas")).toBeHidden();
  await expect(page.locator("#export-button")).toBeDisabled();
});

test("restoring during first decode releases the loading state", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(() => {
    const original = window.createImageBitmap;
    window.createImageBitmap = ((...args: Parameters<typeof original>) =>
      new Promise((resolve) => {
        (window as any).releaseDecode = () => original(...args).then(resolve);
      })) as typeof original;
  });
  await page.locator("#image-file").setInputFiles(fixture);
  await expect
    .poll(() => page.evaluate(() => Boolean((window as any).releaseDecode)))
    .toBe(true);
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    (window as any).releaseDecode();
  });
  await expect(page.locator("#app")).toHaveAttribute("data-busy", "false");
  await expect(page.locator("#status")).toContainText(
    "Ready for a local image",
  );
});

test("finishing an older demo does not cancel a newer preset import", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(() => {
    const blob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...rest) {
      (window as any).releaseDemo = () => blob.call(this, callback, ...rest);
    };
    const text = File.prototype.text;
    File.prototype.text = function () {
      return new Promise((resolve) => {
        (window as any).releasePreset = () => text.call(this).then(resolve);
      });
    };
  });
  await page.locator("#demo-button").click();
  await expect
    .poll(() => page.evaluate(() => Boolean((window as any).releaseDemo)))
    .toBe(true);
  await page.locator("#preset-file").setInputFiles({
    name: "new.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schema: "periodic-stego-preset/v1",
        analysis: { ...DEFAULT_ANALYSIS, window: "blackman" },
        display: DEFAULT_DISPLAY,
      }),
    ),
  });
  await expect
    .poll(() => page.evaluate(() => Boolean((window as any).releasePreset)))
    .toBe(true);
  await page.evaluate(() => (window as any).releaseDemo());
  await expect(page.locator("#status")).toContainText("Ready · job");
  await page.evaluate(() => (window as any).releasePreset());
  await expect(page.locator('[name="window"]')).toHaveValue("blackman");
  await expect(page.locator("#app")).toHaveAttribute(
    "data-result-window",
    "blackman",
  );
});
