import { deflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { decodeRawPNG } from "../src/raw-png";

const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const hidden = [1, 2, 3, 0, 101, 51, 201, 128];
const join = (...parts: Uint8Array[]) => {
  const bytes = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
};
// Independent bit-at-a-time CRC, not the decoder's lookup-table implementation.
function chunk(type: string, payload = new Uint8Array()) {
  const result = new Uint8Array(payload.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, payload.length);
  result.set(
    Array.from(type, (char) => char.charCodeAt(0)),
    4,
  );
  result.set(payload, 8);
  let crc = 0xffffffff;
  for (const value of result.subarray(4, -4)) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0);
  return result;
}
function header(width = 2, height = 1, type = 6, depth = 8, interlace = 0) {
  const bytes = new Uint8Array(13);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  bytes.set([depth, type, 0, 0, interlace], 8);
  return chunk("IHDR", bytes);
}
const end = () => chunk("IEND");
const idat = (raw: number[] | Uint8Array) =>
  chunk("IDAT", deflateSync(new Uint8Array(raw)));
const png = (
  raw: number[] = [0, ...hidden],
  type = 6,
  extras: Uint8Array[] = [],
  width = 2,
  height = 1,
) => join(signature, header(width, height, type), ...extras, idat(raw), end());
const palette = () => chunk("PLTE", new Uint8Array([1, 2, 3, 101, 51, 201]));
const trns = (...bytes: number[]) => chunk("tRNS", new Uint8Array(bytes));
const customPNG = (
  width: number,
  height: number,
  type: number,
  depth: number,
  interlace: number,
  raw: number[],
  extras: Uint8Array[] = [],
) =>
  join(
    signature,
    header(width, height, type, depth, interlace),
    ...extras,
    idat(raw),
    end(),
  );

function filterRows(rows: number[][], bpp: number, filter: number) {
  const raw: number[] = [];
  rows.forEach((row, y) => {
    raw.push(filter);
    row.forEach((sample, x) => {
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = y ? rows[y - 1][x] : 0;
      const diagonal = y && x >= bpp ? rows[y - 1][x - bpp] : 0;
      const p = left + up - diagonal;
      const distances = [
        Math.abs(p - left),
        Math.abs(p - up),
        Math.abs(p - diagonal),
      ];
      const prediction = [
        0,
        left,
        up,
        Math.floor((left + up) / 2),
        [left, up, diagonal][distances.indexOf(Math.min(...distances))],
      ][filter];
      raw.push((sample - prediction + 256) % 256);
    });
  });
  return raw;
}

