import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomDotInput } from "../stereogram-fixture";

async function loadDots(page: Page, depth = 20) {
  const input = randomDotInput(960, 240, 120, depth);
  await page.locator("#image-file").evaluate(
    async (element, input) => {
      const canvas = document.createElement("canvas");
      canvas.width = input.width;
      canvas.height = input.height;
      canvas
        .getContext("2d")!
        .putImageData(
          new ImageData(
            new Uint8ClampedArray(input.rgba),
            input.width,
            input.height,
          ),
          0,
          0,
        );
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((blob) => resolve(blob!)),
      );
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "random-dot.png", { type: "image/png" }));
      (element as HTMLInputElement).files = dt.files;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { width: input.width, height: input.height, rgba: Array.from(input.rgba) },
  );
  await expect(page.locator("#app")).toHaveAttribute("data-current", "true");
}
async function report(page: Page) {
  await page.locator("#export-select").selectOption("report");
  const pending = page.waitForEvent("download");
  await page.locator("#export-button").click();
  return JSON.parse(await readFile((await (await pending).path())!, "utf8"));
}

test("random-dot period, disparity export, locale persistence and replacement cleanup", async ({
  page,
}) => {
  const errors: string[] = [],
    uploads: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method()))
      uploads.push(request.url());
  });
  await page.goto("./");
  await expect(page.locator('[data-view="stereogram"]')).toBeDisabled();
  await loadDots(page);
  await expect(page.locator("#app")).toHaveAttribute("data-strong", "true");
  await expect(page.locator(".stereo-candidate")).toContainText(
    "120 original px",
  );
  const first = await report(page);
  expect(first.stereogram.period).toBe(120);
  expect(first.stereogram.disparity).not.toHaveProperty("pixels");
  await expect(page.locator("#candidate-count")).toHaveText(
    String(first.candidates.length + 1),
  );
  const job = await page.locator("#app").getAttribute("data-job-id");
  await page.locator('[data-view="stereogram"]').click();
  await expect(page.locator("#main-canvas")).toBeVisible();
  const before = await page
    .locator("#main-canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.locator("#language").selectOption("zh-CN");
  await expect(page.locator(".stereo-candidate")).toContainText("120 原图像素");
  await expect(page.locator("#units")).toContainText("蓝色为未匹配");
  await expect(page.locator('[data-view="stereogram"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await page.locator("#app").getAttribute("data-job-id")).toBe(job);
  expect((await report(page)).stereogram).toEqual(first.stereogram);
  await page.locator("#export-select").selectOption("stereogram");
  const pending = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const bytes = await readFile((await (await pending).path())!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.length).toBeGreaterThan(1000);
  expect(before.length).toBeGreaterThan(1000);
  await page
    .locator("#image-file")
    .setInputFiles(path.resolve("tests/fixtures/noise.png"));
  await expect(page.locator("#app")).toHaveAttribute("data-current", "true");
  await expect(page.locator(".stereo-candidate")).toHaveCount(0);
  await expect(page.locator('[data-view="stereogram"]')).toBeDisabled();
  await expect(page.locator('[data-view="original"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#export-select")).toHaveValue("report");
  expect(errors).toEqual([]);
  expect(uploads).toEqual([]);
});

test("disparity view fits a Chinese mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.locator("#language").selectOption("zh-CN");
  await loadDots(page);
  await page.locator('[data-view="stereogram"]').click();
  await expect(page.locator("#main-canvas")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("negative disparity survives Canvas rendering and PNG export", async ({
  page,
}) => {
  await page.goto("./");
  await loadDots(page, -4);
  const first = await report(page);
  const { width, height, scaleX, scaleY } = first.stereogram.disparity;
  await page.locator('[data-view="stereogram"]').click();
  // Test the raster, not grid overlays or interpolated edge colors.
  await page.getByText("Display only", { exact: true }).click();
  await page.locator('[name="grid"]').uncheck();
  await page.locator('[name="interpolation"]').selectOption("nearest");
  const colors = await page.locator("#main-canvas").evaluate(
    (canvas: HTMLCanvasElement, { width, height, scaleX, scaleY }) => {
      const cw = parseFloat(canvas.style.width),
        ch = parseFloat(canvas.style.height);
      const scale = Math.min((cw - 64) / width, (ch - 54) / height);
      const left = (cw - width * scale) / 2,
        top = (ch - height * scale) / 2;
      const sample = (x: number, y: number) => [
        ...canvas
          .getContext("2d")!
          .getImageData(
            Math.floor(
              (left + (Math.floor(x / scaleX) + 0.5) * scale) *
                devicePixelRatio,
            ),
            Math.floor(
              (top + (Math.floor(y / scaleY) + 0.5) * scale) * devicePixelRatio,
            ),
            1,
            1,
          ).data,
      ];
      return { foreground: sample(521, 119), background: sample(251, 119) };
    },
    { width, height, scaleX, scaleY },
  );
  expect(colors.foreground[0]).toBeLessThan(colors.background[0]);
  expect(colors.foreground[0]).toBe(colors.foreground[2]);
  expect(colors.background[0]).toBe(colors.background[2]);
  await page.locator("#export-select").selectOption("stereogram");
  const pending = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const bytes = await readFile((await (await pending).path())!);
  // Exports intentionally rerender at a fixed width, not the viewport width.
  const exported = await page.evaluate(
    async ({ png, width, height, scaleX, scaleY }) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${png}`)).blob(),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const cw = canvas.width / devicePixelRatio,
        ch = canvas.height / devicePixelRatio;
      const scale = Math.min((cw - 64) / width, (ch - 54) / height);
      const sample = (x: number, y: number) => [
        ...ctx.getImageData(
          Math.floor(
            ((cw - width * scale) / 2 +
              (Math.floor(x / scaleX) + 0.5) * scale) *
              devicePixelRatio,
          ),
          Math.floor(
            ((ch - height * scale) / 2 +
              (Math.floor(y / scaleY) + 0.5) * scale) *
              devicePixelRatio,
          ),
          1,
          1,
        ).data,
      ];
      return { foreground: sample(521, 119), background: sample(251, 119) };
    },
    { png: bytes.toString("base64"), width, height, scaleX, scaleY },
  );
  expect(exported).toEqual(colors);
});
