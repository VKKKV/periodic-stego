type ForwardTransform = (re: Float64Array, im: Float64Array) => void;

function validateChannels(re: Float64Array, im: Float64Array): void {
  if (re.length !== im.length) {
    throw new RangeError("Real and imaginary arrays must have equal lengths");
  }
  if (
    re.buffer === im.buffer &&
    re.byteOffset < im.byteOffset + im.byteLength &&
    im.byteOffset < re.byteOffset + re.byteLength
  ) {
    throw new RangeError("Real and imaginary arrays must not overlap");
  }
}

function validateShape(length: number, width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    !Number.isSafeInteger(width * height) ||
    width * height !== length
  ) {
    throw new RangeError(
      "Dimensions must be positive integers matching the array length",
    );
  }
}

/** Build a radix-2 plan once, reusing its twiddles across image rows/columns. */
function radix2Plan(n: number): ForwardTransform {
  const reverse = new Uint32Array(n);
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 1; i < n; i++) {
    reverse[i] = (reverse[i >>> 1] >>> 1) + (i % 2) * (n / 2);
  }
  for (let i = 0; i < n / 2; i++) {
    const angle = (-2 * Math.PI * i) / n;
    cos[i] = Math.cos(angle);
    sin[i] = Math.sin(angle);
  }

  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = reverse[i];
      if (j > i) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let j = 0; j < half; j++) {
          const even = start + j;
          const odd = even + half;
          const c = cos[j * step];
          const s = sin[j * step];
          const tr = re[odd] * c - im[odd] * s;
          const ti = re[odd] * s + im[odd] * c;
          re[odd] = re[even] - tr;
          im[odd] = im[even] - ti;
          re[even] += tr;
          im[even] += ti;
        }
      }
    }
  };
}

function transform(
  re: Float64Array,
  im: Float64Array,
  inverse: boolean,
  forward: ForwardTransform,
): void {
  if (inverse) {
    for (let i = 0; i < im.length; i++) im[i] = -im[i];
  }
  forward(re, im);
  if (inverse) {
    const n = re.length;
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] = -im[i] / n;
    }
  }
}

function forwardPlan(n: number): ForwardTransform {
  if (n <= 1) return () => {};
  if (Number.isInteger(Math.log2(n))) return radix2Plan(n);

  // Bluestein: convert an arbitrary-length DFT into a padded convolution.
  let m = 1;
  while (m < 2 * n - 1) m *= 2;
  const radix2 = radix2Plan(m);
  const cos = new Float64Array(n);
  const sin = new Float64Array(n);
  const kernelRe = new Float64Array(m);
  const kernelIm = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    // Reducing the square modulo 2N keeps trigonometric arguments small.
    const angle = (Math.PI * ((i * i) % (2 * n))) / n;
    cos[i] = Math.cos(angle);
    sin[i] = Math.sin(angle);
    kernelRe[i] = cos[i];
    kernelIm[i] = sin[i];
    if (i !== 0) {
      kernelRe[m - i] = cos[i];
      kernelIm[m - i] = sin[i];
    }
  }
  radix2(kernelRe, kernelIm);
  const workRe = new Float64Array(m);
  const workIm = new Float64Array(m);

  return (re, im) => {
    workRe.fill(0);
    workIm.fill(0);
    for (let i = 0; i < n; i++) {
      workRe[i] = re[i] * cos[i] + im[i] * sin[i];
      workIm[i] = im[i] * cos[i] - re[i] * sin[i];
    }
    radix2(workRe, workIm);
    for (let i = 0; i < m; i++) {
      const tr = workRe[i] * kernelRe[i] - workIm[i] * kernelIm[i];
      workIm[i] = workRe[i] * kernelIm[i] + workIm[i] * kernelRe[i];
      workRe[i] = tr;
    }
    transform(workRe, workIm, true, radix2);
    for (let i = 0; i < n; i++) {
      re[i] = workRe[i] * cos[i] + workIm[i] * sin[i];
      im[i] = workIm[i] * cos[i] - workRe[i] * sin[i];
    }
  };
}

/**
 * In-place complex DFT: forward uses exp(-2πikj/N), without scaling;
 * inverse uses the positive sign and scales by 1/N. Empty arrays are a no-op.
 * Channels must have equal lengths and non-overlapping storage.
 */
export function fft1d(
  re: Float64Array,
  im: Float64Array,
  inverse = false,
): void {
  validateChannels(re, im);
  transform(re, im, inverse, forwardPlan(re.length));
}

/** In-place row-major 2D DFT. The inverse scales by 1/(width * height). */
export function fft2d(
  re: Float64Array,
  im: Float64Array,
  width: number,
  height: number,
  inverse = false,
): void {
  validateChannels(re, im);
  validateShape(re.length, width, height);
  const rowPlan = forwardPlan(width);
  const columnPlan = width === height ? rowPlan : forwardPlan(height);
  for (let y = 0; y < height; y++) {
    const start = y * width;
    transform(
      re.subarray(start, start + width),
      im.subarray(start, start + width),
      inverse,
      rowPlan,
    );
  }
  const columnRe = new Float64Array(height);
  const columnIm = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      columnRe[y] = re[y * width + x];
      columnIm[y] = im[y * width + x];
    }
    transform(columnRe, columnIm, inverse, columnPlan);
    for (let y = 0; y < height; y++) {
      re[y * width + x] = columnRe[y];
      im[y * width + x] = columnIm[y];
    }
  }
}

/** NumPy-compatible fftshift on both row-major axes; returns a new array. */
export function shift2d(
  data: Float64Array,
  w: number,
  h: number,
): Float64Array {
  validateShape(data.length, w, h);
  const result = new Float64Array(data.length);
  const dx = Math.floor(w / 2);
  const dy = Math.floor(h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      result[((y + dy) % h) * w + ((x + dx) % w)] = data[y * w + x];
    }
  }
  return result;
}
