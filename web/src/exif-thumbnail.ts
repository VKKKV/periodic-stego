export type ExifThumbnailResult =
  | { status: "found"; bytes: Uint8Array; offset: number; length: number }
  | { status: "absent" | "unsupported" | "malformed"; reason: string };

type Failure = Exclude<ExifThumbnailResult, { status: "found" }>;
type Entry = { type: number; count: number; value: number };
type Directory = {
  start: number;
  end: number;
  next: number;
  entries: Map<number, Entry>;
};

const malformed = (reason: string): Failure => ({
  status: "malformed",
  reason,
});
const absent = (reason: string): Failure => ({ status: "absent", reason });
const unsupported = (reason: string): Failure => ({
  status: "unsupported",
  reason,
});

// Classic TIFF field widths (including IFD pointers). No BigTIFF arithmetic.
const FIELD_WIDTHS = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
const MAX_DIRECTORIES = 64;
const MAX_ENTRIES = 4096;

function readExif(
  bytes: Uint8Array,
  tiffStart: number,
  app1End: number,
): ExifThumbnailResult {
  // This view deliberately excludes every byte outside this APP1 segment.
  const size = app1End - tiffStart;
  if (size < 8) return malformed("Truncated TIFF header");
  const view = new DataView(bytes.buffer, bytes.byteOffset + tiffStart, size);
  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d)
    return malformed("Invalid TIFF byte order");
  const little = order === 0x4949;
  const u16 = (offset: number) => view.getUint16(offset, little);
  const u32 = (offset: number) => view.getUint32(offset, little);
  if (u16(2) === 43) return unsupported("BigTIFF is not supported");
  if (u16(2) !== 42) return malformed("Invalid TIFF magic");
  const bounded = (offset: number, length: number) =>
    offset >= 8 && offset <= size && length <= size - offset;

  const directories: Directory[] = [];
  const visited = new Set<number>();
  // Also keep out-of-line value ranges so thumbnail bytes cannot masquerade as
  // a directory or another TIFF field's payload.
  const valueRanges: { start: number; end: number }[] = [];
  let offset = u32(4);
  let totalEntries = 0;
  if (offset === 0) return malformed("Missing IFD0");
  while (offset !== 0) {
    if (visited.has(offset)) return malformed("Cyclic TIFF directory chain");
    if (directories.length >= MAX_DIRECTORIES)
      return malformed("Too many TIFF directories");
    visited.add(offset);
    if (!bounded(offset, 2)) return malformed("IFD offset outside APP1");
    const count = u16(offset);
    totalEntries += count;
    if (totalEntries > MAX_ENTRIES) return malformed("Too many TIFF entries");
    const length = 2 + count * 12 + 4;
    if (!bounded(offset, length)) return malformed("Truncated TIFF directory");
    const end = offset + length;
    if (directories.some((d) => offset < d.end && end > d.start))
      return malformed("Overlapping TIFF directories");
    const entries = new Map<number, Entry>();
    for (let i = 0; i < count; i++) {
      const at = offset + 2 + i * 12;
      const tag = u16(at);
      const type = u16(at + 2);
      const itemCount = u32(at + 4);
      if (entries.has(tag)) return malformed("Duplicate TIFF tag");
      const width = FIELD_WIDTHS[type];
      if (!width) return unsupported("Unsupported TIFF field type");
      // JS numbers represent these products exactly; never coerce to uint32.
      const valueLength = itemCount * width;
      if (valueLength > 4) {
        const start = u32(at + 8);
        if (!bounded(start, valueLength))
          return malformed("TIFF field data outside APP1");
        valueRanges.push({ start, end: start + valueLength });
      }
      entries.set(tag, {
        type,
        count: itemCount,
        value: type === 3 ? u16(at + 8) : u32(at + 8),
      });
    }
    const next = u32(end - 4);
    directories.push({ start: offset, end, next, entries });
    offset = next;
  }
  if (
    valueRanges.some((v) =>
      directories.some((d) => v.start < d.end && v.end > d.start),
    )
  )
    return malformed("TIFF field data overlaps a directory");

  const thumbnail = directories[1];
  if (!thumbnail) return absent("No IFD1 thumbnail directory");
  const compression = thumbnail.entries.get(0x0103);
  const location = thumbnail.entries.get(0x0201);
  const length = thumbnail.entries.get(0x0202);
  if (!compression && !location && !length)
    return absent("IFD1 has no JPEG thumbnail tags");
  if (!compression) return malformed("Missing thumbnail Compression tag");
  if (compression.type !== 3 || compression.count !== 1)
    return malformed("Compression must be one SHORT");
  if (compression.value !== 6)
    return unsupported("Thumbnail compression is not JPEG (6)");
  if (!location || !length)
    return malformed("Missing JPEG thumbnail offset or length");
  if (
    location.type !== 4 ||
    location.count !== 1 ||
    length.type !== 4 ||
    length.count !== 1
  )
    return malformed("JPEG thumbnail offset and length must each be one LONG");
  if (length.value < 4 || !bounded(location.value, length.value))
    return malformed("JPEG thumbnail range outside APP1 or too short");
  const start = location.value;
  const end = start + length.value;
  if (
    directories.some((d) => start < d.end && end > d.start) ||
    valueRanges.some((v) => start < v.end && end > v.start)
  )
    return malformed("JPEG thumbnail overlaps TIFF metadata");
  const absolute = tiffStart + start;
  const absoluteEnd = tiffStart + end;
  if (
    bytes[absolute] !== 0xff ||
    bytes[absolute + 1] !== 0xd8 ||
    bytes[absoluteEnd - 2] !== 0xff ||
    bytes[absoluteEnd - 1] !== 0xd9
  )
    return malformed("JPEG thumbnail is missing SOI or EOI");
  // Copy instead of retaining the original image's potentially large buffer.
  // The decoder still has to validate the JPEG codestream and pixel dimensions.
  return {
    status: "found",
    bytes: new Uint8Array(bytes.subarray(absolute, absoluteEnd)),
    offset: absolute,
    length: length.value,
  };
}

