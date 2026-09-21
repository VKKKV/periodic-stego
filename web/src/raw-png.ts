const MAX_INPUT = 32 * 1024 * 1024;
const MAX_PIXELS = 16 * 1024 * 1024;
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function passSize(size: number, start: number, step: number) {
  return size <= start ? 0 : Math.floor((size - start + step - 1) / step);
}

/**
 * Raw, unpremultiplied PNG samples. No canvas, color management, gamma adjustment,
 * alpha compositing or resizing. Supports all PNG color types at their legal
 * 1/2/4/8/16-bit depths and both noninterlaced and Adam7 images.
 *
 * Packed samples are read most-significant-bit first within each byte. 16-bit
 * samples are big-endian and represented in RGBA by their high byte (equivalent
 * to integer division by 256); samples below 8 bits are expanded to the full
 * 0..255 range. This is a byte-oriented decoder, not a color-management path.
 * Memory is bounded by a 32 MiB input snapshot, 64 MiB RGBA and one/two pass
 * scanlines; inflated data is consumed incrementally, never collected in a blob.
 * A superseded operation rejects with an Error named AbortError.
 */
export async function decodeRawPNG(
  bytes: Uint8Array,
  isCurrent: () => boolean = () => true,
): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }> {
  const check = () => {
    if (!isCurrent()) {
      const error = new Error("Raw PNG decode cancelled");
      error.name = "AbortError";
      throw error;
    }
  };
  const pause = async () => {
    await yieldTask();
    check();
  };
  check();
  if (!(bytes instanceof Uint8Array))
    throw new TypeError("PNG input must be Uint8Array");
  if (bytes.length > MAX_INPUT)
    throw new RangeError("PNG input exceeds 32 MiB limit");
  if (bytes.length < 8 || SIGNATURE.some((value, i) => bytes[i] !== value))
    throw new Error("Invalid PNG signature");
  // Isolate parsing and later async reads from caller mutation, including Buffer views.
  const data = new Uint8Array(bytes.length);
  for (let at = 0; at < bytes.length; at += 256 * 1024) {
    data.set(bytes.subarray(at, at + 256 * 1024), at);
    await pause();
  }
  const view = new DataView(data.buffer);
  let width = 0,
    height = 0,
    bitDepth = 0,
    colorType = -1,
    components = 0;
  let palette: Uint8Array | undefined, transparency: Uint8Array | undefined;
  let idatStart = -1,
    idatEnd = -1,
    idatClosed = false,
    ended = false;
  let sinceYield = 0,
    chunksSinceYield = 0;
  const seen = new Set<string>();
  const beforePalette = new Set(["cHRM", "gAMA", "iCCP", "sBIT", "sRGB"]);
  const beforeData = new Set(["bKGD", "hIST", "pHYs", "eXIf"]);
  for (let at = 8; at < data.length;) {
    check();
    if (data.length - at < 12) throw new Error("Truncated PNG chunk");
    const length = view.getUint32(at);
    if (length > 0x7fffffff || length > data.length - at - 12)
      throw new Error("Truncated or invalid PNG chunk length");
    const type = String.fromCharCode(...data.subarray(at + 4, at + 8));
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type))
      throw new Error("Invalid PNG chunk type");
    const start = at + 8,
      end = start + length;
    let crc = 0xffffffff;
    for (let cursor = at + 4; cursor < end;) {
      const stop = Math.min(end, cursor + 256 * 1024);
      sinceYield += stop - cursor;
      for (; cursor < stop; cursor++)
        crc = CRC_TABLE[(crc ^ data[cursor]) & 255] ^ (crc >>> 8);
      if (sinceYield >= 256 * 1024) {
        sinceYield = 0;
        await pause();
      }
    }
    if ((crc ^ 0xffffffff) >>> 0 !== view.getUint32(end))
      throw new Error(`PNG ${type} CRC mismatch`);
    if (at === 8 && type !== "IHDR") throw new Error("PNG IHDR must be first");
    if (idatStart !== -1 && type !== "IDAT") idatClosed = true;
    if (beforePalette.has(type) || beforeData.has(type) || type === "tIME") {
      if (seen.has(type)) throw new Error(`Duplicate PNG ${type}`);
      if (
        (beforePalette.has(type) && (palette || idatStart !== -1)) ||
        (beforeData.has(type) && idatStart !== -1)
      )
        throw new Error(`Invalid PNG ${type} chunk order`);
      if ((type === "hIST" || (type === "bKGD" && colorType === 3)) && !palette)
        throw new Error(`PNG ${type} requires preceding PLTE`);
      seen.add(type);
    }
    switch (type) {
      case "IHDR": {
        if (at !== 8 || length !== 13)
          throw new Error("Invalid or duplicate PNG IHDR");
        width = view.getUint32(start);
        height = view.getUint32(start + 4);
        if (
          !width ||
          !height ||
          width > 16384 ||
          height > 16384 ||
          width * height > MAX_PIXELS
        )
          throw new RangeError(
            "PNG dimensions exceed 16384 per side / 16777216 pixel limit",
          );
        bitDepth = data[start + 8];
        colorType = data[start + 9];
        const legalDepths: Record<number, number[]> = {
          0: [1, 2, 4, 8, 16],
          2: [8, 16],
          3: [1, 2, 4, 8],
          4: [8, 16],
          6: [8, 16],
        };
        components = (
          { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>
        )[colorType];
        if (!components) throw new Error("Unsupported PNG color type");
        if (!legalDepths[colorType].includes(bitDepth))
          throw new Error(
            `Unsupported PNG bit depth ${bitDepth} for color type ${colorType}`,
          );
        if (data[start + 10] !== 0 || data[start + 11] !== 0)
          throw new Error("Unsupported PNG compression or filter method");
        if (data[start + 12] !== 0 && data[start + 12] !== 1)
          throw new Error("Unsupported PNG interlace method");
        break;
      }
      case "PLTE":
        if (
          palette ||
          transparency ||
          idatStart !== -1 ||
          seen.has("bKGD") ||
          seen.has("hIST")
        )
          throw new Error("Invalid PNG PLTE chunk order");
        if (
          colorType === 0 ||
          colorType === 4 ||
          length < 3 ||
          length > 768 ||
          length % 3 ||
          (colorType === 3 && length / 3 > 1 << bitDepth)
        )
          throw new Error("Invalid PNG PLTE");
        palette = data.subarray(start, end);
        break;
      case "tRNS":
        if (transparency || idatStart !== -1)
          throw new Error("Invalid PNG tRNS chunk order");
        if (
          (colorType === 0 && length !== 2) ||
          (colorType === 2 && length !== 6) ||
          (colorType === 3 &&
            (!palette || length < 1 || length > palette.length / 3)) ||
          colorType === 4 ||
          colorType === 6
        )
          throw new Error("Invalid PNG tRNS");
        if (colorType === 0 && view.getUint16(start) >= 1 << bitDepth)
          throw new Error("Invalid grayscale tRNS sample");
        if (colorType === 2) {
          for (let i = start; i < end; i += 2)
            if (view.getUint16(i) >= 1 << bitDepth)
              throw new Error("Invalid RGB tRNS sample");
        }
        transparency = data.subarray(start, end);
        break;
      case "IDAT":
        if (idatClosed) throw new Error("PNG IDAT chunks must be consecutive");
        if (colorType === 3 && !palette)
          throw new Error("Indexed PNG requires PLTE before IDAT");
        if (idatStart === -1) idatStart = at;
        idatEnd = end + 4;
        break;
      case "IEND":
        if (length !== 0 || idatStart === -1)
          throw new Error("Invalid PNG IEND / missing IDAT");
        if (end + 4 !== data.length)
          throw new Error("Trailing data after PNG IEND");
        ended = true;
        break;
      default:
        if (type === "acTL" || type === "fcTL" || type === "fdAT")
          throw new Error("Unsupported animated PNG");
        if (type[0] === type[0].toUpperCase())
          throw new Error(`Unsupported PNG critical chunk ${type}`);
    }
    at = end + 4;
    if (++chunksSinceYield >= 1024) {
      chunksSinceYield = 0;
      await pause();
    }
  }
  if (!ended) throw new Error("Truncated PNG: missing IEND");
  await pause();
  if (typeof DecompressionStream === "undefined")
    throw new Error("Native DecompressionStream is unavailable");

  const interlaced = data[8 + 8 + 12] === 1;
  const bitsPerPixel = components * bitDepth;
  const filterBytes = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const passRows = (pass: number) => {
    if (!interlaced) return { x: 0, y: 0, dx: 1, dy: 1, width, height };
    const [x, y, dx, dy] = ADAM7[pass];
    return {
      x,
      y,
      dx,
      dy,
      width: passSize(width, x, dx),
      height: passSize(height, y, dy),
    };
  };
  let expected = 0;
  for (let pass = 0; pass < (interlaced ? 7 : 1); pass++) {
    const current = passRows(pass);
    expected +=
      current.width && current.height
        ? (Math.ceil((current.width * bitsPerPixel) / 8) + 1) * current.height
        : 0;
  }
  let chunkAt = idatStart,
    payloadAt = 0,
    payloadEnd = 0,
    sourceCancelled = false;
  const compressed = new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      pull(controller) {
        try {
          check();
          if (sourceCancelled) return;
          let skipped = 0;
          while (payloadAt === payloadEnd) {
            if (chunkAt >= idatEnd) {
              controller.close();
              return;
            }
            payloadAt = chunkAt + 8;
            payloadEnd = payloadAt + view.getUint32(chunkAt);
            chunkAt = payloadEnd + 4;
            // Bound work even for many empty IDAT chunks.
            if (++skipped === 1024 && payloadAt === payloadEnd) {
              return pause().then(() => {
                controller.enqueue(new Uint8Array(0));
              });
            }
          }
          const stop = Math.min(payloadEnd, payloadAt + 64 * 1024);
          controller.enqueue(data.subarray(payloadAt, stop));
          payloadAt = stop;
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() {
        sourceCancelled = true;
      },
    },
    { highWaterMark: 0 },
  );

  const reader = compressed
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  let rgba: Uint8ClampedArray | undefined;
  let previous = new Uint8Array(),
    row = new Uint8Array();
  let received = 0,
    pass = -1,
    passY = 0,
    passWidth = 0,
    passHeight = 0,
    passX = 0,
    passYStart = 0,
    passDX = 1,
    passDY = 1,
    rowBytes = 0,
    rowAt = -1,
    filter = 0,
    work = 0;
  const advancePass = () => {
    while (++pass < (interlaced ? 7 : 1)) {
      const current = passRows(pass);
      if (!current.width || !current.height) continue;
      passWidth = current.width;
      passHeight = current.height;
      passX = current.x;
      passYStart = current.y;
      passDX = current.dx;
      passDY = current.dy;
      rowBytes = Math.ceil((passWidth * bitsPerPixel) / 8);
      previous = new Uint8Array(rowBytes);
      row = new Uint8Array(rowBytes);
      passY = 0;
      rowAt = -1;
      return;
    }
    rowAt = -2;
  };
  const sample = (source: Uint8Array, pixel: number, component: number) => {
    const index = pixel * components + component;
    if (bitDepth < 8) {
      const bit = index * bitDepth;
      return (
        (source[bit >> 3] >> (8 - bitDepth - (bit & 7))) & ((1 << bitDepth) - 1)
      );
    }
    const offset = index * (bitDepth === 16 ? 2 : 1);
    return bitDepth === 16
      ? (source[offset] << 8) | source[offset + 1]
      : source[offset];
  };
  const toByte = (value: number) =>
    bitDepth < 8
      ? Math.round((value * 255) / ((1 << bitDepth) - 1))
      : value >> (bitDepth - 8);
  const decodeRow = (source: Uint8Array, sourceY: number) => {
    if (!rgba) rgba = new Uint8ClampedArray(width * height * 4);
    for (let x = 0; x < passWidth; x++) {
      const targetX = passX + x * passDX;
      const targetY = passYStart + sourceY * passDY;
      const target = (targetY * width + targetX) * 4;
      let r: number,
        g: number,
        b: number,
        a = 255;
      if (colorType === 3) {
        const index = sample(source, x, 0);
        if (index >= palette!.length / 3)
          throw new Error("PNG palette index out of range");
        r = palette![index * 3];
        g = palette![index * 3 + 1];
        b = palette![index * 3 + 2];
        a = transparency?.[index] ?? 255;
      } else if (colorType === 0 || colorType === 4) {
        const gray = sample(source, x, 0);
        r = g = b = toByte(gray);
        if (colorType === 4) a = toByte(sample(source, x, 1));
        else if (
          transparency &&
          gray === view.getUint16(transparency.byteOffset - data.byteOffset)
        )
          a = 0;
      } else {
        const red = sample(source, x, 0);
        const green = sample(source, x, 1);
        const blue = sample(source, x, 2);
        r = toByte(red);
        g = toByte(green);
        b = toByte(blue);
        if (colorType === 6) a = toByte(sample(source, x, 3));
        else if (
          transparency &&
          red === view.getUint16(transparency.byteOffset - data.byteOffset) &&
          green ===
            view.getUint16(transparency.byteOffset - data.byteOffset + 2) &&
          blue === view.getUint16(transparency.byteOffset - data.byteOffset + 4)
        )
          a = 0;
      }
      rgba[target] = r;
      rgba[target + 1] = g;
      rgba[target + 2] = b;
      rgba[target + 3] = a;
    }
  };
  advancePass();
  try {
    while (true) {
      check();
      const { done, value } = await reader.read();
      check();
      if (done) break;
      // Reject the offending chunk BEFORE copying it or allocating the RGBA accumulator.
      if (value.length > expected - received)
        throw new Error("PNG decompression exceeds expected scanline length");
      received += value.length;
      for (let i = 0; i < value.length;) {
        if (rowAt === -2)
          throw new Error("PNG decompression exceeds expected scanline length");
        if (rowAt === -1) {
          filter = value[i++];
          if (filter > 4)
            throw new Error(
              `Invalid PNG scanline filter ${filter} at pass ${pass}`,
            );
          rowAt = 0;
        }
        const stop = Math.min(rowBytes, rowAt + value.length - i);
        for (; rowAt < stop; rowAt++, i++) {
          const left = rowAt >= filterBytes ? row[rowAt - filterBytes] : 0;
          const up = previous[rowAt];
          const upperLeft =
            rowAt >= filterBytes ? previous[rowAt - filterBytes] : 0;
          const prediction =
            filter === 0
              ? 0
              : filter === 1
                ? left
                : filter === 2
                  ? up
                  : filter === 3
                    ? Math.floor((left + up) / 2)
                    : paeth(left, up, upperLeft);
          row[rowAt] = (value[i] + prediction) & 255;
        }
        if (rowAt === rowBytes) {
          decodeRow(row, passY);
          [previous, row] = [row, previous];
          passY++;
          if (passY === passHeight) advancePass();
          else rowAt = -1;
          work += rowBytes;
          if (passY % 32 === 0 || work >= 256 * 1024) {
            work = 0;
            await pause();
          }
        }
      }
      // Allow supersession while a large compressed stream produces partial rows.
      await pause();
    }
    if (
      received !== expected ||
      rowAt >= 0 ||
      pass !== (interlaced ? 7 : 1) ||
      !rgba
    )
      throw new Error(
        `Truncated PNG decompressed scanlines (${received}/${expected}, row=${rowAt}, pass=${pass})`,
      );
    check();
    return { width, height, rgba };
  } catch (error) {
    // This propagates through pipeThrough to stop the decompressor and input source.
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
