import { describe, expect, it } from "vitest";
import { extractExifThumbnail } from "../src/exif-thumbnail";

const join = (...parts: Uint8Array[]) => {
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
};
const segment = (marker: number, payload: Uint8Array) =>
  join(
    new Uint8Array([
      0xff,
      marker,
      (payload.length + 2) >>> 8,
      (payload.length + 2) & 255,
    ]),
    payload,
  );

// A complete baseline 1x1 grayscale JPEG, not a signature-only placeholder.
// A single zero DC coefficient and EOB use one zero bit each, then six pad bits.
export function makeThumbnailJpeg(): Uint8Array {
  const table = new Uint8Array(65).fill(1);
  table[0] = 0;
  const huffman = (kind: number) =>
    new Uint8Array([kind, 1, ...Array<number>(15).fill(0), 0]);
  return join(
    new Uint8Array([0xff, 0xd8]),
    segment(0xdb, table),
    segment(0xc0, new Uint8Array([8, 0, 1, 0, 1, 1, 1, 0x11, 0])),
    segment(0xc4, join(huffman(0), huffman(0x10))),
    segment(0xda, new Uint8Array([1, 1, 0, 0, 63, 0])),
    new Uint8Array([0x3f, 0xff, 0xd9]),
  );
}

export function makeExifThumbnailFixture(little = true) {
  const thumbnail = makeThumbnailJpeg();
  const tiff = new Uint8Array(56 + thumbnail.length);
  const view = new DataView(tiff.buffer);
  const u16 = (at: number, value: number) => view.setUint16(at, value, little);
  const u32 = (at: number, value: number) => view.setUint32(at, value, little);
  tiff.set(little ? [0x49, 0x49] : [0x4d, 0x4d]);
  u16(2, 42);
  u32(4, 8);
  u16(8, 0); // IFD0
  u32(10, 14); // IFD1
  u16(14, 3);
  const entry = (at: number, tag: number, type: number, value: number) => {
    u16(at, tag);
    u16(at + 2, type);
    u32(at + 4, 1);
    if (type === 3) u16(at + 8, value);
    else u32(at + 8, value);
  };
  entry(16, 0x0103, 3, 6);
  entry(28, 0x0201, 4, 56);
  entry(40, 0x0202, 4, thumbnail.length);
  u32(52, 0);
  tiff.set(thumbnail, 56);
  const app1 = () =>
    segment(0xe1, join(new Uint8Array([69, 120, 105, 102, 0, 0]), tiff));
  const jpeg = () => {
    const outer = makeThumbnailJpeg();
    return join(outer.subarray(0, 2), app1(), outer.subarray(2));
  };
  return { tiff, thumbnail, u16, u32, app1, jpeg, offset: 2 + 4 + 6 + 56 };
}

const status = (bytes: Uint8Array) => {
  const result = extractExifThumbnail(bytes);
  if (result.status !== "found")
    expect(result.reason.length).toBeGreaterThan(0);
  return result.status;
};