/**
 * Extract only the explicitly referenced JPEG in EXIF IFD1. Offsets in the
 * result are relative to the supplied Uint8Array, not its underlying buffer.
 * No signature carving, image decoding, DOM access, or original-image fallback.
 * The outer JPEG is walked only up to SOS/EOI; entropy data is never metadata.
 */
export function extractExifThumbnail(bytes: Uint8Array): ExifThumbnailResult {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    return unsupported("Input is not a JPEG");
  let cursor = 2;
  let result: ExifThumbnailResult = absent("No EXIF APP1 segment");
  let sawExif = false;
  while (cursor < bytes.length) {
    if (bytes[cursor++] !== 0xff) return malformed("Expected JPEG marker");
    // JPEG permits repeated FF fill bytes before a marker code.
    while (cursor < bytes.length && bytes[cursor] === 0xff) cursor++;
    if (cursor === bytes.length) return malformed("Truncated JPEG marker");
    const marker = bytes[cursor++];
    if (marker === 0xd9) return result;
    if (
      marker === 0x00 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7)
    )
      return malformed("Invalid marker before JPEG scan");
    if (marker === 0x01) continue; // TEM has no length field.
    if (bytes.length - cursor < 2)
      return malformed("Truncated JPEG segment length");
    const length = bytes[cursor] * 256 + bytes[cursor + 1];
    if (length < 2 || length > bytes.length - cursor)
      return malformed("Invalid or truncated JPEG segment");
    const start = cursor + 2;
    const end = cursor + length;
    if (marker === 0xda) {
      // Ns, 2*Ns selector bytes, and three spectral/successive parameters.
      const components = bytes[start];
      if (
        length < 6 ||
        !components ||
        components > 4 ||
        length !== 6 + 2 * components
      )
        return malformed("Invalid JPEG SOS header");
      return result;
    }
    if (
      marker === 0xe1 &&
      end - start >= 6 &&
      bytes[start] === 0x45 &&
      bytes[start + 1] === 0x78 &&
      bytes[start + 2] === 0x69 &&
      bytes[start + 3] === 0x66 &&
      bytes[start + 4] === 0 &&
      bytes[start + 5] === 0
    ) {
      if (sawExif)
        return malformed("Multiple EXIF APP1 segments are ambiguous");
      sawExif = true;
      result = readExif(bytes, start + 6, end);
      if (result.status === "malformed") return result;
    }
    cursor = end;
  }
  return malformed("JPEG header ended before SOS or EOI");
}
