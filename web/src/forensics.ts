import { loadImage, type LocalImage } from "./image";
import { analyzePCA } from "./pca";
import { extractExifThumbnail } from "./exif-thumbnail";

export type ForensicTool = "ela" | "noise" | "clone";

export interface ForensicMetadata {
  sha256: string | null;
  format: string;
  width: number;
  height: number;
  bytes: number;
  jpeg?: {
    components: number;
    progressive: boolean;
    quantizationTables: number[];
    estimatedQuality: number | null;
  };
  chunks?: { type: string; length: number }[];
  exif: Record<string, string>;
  c2pa: "unverified-marker" | "not-detected";
}

export interface ForensicMap {
  canvas: HTMLCanvasElement;
  mean: number;
  p95: number;
  maximum: number;
  displayScale: number;
}

export interface ForensicAnalysis {
  metadata: ForensicMetadata;
  ela: Record<string, ForensicMap>;
  noise: HTMLCanvasElement;
  clone: HTMLCanvasElement;
  gradient: HTMLCanvasElement;
  levelSweep: HTMLCanvasElement;
  pca: HTMLCanvasElement[];
  pcaStats: Omit<ReturnType<typeof analyzePCA>, "components">;
  exifThumbnail: {
    status: string;
    reason?: string;
    canvas?: HTMLCanvasElement;
    bytes?: Uint8Array;
    offset?: number;
    length?: number;
  };
  thumbnail: HTMLCanvasElement;
  strings: string[];
  warnings: string[];
  workWidth: number;
  workHeight: number;
}

const JPEG_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16,
  24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109,
  103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder("latin1").decode(
    bytes.subarray(start, start + length),
  );
}

// JPEG stores DQT coefficients in zigzag order; JPEG_LUMA is row-major.
const JPEG_ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40,
  48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29,
  22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54,
  47, 55, 62, 63,
];

/** Closest IJG quality for a natural-order 8-bit luma table, not encoder provenance. */
export function jpegQualityFromLumaTable(table: number[]): number | null {
  if (
    table.length !== 64 ||
    table.some((v) => !Number.isInteger(v) || v < 1 || v > 255)
  )
    return null;
  // Fit the forward IJG formula to account for rounding and clipping (notably Q=100).
  // Its unclipped inverse is Q = 100 - 50*s for s<=1, otherwise Q = 50/s.
  let bestQuality = 1,
    bestError = Infinity;
  for (let quality = 1; quality <= 100; quality++) {
    const scale = quality < 50 ? Math.floor(5000 / quality) : 200 - 2 * quality;
    let error = 0;
    for (let i = 0; i < 64; i++) {
      const expected = Math.max(
        1,
        Math.min(255, Math.floor((JPEG_LUMA[i] * scale + 50) / 100)),
      );
      error += (table[i] - expected) ** 2;
    }
    if (error < bestError) {
      bestQuality = quality;
      bestError = error;
    }
  }
  return bestQuality;
}

export function jpegMetadata(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables: number[] = [];
  let components = 0;
  let progressive = false;
  let estimatedQuality: number | null = null;
  let pos = 2;
  while (pos + 3 < bytes.length) {
    if (bytes[pos] !== 0xff) break;
    while (pos < bytes.length && bytes[pos] === 0xff) pos++;
    const marker = bytes[pos++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (pos + 2 > bytes.length) break;
    const length = view.getUint16(pos);
    if (length < 2 || pos + length > bytes.length) break;
    if (marker === 0xdb) {
      let p = pos + 2;
      const end = pos + length;
      while (p < end) {
        const info = bytes[p++];
        const precision = info >> 4;
        const tableId = info & 15;
        if (precision > 1 || tableId > 3) break;
        const size = precision === 0 ? 64 : 128;
        if (p + size > end) break;
        if (tableId === 0 && precision === 0) {
          const table = Array.from(bytes.subarray(p, p + 64));
          tables.push(...table);
          const natural = new Array<number>(64);
          for (let i = 0; i < 64; i++) natural[JPEG_ZIGZAG[i]] = table[i];
          estimatedQuality = jpegQualityFromLumaTable(natural);
        }
        p += size;
      }
    } else if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      progressive = marker === 0xc2 || marker === 0xca;
      components = length >= 8 ? bytes[pos + 7] : 0;
    }
    pos += length;
  }
  return {
    components,
    progressive,
    quantizationTables: tables,
    estimatedQuality,
  };
}