describe("raw PNG sample decoding", () => {
  it("preserves fully hidden RGB and semitransparent samples exactly, without DOM", async () => {
    const source = png();
    const before = source.slice();
    const result = await decodeRawPNG(source);
    expect(result).toEqual({
      width: 2,
      height: 1,
      rgba: new Uint8ClampedArray(hidden),
    });
    expect(source).toEqual(before);
    expect(result.rgba.buffer).not.toBe(source.buffer);
  });

  it.each([0, 1, 2, 3, 4])(
    "reverses filter %i with left, upper and diagonal neighbors",
    async (filter) => {
      const rows = [
        hidden,
        [254, 1, 99, 255, 13, 211, 5, 0],
        [77, 88, 99, 0, 1, 2, 3, 4],
      ];
      expect(
        (await decodeRawPNG(png(filterRows(rows, 4, filter), 6, [], 2, 3)))
          .rgba,
      ).toEqual(new Uint8ClampedArray(rows.flat()));
    },
  );

  it.each([
    {
      type: 0,
      samples: [9, 77],
      extras: [],
      expected: [9, 9, 9, 255, 77, 77, 77, 255],
    },
    {
      type: 0,
      samples: [9, 77],
      extras: [trns(0, 9)],
      expected: [9, 9, 9, 0, 77, 77, 77, 255],
    },
    {
      type: 2,
      samples: [1, 2, 3, 101, 51, 201],
      extras: [],
      expected: [1, 2, 3, 255, 101, 51, 201, 255],
    },
    {
      type: 2,
      samples: [1, 2, 3, 101, 51, 201],
      extras: [trns(0, 1, 0, 2, 0, 3)],
      expected: [1, 2, 3, 0, 101, 51, 201, 255],
    },
    {
      type: 4,
      samples: [9, 0, 77, 128],
      extras: [],
      expected: [9, 9, 9, 0, 77, 77, 77, 128],
    },
    {
      type: 3,
      samples: [0, 1],
      extras: [palette()],
      expected: [1, 2, 3, 255, 101, 51, 201, 255],
    },
    {
      type: 3,
      samples: [0, 1],
      extras: [palette(), trns(0)],
      expected: [1, 2, 3, 0, 101, 51, 201, 255],
    },
    {
      type: 3,
      samples: [0, 1],
      extras: [palette(), trns(0, 128)],
      expected: hidden,
    },
  ])(
    "decodes color type $type / transparency $extras",
    async ({ type, samples, extras, expected }) => {
      const bpp = samples.length / 2;
      for (let filter = 0; filter < 5; filter++) {
        const result = await decodeRawPNG(
          png(filterRows([samples, samples], bpp, filter), type, extras, 2, 2),
        );
        expect(result.rgba).toEqual(
          new Uint8ClampedArray([...expected, ...expected]),
        );
      }
    },
  );

  it("accepts contiguous IDAT split at every compressed byte, including empty chunks", async () => {
    const compressed = deflateSync(new Uint8Array([0, ...hidden]));
    const source = join(
      signature,
      header(),
      chunk("IDAT"),
      ...Array.from(compressed, (value) =>
        chunk("IDAT", new Uint8Array([value])),
      ),
      chunk("IDAT"),
      end(),
    );
    expect((await decodeRawPNG(source)).rgba).toEqual(
      new Uint8ClampedArray(hidden),
    );
  });

  it("accepts ancillary chunks without applying gamma/color transforms, and buffer offsets", async () => {
    const file = png([0, ...hidden], 6, [
      chunk("gAMA", new Uint8Array([0, 0, 177, 143])),
      chunk("tEXt", new Uint8Array([65, 0, 66])),
    ]);
    const wrapped = join(new Uint8Array(13), file, new Uint8Array(7));
    expect(
      (await decodeRawPNG(wrapped.subarray(13, 13 + file.length))).rgba,
    ).toEqual(new Uint8ClampedArray(hidden));
  });

  it("snapshots mutable input before yielding into asynchronous decompression", async () => {
    const source = png();
    const decoding = decodeRawPNG(source);
    source.fill(0);
    expect((await decoding).rgba).toEqual(new Uint8ClampedArray(hidden));
  });

  it.each([
    [1, 5, [0x58], [0, 255, 0, 255, 255]],
    [2, 4, [0x1b], [0, 85, 170, 255]],
    [4, 4, [0x05, 0xaf], [0, 85, 170, 255]],
  ])(
    "expands packed grayscale depth %i MSB-first samples",
    async (depth, width, bytes, samples) => {
      const result = await decodeRawPNG(
        customPNG(width, 1, 0, depth, 0, [0, ...bytes]),
      );
      expect(Array.from(result.rgba)).toEqual(
        samples.flatMap((value) => [value, value, value, 255]),
      );
    },
  );

  it("uses the high byte of big-endian 16-bit RGBA samples", async () => {
    const result = await decodeRawPNG(
      customPNG(
        2,
        1,
        6,
        16,
        0,
        [
          0, 0x12, 0x34, 0xab, 0xcd, 0xef, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
          0x07, 0x08, 0x09, 0x0a, 0x0b,
        ],
      ),
    );
    expect(Array.from(result.rgba)).toEqual([
      0x12, 0xab, 0xef, 0x02, 0x04, 0x06, 0x08, 0x0a,
    ]);
  });

  it("reassembles Adam7 passes into their original pixel coordinates", async () => {
    // 3×3 grayscale image, values 1..9 in row-major order. Empty passes are omitted.
    const adam7 = [
      0,
      1, // pass 1: (0,0)
      0,
      3, // pass 4: (2,0)
      0,
      7,
      9, // pass 5: (0,2), (2,2)
      0,
      2,
      0,
      8, // pass 6: (1,0), (1,2)
      0,
      4,
      5,
      6, // pass 7: row 1
    ];
    const result = await decodeRawPNG(customPNG(3, 3, 0, 8, 1, adam7));
    expect(Array.from(result.rgba)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((value) => [
        value,
        value,
        value,
        255,
      ]),
    );
  });
});

