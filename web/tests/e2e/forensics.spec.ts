import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const fixture = path.resolve("tests/fixtures/rgb.jpg");
async function ready(page: Page) {
  await expect(page.locator("#app")).toHaveAttribute("data-current", "true");
  await expect(page.locator("#forensic-status")).toHaveAttribute(
    "data-state",
    "ready",
  );
}

test("empty-state sample starts both analyses and forensic results can be reopened", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#empty-sample").click();
  await ready(page);
  await expect(page.locator("#forensic-panel")).toBeVisible();
  await page.locator("#forensic-close").click();
  await expect(page.locator("#forensic-panel")).toBeHidden();
  await page.locator("#forensic-toggle").click();
  await expect(page.locator("#forensic-panel")).toBeVisible();
  await page.locator("#forensic-tool").selectOption("metadata");
  await expect(page.locator("#forensic-export")).toBeDisabled();
  await page.locator("#forensic-tool").selectOption("ela-90");
  const pixels = await page
    .locator("#forensic-canvas")
    .evaluate((c: HTMLCanvasElement) => {
      const data = c
        .getContext("2d")!
        .getImageData(0, 0, c.width, c.height).data;
      return {
        opaque: data.some((v, i) => i % 4 === 3 && v === 255),
        signal: data.some((v, i) => i % 4 === 0 && v > 0),
      };
    });
  expect(pixels).toEqual({ opaque: true, signal: true });
  const download = page.waitForEvent("download");
  await page.locator("#forensic-export").click();
  expect((await download).suggestedFilename()).toBe(
    "periodic-stego-ela-90.png",
  );
});

test("empty-state picker loads a file and bilingual forensic UI preserves selection", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#empty input[type=file]").setInputFiles(fixture);
  await ready(page);
  await page.locator("#forensic-tool").selectOption("noise");
  await page.locator("#language").selectOption("zh-CN");
  await expect(page.locator("#forensic-tool")).toHaveValue("noise");
  await expect(page.locator("#forensic-status")).toContainText("取证");
  await expect(page.locator("#forensic-warnings")).toContainText("筛查");
  await expect(page.locator(".command-actions")).toContainText("示例");
  await expect(page.locator("#forensic-meta")).toContainText("筛查");
});

test("forensic completion cannot clear a pending FFT job", async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      postMessage(message: unknown, transfer: Transferable[] = []) {
        (window as unknown as { releaseFFT: () => void }).releaseFFT = () =>
          super.postMessage(message, transfer);
      }
    } as typeof Worker;
  });
  await page.goto("./");
  await page.locator("#image-file").setInputFiles(fixture);
  await expect(page.locator("#forensic-status")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(page.locator("#app")).toHaveAttribute("data-busy", "true");
  await expect(page.locator("#export-button")).toBeDisabled();
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { releaseFFT?: () => void }).releaseFFT ===
      "function",
  );
  await page.evaluate(() =>
    (window as unknown as { releaseFFT: () => void }).releaseFFT(),
  );
  await ready(page);
  await expect(page.locator("#app")).toHaveAttribute("data-busy", "false");
});

test("replacement invalidates forensic exports before decoding completes", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#image-file").setInputFiles(fixture);
  await ready(page);
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      return new Promise<ArrayBuffer>((resolve) => {
        (window as unknown as { releaseImage: () => void }).releaseImage = () =>
          void original.call(this).then(resolve);
      });
    };
  });
  await page
    .locator("#image-file")
    .setInputFiles(path.resolve("tests/fixtures/noise.png"));
  await expect(page.locator("#forensic-export")).toBeDisabled();
  await expect(page.locator("#forensic-canvas")).toBeHidden();
  await page.evaluate(() =>
    (window as unknown as { releaseImage: () => void }).releaseImage(),
  );
  await ready(page);
});

test("tabs use keyboard navigation; forensic controls fit a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.locator("#image-file").setInputFiles(fixture);
  await ready(page);
  await page.locator('[data-view="original"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-view="preprocessed"]')).toBeFocused();
  await expect(page.locator('[data-view="preprocessed"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
