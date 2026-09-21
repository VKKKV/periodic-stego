import { describe, expect, it } from "vitest";
import {
  bitplane,
  extractPixelBits,
  type PixelBitOptions,
  type PixelChannel,
} from "../src/bitplanes";

const hidden = new Uint8ClampedArray([1, 2, 3, 0, 101, 51, 201, 128]);
const options: PixelBitOptions = {
  channels: "rgba",
  bit: 0,
  order: "row",
  bitOrder: "msb",
  offset: 0,
  length: 1,
};

// Deliberately simple string oracle, independent of production indexing/packing.
function oracle(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  config: PixelBitOptions,
) {
  const pixels: number[] = [];
  if (config.order === "row") {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) pixels.push(y * width + x);
  } else {
    for (let x = 0; x < width; x++)
      for (let y = 0; y < height; y++) pixels.push(y * width + x);
  }
  let bits = "";
  for (const pixel of pixels)
    for (const channel of config.channels)
      bits +=
        Math.floor(
          data[pixel * 4 + "rgba".indexOf(channel)] / 2 ** config.bit,
        ) % 2;
  bits = bits.slice(config.offset, config.offset + config.length * 8);
  const result: number[] = [];
  for (let at = 0; at < bits.length; at += 8) {
    const group = bits.slice(at, at + 8);
    result.push(
      parseInt(
        config.bitOrder === "msb" ? group : [...group].reverse().join(""),
        2,
      ),
    );
  }
  return new Uint8Array(result);
}

describe("raw pixel bitplanes", () => {
  it("produces one black/white grayscale byte per pixel, including hidden RGB", () => {
    expect(bitplane(hidden, 2, 1, "r", 0)).toEqual(
      new Uint8ClampedArray([255, 255]),
    );
    expect(bitplane(hidden, 2, 1, "g", 0)).toEqual(
      new Uint8ClampedArray([0, 255]),
    );
    expect(bitplane(hidden, 2, 1, "b", 7)).toEqual(
      new Uint8ClampedArray([0, 255]),
    );
    expect(bitplane(hidden, 2, 1, "a", 7)).toEqual(
      new Uint8ClampedArray([0, 255]),
    );
  });
  it("handles every channel and bit without mutating input", () => {
    const data = new Uint8ClampedArray(
      Array.from({ length: 256 }, (_, i) => (i * 37) & 255),
    );
    const before = data.slice();
    for (const channel of "rgba")
      for (let bit = 0; bit < 8; bit++) {
        const result = bitplane(data, 8, 8, channel as PixelChannel, bit);
        expect(result).toEqual(
          new Uint8ClampedArray(
            Array.from({ length: 64 }, (_, i) =>
              Math.floor(data[i * 4 + "rgba".indexOf(channel)] / 2 ** bit) % 2
                ? 255
                : 0,
            ),
          ),
        );
      }
    expect(data).toEqual(before);
  });
  it.each(["", "rgb", "R", "x", 0, null])(
    "rejects invalid channel %s",
    (channel) => {
      expect(() => bitplane(hidden, 2, 1, channel as PixelChannel, 0)).toThrow(
        /Channel/,
      );
    },
  );
});

