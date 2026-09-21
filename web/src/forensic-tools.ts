export type ToolChannel = "r" | "g" | "b" | "a" | "luminance";
export type PixelOrder = "row" | "column";

const MAX_PIXELS = 16 * 1024 * 1024;
const MAX_COORDINATES = 1_000_000;
const MAX_OUTPUT = 1024 * 1024;

function validatePixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (
    !(rgba instanceof Uint8ClampedArray) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    width * height > MAX_PIXELS ||
    rgba.length !== width * height * 4
  )
    throw new RangeError("Invalid RGBA dimensions or buffer");
  return width * height;
}

function channelIndex(channel: ToolChannel): number {
  if (channel === "luminance") return -1;
  const index = "rgba".indexOf(channel);
  if (index < 0) throw new RangeError("Invalid pixel channel");
  return index;
}

function channelValue(
  rgba: Uint8ClampedArray,
  pixel: number,
  channel: ToolChannel,
): number {
  const index = channelIndex(channel);
  if (index >= 0) return rgba[pixel * 4 + index];
  return Math.round(
    0.2126 * rgba[pixel * 4] +
      0.7152 * rgba[pixel * 4 + 1] +
      0.0722 * rgba[pixel * 4 + 2],
  );
}

export interface ChannelDifferenceOptions {
  left: ToolChannel;
  right: ToolChannel;
  threshold: number;
}

export function channelDifferenceMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: ChannelDifferenceOptions,
): Uint8ClampedArray {
  const count = validatePixels(rgba, width, height);
  if (
    !Number.isInteger(options.threshold) ||
    options.threshold < 0 ||
    options.threshold > 255
  )
    throw new RangeError("Threshold must be an integer in 0..255");
  channelIndex(options.left);
  channelIndex(options.right);
  const output = new Uint8ClampedArray(count * 4);
  for (let pixel = 0; pixel < count; pixel++) {
    const value = Math.abs(
      channelValue(rgba, pixel, options.left) -
        channelValue(rgba, pixel, options.right),
    );
    const mask = value >= options.threshold ? value : 0;
    output[pixel * 4] = output[pixel * 4 + 1] = output[pixel * 4 + 2] = mask;
    output[pixel * 4 + 3] = 255;
  }
  return output;
}

export interface AnomalyOptions {
  channel: ToolChannel;
  threshold: number;
}

export function anomalyMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: AnomalyOptions,
): Uint8ClampedArray {
  validatePixels(rgba, width, height);
  if (
    !Number.isInteger(options.threshold) ||
    options.threshold < 0 ||
    options.threshold > 255
  )
    throw new RangeError("Threshold must be an integer in 0..255");
  channelIndex(options.channel);
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const values: number[] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.max(0, Math.min(width - 1, x + dx));
          const ny = Math.max(0, Math.min(height - 1, y + dy));
          values.push(channelValue(rgba, ny * width + nx, options.channel));
        }
      values.sort((a, b) => a - b);
      const center = channelValue(rgba, y * width + x, options.channel);
      const value = Math.abs(center - values[4]);
      const mask = value >= options.threshold ? value : 0;
      const at = (y * width + x) * 4;
      output[at] = output[at + 1] = output[at + 2] = mask;
      output[at + 3] = 255;
    }
  }
  return output;
}

function isPrime(value: number): boolean {
  if (value < 2) return false;
  if (value % 2 === 0) return value === 2;
  for (let divisor = 3; divisor * divisor <= value; divisor += 2)
    if (value % divisor === 0) return false;
  return true;
}

export function primeValueMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  channel: ToolChannel,
): Uint8ClampedArray {
  const count = validatePixels(rgba, width, height);
  channelIndex(channel);
  const output = new Uint8ClampedArray(count * 4);
  for (let pixel = 0; pixel < count; pixel++) {
    const mask = isPrime(channelValue(rgba, pixel, channel)) ? 255 : 0;
    output[pixel * 4] = output[pixel * 4 + 1] = output[pixel * 4 + 2] = mask;
    output[pixel * 4 + 3] = 255;
  }
  return output;
}

