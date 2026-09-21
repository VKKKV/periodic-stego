import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixture = path.resolve("tests/fixtures/rgb.jpg");
function withThumbnail(main: Buffer, thumbnail: Buffer, little = true) {
  const tiff = Buffer.alloc(56);
  const u16 = (p: number, v: number) =>
    little ? tiff.writeUInt16LE(v, p) : tiff.writeUInt16BE(v, p);
  const u32 = (p: number, v: number) =>
    little ? tiff.writeUInt32LE(v, p) : tiff.writeUInt32BE(v, p);
  tiff.write(little ? "II" : "MM");
  u16(2, 42);
  u32(4, 8);
  u16(8, 0);
  u32(10, 14);
  u16(14, 3);
  u16(16, 0x0103);
  u16(18, 3);
  u32(20, 1);
  u16(24, 6);
  u16(28, 0x0201);
  u16(30, 4);
  u32(32, 1);
  u32(36, 56);
  u16(40, 0x0202);
  u16(42, 4);
  u32(44, 1);
  u32(48, thumbnail.length);
  u32(52, 0);
  const app = Buffer.concat([Buffer.from("Exif\0\0"), tiff, thumbnail]);
  const marker = Buffer.alloc(4);
  marker[0] = 255;
  marker[1] = 225;
  marker.writeUInt16BE(app.length + 2, 2);
  return Buffer.concat([main.subarray(0, 2), marker, app, main.subarray(2)]);
}

test("true PCA components expose loadings and preserve selection across locale/export", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#image-file").setInputFiles(fixture);
  await expect(page.locator("#forensic-status")).toHaveAttribute(
    "data-state",
    "ready",
  );
  for (const tool of ["pca", "pca-2", "pca-3"]) {
    await page.locator("#forensic-tool").selectOption(tool);
    await expect(page.locator("#forensic-meta")).toContainText(
      '"eigenvectors"',
    );
    await expect(page.locator("#forensic-meta")).toContainText(
      '"explainedVariance"',
    );
    await expect(page.locator("#forensic-canvas")).toBeVisible();
    const dl = page.waitForEvent("download");
    await page.locator("#forensic-export").click();
    expect((await dl).suggestedFilename()).toBe(`periodic-stego-${tool}.png`);
  }
  await page.locator("#language").selectOption("zh-CN");
  await expect(page.locator("#forensic-tool")).toHaveValue("pca-3");
  await expect(page.locator("#forensic-meta")).toContainText("中心化 RGB PCA");
});

for (const little of [true, false])
  test(`EXIF thumbnail exact-byte export (${little ? "LE" : "BE"}) and absence cleanup`, async ({
    page,
  }) => {
    const main = await readFile(fixture);
    await page.goto("./");
    const thumb = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 6;
      c.getContext("2d")!.fillRect(0, 0, 8, 6);
      return Array.from(
        new Uint8Array(
          await (
            await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg"))
          ).arrayBuffer(),
        ),
      );
    });
    const bytes = Buffer.from(thumb);
    await page.locator("#image-file").setInputFiles({
      name: "with-exif.jpg",
      mimeType: "image/jpeg",
      buffer: withThumbnail(main, bytes, little),
    });
    await expect(page.locator("#forensic-status")).toHaveAttribute(
      "data-state",
      "ready",
    );
    await page.locator("#forensic-tool").selectOption("exif-thumbnail");
    await expect(page.locator("#forensic-canvas")).toHaveAttribute(
      "width",
      "8",
    );
    await expect(page.locator("#forensic-canvas")).toHaveAttribute(
      "height",
      "6",
    );
    const dl = page.waitForEvent("download");
    await page.locator("#forensic-export").click();
    const download = await dl;
    expect(download.suggestedFilename()).toBe(
      "periodic-stego-exif-thumbnail.jpg",
    );
    expect((await readFile((await download.path())!)).equals(bytes)).toBe(true);
    await page.locator("#image-file").setInputFiles(fixture);
    await expect(page.locator("#forensic-status")).toHaveAttribute(
      "data-state",
      "ready",
    );
    await expect(page.locator("#forensic-canvas")).toBeHidden();
    await expect(page.locator("#forensic-export")).toBeDisabled();
    await expect(page.locator("#forensic-meta")).toContainText(
      "No supported EXIF JPEG thumbnail",
    );
  });

test("PNG extraction tool decodes original trailing bytes and clears output on replacement", async ({
  page,
}) => {
  const png = await readFile(path.resolve("tests/fixtures/rgb.png"));
  const payload = Buffer.from("synthetic local payload\n");
  await page.goto("./");
  await page.locator("#image-file").setInputFiles({
    name: "payload.png",
    mimeType: "image/png",
    buffer: Buffer.concat([png, Buffer.from(payload.toString("base64"))]),
  });
  await expect(page.locator("#app")).toHaveAttribute("data-current", "true");
  await page.locator("#tools-button").click();
  await page.locator("#byte-encoding").selectOption("base64");
  await page.locator("#tool-run").click();
  await expect(page.locator("#tool-preview")).toContainText(
    "synthetic local payload",
  );
  const dl = page.waitForEvent("download");
  await page.locator("#tool-export").click();
  expect((await readFile((await (await dl).path())!)).equals(payload)).toBe(
    true,
  );
  await page.locator("#language").selectOption("zh-CN");
  await expect(page.locator("#tool-run")).toHaveText("运行工具");
  await page.locator("#image-file").setInputFiles(fixture);
  await expect(page.locator("#tool-preview")).toHaveText("");
  await expect(page.locator("#tool-export")).toBeDisabled();
  await page.locator("#byte-encoding").selectOption("base64");
  await page.locator("#tool-run").click();
  await expect(page.locator("#tool-status")).toContainText("错误");
  await expect(page.locator("#app")).toHaveAttribute("data-current", "true");
});
