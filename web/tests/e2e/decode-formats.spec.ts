import { test, expect } from "@playwright/test";

// OS/2 BITMAPCOREHEADER, 1×1, 24-bit, padded BGR row.
function coreBMP() {
  const b = Buffer.alloc(30);
  b.write("BM");
  b.writeUInt32LE(b.length, 2);
  b.writeUInt32LE(26, 10);
  b.writeUInt32LE(12, 14);
  b.writeUInt16LE(1, 18);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt16LE(24, 24);
  b[28] = 255;
  return b;
}

test("accepts legacy BMP CORE dimensions without mistaking packed fields for huge dimensions", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#image-file").setInputFiles({
    name: "core.bmp",
    mimeType: "image/bmp",
    buffer: coreBMP(),
  });
  await expect(page.locator("#image-meta")).toContainText(
    "core.bmp · 1 × 1 px",
  );
  await expect(page.locator("#app")).toHaveAttribute("data-current", "true");
  await expect(page.locator("#forensic-status")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(page.locator("#error")).toBeHidden();
});

test("transparent PNG warns about decoded RGB loss in both locales", async ({
  page,
}) => {
  // Raw PNG pixels are [1,2,3,0,101,51,201,128], deliberately not made with Canvas.
  const buffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGNgZGJmSDU+2QAABHAB6Ki6gBcAAAAASUVORK5CYII=",
    "base64",
  );
  await page.goto("./");
  const decoded = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    );
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 1;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return Array.from(ctx.getImageData(0, 0, 2, 1).data);
  }, Array.from(buffer));
  expect(decoded.slice(0, 4)).toEqual([0, 0, 0, 0]);
  await page
    .locator("#image-file")
    .setInputFiles({ name: "hidden-rgb.png", mimeType: "image/png", buffer });
  await expect(page.locator("#forensic-status")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(page.locator("#forensic-warnings")).toContainText(
    "not byte-exact source pixels",
  );
  await page.locator("#language").selectOption("zh-CN");
  await expect(page.locator("#forensic-warnings")).toContainText(
    "不等同于源文件的逐字节像素",
  );
});