describe("exact pixel-bit extraction", () => {
  it("extracts known hidden RGB/alpha sample bits with both packing orders", () => {
    expect(extractPixelBits(hidden, 2, 1, options)).toEqual(
      new Uint8Array([0xae]),
    );
    expect(
      extractPixelBits(hidden, 2, 1, { ...options, bitOrder: "lsb" }),
    ).toEqual(new Uint8Array([0x75]));
    expect(
      extractPixelBits(hidden, 2, 1, { ...options, channels: "abgr" }),
    ).toEqual(new Uint8Array([0x57]));
  });
  it("uses x-first/column or y-first/row traversal and ordered channels", () => {
    const data = new Uint8ClampedArray([
      1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0,
    ]);
    expect(
      extractPixelBits(data, 2, 2, { ...options, channels: "rg" }),
    ).toEqual(new Uint8Array([0x9c]));
    expect(
      extractPixelBits(data, 2, 2, {
        ...options,
        channels: "rg",
        order: "column",
      }),
    ).toEqual(new Uint8Array([0xb4]));
  });
  it("matches an independent oracle across axes, bits, channels, packing and unaligned offsets", () => {
    const data = new Uint8ClampedArray(
      Array.from({ length: 5 * 7 * 4 }, (_, i) => (i * 89 + i * i) % 256),
    );
    const before = data.slice();
    for (const channels of ["r", "a", "rgb", "bgr", "ag", "abgr"]) {
      for (const order of ["row", "column"] as const)
        for (const bitOrder of ["msb", "lsb"] as const) {
          for (let bit = 0; bit < 8; bit++)
            for (const offset of [0, 1, 7, 8, 11]) {
              const config = {
                channels,
                order,
                bitOrder,
                bit,
                offset,
                length: 3,
              };
              expect(extractPixelBits(data, 5, 7, config)).toEqual(
                oracle(data, 5, 7, config),
              );
            }
        }
    }
    expect(data).toEqual(before);
  });
  it("allows the final complete byte, rejects even one bit short (no zero padding)", () => {
    const data = new Uint8ClampedArray(12);
    expect(extractPixelBits(data, 3, 1, { ...options, offset: 4 })).toEqual(
      new Uint8Array([0]),
    );
    expect(() =>
      extractPixelBits(data, 3, 1, { ...options, offset: 5 }),
    ).toThrow(/complete/);
    expect(() =>
      extractPixelBits(hidden, 2, 1, { ...options, channels: "rgb" }),
    ).toThrow(/complete/);
    expect(() =>
      extractPixelBits(hidden, 2, 1, { ...options, length: 2 }),
    ).toThrow(/complete/);
  });
  it("accepts the 1 MiB output boundary with sufficient pixels", () => {
    const data = new Uint8ClampedArray(2048 * 1024 * 4).fill(1);
    const result = extractPixelBits(data, 2048, 1024, {
      ...options,
      length: 1024 * 1024,
    });
    expect(result.length).toBe(1024 * 1024);
    expect(result.every((value) => value === 255)).toBe(true);
  });
  it.each(["", "rr", "rgbaa", "R", "rgba ", "x", 1, null])(
    "rejects invalid channels %s",
    (channels) => {
      expect(() =>
        extractPixelBits(hidden, 2, 1, {
          ...options,
          channels: channels as string,
        }),
      ).toThrow(/Channels/);
    },
  );
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid bit offset %s",
    (offset) => {
      expect(() =>
        extractPixelBits(hidden, 2, 1, { ...options, offset }),
      ).toThrow(/Offset/);
    },
  );
  it.each([0, -1, 0.5, NaN, Infinity, 1024 * 1024 + 1])(
    "rejects invalid output length %s",
    (length) => {
      expect(() =>
        extractPixelBits(hidden, 2, 1, { ...options, length }),
      ).toThrow(/Length/);
    },
  );
  it("rejects invalid order and missing options", () => {
    expect(() =>
      extractPixelBits(hidden, 2, 1, {
        ...options,
        order: "diagonal" as "row",
      }),
    ).toThrow(/order/);
    expect(() =>
      extractPixelBits(hidden, 2, 1, { ...options, bitOrder: "big" as "msb" }),
    ).toThrow(/order/);
    expect(() =>
      extractPixelBits(hidden, 2, 1, null as unknown as PixelBitOptions),
    ).toThrow(/options/);
    expect(() =>
      extractPixelBits(hidden, 2, 1, {
        ...options,
        offset: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow(/complete/);
  });
});

describe("pixel shape and bit validation shared by both APIs", () => {
  it.each([
    [0, 1],
    [1, 0],
    [-1, 1],
    [1.5, 1],
    [NaN, 1],
    [1, Infinity],
    [16385, 1],
    [4097, 4096],
  ])("rejects dimensions %s x %s", (width, height) => {
    expect(() => bitplane(hidden, width, height, "r", 0)).toThrow(/dimensions/);
    expect(() => extractPixelBits(hidden, width, height, options)).toThrow(
      /dimensions/,
    );
  });
  it.each([-1, 8, 1.5, NaN, Infinity])("rejects invalid bit %s", (bit) => {
    expect(() => bitplane(hidden, 2, 1, "r", bit)).toThrow(/Bit/);
    expect(() => extractPixelBits(hidden, 2, 1, { ...options, bit })).toThrow(
      /Bit/,
    );
  });
  it.each([
    new Uint8ClampedArray(7),
    new Uint8ClampedArray(9),
    new Uint8Array(8),
    null,
  ])("rejects wrong RGBA buffer %s", (data) => {
    expect(() => bitplane(data as Uint8ClampedArray, 2, 1, "r", 0)).toThrow(
      /RGBA/,
    );
    expect(() =>
      extractPixelBits(data as Uint8ClampedArray, 2, 1, options),
    ).toThrow(/RGBA/);
  });
  it("accepts tightly packed subarray buffers", () => {
    const data = new Uint8ClampedArray(16);
    data.set(hidden, 4);
    expect(extractPixelBits(data.subarray(4, 12), 2, 1, options)).toEqual(
      new Uint8Array([0xae]),
    );
    expect(bitplane(data.subarray(4, 12), 2, 1, "r", 0)).toEqual(
      new Uint8ClampedArray([255, 255]),
    );
  });
});
