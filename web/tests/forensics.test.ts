import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeForensics,
  c2paMarker,
  workCanvas,
  cloneCanvas,
  differenceCanvas,
  exif,
  jpegMetadata,
  jpegQualityFromLumaTable,
  printableStrings,
} from "../src/forensics";

const luma = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16,
  24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109,
  103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];
const zigzag = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40,
  48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29,
  22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54,
  47, 55, 62, 63,
];
function table(quality: number) {
  const scale = quality < 50 ? 5000 / quality : 200 - 2 * quality;
  return luma.map((v) =>
    Math.max(1, Math.min(255, Math.floor((v * scale + 50) / 100))),
  );
}
function fakeCanvas() {
  vi.stubGlobal(
    "ImageData",
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  );
  vi.stubGlobal("document", {
    createElement: () => {
      let pixels: { data: Uint8ClampedArray };
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          putImageData: (p: typeof pixels) => {
            pixels = p;
          },
          getImageData: () => pixels,
        }),
      };
    },
  });
}
afterEach(() => vi.unstubAllGlobals());

describe("browser forensics helpers", () => {
  it("never labels arbitrary C2PA marker text as verified provenance", () => {
    expect(c2paMarker(new TextEncoder().encode("not a manifest: c2pa"))).toBe(
      "unverified-marker",
    );
    expect(c2paMarker(new Uint8Array([99, 50, 112]))).toBe("not-detected");
  });
  it("rejects superseded analysis before touching the image", async () => {
    await expect(
      analyzeForensics(null as never, new Uint8Array(), () => false),
    ).rejects.toThrow(/superseded/);
  });
  it("composites an opaque background before drawing the ELA source", () => {
    const calls: string[] = [];
    const context = {
      fillStyle: "",
      fillRect: () => calls.push("fill"),
      drawImage: () => calls.push("draw"),
    };
    vi.stubGlobal("document", {
      createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    });
    workCanvas({ canvas: { width: 4, height: 4 } } as never);
    expect(calls).toEqual(["fill", "draw"]);
    expect(context.fillStyle).toBe("#fff");
  });
  it.each([25, 50, 75, 90, 95, 100])(
    "estimates IJG natural-order quality %i",
    (q) => {
      expect(jpegQualityFromLumaTable(table(q))).toBeCloseTo(q, 0);
    },
  );
  it("rejects incomplete or invalid quantization tables", () => {
    expect(jpegQualityFromLumaTable([1, 2, 3])).toBeNull();
    expect(jpegQualityFromLumaTable(Array(64).fill(0))).toBeNull();
  });
  it.each([50, 75, 90, 95])("de-zigzags JPEG DQT at quality %i", (q) => {
    const natural = table(q);
    const bytes = new Uint8Array([
      255,
      216,
      255,
      219,
      0,
      67,
      0,
      ...zigzag.map((i) => natural[i]),
      255,
      217,
    ]);
    expect(jpegMetadata(bytes).estimatedQuality).toBe(q);
  });
  it("does not read EXIF IFD entries outside its APP1 segment", () => {
    // A valid TIFF header whose IFD points into the following JPEG bytes.
    const bytes = new Uint8Array([
      255, 216, 255, 225, 0, 16, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0,
      0, 0, 1, 0, 15, 1, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(exif(bytes, "image/jpeg")).not.toHaveProperty("ExifEntries");
  });
  it.each([true, false])(
    "reads a segment-bounded TIFF IFD (little endian: %s)",
    (little) => {
      const bytes = new Uint8Array(40);
      bytes.set([255, 216, 255, 225, 0, 34, 69, 120, 105, 102, 0, 0]);
      const view = new DataView(bytes.buffer);
      bytes.set(little ? [73, 73] : [77, 77], 12);
      view.setUint16(14, 42, little);
      view.setUint32(16, 8, little);
      view.setUint16(20, 1, little);
      view.setUint16(22, 0x10f, little);
      view.setUint16(24, 2, little);
      view.setUint32(26, 1, little);
      const wrapped = new Uint8Array(45);
      wrapped.set(bytes, 3);
      expect(exif(wrapped.subarray(3, 43), "image/jpeg")).toMatchObject({
        ExifEntries: "1",
        "Tag 0x010f": "type 2, count 1",
      });
    },
  );
  it("rejects invalid TIFF byte order", () => {
    const bytes = new Uint8Array([
      255, 216, 255, 225, 0, 18, 69, 120, 105, 102, 0, 0, 88, 88, 0, 42, 0, 0,
      0, 8, 0, 0,
    ]);
    expect(exif(bytes, "image/jpeg")).not.toHaveProperty("ExifEntries");
  });
  it("does not mistake PNG payload text for an eXIf chunk", () => {
    const bytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 4, 116, 69, 88, 116, 101, 88,
      73, 102, 0, 0, 0, 0,
    ]);
    expect(exif(bytes, "image/png")).toEqual({});
  });
  it("recognizes an actual eXIf chunk", () => {
    const bytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 101, 88, 73, 102, 0, 0, 0, 0,
    ]);
    expect(exif(bytes, "image/png")).toEqual({ hasExif: "true" });
  });
  it("verifies clone block pixels instead of only mean/variance", () => {
    fakeCanvas();
    const make = (same: boolean) => {
      const data = new Uint8ClampedArray(48 * 8 * 4);
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 48; x++) {
          const i = (y * 48 + x) * 4;
          const v =
            x < 8
              ? x % 2
                ? 255
                : 0
              : x >= 40
                ? (same ? x : y) % 2
                  ? 255
                  : 0
                : 0;
          data[i] = data[i + 1] = data[i + 2] = v;
          data[i + 3] = 255;
        }
      return cloneCanvas(data, 48, 8)
        .getContext("2d")!
        .getImageData(0, 0, 48, 8).data;
    };
    expect(make(false)[3]).toBe(0);
    expect(make(false).at(-1)).toBe(0);
    expect(make(true)[3]).toBeGreaterThan(0);
    expect(make(true).at(-1)).toBeGreaterThan(0);
  });
  it("preserves exact ELA statistics using byte-valued differences", () => {
    fakeCanvas();
    const a = new Uint8ClampedArray(100 * 4),
      b = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 100; i++) a[i * 4] = i;
    const result = differenceCanvas(a, b, 100, 1, 20);
    expect(result.mean).toBe(49.5);
    expect(result.p95).toBe(95);
    expect(result.maximum).toBe(99);
  });
  it("bounds string count and individual length without splitting long runs", () => {
    const text = "A".repeat(100000) + "\0" + "second string\0".repeat(150);
    const strings = printableStrings(new TextEncoder().encode(text));
    expect(strings).toHaveLength(100);
    expect(strings[0].length).toBeLessThanOrEqual(512);
    expect(strings[1]).toBe("second string");
  });
});