function pngChunks(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: { type: string; length: number }[] = [];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const length = view.getUint32(pos);
    if (length > bytes.length - pos - 12) break;
    chunks.push({ type: ascii(bytes, pos + 4, 4), length });
    pos += length + 12;
    if (chunks.at(-1)?.type === "IEND") break;
  }
  return chunks;
}

export function exif(
  bytes: Uint8Array,
  format: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (format === "image/png") {
    if (pngChunks(bytes).some((chunk) => chunk.type === "eXIf"))
      result.hasExif = "true";
    return result;
  }
  if (format !== "image/jpeg") return result;
  let pos = 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (pos + 4 < bytes.length && bytes[pos] === 0xff) {
    while (bytes[pos] === 0xff) pos++;
    const marker = bytes[pos++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (pos + 2 > bytes.length) break;
    const length = view.getUint16(pos);
    if (length < 2 || pos + length > bytes.length) break;
    if (
      marker === 0xe1 &&
      length >= 8 &&
      ascii(bytes, pos + 2, 6) === "Exif\0\0"
    ) {
      result.Exif = "present";
      const base = pos + 8;
      const end = pos + length;
      const order = ascii(bytes, base, 2);
      if (base + 8 <= end && (order === "II" || order === "MM")) {
        const little = order === "II";
        const u16 = (at: number) =>
          little ? view.getUint16(at, true) : view.getUint16(at, false);
        const u32 = (at: number) =>
          little ? view.getUint32(at, true) : view.getUint32(at, false);
        if (u16(base + 2) === 42) {
          const ifd = base + u32(base + 4);
          if (ifd >= base + 8 && ifd + 2 <= end) {
            const count = Math.min(u16(ifd), 256);
            if (ifd + 2 + u16(ifd) * 12 + 4 > end) {
              pos += length;
              continue;
            }
            result.ExifEntries = String(count);
            for (let i = 0; i < count; i++) {
              const entry = ifd + 2 + i * 12;
              if (entry + 12 > end) break;
              const tag = u16(entry).toString(16).padStart(4, "0");
              result[`Tag 0x${tag}`] =
                `type ${u16(entry + 2)}, count ${u32(entry + 4)}`;
            }
          }
        }
      }
    }
    pos += length;
  }
  return result;
}

async function digest(bytes: Uint8Array): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const copy = bytes.slice();
  const hash = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(hash), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}

export function c2paMarker(
  bytes: Uint8Array,
): "unverified-marker" | "not-detected" {
  // A byte marker is not a parsed manifest or a validated signature.
  for (let i = 0; i + 3 < bytes.length; i++)
    if (
      bytes[i] === 99 &&
      bytes[i + 1] === 50 &&
      bytes[i + 2] === 112 &&
      bytes[i + 3] === 97
    )
      return "unverified-marker";
  return "not-detected";
}

function metadata(
  image: LocalImage,
  bytes: Uint8Array,
  sha256: string | null,
): ForensicMetadata {
  const base: ForensicMetadata = {
    sha256,
    format: image.meta.type,
    width: image.meta.width,
    height: image.meta.height,
    bytes: image.meta.bytes,
    exif: exif(bytes, image.meta.type),
    c2pa: c2paMarker(bytes),
  };
  if (image.meta.type === "image/jpeg") base.jpeg = jpegMetadata(bytes);
  if (image.meta.type === "image/png") base.chunks = pngChunks(bytes);
  return base;
}

