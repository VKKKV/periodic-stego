// Byte-level extraction only: PNG IDAT and GIF LZW data are not decompressed.
// Container traversal is bounded by the input; output allocations are capped.
export interface ExtractionOptions {
  source: "png-trailer" | "gif-trailer" | "bmp-sentinels";
  encoding: "raw" | "ascii-bits" | "base64";
  zero?: number;
  one?: number;
  insertAt?: number;
  insertBit?: 0 | 1;
  bitOrder?: "msb" | "lsb";
}

const MAX_FILE = 32 * 1024 * 1024;
const MAX_OUTPUT = 1024 * 1024;

function invalid(detail: string): never {
  throw new Error(`Invalid extraction: ${detail}`);
}
function noPayload(): never {
  throw new Error("No payload found.");
}
function outputLimit(size: number): void {
  if (size > MAX_OUTPUT)
    throw new Error("Payload exceeds the 1 MiB output limit.");
}
function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
function matches(bytes: Uint8Array, offset: number, value: string): boolean {
  for (let i = 0; i < value.length; i++)
    if (bytes[offset + i] !== value.charCodeAt(i)) return false;
  return true;
}

function bmpSymbols(bytes: Uint8Array): Uint8Array {
  if (!matches(bytes, 0, "BM")) invalid("Expected a BMP file.");
  if (bytes.length < 54) invalid("Truncated BMP header.");
  const d = view(bytes);
  const fileSize = d.getUint32(2, true);
  const offset = d.getUint32(10, true);
  const dibSize = d.getUint32(14, true);
  if (dibSize < 40 || dibSize > bytes.length - 14)
    invalid("Invalid BMP DIB header.");
  if (
    d.getUint16(6, true) !== 0 ||
    d.getUint16(8, true) !== 0 ||
    d.getUint16(26, true) !== 1 ||
    d.getUint16(28, true) !== 8 ||
    d.getUint32(30, true) !== 0
  )
    invalid("Expected an uncompressed 8-bit indexed BMP.");
  const width = d.getInt32(18, true);
  const height = d.getInt32(22, true);
  if (width <= 0 || height === 0) invalid("Invalid BMP dimensions.");
  const colors = d.getUint32(46, true) || 256;
  const pixelSize = Math.ceil(width / 4) * 4 * Math.abs(height);
  const declaredPixelSize = d.getUint32(34, true);
  if (
    colors > 256 ||
    offset < 14 + dibSize + colors * 4 ||
    fileSize > bytes.length ||
    !Number.isSafeInteger(pixelSize) ||
    offset > fileSize ||
    pixelSize > fileSize - offset ||
    (declaredPixelSize !== 0 && declaredPixelSize !== pixelSize)
  )
    invalid("Invalid BMP palette, pixel offset or range.");

  // File pixel order, including row padding; never palette or trailing bytes.
  // Skip the full first sentinel so overlapping zero pairs cannot match twice.
  let first = -1;
  const end = offset + pixelSize;
  for (let i = offset; i + 1 < end; i++) {
    if (bytes[i] !== 0 || bytes[i + 1] !== 0) continue;
    if (first < 0) {
      first = i;
      i++;
    } else {
      if (i === first + 2) noPayload();
      return bytes.subarray(first + 2, i);
    }
  }
  noPayload();
}

function decodeBits(
  symbols: Uint8Array,
  zero: number,
  one: number,
  options: ExtractionOptions,
): Uint8Array {
  if (
    !Number.isInteger(zero) ||
    zero < 0 ||
    zero > 255 ||
    !Number.isInteger(one) ||
    one < 0 ||
    one > 255 ||
    zero === one
  )
    invalid("Bit symbols must be distinct byte values (0–255).");
  const insertAt = options.insertAt ?? -1;
  const insertBit = options.insertBit ?? 0;
  const order = options.bitOrder ?? "msb";
  // Insertion is before the indexed bit; stream.length explicitly appends.
  if (!Number.isInteger(insertAt) || insertAt < -1 || insertAt > symbols.length)
    invalid(
      "Insertion index must be -1 or within the bit stream (including its end).",
    );
  if (insertBit !== 0 && insertBit !== 1)
    invalid("Inserted bit must be 0 or 1.");
  if (order !== "msb" && order !== "lsb")
    invalid("Bit order must be msb or lsb.");
  if (!symbols.length) noPayload();
  const length = symbols.length + (insertAt === -1 ? 0 : 1);
  outputLimit(Math.ceil(length / 8));
  if (length % 8)
    invalid(
      "Bit stream must contain complete 8-bit groups; no bits are added implicitly.",
    );
  const out = new Uint8Array(length / 8);
  function put(index: number, bit: number): void {
    out[Math.floor(index / 8)] |=
      bit << (order === "msb" ? 7 - (index % 8) : index % 8);
  }
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    if (symbol !== zero && symbol !== one)
      invalid(`Invalid bit symbol at index ${i}; expected ${zero} or ${one}.`);
    put(i + (insertAt !== -1 && i >= insertAt ? 1 : 0), symbol === one ? 1 : 0);
  }
  if (insertAt !== -1) put(insertAt, insertBit);
  return out;
}

