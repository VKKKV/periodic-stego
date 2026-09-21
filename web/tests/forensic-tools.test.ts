import { describe, expect, it } from "vitest";
import {
  anomalyMask,
  channelDifferenceMask,
  coordinatesToMorse,
  inspectJPEG,
  plotCoordinates,
  primeValueMask,
  selectCoordinates,
  transformBytes,
} from "../src/forensic-tools";

const rgba = (...pixels: number[]) => new Uint8ClampedArray(pixels);

function pngSignature(): Uint8Array {
  return new Uint8Array([137, 80, 78, 71]);
}

describe("generic forensic masks", () => {
  it("computes channel difference without alpha compositing", () => {
    expect(
      Array.from(
        channelDifferenceMask(rgba(10, 40, 0, 0, 80, 80, 0, 0), 2, 1, {
          left: "r",
          right: "g",
          threshold: 30,
        }),
      ),
    ).toEqual([30, 30, 30, 255, 0, 0, 0, 255]);
  });

  it("finds local median anomalies and prime-valued samples", () => {
    const input = rgba(10, 10, 10, 255, 10, 99, 10, 255, 10, 10, 10, 255);
    expect(anomalyMask(input, 3, 1, { channel: "g", threshold: 20 })[4]).toBe(
      89,
    );
    const prime = primeValueMask(
      rgba(2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255),
      3,
      1,
      "r",
    );
    expect(Array.from(prime)).toEqual([
      255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255,
    ]);
  });
});

describe("coordinate traversal and byte transforms", () => {
  const input = rgba(
    200,
    0,
    0,
    255,
    0,
    0,
    0,
    255,
    255,
    0,
    0,
    255,
    100,
    0,
    0,
    255,
  );

  it("supports row and column coordinate traversal", () => {
    expect(
      selectCoordinates(input, 2, 2, {
        channel: "r",
        order: "row",
        threshold: 150,
        invert: false,
      }),
    ).toEqual([
      { x: 0, y: 0, value: 200 },
      { x: 0, y: 1, value: 255 },
    ]);
    expect(
      selectCoordinates(input, 2, 2, {
        channel: "r",
        order: "column",
        threshold: 150,
        invert: false,
      }),
    ).toEqual([
      { x: 0, y: 0, value: 200 },
      { x: 0, y: 1, value: 255 },
    ]);
  });

  it("converts selected intensity values to Morse symbols", () => {
    expect(
      coordinatesToMorse(
        [
          { x: 0, y: 0, value: 20 },
          { x: 1, y: 0, value: 200 },
        ],
        2,
      ),
    ).toBe("A");
  });

  it("inverts then XORs bytes in a deterministic order", () => {
    expect(
      Array.from(
        transformBytes(new Uint8Array([0, 15, 255]), {
          invert: true,
          xor: 0x0f,
        }),
      ),
    ).toEqual([240, 255, 15]);
  });

  it("plots bounded coordinates and rejects out-of-range points", () => {
    expect(
      Array.from(plotCoordinates([{ x: 1, y: 0, value: 255 }], 2, 1)),
    ).toEqual([0, 0, 0, 0, 255, 64, 32, 255]);
    expect(() => plotCoordinates([{ x: 2, y: 0, value: 0 }], 2, 1)).toThrow(
      /outside/,
    );
  });
});

describe("structured JPEG inspection", () => {
  it("reports segments, scan bounds, EOI and trailing signatures", () => {
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x04,
      0x41,
      0x42,
      0xff,
      0xda,
      0x00,
      0x02,
      0x11,
      0xff,
      0x00,
      0x22,
      0xff,
      0xd9,
      ...pngSignature(),
      0x00,
    ]);
    const result = inspectJPEG(jpeg);
    expect(result.segments.map(({ marker }) => marker)).toEqual([
      "FFE0",
      "FFDA",
    ]);
    expect(result.scanStart).toBe(8);
    expect(result.eoi).toBe(16);
    expect(result.trailingOffset).toBe(18);
    expect(result.carved).toEqual([{ offset: 18, length: 5, kind: "png" }]);
  });

  it("rejects malformed markers and missing EOI", () => {
    expect(() => inspectJPEG(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toThrow(
      /JPEG/,
    );
    expect(() =>
      inspectJPEG(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2])),
    ).toThrow(/EOI/);
  });
});