export function workCanvas(image: LocalImage, max = 2048): HTMLCanvasElement {
  const scale = Math.min(
    1,
    max / Math.max(image.canvas.width, image.canvas.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.canvas.width * scale));
  canvas.height = Math.max(1, Math.round(image.canvas.height * scale));
  const ctx = canvas.getContext("2d")!;
  // JPEG has no alpha. Compare both images over the same documented white matte.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image.canvas, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function jpegPixels(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Uint8ClampedArray> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("JPEG re-encoding failed.")),
      "image/jpeg",
      quality / 100,
    ),
  );
  const bitmap = await createImageBitmap(blob);
  const decoded = document.createElement("canvas");
  decoded.width = canvas.width;
  decoded.height = canvas.height;
  decoded
    .getContext("2d")!
    .drawImage(bitmap, 0, 0, decoded.width, decoded.height);
  bitmap.close();
  return decoded
    .getContext("2d", { willReadFrequently: true })!
    .getImageData(0, 0, decoded.width, decoded.height).data;
}

export function differenceCanvas(
  original: Uint8ClampedArray,
  recompressed: Uint8ClampedArray,
  width: number,
  height: number,
  scale: number,
): ForensicMap {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const data = new Uint8ClampedArray(original.length);
  const histogram = new Uint32Array(256);
  let sum = 0,
    maximum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const difference = Math.max(
      Math.abs(original[i] - recompressed[i]),
      Math.abs(original[i + 1] - recompressed[i + 1]),
      Math.abs(original[i + 2] - recompressed[i + 2]),
    );
    histogram[difference]++;
    sum += difference;
    maximum = Math.max(maximum, difference);
    const value = Math.min(255, Math.round(difference * scale));
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  output
    .getContext("2d")!
    .putImageData(new ImageData(data, width, height), 0, 0);
  const count = data.length / 4;
  const mean = count ? sum / count : 0;
  const rank = Math.floor(count * 0.95);
  let cumulative = 0,
    p95 = maximum;
  for (let value = 0; value < histogram.length; value++) {
    cumulative += histogram[value];
    if (cumulative > rank) {
      p95 = value;
      break;
    }
  }
  return { canvas: output, mean, p95, maximum, displayScale: scale };
}

function luminance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float64Array {
  const output = new Float64Array(width * height);
  for (let i = 0; i < output.length; i++)
    output[i] =
      0.2126 * data[i * 4] +
      0.7152 * data[i * 4 + 1] +
      0.0722 * data[i * 4 + 2];
  return output;
}

function noiseCanvas(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): HTMLCanvasElement {
  const gray = luminance(data, width, height);
  const out = new Uint8ClampedArray(data.length);
  let maximum = 1;
  const residual = new Float64Array(width * height);
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const values: number[] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          values.push(gray[(y + dy) * width + x + dx]);
      values.sort((a, b) => a - b);
      const r = Math.abs(gray[y * width + x] - values[4]);
      residual[y * width + x] = r;
      maximum = Math.max(maximum, r);
    }
  for (let i = 0; i < gray.length; i++) {
    const v = Math.min(255, Math.round((residual[i] / maximum) * 255));
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas
    .getContext("2d")!
    .putImageData(new ImageData(out, width, height), 0, 0);
  return canvas;
}

function scalarCanvas(
  values: Float64Array,
  width: number,
  height: number,
  scale = 1,
): HTMLCanvasElement {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < values.length; i++) {
    const value = Math.max(0, Math.min(255, Math.round(values[i] * scale)));
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = value;
    out[i * 4 + 3] = 255;
  }
  return canvasFromPixels(out, width, height);
}

function gradientCanvas(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): HTMLCanvasElement {
  const gray = luminance(data, width, height);
  const gradient = new Float64Array(gray.length);
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      gradient[i] =
        Math.abs(gray[i + 1] - gray[i - 1]) +
        Math.abs(gray[i + width] - gray[i - width]);
    }
  return scalarCanvas(gradient, width, height, 2);
}