export interface Coordinate {
  x: number;
  y: number;
  value: number;
}

export interface CoordinateOptions {
  channel: ToolChannel;
  order: PixelOrder;
  threshold: number;
  invert: boolean;
}

export function selectCoordinates(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: CoordinateOptions,
): Coordinate[] {
  const count = validatePixels(rgba, width, height);
  channelIndex(options.channel);
  if (
    !Number.isInteger(options.threshold) ||
    options.threshold < 0 ||
    options.threshold > 255
  )
    throw new RangeError("Threshold must be an integer in 0..255");
  const output: Coordinate[] = [];
  const visit = (position: number) => {
    const x =
      options.order === "row"
        ? position % width
        : Math.floor(position / height);
    const y =
      options.order === "row"
        ? Math.floor(position / width)
        : position % height;
    const pixel = y * width + x;
    const value = channelValue(rgba, pixel, options.channel);
    if (
      (options.invert
        ? value < options.threshold
        : value >= options.threshold) &&
      output.length < MAX_COORDINATES
    )
      output.push({ x, y, value });
  };
  for (let position = 0; position < count; position++) visit(position);
  return output;
}

const MORSE: Record<string, string> = {
  ".-": "A",
  "-...": "B",
  "-.-.": "C",
  "-..": "D",
  ".": "E",
  "..-.": "F",
  "--.": "G",
  "....": "H",
  "..": "I",
  ".---": "J",
  "-.-": "K",
  ".-..": "L",
  "--": "M",
  "-.": "N",
  "---": "O",
  ".--.": "P",
  "--.-": "Q",
  ".-.": "R",
  "...": "S",
  "-": "T",
  "..-": "U",
  "...-": "V",
  ".--": "W",
  "-..-": "X",
  "-.--": "Y",
  "--..": "Z",
  "-----": "0",
  ".----": "1",
  "..---": "2",
  "...--": "3",
  "....-": "4",
  ".....": "5",
  "-....": "6",
  "--...": "7",
  "---..": "8",
  "----.": "9",
};

export function coordinatesToMorse(
  coordinates: Coordinate[],
  width: number,
): string {
  if (!Number.isInteger(width) || width < 1)
    throw new RangeError("Width must be positive");
  let previous = -1;
  const symbols: string[] = [];
  for (const point of coordinates) {
    const index = point.y * width + point.x;
    const gap = previous < 0 ? 0 : index - previous - 1;
    if (gap > 0) symbols.push(" ");
    symbols.push(point.value >= 128 ? "-" : ".");
    previous = index;
  }
  return symbols
    .join("")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split("/")
        .map((part) => MORSE[part] ?? "?")
        .join(""),
    )
    .join(" ");
}

export function transformBytes(
  bytes: Uint8Array,
  options: { invert: boolean; xor: number },
): Uint8Array {
  if (!(bytes instanceof Uint8Array))
    throw new TypeError("Expected byte input");
  if (!Number.isInteger(options.xor) || options.xor < 0 || options.xor > 255)
    throw new RangeError("XOR value must be an integer in 0..255");
  if (bytes.length > MAX_OUTPUT)
    throw new RangeError("Output exceeds the 1 MiB limit");
  return Uint8Array.from(
    bytes,
    (value) => (options.invert ? value ^ 255 : value) ^ options.xor,
  );
}

export function plotCoordinates(
  coordinates: Coordinate[],
  width: number,
  height: number,
): Uint8ClampedArray {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_PIXELS
  )
    throw new RangeError("Invalid plot dimensions");
  if (coordinates.length > MAX_COORDINATES)
    throw new RangeError("Too many coordinates");
  const output = new Uint8ClampedArray(width * height * 4);
  for (const { x, y } of coordinates) {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x >= width ||
      y < 0 ||
      y >= height
    )
      throw new RangeError("Coordinate outside plot");
    const at = (y * width + x) * 4;
    output[at] = 255;
    output[at + 1] = 64;
    output[at + 2] = 32;
    output[at + 3] = 255;
  }
  return output;
}