function gifEnd(bytes: Uint8Array): number {
  if (!matches(bytes, 0, "GIF87a") && !matches(bytes, 0, "GIF89a"))
    throw new Error("Expected a GIF file.");
  if (bytes.length < 13) invalid("Truncated GIF header.");
  const d = view(bytes);
  const width = d.getUint16(6, true);
  const height = d.getUint16(8, true);
  if (!width || !height) invalid("Invalid GIF dimensions.");
  let pos = 13;
  let hasImage = false;
  function skip(count: number): void {
    if (count > bytes.length - pos) invalid("Truncated GIF block.");
    pos += count;
  }
  function subblocks(): void {
    while (pos < bytes.length) {
      const size = bytes[pos++];
      if (!size) return;
      skip(size);
    }
    invalid("Unterminated GIF subblocks.");
  }
  if (bytes[10] & 0x80) skip(3 * 2 ** ((bytes[10] & 7) + 1));
  while (pos < bytes.length) {
    const tag = bytes[pos++];
    if (tag === 0x3b) {
      if (!hasImage) invalid("GIF trailer appears before image data.");
      return pos;
    }
    if (tag === 0x21) {
      if (pos >= bytes.length) invalid("Truncated GIF extension.");
      const label = bytes[pos++];
      if (label === 0xf9) {
        if (bytes[pos] !== 4) invalid("Invalid GIF graphic control extension.");
        skip(5);
        if (bytes[pos] !== 0)
          invalid("Invalid GIF graphic control terminator.");
        skip(1);
      } else if (label === 0xfe) {
        subblocks();
      } else if (label === 0xff || label === 0x01) {
        const fixed = label === 0xff ? 11 : 12;
        if (bytes[pos] !== fixed) invalid("Invalid GIF extension header.");
        skip(fixed + 1);
        subblocks();
      } else invalid("Unknown GIF extension.");
    } else if (tag === 0x2c) {
      const start = pos;
      skip(9);
      const w = d.getUint16(start + 4, true);
      const h = d.getUint16(start + 6, true);
      if (
        !w ||
        !h ||
        d.getUint16(start, true) + w > width ||
        d.getUint16(start + 2, true) + h > height
      )
        invalid("Invalid GIF image dimensions.");
      const packed = bytes[start + 8];
      if (packed & 0x80) skip(3 * 2 ** ((packed & 7) + 1));
      if (bytes[pos] < 2 || bytes[pos] > 8 || pos >= bytes.length)
        invalid("Invalid GIF LZW minimum code size.");
      pos++;
      if (bytes[pos] === 0) invalid("Empty GIF image data.");
      subblocks();
      hasImage = true;
    } else invalid("Unknown GIF block.");
  }
  invalid("Missing GIF trailer.");
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function pngEnd(bytes: Uint8Array): number {
  if (!matches(bytes, 0, "\x89PNG\r\n\x1a\n"))
    throw new Error("Expected a PNG file.");
  const d = view(bytes);
  let pos = 8;
  let hasHeader = false;
  let hasData = false;
  while (pos < bytes.length) {
    if (bytes.length - pos < 12) invalid("Truncated PNG chunk.");
    const size = d.getUint32(pos);
    if (size > bytes.length - pos - 12) invalid("Invalid PNG chunk bounds.");
    for (let i = pos + 4; i < pos + 8; i++) {
      const c = bytes[i];
      if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122)))
        invalid("Invalid PNG chunk type.");
    }
    if (bytes[pos + 6] & 32) invalid("Invalid PNG chunk type.");
    let crc = 0xffffffff;
    for (let i = pos + 4; i < pos + 8 + size; i++)
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 255];
    if ((crc ^ 0xffffffff) >>> 0 !== d.getUint32(pos + 8 + size))
      invalid("Invalid PNG chunk CRC.");
    const isHeader = matches(bytes, pos + 4, "IHDR");
    if (!hasHeader && !isHeader) invalid("PNG must begin with IHDR.");
    if (isHeader) {
      if (hasHeader || size !== 13) invalid("Invalid PNG IHDR.");
      const width = d.getUint32(pos + 8);
      const height = d.getUint32(pos + 12);
      const depth = bytes[pos + 16];
      const color = bytes[pos + 17];
      const validDepths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !width ||
        !height ||
        width > 0x7fffffff ||
        height > 0x7fffffff ||
        !validDepths[color]?.includes(depth) ||
        bytes[pos + 18] !== 0 ||
        bytes[pos + 19] !== 0 ||
        bytes[pos + 20] > 1
      )
        invalid("Invalid PNG IHDR.");
      hasHeader = true;
    }
    if (matches(bytes, pos + 4, "IDAT")) hasData = true;
    if (matches(bytes, pos + 4, "IEND")) {
      if (size !== 0 || !hasData) invalid("Invalid PNG IEND.");
      return pos + 12;
    }
    pos += size + 12;
  }
  invalid("Missing PNG IEND.");
}