function levelSweepCanvas(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): HTMLCanvasElement {
  const gray = luminance(data, width, height);
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < gray.length; i++) {
    const band = Math.floor(gray[i] / 16) * 16;
    out[i * 4] = Math.min(255, band * 2);
    out[i * 4 + 1] = Math.min(255, 255 - band);
    out[i * 4 + 2] = 96;
    out[i * 4 + 3] = 255;
  }
  return canvasFromPixels(out, width, height);
}

export function printableStrings(bytes: Uint8Array): string[] {
  const strings: string[] = [];
  let run = "",
    length = 0;
  for (let i = 0; i <= bytes.length && strings.length < 100; i++) {
    const value = bytes[i];
    if (value >= 32 && value <= 126) {
      if (length < 512) run += String.fromCharCode(value);
      length++;
    } else {
      if (length >= 6) strings.push(run);
      run = "";
      length = 0;
    }
  }
  return strings;
}

export function cloneCanvas(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): HTMLCanvasElement {
  const gray = luminance(data, width, height);
  const out = new Uint8ClampedArray(width * height * 4);
  const buckets = new Map<string, { x: number; y: number }[]>();
  const block = 8;
  for (let y = 0; y + block <= height; y += 4)
    for (let x = 0; x + block <= width; x += 4) {
      let sum = 0,
        sum2 = 0;
      for (let dy = 0; dy < block; dy++)
        for (let dx = 0; dx < block; dx++) {
          const v = gray[(y + dy) * width + x + dx];
          sum += v;
          sum2 += v * v;
        }
      const mean = sum / 64;
      const variance = Math.max(0, sum2 / 64 - mean * mean);
      if (variance < 8) continue;
      const key = `${Math.round(mean / 8)}:${Math.round(Math.sqrt(variance) / 4)}`;
      const list = buckets.get(key) ?? [];
      list.push({ x, y });
      buckets.set(key, list);
    }
  const maxPointsPerBucket = 64;
  const maxComparisons = 12000;
  let comparisons = 0;
  for (const originalPoints of buckets.values())
    if (originalPoints.length > 1) {
      const step = Math.max(
        1,
        Math.ceil(originalPoints.length / maxPointsPerBucket),
      );
      const points = originalPoints.filter(
        (_point, index) => index % step === 0,
      );
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
          if (comparisons++ >= maxComparisons)
            return canvasFromPixels(out, width, height);
          const a = points[i],
            b = points[j];
          if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 32) continue;
          // Mean/variance only shortlist candidates: verify their spatial RGB pattern.
          let squaredError = 0;
          for (let dy = 0; dy < block; dy++)
            for (let dx = 0; dx < block; dx++) {
              const ai = ((a.y + dy) * width + a.x + dx) * 4;
              const bi = ((b.y + dy) * width + b.x + dx) * 4;
              for (let channel = 0; channel < 3; channel++)
                squaredError += (data[ai + channel] - data[bi + channel]) ** 2;
            }
          if (squaredError / (block * block * 3) > 16) continue;
          for (const p of [a, b])
            for (let dy = 0; dy < block; dy++)
              for (let dx = 0; dx < block; dx++) {
                const k = ((p.y + dy) * width + p.x + dx) * 4;
                out[k] = 255;
                out[k + 1] = 72;
                out[k + 2] = 42;
                out[k + 3] = 210;
              }
        }
    }
  return canvasFromPixels(out, width, height);
}

function canvasFromPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas
    .getContext("2d")!
    .putImageData(
      new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height),
      0,
      0,
    );
  return canvas;
}

