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

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Raw, unpremultiplied PNG samples. No canvas, color management, gamma adjustment,
 * alpha compositing or resizing. Only noninterlaced 8-bit PNG is supported.
 * Memory is bounded by a 32 MiB input snapshot, 64 MiB RGBA and two scanlines;
 * inflated data is consumed incrementally, never collected in an unbounded blob.
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
        if (data[start + 8] !== 8)
          throw new Error("Unsupported PNG bit depth: only 8-bit supported");
        colorType = data[start + 9];
        components = (
          { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>
        )[colorType];
        if (!components) throw new Error("Unsupported PNG color type");
        if (data[start + 10] !== 0 || data[start + 11] !== 0)
          throw new Error("Unsupported PNG compression or filter method");
        if (data[start + 12] !== 0)
          throw new Error("Unsupported PNG interlace (Adam7)");
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
          length % 3
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
        if (colorType !== 3) {
          for (let i = start; i < end; i += 2)
            if (view.getUint16(i) > 255)
              throw new Error("Invalid 8-bit PNG tRNS sample");
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
  const rowBytes = width * components;
  // Validated dimensions bound this cap BEFORE any inflated accumulator/output allocation.
  const expected = (rowBytes + 1) * height;
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
  let previous = new Uint8Array(rowBytes),
    row = new Uint8Array(rowBytes);
  let received = 0,
    rowAt = -1,
    filter = 0,
    y = 0,
    work = 0;
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
      rgba ??= new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < value.length;) {
        if (rowAt === -1) {
          filter = value[i++];
          if (filter > 4) throw new Error("Invalid PNG scanline filter");
          rowAt = 0;
        }
        const stop = Math.min(rowBytes, rowAt + value.length - i);
        for (; rowAt < stop; rowAt++, i++) {
          const left = rowAt >= components ? row[rowAt - components] : 0;
          const up = previous[rowAt];
          const upperLeft =
            rowAt >= components ? previous[rowAt - components] : 0;
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
          for (let x = 0; x < width; x++) {
            const source = x * components,
              target = (y * width + x) * 4;
            let r: number,
              g: number,
              b: number,
              a = 255;
            if (colorType === 3) {
              const index = row[source];
              if (index >= palette!.length / 3)
                throw new Error("PNG palette index out of range");
              r = palette![index * 3];
              g = palette![index * 3 + 1];
              b = palette![index * 3 + 2];
              a = transparency?.[index] ?? 255;
            } else if (colorType === 0 || colorType === 4) {
              r = g = b = row[source];
              if (colorType === 4) a = row[source + 1];
              else if (transparency && r === transparency[1]) a = 0;
            } else {
              r = row[source];
              g = row[source + 1];
              b = row[source + 2];
              if (colorType === 6) a = row[source + 3];
              else if (
                transparency &&
                r === transparency[1] &&
                g === transparency[3] &&
                b === transparency[5]
              )
                a = 0;
            }
            rgba[target] = r;
            rgba[target + 1] = g;
            rgba[target + 2] = b;
            rgba[target + 3] = a;
          }
          [previous, row] = [row, previous];
          rowAt = -1;
          y++;
          work += rowBytes;
          if (y % 32 === 0 || work >= 256 * 1024) {
            work = 0;
            await pause();
          }
        }
      }
      // Allow supersession while a large compressed stream produces partial rows.
      await pause();
    }
    if (received !== expected || y !== height || !rgba)
      throw new Error("Truncated PNG decompressed scanlines");
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