function base64Value(c: number): number {
  if (c >= 65 && c <= 90) return c - 65;
  if (c >= 97 && c <= 122) return c - 97 + 26;
  if (c >= 48 && c <= 57) return c - 48 + 52;
  if (c === 43) return 62;
  if (c === 47) return 63;
  return -1;
}

function decodeBase64(symbols: Uint8Array): Uint8Array {
  const length = symbols.length;
  if (length % 4) invalid("Expected canonical Base64 with required padding.");
  const padding =
    symbols[length - 1] === 61 ? (symbols[length - 2] === 61 ? 2 : 1) : 0;
  const size = (length / 4) * 3 - padding;
  outputLimit(size);
  const out = new Uint8Array(size);
  let index = 0;
  for (let i = 0; i < length; i += 4) {
    const last = i + 4 === length;
    const a = base64Value(symbols[i]);
    const b = base64Value(symbols[i + 1]);
    const c = last && padding === 2 ? 0 : base64Value(symbols[i + 2]);
    const d = last && padding > 0 ? 0 : base64Value(symbols[i + 3]);
    if (
      a < 0 ||
      b < 0 ||
      c < 0 ||
      d < 0 ||
      (last && padding === 2 && (b & 15) !== 0) ||
      (last && padding === 1 && (c & 3) !== 0)
    )
      invalid("Expected canonical Base64 (alphabet, padding and pad bits).");
    out[index++] = (a << 2) | (b >> 4);
    if (index < size) out[index++] = ((b & 15) << 4) | (c >> 2);
    if (index < size) out[index++] = ((c & 3) << 6) | d;
  }
  return out;
}

function trimAsciiWhitespace(bytes: Uint8Array): Uint8Array {
  let start = 0;
  let end = bytes.length;
  const space = (c: number) => c === 32 || (c >= 9 && c <= 13);
  while (start < end && space(bytes[start])) start++;
  while (end > start && space(bytes[end - 1])) end--;
  return bytes.subarray(start, end);
}

export function extractBytes(
  bytes: Uint8Array,
  options: ExtractionOptions,
): { bytes: Uint8Array; text: string; note: string; filename: string } {
  if (bytes.length > MAX_FILE)
    throw new Error("File exceeds the 32 MiB input limit.");
  let out: Uint8Array;
  let note: string;
  if (options.source === "bmp-sentinels") {
    out = decodeBits(
      bmpSymbols(bytes),
      options.zero ?? 0x16,
      options.one ?? 0x17,
      options,
    );
    note =
      "Decoded bits between the first two non-overlapping 00 00 sentinels in BMP pixel data (including row padding).";
  } else {
    let start: number;
    if (options.source === "png-trailer") {
      start = pngEnd(bytes);
      note =
        "Extracted after structurally parsed PNG IEND; chunk CRCs verified.";
    } else if (options.source === "gif-trailer") {
      start = gifEnd(bytes);
      note = "Extracted after the structurally parsed GIF trailer.";
    } else invalid("Unsupported extraction source.");
    let payload = bytes.subarray(start);
    if (options.encoding !== "raw") payload = trimAsciiWhitespace(payload);
    if (!payload.length) noPayload();
    if (options.encoding === "raw") {
      outputLimit(payload.length);
      out = payload.slice();
      note += " Raw bytes preserved without trimming.";
    } else if (options.encoding === "ascii-bits") {
      out = decodeBits(payload, 0x30, 0x31, options);
      note += " Decoded ASCII 0/1 bits; only outer ASCII whitespace trimmed.";
    } else if (options.encoding === "base64") {
      out = decodeBase64(payload);
      note += " Decoded strict Base64; only outer ASCII whitespace trimmed.";
    } else invalid("Unsupported payload encoding.");
  }
  if (options.source === "bmp-sentinels" || options.encoding === "ascii-bits") {
    note += ` Bit order: ${options.bitOrder ?? "msb"}.`;
    if ((options.insertAt ?? -1) !== -1)
      note += ` Inserted bit ${options.insertBit ?? 0} at index ${options.insertAt}.`;
  }
  return {
    bytes: out,
    text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(out),
    note,
    filename: `${options.source}-extracted.bin`,
  };
}
