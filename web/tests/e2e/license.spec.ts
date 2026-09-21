import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("license download and source notice are available in both locales", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  const license = page.locator('a[download="LICENSE.txt"]');
  await expect(license).toHaveAttribute("download", "LICENSE.txt");
  const href = await license.getAttribute("href");
  expect(new URL(href!, page.url()).origin).toBe(new URL(page.url()).origin);
  const response = await page.request.get(new URL(href!, page.url()).href);
  expect(response.status()).toBe(200);
  const expected = await readFile(path.resolve("../LICENSE"));
  expect((await response.body()).equals(expected)).toBe(true);
  const pending = page.waitForEvent("download");
  await license.click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("LICENSE.txt");
  expect((await readFile((await download.path())!)).equals(expected)).toBe(
    true,
  );
  for (const [locale, label, notice] of [
    ["en", "Source", "AGPL-3.0-only"],
    ["zh-CN", "源码", "AGPL-3.0-only"],
  ]) {
    await page.locator("#language").selectOption(locale);
    await expect(
      page.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("href", "https://github.com/VKKKV/periodic-stego");
    await expect(page.locator(".legal")).toContainText(notice);
    await expect(license).toHaveAttribute("href", href!);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".legal")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
