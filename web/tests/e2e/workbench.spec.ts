import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
const fixture = (name: string) => path.resolve("tests/fixtures", name);
async function ready(page: Page) {
  await expect(page.locator("#status")).toContainText("Ready · job");
  await expect(page.locator("#app")).toHaveAttribute("data-busy", "false");
}
async function changed(page: Page, action: () => Promise<unknown>) {
  const before = await page.locator("#app").getAttribute("data-job-id");
  await action();
  await expect(page.locator("#app")).not.toHaveAttribute(
    "data-job-id",
    before!,
  );
  await ready(page);
}
async function exportFile(page: Page, kind: string) {
  await page.getByLabel("Export diagnostic").selectOption(kind);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  return await download;
}
async function pixels(page: Page, id = "main-canvas") {
  return page
    .locator(`#${id}`)
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}
async function openDetails(page: Page, title: string) {
  await page
    .locator("summary")
    .filter({ hasText: title })
    .first()
    .evaluate((el) => ((el.parentElement as HTMLDetailsElement).open = true));
}
test("PNG drag/drop, numerical views, live controls, current exports and preset roundtrip", async ({
  page,
}) => {
  const errors: string[] = [],
    forbidden: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method()))
      forbidden.push(r.method() + " " + r.url());
  });
  await page.goto("./");
  const bytes = Array.from(await readFile(fixture("rgb.png")));
  await page.locator('[data-testid="drop-zone"]').evaluate((el, bytes) => {
    const dt = new DataTransfer();
    dt.items.add(
      new File([new Uint8Array(bytes)], "rgb.png", { type: "image/png" }),
    );
    el.dispatchEvent(
      new DragEvent("drop", { bubbles: true, dataTransfer: dt }),
    );
  }, bytes);
  await ready(page);
  await expect(page.locator("#image-meta")).toContainText("rgb.png");
  await expect(page.locator("#main-canvas")).toBeVisible();
  await changed(page, () =>
    page.getByLabel("Channel", { exact: true }).selectOption("r"),
  );
  const beforeFFT = await pixels(page);
  await page.getByRole("tab", { name: "FFT spectrum" }).click();
  expect(await pixels(page)).not.toBe(beforeFFT);
  const initial = await pixels(page);
  await changed(page, () =>
    page.getByLabel("Window function").selectOption("blackman"),
  );
  expect(await pixels(page)).not.toBe(initial);
  await openDetails(page, "FFT detection");
  await changed(page, () =>
    page.getByLabel("Relative power threshold", { exact: true }).fill("19"),
  );
  await expect(page.locator("#app")).toHaveAttribute(
    "data-result-threshold",
    "19",
  );
  await openDetails(page, "Display only");
  const job = await page.locator("#app").getAttribute("data-job-id");
  const oldDisplay = await pixels(page);
  await page.getByLabel("Spectrum display").selectOption("power");
  await expect.poll(() => pixels(page)).not.toBe(oldDisplay);
  expect(await page.locator("#app").getAttribute("data-job-id")).toBe(job);
  const oldGamma = await pixels(page);
  await page.getByLabel("Display gamma", { exact: true }).fill("1.7");
  await expect.poll(() => pixels(page)).not.toBe(oldGamma);
  expect(await page.locator("#app").getAttribute("data-job-id")).toBe(job);
  for (const name of ["Preprocessed", "Autocorrelation", "FFT spectrum"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.locator("#main-canvas")).toBeVisible();
  }
  expect((await pixels(page, "profile-canvas")).length).toBeGreaterThan(3000);
  const report = await exportFile(page, "report");
  const json = JSON.parse(await readFile((await report.path())!, "utf8"));
  expect(json.parameters.analysis).toMatchObject({
    window: "blackman",
    relativeThreshold: 19,
    channel: "r",
  });
  expect(json.parameters.display.spectrum).toBe("power");
  expect(json.fftConvention).toContain("Float64");
  expect(
    json.candidates.some(
      (c: any) => c.source === "fft-profile" && Math.abs(c.periodX - 16) < 1,
    ),
  ).toBe(true);
  expect(json).not.toHaveProperty("rgba");
  for (const kind of [
    "fft",
    "autocorrelation",
    "preprocessed",
    "profiles",
    "original",
  ]) {
    const download = await exportFile(page, kind);
    const data = await readFile((await download.path())!);
    expect([...data.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  }
  const presetDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save preset", exact: true }).click();
  const saved = await presetDownload;
  await changed(page, () =>
    page.getByRole("button", { name: "Reset", exact: true }).click(),
  );
  await changed(page, async () =>
    page.locator("#preset-file").setInputFiles((await saved.path())!),
  );
  await expect(page.getByLabel("Window function")).toHaveValue("blackman");
  await page.screenshot({
    path: "test-results/workstation-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(forbidden).toEqual([]);
});
test("noise, JPEG, bad/empty/oversize files and recovery", async ({ page }) => {
  await page.goto("./");
  await page.getByLabel("Experiment preset").selectOption("conservative");
  await page.locator("#image-file").setInputFiles(fixture("noise.png"));
  await ready(page);
  await expect(page.locator("#app")).toHaveAttribute("data-strong", "false");
  await changed(page, () =>
    page.locator("#image-file").setInputFiles(fixture("rgb.jpg")),
  );
  await expect(page.locator("#image-meta")).toContainText("rgb.jpg");
  for (const payload of [
    {
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    },
    { name: "empty.png", mimeType: "image/png", buffer: Buffer.alloc(0) },
  ]) {
    await page.locator("#image-file").setInputFiles(payload);
    await expect(page.locator("#error")).toBeVisible();
  }
  const header = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header);
  header.writeUInt32BE(100000, 16);
  header.writeUInt32BE(100000, 20);
  await page
    .locator("#image-file")
    .setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: header });
  await expect(page.locator("#error")).toContainText("safe decode limit");
  await page.locator("#image-file").setInputFiles(fixture("constant.png"));
  await ready(page);
  await expect(page.locator("#verdict")).toContainText("No useful signal");
  await expect(page.locator("#error")).toBeHidden();
});
test("latest job wins, 1024 analysis stays responsive and ROI resets on replacement", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#image-file").setInputFiles(fixture("large.png"));
  await ready(page);
  await page.evaluate(() => {
    (window as any).ticks = 0;
    (window as any).tickTimer = setInterval(() => (window as any).ticks++, 10);
  });
  await changed(page, () => page.getByLabel("Max dimension (px)").fill("1024"));
  expect(await page.evaluate(() => (window as any).ticks)).toBeGreaterThan(5);
  await openDetails(page, "FFT detection");
  await changed(page, () =>
    page
      .getByLabel("Relative power threshold", { exact: true })
      .evaluate((el: HTMLInputElement) => {
        for (let i = 2; i <= 35; i++) {
          el.value = String(i);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }),
  );
  await expect(page.locator("#app")).toHaveAttribute(
    "data-result-threshold",
    "35",
  );
  await page.waitForTimeout(500);
  await expect(page.locator("#app")).toHaveAttribute(
    "data-result-threshold",
    "35",
  );
  await openDetails(page, "Crop ROI");
  await changed(page, () => page.getByLabel("ROI width").fill("128"));
  await expect(page.locator("#stats")).toContainText("128 × 1024");
  await changed(page, () =>
    page.locator("#image-file").setInputFiles(fixture("odd.png")),
  );
  await expect(page.getByLabel("ROI width")).toHaveValue("");
  const count = await page.locator("canvas").count();
  for (let i = 0; i < 3; i++)
    await changed(page, () =>
      page
        .locator("#image-file")
        .setInputFiles(fixture(i % 2 ? "rgb.jpg" : "vertical.png")),
    );
  expect(await page.locator("canvas").count()).toBe(count);
  await page.evaluate(() => clearInterval((window as any).tickTimer));
});
test("small viewport, reduced motion, keyboard controls and no horizontal page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await expect(page.locator("#parameters")).toBeHidden();
  await page.getByRole("button", { name: "Parameters", exact: true }).click();
  await expect(page.locator("#parameters")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#parameters")).toBeHidden();
  await page.getByRole("button", { name: "Run demo" }).click();
  await ready(page);
  await page.getByRole("tab", { name: "FFT spectrum" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/workstation-mobile.png",
    fullPage: true,
  });
});
