export type PixelChannel = "r" | "g" | "b" | "a";

export interface PixelBitOptions {
  /** Unique channel letters, visited in the supplied order within each pixel. */
  channels: string;
  bit: number;
  order: "row" | "column";
  /** First extracted bit occupies bit 7 (msb) or bit 0 (lsb) of each byte. */
  bitOrder: "msb" | "lsb";
  /** Bits to skip in the selected pixel/channel stream. */
  offset: number;
  length: number;
}

function validatePixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    width * height > 16 * 1024 * 1024
  )
    throw new RangeError(
      "Pixel dimensions must be 1..16384, at most 16777216 pixels",
    );
  if (
    !(rgba instanceof Uint8ClampedArray) ||
    rgba.length !== width * height * 4
  )
    throw new RangeError("Expected exactly width * height * 4 RGBA bytes");
  return width * height;
}

function validateBit(bit: number) {
  if (!Number.isInteger(bit) || bit < 0 || bit > 7)
    throw new RangeError("Bit must be an integer in 0..7");
}

/** One grayscale byte per pixel (0 or 255); no alpha weighting or compositing. */
export function bitplane(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  channel: PixelChannel,
  bit: number,
): Uint8ClampedArray {
  const count = validatePixels(rgba, width, height);
  validateBit(bit);
  if (typeof channel !== "string" || !/^[rgba]$/.test(channel))
    throw new RangeError("Channel must be r, g, b or a");
  const component = "rgba".indexOf(channel);
  const result = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i++)
    result[i] = ((rgba[i * 4 + component] >>> bit) & 1) * 255;
  return result;
}

/** Exact extraction, never padded or truncated; alpha-zero RGB is ordinary data. */
export function extractPixelBits(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: PixelBitOptions,
): Uint8Array {
  const count = validatePixels(rgba, width, height);
  if (!options || typeof options !== "object")
    throw new TypeError("Bit options required");
  const { channels, bit, order, bitOrder, offset, length } = options;
  validateBit(bit);
  if (
    typeof channels !== "string" ||
    !/^[rgba]{1,4}$/.test(channels) ||
    new Set(channels).size !== channels.length
  )
    throw new RangeError("Channels must be unique ordered letters from rgba");
  if (order !== "row" && order !== "column")
    throw new RangeError("Invalid pixel order");
  if (bitOrder !== "msb" && bitOrder !== "lsb")
    throw new RangeError("Invalid bit order");
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new RangeError("Offset must be a nonnegative bit count");
  if (!Number.isInteger(length) || length < 1 || length > 1024 * 1024)
    throw new RangeError("Length must be 1..1048576 bytes");
  const needed = length * 8;
  if (offset > count * channels.length - needed)
    throw new RangeError(
      "Not enough selected pixel bits for the complete requested output",
    );
  const components = Array.from(channels, (channel) => "rgba".indexOf(channel));
  const result = new Uint8Array(length);
  for (let i = 0; i < needed; i++) {
    const position = offset + i;
    const visit = Math.floor(position / components.length);
    const pixel =
      order === "row"
        ? visit
        : (visit % height) * width + Math.floor(visit / height);
    const value =
      (rgba[pixel * 4 + components[position % components.length]] >>> bit) & 1;
    result[i >>> 3] |= value << (bitOrder === "msb" ? 7 - (i & 7) : i & 7);
  }
  return result;
}
