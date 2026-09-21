export interface LocalImage {
  canvas: HTMLCanvasElement;
  rgba: Uint8ClampedArray;
  bytes: Uint8Array;
  meta: {
    name: string;
    width: number;
    height: number;
    hasAlpha: boolean;
    type: string;
    bytes: number;
    lastModified: number;
  };
}
function dimensions(bytes: Uint8Array): {
  width: number;
  height: number;
  type: string;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
  ) {
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
      type: "image/png",
    };
  }
  if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    let pos = 2;
    while (pos + 3 < bytes.length) {
      if (bytes[pos++] !== 255) throw new Error("Malformed JPEG marker.");
      while (bytes[pos] === 255) pos++;
      const marker = bytes[pos++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (pos + 2 > bytes.length) break;
      const length = view.getUint16(pos);
      if (length < 2 || pos + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 8
      ) {
        return {
          width: view.getUint16(pos + 5),
          height: view.getUint16(pos + 3),
          type: "image/jpeg",
        };
      }
      pos += length;
    }
  }
  if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    const dibSize = view.getUint32(14, true);
    if (dibSize === 12) {
      return {
        width: view.getUint16(18, true),
        height: view.getUint16(20, true),
        type: "image/bmp",
      };
    }
    if (dibSize >= 40 && dibSize <= bytes.length - 14) {
      return {
        width: Math.abs(view.getInt32(18, true)),
        height: Math.abs(view.getInt32(22, true)),
        type: "image/bmp",
      };
    }
  }
  if (
    bytes.length >= 10 &&
    (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")
  ) {
    return {
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
      type: "image/gif",
    };
  }
  throw new Error(
    "Unsupported or corrupt image. Choose a valid PNG, JPEG, BMP, or GIF.",
  );
}
function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
let decodeQueue: Promise<void> = Promise.resolve();
export async function loadImage(
  file: File,
  isCurrent: () => boolean = () => true,
): Promise<LocalImage> {
  const previous = decodeQueue;
  let release!: () => void;
  decodeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const check = () => {
    if (!isCurrent()) throw new Error("Image request superseded.");
  };
  try {
    check();
    return await decodeImage(file, check);
  } finally {
    release();
  }
}
async function decodeImage(file: File, check: () => void): Promise<LocalImage> {
  if (file.size === 0) throw new Error("The image file is empty.");
  if (file.size > 32 * 1024 * 1024)
    throw new Error("File exceeds 32 MiB. Resize it locally before opening.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  check();
  const header = dimensions(bytes);
  if (
    !header.width ||
    !header.height ||
    header.width > 16384 ||
    header.height > 16384 ||
    header.width * header.height > 16777216
  ) {
    throw new Error(
      "Image exceeds the safe decode limit (16 megapixels / 16384 px per side). Resize it locally first.",
    );
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: header.type }));
  } catch {
    throw new Error(
      "The browser could not decode this image. It may be corrupt or unsupported.",
    );
  }
  try {
    check();
    const canvas = document.createElement("canvas");
    canvas.dataset.sourceDecode = "true";
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D is not supported by this browser.");
    ctx.drawImage(bitmap, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hasAlpha = false;
    for (let i = 3; i < rgba.length; i += 4)
      if (rgba[i] < 255) {
        hasAlpha = true;
        break;
      }
    return {
      canvas,
      rgba,
      bytes,
      meta: {
        name: file.name,
        width: canvas.width,
        height: canvas.height,
        hasAlpha,
        type: header.type,
        bytes: file.size,
        lastModified: file.lastModified,
      },
    };
  } finally {
    bitmap.close();
  }
}
export async function demoFile(name: string): Promise<File> {
  if (!["vertical", "horizontal", "both", "noise", "constant"].includes(name))
    throw new Error("Unknown demo.");
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext("2d")!;
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  let seed = 7;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      let v = name === "constant" ? 128 : 128 + (random() - 0.5) * 70;
      if (name === "vertical" || name === "both")
        v += 56 * Math.sin((2 * Math.PI * x) / 16);
      if (name === "horizontal" || name === "both")
        v += 56 * Math.sin((2 * Math.PI * y) / 16);
      pixels.data[i] = v;
      pixels.data[i + 1] = v;
      pixels.data[i + 2] = v;
      pixels.data[i + 3] = 255;
    }
  ctx.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Demo PNG generation failed.")),
      "image/png",
    ),
  );
  return new File([blob], `synthetic-${name}-period16.png`, {
    type: "image/png",
    lastModified: 0,
  });
}