describe("PNG structural validation and bounded decompression", () => {
  it.each([1, 2, 4])(
    "rejects depth %i when it is illegal for RGBA",
    async (depth) => {
      await expect(
        decodeRawPNG(
          join(signature, header(2, 1, 6, depth), idat([0, ...hidden]), end()),
        ),
      ).rejects.toThrow(/bit depth.*color type/i);
    },
  );

  it.each([
    [0, 1],
    [1, 0],
    [16385, 1],
    [1, 16385],
    [4097, 4096],
    [0xffffffff, 0xffffffff],
  ])(
    "rejects invalid dimensions %i x %i before inflate",
    async (width, height) => {
      await expect(
        decodeRawPNG(join(signature, header(width, height), idat([0]), end())),
      ).rejects.toThrow(/dimensions/);
    },
  );
  it("accepts the side boundary for a thin image", async () => {
    const result = await decodeRawPNG(
      join(signature, header(16384, 1, 0), idat(new Uint8Array(16385)), end()),
    );
    expect(result.rgba.length).toBe(16384 * 4);
    expect(result.rgba[3]).toBe(255);
  });
  it("rejects input beyond 32 MiB", async () => {
    await expect(
      decodeRawPNG(new Uint8Array(32 * 1024 * 1024 + 1)),
    ).rejects.toThrow(/32 MiB/);
  });
  it("validates signature, type and every truncation prefix", async () => {
    const source = png();
    await expect(decodeRawPNG(new Uint8Array(8))).rejects.toThrow(/signature/);
    await expect(decodeRawPNG([] as unknown as Uint8Array)).rejects.toThrow(
      /Uint8Array/,
    );
    for (let i = 0; i < source.length; i++)
      await expect(decodeRawPNG(source.subarray(0, i))).rejects.toThrow();
  });
  it.each(["IHDR", "IDAT", "IEND", "tEXt"])("checks %s CRC", async (type) => {
    const damaged =
      type === "IHDR"
        ? header()
        : type === "IDAT"
          ? idat([0, ...hidden])
          : chunk(type);
    damaged[damaged.length - 1] ^= 1;
    const parts =
      type === "IHDR"
        ? [damaged, idat([0, ...hidden]), end()]
        : type === "IDAT"
          ? [header(), damaged, end()]
          : type === "IEND"
            ? [header(), idat([0, ...hidden]), damaged]
            : [header(), damaged, idat([0, ...hidden]), end()];
    await expect(decodeRawPNG(join(signature, ...parts))).rejects.toThrow(
      /CRC/,
    );
  });
  it.each([
    ["IHDR not first", [chunk("tEXt"), header(), idat([0]), end()]],
    ["duplicate IHDR", [header(), header(), idat([0]), end()]],
    ["missing IDAT", [header(), end()]],
    [
      "nonconsecutive IDAT",
      [header(), idat([0]), chunk("tEXt"), chunk("IDAT"), end()],
    ],
    ["late PLTE", [header(), idat([0]), palette(), end()]],
    ["duplicate PLTE", [header(), palette(), palette(), idat([0]), end()]],
    ["late tRNS", [header(2, 1, 2), idat([0]), trns(0, 1, 0, 2, 0, 3), end()]],
    [
      "duplicate tRNS",
      [header(2, 1, 0), trns(0, 1), trns(0, 2), idat([0]), end()],
    ],
    [
      "PLTE after tRNS",
      [header(2, 1, 2), trns(0, 1, 0, 2, 0, 3), palette(), idat([0]), end()],
    ],
    ["late gAMA", [header(), palette(), chunk("gAMA"), idat([0]), end()]],
    ["late pHYs", [header(), idat([0]), chunk("pHYs"), end()]],
    [
      "hIST before PLTE",
      [header(), chunk("hIST"), palette(), idat([0]), end()],
    ],
    ["unknown critical", [header(), chunk("TEST"), idat([0]), end()]],
    ["invalid reserved letter", [header(), chunk("abca"), idat([0]), end()]],
    ["invalid type character", [header(), chunk("a1Aa"), idat([0]), end()]],
    [
      "nonempty IEND",
      [header(), idat([0]), chunk("IEND", new Uint8Array([0]))],
    ],
    ["animated PNG", [header(), chunk("acTL"), idat([0]), end()]],
  ])("rejects %s", async (_label, parts) => {
    await expect(
      decodeRawPNG(join(signature, ...(parts as Uint8Array[]))),
    ).rejects.toThrow();
  });
  it("rejects trailing data, duplicate IEND and forged chunk lengths", async () => {
    await expect(
      decodeRawPNG(join(png(), new Uint8Array([0]))),
    ).rejects.toThrow(/Trailing/);
    await expect(decodeRawPNG(join(png(), end()))).rejects.toThrow(/Trailing/);
    const broken = png();
    new DataView(broken.buffer).setUint32(8, 0xffffffff);
    await expect(decodeRawPNG(broken)).rejects.toThrow(/length/);
  });
  it.each([
    [0, [palette()]],
    [4, [palette()]],
    [3, []],
    [3, [trns(0), palette()]],
    [3, [chunk("PLTE")]],
    [3, [chunk("PLTE", new Uint8Array(4))]],
    [3, [chunk("PLTE", new Uint8Array(771))]],
    [3, [palette(), trns()]],
    [3, [palette(), trns(0, 1, 2)]],
    [0, [trns(0)]],
    [0, [trns(1, 0)]],
    [2, [trns(0, 1)]],
    [2, [trns(0, 1, 0, 2, 1, 0)]],
    [4, [trns(0, 1)]],
    [6, [trns(0, 1)]],
  ])("rejects invalid PLTE/tRNS for color %i (%j)", async (type, extras) => {
    await expect(
      decodeRawPNG(png([0, 0, 1], type as number, extras as Uint8Array[])),
    ).rejects.toThrow();
  });
  it("rejects palette index beyond PLTE", async () => {
    await expect(decodeRawPNG(png([0, 0, 2], 3, [palette()]))).rejects.toThrow(
      /palette index/,
    );
  });
  it("rejects unknown color, compression and filter methods", async () => {
    await expect(
      decodeRawPNG(join(signature, header(2, 1, 5), idat([0]), end())),
    ).rejects.toThrow(/color type/);
    for (const offset of [10, 11]) {
      const payload = header().slice(8, 21);
      payload[offset] = 1;
      await expect(
        decodeRawPNG(join(signature, chunk("IHDR", payload), idat([0]), end())),
      ).rejects.toThrow(/method/);
    }
  });
  it("rejects invalid scanline filter, short and overlong scanlines", async () => {
    await expect(decodeRawPNG(png([5, ...hidden]))).rejects.toThrow(/filter/);
    await expect(decodeRawPNG(png([0, ...hidden.slice(1)]))).rejects.toThrow(
      /Truncated/,
    );
    await expect(decodeRawPNG(png([0, ...hidden, 0]))).rejects.toThrow(
      /exceeds/,
    );
  });
  it("rejects corrupt/truncated deflate and zlib checksums", async () => {
    const compressed = deflateSync(new Uint8Array([0, ...hidden]));
    const bad = compressed.slice();
    bad[bad.length - 1] ^= 1;
    for (const payload of [
      new Uint8Array(),
      new Uint8Array([1, 2, 3]),
      compressed.subarray(0, -1),
      bad,
    ])
      await expect(
        decodeRawPNG(join(signature, header(), chunk("IDAT", payload), end())),
      ).rejects.toThrow();
  });
  it("caps a real zlib decompression bomb to the expected nine scanline bytes", async () => {
    const bomb = join(
      signature,
      header(),
      idat(new Uint8Array(4 * 1024 * 1024)),
      end(),
    );
    expect(bomb.length).toBeLessThan(8192);
    await expect(decodeRawPNG(bomb)).rejects.toThrow(/exceeds expected/);
  });
  it("cancels the output reader on overflow before allocating RGBA", async () => {
    const cancel = vi.fn();
    const fake = class {
      readable = new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(10));
        },
        cancel,
      });
      writable = new WritableStream();
    };
    vi.stubGlobal("DecompressionStream", fake);
    try {
      await expect(decodeRawPNG(png())).rejects.toThrow(/exceeds expected/);
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("detects absent native decompression instead of falling back to canvas", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    try {
      await expect(decodeRawPNG(png())).rejects.toThrow(/unavailable/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("PNG cancellation and incremental scanline boundaries", () => {
  it("honors pre-cancel and cancellation between parse phases", async () => {
    await expect(decodeRawPNG(png(), () => false)).rejects.toMatchObject({
      name: "AbortError",
    });
    let current = true;
    const pending = decodeRawPNG(png(), () => current);
    current = false;
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("decodes inflated chunks split at every byte", async () => {
    // Use a valid two-row filter stream, delivered one byte per read.
    const encoded = filterRows([hidden, hidden], 4, 4);
    const fake = class {
      readable = new ReadableStream({
        start(c) {
          for (const byte of encoded) c.enqueue(new Uint8Array([byte]));
          c.close();
        },
      });
      writable = new WritableStream();
    };
    vi.stubGlobal("DecompressionStream", fake);
    try {
      expect((await decodeRawPNG(png(encoded, 6, [], 2, 2))).rgba).toEqual(
        new Uint8ClampedArray([...hidden, ...hidden]),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("yields and cancels inside a large batch of scanlines", async () => {
    let current = true;
    const cancel = vi.fn();
    const raw = new Uint8Array(9 * 2048);
    const fake = class {
      readable = new ReadableStream({
        start(c) {
          c.enqueue(raw);
          setTimeout(() => {
            current = false;
          }, 0);
        },
        cancel,
      });
      writable = new WritableStream();
    };
    vi.stubGlobal("DecompressionStream", fake);
    try {
      await expect(
        decodeRawPNG(png([0], 6, [], 2, 2048), () => current),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
