import { test, expect } from "@playwright/test";

const native = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGNgZGJmSDU+2QAABHAB6Ki6gBcAAAAASUVORK5CYII=",
  "base64",
);

test("generic forensic tool methods run explicitly and invalidate output", async ({
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

  for (const operation of [
    "channel-difference",
    "anomaly",
    "prime-mask",
    "coordinates",
  ]) {
    await page.locator("#tool-operation").selectOption(operation);
    await page.locator("#tool-run").click();
    await expect(page.locator("#tool-canvas")).toBeVisible();
    await expect(page.locator("#tool-export")).toBeEnabled();
  }

  await page.locator("#tool-operation").selectOption("byte-transform");
  await page.locator("#invert-bytes").check();
  await page.locator("#xor-value").fill("15");
  await page.locator("#tool-run").click();
  await expect(page.locator("#tool-export")).toBeEnabled();
  await page.locator("#tool-operation").selectOption("jpeg-inspect");
  await expect(page.locator("#tool-export")).toBeDisabled();
});