export async function analyzeForensics(
  image: LocalImage,
  bytes: Uint8Array,
  isCurrent: () => boolean = () => true,
): Promise<ForensicAnalysis> {
  const check = () => {
    if (!isCurrent()) throw new Error("Forensic request superseded.");
  };
  const checkpoint = async () => {
    check();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    check();
  };
  await checkpoint();
  const work = workCanvas(image);
  const ctx = work.getContext("2d", { willReadFrequently: true })!;
  const original = ctx.getImageData(0, 0, work.width, work.height).data;
  const qualities = [50, 75, 90, 95];
  const ela: Record<string, ForensicMap> = {};
  for (const quality of qualities) {
    await checkpoint();
    const recompressed = await jpegPixels(work, quality);
    check();
    ela[String(quality)] = differenceCanvas(
      original,
      recompressed,
      work.width,
      work.height,
      20,
    );
  }
  await checkpoint();
  const meta = metadata(image, bytes, await digest(bytes));
  await checkpoint();
  // Bound expensive median filtering and candidate matching. Maps retain work dimensions.
  const small = workCanvas(image, 512);
  const smallPixels = small
    .getContext("2d", { willReadFrequently: true })!
    .getImageData(0, 0, small.width, small.height).data;
  const restoreSize = (source: HTMLCanvasElement) => {
    if (source.width === work.width && source.height === work.height)
      return source;
    const output = document.createElement("canvas");
    output.width = work.width;
    output.height = work.height;
    const context = output.getContext("2d")!;
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, output.width, output.height);
    return output;
  };
  const noise = restoreSize(
    noiseCanvas(smallPixels, small.width, small.height),
  );
  await checkpoint();
  const clone = restoreSize(
    cloneCanvas(smallPixels, small.width, small.height),
  );
  await checkpoint();
  const gradient = gradientCanvas(original, work.width, work.height);
  await checkpoint();
  const levelSweep = levelSweepCanvas(original, work.width, work.height);
  await checkpoint();
  const { components, ...pcaStats } = analyzePCA(
    original,
    work.width,
    work.height,
  );
  const pca = components.map((component) => {
    const rgba = new Uint8ClampedArray(component.length * 4);
    for (let i = 0; i < component.length; i++) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = component[i];
      rgba[i * 4 + 3] = 255;
    }
    return canvasFromPixels(rgba, work.width, work.height);
  });
  await checkpoint();
  const extracted = extractExifThumbnail(bytes);
  let exifThumbnail: ForensicAnalysis["exifThumbnail"] = extracted;
  if (extracted.status === "found") {
    try {
      const thumbnail = await loadImage(
        new File([extracted.bytes.slice()], "exif-thumbnail.jpg", {
          type: "image/jpeg",
        }),
        isCurrent,
      );
      check();
      exifThumbnail = { ...extracted, canvas: thumbnail.canvas };
    } catch {
      check();
      exifThumbnail = {
        status: "malformed",
        reason: "Embedded thumbnail could not be decoded safely.",
      };
    }
  }
  await checkpoint();
  const strings = printableStrings(bytes);
  check();
  return {
    metadata: meta,
    ela,
    noise,
    clone,
    gradient,
    levelSweep,
    pca,
    pcaStats,
    exifThumbnail,
    thumbnail: work,
    strings,
    warnings: [
      "Browser-decoded pixels are not byte-exact source pixels. Canvas can discard hidden RGB under full transparency and round semi-transparent RGB; use a raw decoder for pixel-bit steganography.",
      "ELA, noise and clone maps are screening signals, not authenticity verdicts.",
      "Re-encoding, resizing, platform compression and ordinary texture can create highlights.",
      "ELA uses a white matte for transparency and a working image capped at 2048 pixels per side.",
      "PCA uses the decoded, white-matted working RGB image (at most 2048 pixels per side), not raw source pixels or the signal-analysis ROI.",
      "Noise and clone screening use a working image capped at 512 pixels per side, then scale the maps back up.",
      "Clone screening verifies RGB block differences but uses bounded candidate sampling; repeated texture can match and small or transformed copies can be missed.",
      "Printable strings are limited to 100 runs of at most 512 characters each.",
      "C2PA marker scanning does not parse manifests or validate signatures. A match is not proof of provenance.",
    ],
    workWidth: work.width,
    workHeight: work.height,
  };
}