describe("safe EXIF JPEG thumbnail extraction", () => {
  it.each([true, false])(
    "extracts the exact IFD1 range (little endian: %s)",
    (little) => {
      const f = makeExifThumbnailFixture(little);
      const source = f.jpeg();
      const original = source.slice();
      const result = extractExifThumbnail(source);
      expect(result).toEqual({
        status: "found",
        bytes: f.thumbnail,
        offset: f.offset,
        length: f.thumbnail.length,
      });
      expect(source).toEqual(original);
      if (result.status === "found") {
        expect(result.bytes.buffer).not.toBe(source.buffer);
        result.bytes[0] = 0;
        expect(source).toEqual(original);
      }
    },
  );

  it("uses Uint8Array-relative offsets, even for an unaligned subarray", () => {
    const f = makeExifThumbnailFixture(false);
    const jpeg = f.jpeg();
    const backing = new Uint8Array(jpeg.length + 37).fill(0x42);
    backing.set(jpeg, 13);
    const result = extractExifThumbnail(backing.subarray(13, 13 + jpeg.length));
    expect(result).toEqual({
      status: "found",
      bytes: f.thumbnail,
      offset: f.offset,
      length: f.thumbnail.length,
    });
  });

  it.each([
    new Uint8Array(),
    new Uint8Array([0xff]),
    new Uint8Array([137, 80, 78, 71]),
    new TextEncoder().encode("Exif\0\0not jpeg"),
  ])("reports non-JPEG inputs as unsupported", (bytes) => {
    expect(status(bytes)).toBe("unsupported");
  });

  it("reports absent EXIF, absent IFD1, and absent thumbnail tags", () => {
    expect(status(makeThumbnailJpeg())).toBe("absent");
    const noIfd1 = makeExifThumbnailFixture();
    noIfd1.u32(10, 0);
    expect(status(noIfd1.jpeg())).toBe("absent");
    const noTags = makeExifThumbnailFixture();
    noTags.u16(16, 0x0110);
    noTags.u16(28, 0x0111);
    noTags.u16(40, 0x0112);
    expect(status(noTags.jpeg())).toBe("absent");
  });

  it("skips XMP/non-EXIF APP1 and other length-delimited segments", () => {
    const f = makeExifThumbnailFixture();
    const image = f.jpeg();
    const prefix = join(
      segment(0xe1, new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0")),
      segment(0xfe, f.thumbnail),
    );
    const result = extractExifThumbnail(
      join(image.subarray(0, 2), prefix, image.subarray(2)),
    );
    expect(result).toEqual({
      status: "found",
      bytes: f.thumbnail,
      offset: f.offset + prefix.length,
      length: f.thumbnail.length,
    });
  });

  it("allows marker fill bytes and standalone TEM", () => {
    const f = makeExifThumbnailFixture();
    const image = f.jpeg();
    const result = extractExifThumbnail(
      join(
        image.subarray(0, 2),
        new Uint8Array([0xff, 0x01, 0xff]),
        image.subarray(2),
      ),
    );
    expect(result.status).toBe("found");
  });

  it("does not carve signatures, parse entropy as APP1, or use trailing EXIF", () => {
    const f = makeExifThumbnailFixture();
    f.u32(10, 0);
    expect(status(f.jpeg())).toBe("absent");
    const fakeScan = join(
      new Uint8Array([0xff, 0xd8]),
      segment(0xda, new Uint8Array([1, 1, 0, 0, 63, 0])),
      makeExifThumbnailFixture().app1(),
      new Uint8Array([0xff, 0xd9]),
    );
    expect(status(fakeScan)).toBe("absent");
    expect(
      status(
        join(
          new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
          makeExifThumbnailFixture().app1(),
        ),
      ),
    ).toBe("absent");
  });

  it.each([1, 5, 7, 32773])(
    "never substitutes the original for non-JPEG compression %i",
    (compression) => {
      const f = makeExifThumbnailFixture();
      f.u16(24, compression);
      expect(status(f.jpeg())).toBe("unsupported");
    },
  );

  it.each([16, 28, 40])("rejects missing required tag at %i", (at) => {
    const f = makeExifThumbnailFixture();
    f.u16(at, 0x9999);
    expect(status(f.jpeg())).toBe("malformed");
  });

  it.each([
    [18, 4],
    [30, 3],
    [42, 3],
  ])("requires the correct scalar TIFF type at %i", (at, type) => {
    const f = makeExifThumbnailFixture(false);
    f.u16(at, type);
    expect(status(f.jpeg())).toBe("malformed");
  });

  it.each([20, 32, 44])("rejects zero/array/overflow counts at %i", (at) => {
    for (const count of [0, 2, 0xffffffff]) {
      const f = makeExifThumbnailFixture();
      f.u32(at, count);
      expect(status(f.jpeg())).toBe("malformed");
    }
  });

  it("rejects duplicate tags and ambiguous duplicate EXIF segments", () => {
    const f = makeExifThumbnailFixture();
    f.u16(40, 0x0201);
    expect(status(f.jpeg())).toBe("malformed");
    const other = makeExifThumbnailFixture();
    expect(
      status(
        join(
          new Uint8Array([0xff, 0xd8]),
          other.app1(),
          other.app1(),
          new Uint8Array([0xff, 0xd9]),
        ),
      ),
    ).toBe("malformed");
  });

  it.each([0, 1, 7, 0xfffffff0, 0xffffffff])(
    "rejects invalid IFD0 offset %i",
    (offset) => {
      const f = makeExifThumbnailFixture();
      f.u32(4, offset);
      expect(status(f.jpeg())).toBe("malformed");
    },
  );

  it.each([
    [10, 8],
    [52, 14],
    [52, 8],
  ])("rejects cyclic IFD links %i -> %i", (at, value) => {
    const f = makeExifThumbnailFixture();
    f.u32(at, value);
    expect(status(f.jpeg())).toBe("malformed");
  });

  it("rejects overlapping and truncated IFDs and huge entry tables", () => {
    for (const mutate of [
      (f: ReturnType<typeof makeExifThumbnailFixture>) => f.u32(10, 9),
      (f: ReturnType<typeof makeExifThumbnailFixture>) =>
        f.u32(10, f.tiff.length - 1),
      (f: ReturnType<typeof makeExifThumbnailFixture>) => f.u16(14, 100),
      (f: ReturnType<typeof makeExifThumbnailFixture>) => f.u16(14, 0xffff),
      (f: ReturnType<typeof makeExifThumbnailFixture>) => f.u32(52, 0xffffffff),
    ]) {
      const f = makeExifThumbnailFixture();
      mutate(f);
      expect(status(f.jpeg())).toBe("malformed");
    }
  });

  it.each([
    [36, 0xfffffff0],
    [48, 0xffffffff],
    [36, 0],
    [48, 0],
    [48, 3],
  ])("rejects overflow/header/empty thumbnail range at %i", (at, value) => {
    const f = makeExifThumbnailFixture();
    f.u32(at, value);
    expect(status(f.jpeg())).toBe("malformed");
  });

  it("rejects TIFF directory and thumbnail ranges crossing this APP1", () => {
    const f = makeExifThumbnailFixture();
    f.u32(36, f.tiff.length + 6);
    const image = join(
      new Uint8Array([0xff, 0xd8]),
      f.app1(),
      segment(0xe2, f.thumbnail),
      new Uint8Array([0xff, 0xd9]),
    );
    expect(status(image)).toBe("malformed");
    const directory = makeExifThumbnailFixture();
    directory.u32(10, directory.tiff.length + 6);
    expect(
      status(
        join(
          new Uint8Array([0xff, 0xd8]),
          directory.app1(),
          segment(0xe2, directory.tiff.subarray(14)),
          new Uint8Array([0xff, 0xd9]),
        ),
      ),
    ).toBe("malformed");
    const partial = makeExifThumbnailFixture();
    partial.u32(48, partial.thumbnail.length + 1);
    expect(status(partial.jpeg())).toBe("malformed");
  });

  it("rejects out-of-line field crossings even for unrelated IFD tags", () => {
    const f = makeExifThumbnailFixture();
    f.u16(16, 0x9999);
    f.u16(18, 2);
    f.u32(20, 20);
    f.u32(24, f.tiff.length - 2);
    expect(status(f.jpeg())).toBe("malformed");
  });

  it.each([0, 1, -2, -1])(
    "requires thumbnail SOI and EOI (damaged byte %i)",
    (at) => {
      const f = makeExifThumbnailFixture();
      f.tiff[at < 0 ? f.tiff.length + at : 56 + at] = 0;
      expect(status(f.jpeg())).toBe("malformed");
    },
  );

  it("rejects invalid TIFF byte order and magic, but identifies BigTIFF", () => {
    const f = makeExifThumbnailFixture();
    f.tiff[0] = 0;
    expect(status(f.jpeg())).toBe("malformed");
    const magic = makeExifThumbnailFixture();
    magic.u16(2, 0);
    expect(status(magic.jpeg())).toBe("malformed");
    magic.u16(2, 43);
    expect(status(magic.jpeg())).toBe("unsupported");
  });

  it.each([
    [0xff, 0xd8],
    [0xff, 0xd8, 0xff],
    [0xff, 0xd8, 0x00],
    [0xff, 0xd8, 0xff, 0x00],
    [0xff, 0xd8, 0xff, 0xd8],
    [0xff, 0xd8, 0xff, 0xd0],
    [0xff, 0xd8, 0xff, 0xe1],
    [0xff, 0xd8, 0xff, 0xe1, 0],
    [0xff, 0xd8, 0xff, 0xe1, 0, 1],
    [0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff],
    [0xff, 0xd8, 0xff, 0xda, 0, 2],
  ])("rejects malformed JPEG framing %j", (...values) => {
    expect(status(new Uint8Array(values))).toBe("malformed");
  });

  it("rejects every truncation of the APP1 containing a thumbnail", () => {
    const f = makeExifThumbnailFixture();
    const image = f.jpeg();
    for (let end = 2; end < 2 + f.app1().length; end++)
      expect(status(image.subarray(0, end))).toBe("malformed");
  });

  it("rejects truncated TIFF headers within otherwise complete JPEG framing", () => {
    for (let length = 0; length < 8; length++) {
      const f = makeExifThumbnailFixture();
      const app1 = segment(
        0xe1,
        join(
          new Uint8Array([69, 120, 105, 102, 0, 0]),
          f.tiff.subarray(0, length),
        ),
      );
      expect(
        status(
          join(
            new Uint8Array([0xff, 0xd8]),
            app1,
            new Uint8Array([0xff, 0xd9]),
          ),
        ),
      ).toBe("malformed");
    }
  });

  it("rejects thumbnail overlap with TIFF metadata even with matching signatures", () => {
    const f = makeExifThumbnailFixture();
    // Put SOI/EOI into two otherwise ignored scalar values in a new IFD2.
    f.u32(52, 56);
    f.u16(56, 2);
    f.u16(58, 0x7777);
    f.u16(60, 4);
    f.u32(62, 1);
    f.tiff.set([0xff, 0xd8, 0, 0], 66);
    f.u16(70, 0x7778);
    f.u16(72, 4);
    f.u32(74, 1);
    f.tiff.set([0, 0, 0xff, 0xd9], 78);
    f.u32(82, 0);
    f.u32(36, 66);
    f.u32(48, 16);
    expect(status(f.jpeg())).toBe("malformed");
  });

  it("bounds long directory chains without recursion", () => {
    const tiff = new Uint8Array(8 + 65 * 6);
    const view = new DataView(tiff.buffer);
    tiff.set([0x49, 0x49, 42, 0, 8, 0, 0, 0]);
    for (let i = 0; i < 64; i++)
      view.setUint32(8 + i * 6 + 2, 8 + (i + 1) * 6, true);
    const app1 = segment(
      0xe1,
      join(new Uint8Array([69, 120, 105, 102, 0, 0]), tiff),
    );
    expect(
      status(
        join(new Uint8Array([0xff, 0xd8]), app1, new Uint8Array([0xff, 0xd9])),
      ),
    ).toBe("malformed");
  });

  it("never throws or returns out-of-bounds slices under deterministic mutation", () => {
    const original = makeExifThumbnailFixture().jpeg();
    for (let at = 0; at < original.length; at++) {
      for (const value of [0, 0xff]) {
        const bytes = original.slice();
        bytes[at] = value;
        const result = extractExifThumbnail(bytes);
        if (result.status === "found") {
          expect(result.offset).toBeGreaterThanOrEqual(0);
          expect(result.offset + result.length).toBeLessThanOrEqual(
            2 + makeExifThumbnailFixture().app1().length,
          );
          expect(result.bytes).toEqual(
            bytes.subarray(result.offset, result.offset + result.length),
          );
        } else expect(result.reason).not.toBe("");
      }
    }
  });
});
