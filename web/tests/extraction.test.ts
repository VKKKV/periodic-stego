import { describe, expect, it } from "vitest";
import { extractBytes, type ExtractionOptions } from "../src/extraction";

const ascii = (s: string) => new TextEncoder().encode(s);
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
const dataView = (b: Uint8Array) =>
  new DataView(b.buffer, b.byteOffset, b.length);
const MiB = 1024 * 1024;

// All containers and payloads are synthetic. CRC uses an independent bitwise
// implementation; the production parser uses a lookup table.
function chunk(type: string, data: Uint8Array = new Uint8Array()): Uint8Array {
  const out = new Uint8Array(data.length + 12);
  dataView(out).setUint32(0, data.length);
  out.set(ascii(type), 4);
  out.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of out.subarray(4, out.length - 4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  dataView(out).setUint32(out.length - 4, (crc ^ 0xffffffff) >>> 0);
  return out;
}
const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function ihdr(): Uint8Array {
  const data = new Uint8Array(13);
  dataView(data).setUint32(0, 1);
  dataView(data).setUint32(4, 1);
  data[8] = 8;
  data[9] = 0;
  return chunk("IHDR", data);
}
function png(
  payload: Uint8Array = new Uint8Array(),
  extra: Uint8Array = new Uint8Array(),
): Uint8Array {
  // A zlib stream containing the single grayscale scanline [filter=0, value=0].
  const idat = new Uint8Array([
    0x78, 0x01, 0x01, 0x02, 0, 0xfd, 0xff, 0, 0, 0, 2, 0, 1,
  ]);
  return join(
    signature,
    ihdr(),
    extra,
    chunk("IDAT", idat),
    chunk("IEND"),
    payload,
  );
}
function gif(
  payload: Uint8Array = new Uint8Array(),
  extra: Uint8Array = new Uint8Array(),
): Uint8Array {
  return join(
    ascii("GIF89a"),
    new Uint8Array([1, 0, 1, 0, 0x80, 0, 0]),
    new Uint8Array([0, 0, 0, 255, 255, 255]),
    extra,
    // A 1x1 image, LZW code size 2, data subblock, terminator, real trailer.
    new Uint8Array([
      0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0, 0x3b,
    ]),
    payload,
  );
}
function bmp(pixelBytes: Uint8Array, topDown = false): Uint8Array {
  const width = pixelBytes.length;
  const size = Math.ceil(width / 4) * 4;
  const offset = 54 + 256 * 4;
  const out = new Uint8Array(offset + size);
  const d = dataView(out);
  out.set(ascii("BM"));
  d.setUint32(2, out.length, true);
  d.setUint32(10, offset, true);
  d.setUint32(14, 40, true);
  d.setInt32(18, width, true);
  d.setInt32(22, topDown ? -1 : 1, true);
  d.setUint16(26, 1, true);
  d.setUint16(28, 8, true);
  d.setUint32(34, size, true);
  for (let i = 0; i < 256; i++) out.fill(i, 54 + i * 4, 54 + i * 4 + 3);
  out.fill(0x7f, offset);
  out.set(pixelBytes, offset);
  return out;
}
const sentinels = (symbols: Uint8Array) =>
  join(new Uint8Array(2), symbols, new Uint8Array(2));
function bits(bytes: Uint8Array, zero = 0x30, one = 0x31): Uint8Array {
  return Uint8Array.from(
    Array.from(bytes).flatMap((byte) =>
      Array.from({ length: 8 }, (_, i) => (byte & (1 << (7 - i)) ? one : zero)),
    ),
  );
}
const trailers = [
  { source: "png-trailer" as const, make: png },
  { source: "gif-trailer" as const, make: gif },
];

for (const { source, make } of trailers) {
  describe(source, () => {
    it.each([1, 2, 3, 8, 19, 127])(
      "extracts raw payload length %i without mutation",
      (length) => {
        const payload = Uint8Array.from({ length }, (_, i) => (i * 17) & 255);
        const input = make(payload);
        const saved = input.slice();
        const result = extractBytes(input, { source, encoding: "raw" });
        expect(result.bytes).toEqual(payload);
        expect(input).toEqual(saved);
        expect(result.filename).toBe(`${source}-extracted.bin`);
        expect(result.note).toContain("structurally parsed");
        result.bytes[0] ^= 255;
        expect(input).toEqual(saved);
      },
    );
    it("does not trim raw whitespace or discard a UTF-8 BOM in the text view", () => {
      const payload = new Uint8Array([0xef, 0xbb, 0xbf, 9, 32, 0, 10]);
      const result = extractBytes(make(payload), { source, encoding: "raw" });
      expect(result.bytes).toEqual(payload);
      expect(result.text).toBe("\ufeff\t \0\n");
      expect(
        extractBytes(make(ascii(" \n")), { source, encoding: "raw" }).bytes,
      ).toEqual(ascii(" \n"));
    });
    it("supports Uint8Array views with nonzero byte offsets", () => {
      const container = make(ascii("value"));
      const padded = join(new Uint8Array(11), container, new Uint8Array(11));
      expect(
        extractBytes(padded.subarray(11, 11 + container.length), {
          source,
          encoding: "raw",
        }).text,
      ).toBe("value");
    });
    it.each([1, 2, 3, 9, 31])("decodes ASCII bits at length %i", (length) => {
      const expected = Uint8Array.from({ length }, (_, i) => i + 32);
      const payload = join(
        ascii("\t\n\v\f\r "),
        bits(expected),
        ascii(" \r\n"),
      );
      expect(
        extractBytes(make(payload), { source, encoding: "ascii-bits" }).bytes,
      ).toEqual(expected);
    });
    it("supports MSB/LSB bit order and explicit insertion at beginning, middle or end", () => {
      expect(
        extractBytes(make(ascii("10000000")), {
          source,
          encoding: "ascii-bits",
          bitOrder: "msb",
        }).bytes,
      ).toEqual(new Uint8Array([128]));
      expect(
        extractBytes(make(ascii("10000000")), {
          source,
          encoding: "ascii-bits",
          bitOrder: "lsb",
        }).bytes,
      ).toEqual(new Uint8Array([1]));
      for (const insertAt of [0, 3, 7]) {
        const result = extractBytes(make(ascii("0000000")), {
          source,
          encoding: "ascii-bits",
          insertAt,
          insertBit: 1,
        });
        expect(result.bytes).toEqual(new Uint8Array([1 << (7 - insertAt)]));
        expect(result.note).toContain(`Inserted bit 1 at index ${insertAt}`);
      }
      expect(
        extractBytes(make(ascii("1111111")), {
          source,
          encoding: "ascii-bits",
          insertAt: 7,
        }).bytes,
      ).toEqual(new Uint8Array([254]));
    });
    it.each([
      "0101010",
      "010101010",
      "0101 0101",
      "0101\n0101",
      "0101010x",
      "0101010\u00a0",
    ])("rejects invalid bit stream %j", (payload) => {
      expect(() =>
        extractBytes(make(ascii(payload)), { source, encoding: "ascii-bits" }),
      ).toThrow();
    });
    it.each([-2, 8, 0.5, NaN, Infinity])(
      "rejects invalid insertion index %s",
      (insertAt) => {
        expect(() =>
          extractBytes(make(ascii("0000000")), {
            source,
            encoding: "ascii-bits",
            insertAt,
          }),
        ).toThrow(/Insertion index/);
      },
    );
    it.each([
      ["AA==", [0]],
      ["AQI=", [1, 2]],
      ["AQID", [1, 2, 3]],
      [" /+7dzA==\r\n", [255, 238, 221, 204]],
    ])("decodes strict Base64 %j", (payload, expected) => {
      expect(
        extractBytes(make(ascii(payload as string)), {
          source,
          encoding: "base64",
        }).bytes,
      ).toEqual(new Uint8Array(expected as number[]));
    });
    it.each([
      "A",
      "AA",
      "AAA",
      "A===",
      "====",
      "AA=A",
      "AA==AAAA",
      "AB==",
      "AAB=",
      "_w==",
      "-w==",
      "AA A",
      "AA\nA",
      "\u00a0AA==",
      "AA==\0",
    ])("rejects noncanonical Base64 %j", (payload) => {
      expect(() =>
        extractBytes(make(ascii(payload)), { source, encoding: "base64" }),
      ).toThrow(/Base64/);
    });
    it.each(["raw", "ascii-bits", "base64"] as const)(
      "rejects missing %s payload",
      (encoding) => {
        expect(() => extractBytes(make(), { source, encoding })).toThrow(
          /No payload/,
        );
        if (encoding !== "raw")
          expect(() =>
            extractBytes(make(ascii("\t \r\n")), { source, encoding }),
          ).toThrow(/No payload/);
      },
    );
    it("accepts exactly 1 MiB raw output and rejects one extra byte", () => {
      expect(
        extractBytes(make(new Uint8Array(MiB)), { source, encoding: "raw" })
          .bytes.length,
      ).toBe(MiB);
      expect(() =>
        extractBytes(make(new Uint8Array(MiB + 1)), {
          source,
          encoding: "raw",
        }),
      ).toThrow(/1 MiB/);
    });
  });
}

describe("container traversal", () => {
  it("ignores literal IEND and a complete IEND chunk embedded in PNG chunk data", () => {
    const bytes = png(
      ascii("outside"),
      chunk("tEXt", join(ascii("key\0IEND"), chunk("IEND"), ascii("inside"))),
    );
    expect(
      extractBytes(bytes, { source: "png-trailer", encoding: "raw" }).text,
    ).toBe("outside");
  });
  it("rejects PNG CRC errors including IEND CRC", () => {
    for (const offset of [29, png().length - 1]) {
      const bytes = png(ascii("data"));
      bytes[offset] ^= 1;
      expect(() =>
        extractBytes(bytes, { source: "png-trailer", encoding: "raw" }),
      ).toThrow(/CRC/);
    }
  });
  it("requires an IHDR, IDAT and zero-length IEND in structural positions", () => {
    const cases = [
      join(signature, chunk("IEND")),
      join(signature, ihdr(), chunk("IEND")),
      join(signature, ihdr(), ihdr(), chunk("IDAT"), chunk("IEND")),
      join(signature, ihdr(), chunk("IDAT"), chunk("IEND", ascii("x"))),
      join(signature, ihdr(), chunk("IDAT")),
      png(ascii("x"), chunk("bad1")),
      png(ascii("x"), chunk("abca")),
    ];
    for (const bytes of cases)
      expect(() =>
        extractBytes(bytes, { source: "png-trailer", encoding: "raw" }),
      ).toThrow();
  });
  it("rejects oversized PNG chunks and every prefix of a complete PNG", () => {
    const bytes = png();
    for (let end = 0; end < bytes.length; end++)
      expect(() =>
        extractBytes(bytes.subarray(0, end), {
          source: "png-trailer",
          encoding: "raw",
        }),
      ).toThrow();
    const huge = png(ascii("x"));
    dataView(huge).setUint32(8, 0xffffffff);
    expect(() =>
      extractBytes(huge, { source: "png-trailer", encoding: "raw" }),
    ).toThrow(/bounds/);
  });
  it("does not confuse GIF table, extension or image bytes with the trailer", () => {
    const extra = new Uint8Array([
      0x21,
      0xfe,
      3,
      0x3b,
      0x2c,
      0x21,
      0,
      0x21,
      0xf9,
      4,
      0,
      0x3b,
      0,
      0,
      0,
      0x21,
      0xff,
      11,
      ...ascii("APP;0000000"),
      1,
      0x3b,
      0,
      0x21,
      1,
      12,
      ...new Uint8Array(12),
      1,
      0x3b,
      0,
    ]);
    const bytes = gif(ascii("outside"), extra);
    bytes[13] = 0x3b;
    bytes[bytes.length - ascii("outside").length - 3] = 0x3b;
    expect(
      extractBytes(bytes, { source: "gif-trailer", encoding: "raw" }).text,
    ).toBe("outside");
  });
  it("traverses GIF87a local palettes and multiple images", () => {
    const bytes = gif();
    bytes.set(ascii("GIF87a"));
    const image = bytes.slice(19, -1);
    image[9] = 0x80;
    const local = join(
      image.subarray(0, 10),
      new Uint8Array([0x3b, 0, 0, 0, 0, 0]),
      image.subarray(10),
    );
    const input = join(
      bytes.subarray(0, 19),
      local,
      local,
      new Uint8Array([0x3b]),
      ascii("ok"),
    );
    expect(
      extractBytes(input, { source: "gif-trailer", encoding: "raw" }).text,
    ).toBe("ok");
  });
  it("rejects every truncated GIF prefix and malformed blocks", () => {
    const bytes = gif();
    for (let end = 0; end < bytes.length; end++)
      expect(() =>
        extractBytes(bytes.subarray(0, end), {
          source: "gif-trailer",
          encoding: "raw",
        }),
      ).toThrow();
    for (const extra of [
      new Uint8Array([0x3b]),
      new Uint8Array([0xff]),
      new Uint8Array([0x21, 0xfd]),
      new Uint8Array([0x21, 0xf9, 3]),
      new Uint8Array([0x21, 0xfe, 255]),
    ]) {
      expect(() =>
        extractBytes(gif(ascii("x"), extra), {
          source: "gif-trailer",
          encoding: "raw",
        }),
      ).toThrow();
    }
    for (const [offset, value] of [
      [6, 0],
      [24, 2],
      [29, 1],
      [30, 0],
    ]) {
      const broken = gif(ascii("x"));
      broken[offset] = value;
      expect(() =>
        extractBytes(broken, { source: "gif-trailer", encoding: "raw" }),
      ).toThrow();
    }
  });
});

describe("BMP sentinels", () => {
  const options: ExtractionOptions = {
    source: "bmp-sentinels",
    encoding: "raw",
  };
  it.each([1, 2, 4, 11, 32])(
    "decodes %i bytes, always as bits regardless of encoding",
    (length) => {
      const expected = Uint8Array.from({ length }, (_, i) => 128 + i);
      const input = bmp(sentinels(bits(expected, 0x16, 0x17)), true);
      for (const encoding of ["raw", "ascii-bits", "base64"] as const)
        expect(extractBytes(input, { ...options, encoding }).bytes).toEqual(
          expected,
        );
    },
  );
  it("uses the first pair of non-overlapping sentinels, not later candidates", () => {
    const stream = join(
      sentinels(bits(new Uint8Array([65]), 0x16, 0x17)),
      sentinels(bits(new Uint8Array([66]), 0x16, 0x17)),
    );
    expect(extractBytes(bmp(stream), options).text).toBe("A");
    // The third zero belongs to the symbols, not an overlapping second sentinel.
    const zeros = join(
      new Uint8Array([0, 0]),
      new Uint8Array([0, 1, 1, 1, 1, 1, 1, 1]),
      new Uint8Array(2),
    );
    expect(
      extractBytes(bmp(zeros), { ...options, zero: 0, one: 1 }).bytes,
    ).toEqual(new Uint8Array([127]));
    expect(() => extractBytes(bmp(new Uint8Array(8)), options)).toThrow(
      /No payload/,
    );
  });
  it("supports custom symbols, LSB order and explicit insertion without implicit correction", () => {
    const input = bmp(sentinels(new Uint8Array([5, 9, 9, 9, 9, 9, 9])));
    expect(() => extractBytes(input, { ...options, zero: 5, one: 9 })).toThrow(
      /8-bit/,
    );
    expect(
      extractBytes(input, {
        ...options,
        zero: 5,
        one: 9,
        insertAt: 0,
        insertBit: 1,
        bitOrder: "lsb",
      }).bytes,
    ).toEqual(new Uint8Array([253]));
    expect(
      extractBytes(input, { ...options, zero: 5, one: 9, insertAt: 7 }).bytes,
    ).toEqual(new Uint8Array([126]));
  });
  it.each([
    [3, 3],
    [-1, 2],
    [0, 256],
    [0.5, 2],
    [NaN, 2],
  ])("rejects invalid symbols %s/%s", (zero, one) => {
    expect(() =>
      extractBytes(bmp(sentinels(new Uint8Array(8).fill(3))), {
        ...options,
        zero,
        one,
      }),
    ).toThrow(/distinct byte/);
  });
  it("rejects unknown symbols and incomplete streams", () => {
    expect(() =>
      extractBytes(bmp(sentinels(new Uint8Array(8).fill(0x18))), options),
    ).toThrow(/Invalid bit symbol/);
    expect(() =>
      extractBytes(bmp(sentinels(new Uint8Array(9).fill(0x16))), options),
    ).toThrow(/8-bit/);
  });
  it("excludes palette and file trailer, but includes row padding", () => {
    const withoutSecond = bmp(
      join(new Uint8Array(2), new Uint8Array(8).fill(0x17)),
    );
    expect(() =>
      extractBytes(join(withoutSecond, new Uint8Array(2)), options),
    ).toThrow(/No payload/);
    const onlyPalette = bmp(new Uint8Array(16).fill(0x17));
    expect(() => extractBytes(onlyPalette, options)).toThrow(/No payload/);
    const padding = bmp(join(new Uint8Array(2), new Uint8Array(8).fill(0x17)));
    padding.fill(0, padding.length - 2);
    expect(extractBytes(padding, options).bytes).toEqual(new Uint8Array([255]));
  });
  it("checks BMP header, palette, dimensions and declared pixel bounds", () => {
    const good = bmp(sentinels(new Uint8Array(8).fill(0x17)));
    for (const size of [0, 2, 20, 53, 54, good.length - 1])
      expect(() => extractBytes(good.subarray(0, size), options)).toThrow();
    const edits: [number, number, 2 | 4][] = [
      [2, good.length + 1, 4],
      [2, good.length - 1, 4],
      [10, 54, 4],
      [14, 39, 4],
      [14, 0xffffffff, 4],
      [18, 0, 4],
      [22, 0, 4],
      [26, 2, 2],
      [28, 24, 2],
      [30, 1, 4],
      [34, 1, 4],
      [46, 257, 4],
      [6, 1, 2],
      [10, 0xffffffff, 4],
    ];
    for (const [offset, value, width] of edits) {
      const bytes = good.slice();
      if (width === 2) dataView(bytes).setUint16(offset, value, true);
      else dataView(bytes).setUint32(offset, value, true);
      expect(() => extractBytes(bytes, options)).toThrow();
    }
    dataView(good).setUint32(34, 0, true);
    expect(extractBytes(good, options).bytes).toEqual(new Uint8Array([255]));
  });
  it("accepts a smaller declared palette when the offset covers it", () => {
    const input = bmp(sentinels(new Uint8Array(8).fill(1)));
    dataView(input).setUint32(46, 2, true);
    expect(extractBytes(input, { ...options, zero: 0, one: 1 }).bytes).toEqual(
      new Uint8Array([255]),
    );
  });
});

describe("limits and runtime option validation", () => {
  it("enforces the input ceiling and accepts exactly 32 MiB", () => {
    expect(() =>
      extractBytes(new Uint8Array(32 * MiB + 1), {
        source: "png-trailer",
        encoding: "raw",
      }),
    ).toThrow(/32 MiB/);
    const payload = new Uint8Array(32 * MiB - gif().length).fill(32);
    payload.set(ascii("YQ=="));
    expect(
      extractBytes(gif(payload), { source: "gif-trailer", encoding: "base64" })
        .text,
    ).toBe("a");
  });
  it("caps decoded ASCII bits and BMP symbols before allocating output", () => {
    const symbols = new Uint8Array(MiB * 8).fill(0x31);
    expect(
      extractBytes(gif(symbols), {
        source: "gif-trailer",
        encoding: "ascii-bits",
      }).bytes.length,
    ).toBe(MiB);
    expect(() =>
      extractBytes(gif(join(symbols, ascii("00000000"))), {
        source: "gif-trailer",
        encoding: "ascii-bits",
      }),
    ).toThrow(/1 MiB/);
    symbols.fill(0x17);
    expect(
      extractBytes(bmp(sentinels(symbols)), {
        source: "bmp-sentinels",
        encoding: "raw",
      }).bytes.length,
    ).toBe(MiB);
    expect(() =>
      extractBytes(
        bmp(sentinels(join(symbols, new Uint8Array(8).fill(0x17)))),
        { source: "bmp-sentinels", encoding: "raw" },
      ),
    ).toThrow(/1 MiB/);
    expect(() =>
      extractBytes(bmp(sentinels(symbols)), {
        source: "bmp-sentinels",
        encoding: "raw",
        insertAt: 0,
      }),
    ).toThrow(/1 MiB/);
  });
  it("caps decoded Base64 rather than its encoded size", () => {
    const encodeZeros = (length: number) =>
      ascii(
        "AAAA".repeat(Math.floor(length / 3)) +
          (length % 3 === 1 ? "AA==" : length % 3 === 2 ? "AAA=" : ""),
      );
    expect(
      extractBytes(png(encodeZeros(MiB)), {
        source: "png-trailer",
        encoding: "base64",
      }).bytes.length,
    ).toBe(MiB);
    expect(() =>
      extractBytes(png(encodeZeros(MiB + 1)), {
        source: "png-trailer",
        encoding: "base64",
      }),
    ).toThrow(/1 MiB/);
  });
  it("rejects unknown runtime source, encoding, bit order and insertion bit", () => {
    const input = gif(ascii("00000000"));
    for (const options of [
      { source: "other", encoding: "raw" },
      { source: "gif-trailer", encoding: "other" },
      { source: "gif-trailer", encoding: "ascii-bits", bitOrder: "other" },
      { source: "gif-trailer", encoding: "ascii-bits", insertBit: 2 },
    ])
      expect(() => extractBytes(input, options as ExtractionOptions)).toThrow();
  });
});
