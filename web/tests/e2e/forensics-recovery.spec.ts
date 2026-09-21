import { test, expect } from "@playwright/test";
import path from "node:path";

const fixture = path.resolve("tests/fixtures/rgb.jpg");

test("forensic failure is recoverable without discarding a successful FFT result", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (type === "image/jpeg") {
        HTMLCanvasElement.prototype.toBlob = original;
        callback(null);
      } else original.call(this, callback, type, quality);
    };
  });
  await page.locator("#image-file").setInputFiles(fixture);
  await expect(page.locator("#forensic-status")).toHaveAttribute(
    "data-state",
    "error",
  );
  await expect(page.locator("#forensic-status")).toContainText(
    "JPEG re-encoding failed.",
  );
  await expect(page.locator("#app")).toHaveAttribute("data-current", "true");
  await expect(page.locator("#app")).toHaveAttribute("data-busy", "false");
  const job = await page.locator("#app").getAttribute("data-job-id");
  await page.locator("#forensic-retry").click();
  await expect(page.locator("#forensic-status")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(page.locator("#forensic-export")).toBeEnabled();
  await expect(page.locator("#forensic-retry")).toBeHidden();
  await expect(page.locator("#app")).toHaveAttribute("data-job-id", job!);
});

test("a delayed forensic codec cannot overwrite the replacement image", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (type === "image/jpeg") {
        HTMLCanvasElement.prototype.toBlob = original;
        (window as any).releaseForensic = () =>
          original.call(this, callback, type, quality);
      } else original.call(this, callback, type, quality);
    };
  });
  await page.locator("#image-file").setInputFiles(fixture);
  await page.waitForFunction(
    () => typeof (window as any).releaseForensic === "function",
  );
  await page
    .locator("#image-file")
    .setInputFiles(path.resolve("tests/fixtures/odd.png"));
  await expect(page.locator("#forensic-status")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await page.locator("#forensic-tool").selectOption("metadata");
  const before = await page.locator("#forensic-meta").textContent();
  expect(JSON.parse(before!).format).toBe("image/png");
  await page.evaluate(async () => {
    (window as any).releaseForensic();
    // Wait for the pending codec to finish by tracking bitmap creation.
    const original = window.createImageBitmap.bind(window);
    await new Promise<void>((resolve) => {
      window.createImageBitmap = (async (
        ...args: Parameters<typeof createImageBitmap>
      ) => {
        const bitmap = await original(...args);
        window.createImageBitmap = original;
        setTimeout(resolve, 0);
        return bitmap;
      }) as typeof createImageBitmap;
    });
  });
  await expect(page.locator("#forensic-meta")).toHaveText(before!);
  await expect(page.locator("#forensic-status")).toHaveAttribute(
    "data-state",
    "ready",
  );
});
