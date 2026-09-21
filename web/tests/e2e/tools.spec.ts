import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const native = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGNgZGJmSDU+2QAABHAB6Ki6gBcAAAAASUVORK5CYII=",
  "base64",
);
test("raw PNG tools preserve transparent RGB, export exact bits and invalidate on parameter changes", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#image-file").setInputFiles({
    name: "native.png",
    mimeType: "image/png",
    buffer: native,
  });
  await expect(page.locator("#app")).toHaveAttribute("data-current", "true");
  await page.locator("#tools-button").click();
  await page.locator("#tool-operation").selectOption("bitplane");
  await page.locator("#tool-run").click();
  await expect(page.locator("#tool-canvas")).toBeVisible();
  const values = await page
    .locator("#tool-canvas")
    .evaluate((c: HTMLCanvasElement) =>
      Array.from(c.getContext("2d")!.getImageData(0, 0, 2, 1).data),
    );
  expect(values).toEqual([255, 255, 255, 255, 255, 255, 255, 255]);
  await page.locator("#tool-operation").selectOption("pixel-bits");
  await expect(page.locator("#tool-export")).toBeDisabled();
  await page.locator("#pixel-channels").fill("rgba");
  await page.locator("#tool-run").click();
  await expect(page.locator("#tool-export")).toBeEnabled();
  const dl = page.waitForEvent("download");
  await page.locator("#tool-export").click();
  expect(Array.from(await readFile((await (await dl).path())!))).toEqual([
    0xae,
  ]);
  await page.locator("#pixel-bit").fill("1");
  await expect(page.locator("#tool-export")).toBeDisabled();
  await page.locator("#tool-run").click();
  await expect(page.locator("#tool-export")).toBeEnabled();
  await page.locator("#language").selectOption("zh-CN");
  await expect(page.locator("#tool-operation")).toHaveValue("pixel-bits");
  await expect(page.locator("#tool-status")).toContainText("提取完成");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  await page
    .locator("#image-file")
    .setInputFiles(path.resolve("tests/fixtures/rgb.jpg"));
  await expect(page.locator("#tool-export")).toBeDisabled();
  await expect(page.locator("#tool-preview")).toHaveText("");
  await page.locator("#tool-run").click();
  await expect(page.locator("#tool-status")).toContainText("错误");
  await expect(page.locator("#tool-export")).toBeDisabled();
});

test("a superseded raw decode cannot publish its preview or enable export", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = DecompressionStream;
    (window as any).DecompressionStream = class {
      readable: ReadableStream;
      writable: WritableStream;
      constructor(format: CompressionFormat) {
        const stream = new Native(format);
        this.writable = stream.writable;
        let first = true;
        this.readable = stream.readable.pipeThrough(
          new TransformStream({
            async transform(chunk, controller) {
              if (first) {
                first = false;
                await new Promise<void>((resolve) => {
                  (window as any).releaseRaw = resolve;
                });
              }
              controller.enqueue(chunk);
            },
          }),
        );
      }
    };
  });
  await page.goto("./");
  await page
    .locator("#image-file")
    .setInputFiles({ name: "old.png", mimeType: "image/png", buffer: native });
  await expect(page.locator("#app")).toHaveAttribute("data-current", "true");
  await page.locator("#tools-button").click();
  await page.locator("#tool-operation").selectOption("bitplane");
  await page.locator("#tool-run").click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).releaseRaw))
    .toBe("function");
  await page
    .locator("#image-file")
    .setInputFiles(path.resolve("tests/fixtures/rgb.jpg"));
  await expect(page.locator("#app")).toHaveAttribute("data-image", "rgb.jpg");
  await page.evaluate(() => (window as any).releaseRaw());
  await expect(page.locator("#app")).toHaveAttribute("data-current", "true");
  await expect(page.locator("#tool-canvas")).toBeHidden();
  await expect(page.locator("#tool-export")).toBeDisabled();
  await expect(page.locator("#tool-status")).toHaveText("Ready to extract.");
});

test("toolbox contains no challenge catalog or answer presets", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#tools-button").click();
  await expect(page.locator("#tools-panel")).toBeVisible();
  await expect(page.locator("#tool-run")).toBeDisabled();
  expect(
    await page
      .locator("[data-challenge], #challenge-panel, #challenges-button")
      .count(),
  ).toBe(0);
  expect(await page.locator("#tools-panel").textContent()).not.toMatch(
    /HackThisSite|hts-steg|Writeup status|verified/i,
  );
  await page.locator("#tools-close").click();
  await expect(page.locator("#tools-panel")).toBeHidden();
  await expect(page.locator("#tools-button")).toBeFocused();
});