export interface JpegInspection {
  segments: { marker: string; offset: number; length: number }[];
  scanStart: number | null;
  eoi: number | null;
  trailingOffset: number | null;
  carved: { offset: number; length: number; kind: "jpeg" | "png" | "zip" }[];
}

function markerName(marker: number): string {
  return `FF${marker.toString(16).padStart(2, "0").toUpperCase()}`;
}

export function inspectJPEG(bytes: Uint8Array): JpegInspection {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new Error("Input is not a JPEG");
  const segments: JpegInspection["segments"] = [];
  let pos = 2;
  let scanStart: number | null = null;
  let eoi: number | null = null;
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) throw new Error("Malformed JPEG marker");
    while (bytes[pos] === 0xff) pos++;
    const marker = bytes[pos++];
    if (marker === 0xd9) {
      eoi = pos - 2;
      break;
    }
    if (marker === 0xda) {
      if (pos + 2 > bytes.length)
        throw new Error("Truncated JPEG segment length");
      const length = (bytes[pos] << 8) | bytes[pos + 1];
      if (length < 2 || pos + length > bytes.length)
        throw new Error("Invalid or truncated JPEG segment");
      scanStart = pos - 2;
      segments.push({
        marker: markerName(marker),
        offset: pos - 2,
        length: length + 2,
      });
      pos += length;
      while (pos + 1 < bytes.length) {
        if (bytes[pos] !== 0xff) {
          pos++;
          continue;
        }
        if (bytes[pos + 1] === 0x00) {
          pos += 2;
          continue;
        }
        if (bytes[pos + 1] === 0xd9) {
          eoi = pos;
          pos += 2;
          break;
        }
        if (bytes[pos + 1] >= 0xd0 && bytes[pos + 1] <= 0xd7) {
          pos += 2;
          continue;
        }
        throw new Error("Malformed JPEG marker inside scan");
      }
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      segments.push({ marker: markerName(marker), offset: pos - 2, length: 2 });
      continue;
    }
    if (pos + 2 > bytes.length)
      throw new Error("Truncated JPEG segment length");
    const length = (bytes[pos] << 8) | bytes[pos + 1];
    if (length < 2 || pos + length > bytes.length)
      throw new Error("Invalid or truncated JPEG segment");
    segments.push({
      marker: markerName(marker),
      offset: pos - 2,
      length: length + 2,
    });
    pos += length;
  }
  if (eoi === null) throw new Error("JPEG is missing EOI");
  const trailingOffset = eoi + 2 < bytes.length ? eoi + 2 : null;
  const carved: JpegInspection["carved"] = [];
  if (trailingOffset !== null) {
    for (
      let i = trailingOffset;
      i + 3 < bytes.length && carved.length < 128;
      i++
    ) {
      const kind =
        bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff
          ? "jpeg"
          : bytes[i] === 0x89 &&
              bytes[i + 1] === 0x50 &&
              bytes[i + 2] === 0x4e &&
              bytes[i + 3] === 0x47
            ? "png"
            : bytes[i] === 0x50 &&
                bytes[i + 1] === 0x4b &&
                bytes[i + 2] === 0x03 &&
                bytes[i + 3] === 0x04
              ? "zip"
              : null;
      if (kind) carved.push({ offset: i, length: bytes.length - i, kind });
    }
  }
  return { segments, scanStart, eoi, trailingOffset, carved };
}

export interface BarcodeResult {
  rawValue: string;
  format: string;
}

export async function recognizeBarcodes(
  source: Blob,
): Promise<BarcodeResult[]> {
  const detector = (
    globalThis as typeof globalThis & {
      BarcodeDetector?: new (options?: { formats?: string[] }) => {
        detect(input: ImageBitmap): Promise<BarcodeResult[]>;
      };
    }
  ).BarcodeDetector;
  if (!detector)
    throw new Error("BarcodeDetector is unavailable in this browser");
  const bitmap = await createImageBitmap(source);
  try {
    const results = await new detector().detect(bitmap);
    return results.map(({ rawValue, format }) => ({ rawValue, format }));
  } finally {
    bitmap.close();
  }
}
