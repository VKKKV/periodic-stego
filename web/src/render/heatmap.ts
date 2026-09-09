import type { AnalysisResult, DisplayParams } from "../core/types";
export function dataCanvas(
  values: Float64Array,
  w: number,
  h: number,
  mode: "gray" | "ac" | "power" | "magnitude" | "log-power",
  gamma: number,
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!,
    pixels = ctx.createImageData(w, h);
  const transformed = new Float64Array(values.length);
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v =
      mode === "log-power"
        ? Math.log1p(Math.max(0, values[i]))
        : mode === "magnitude"
          ? Math.sqrt(Math.max(0, values[i]))
          : values[i];
    transformed[i] = v;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  for (let i = 0; i < values.length; i++) {
    const t = Math.pow(
        Math.max(0, (transformed[i] - min) / Math.max(max - min, 1e-18)),
        1 / gamma,
      ),
      k = i * 4;
    if (mode === "gray")
      pixels.data[k] =
        pixels.data[k + 1] =
        pixels.data[k + 2] =
          Math.round(t * 255);
    else {
      pixels.data[k] = Math.round(8 + 155 * t * t);
      pixels.data[k + 1] = Math.round(14 + 222 * t);
      pixels.data[k + 2] = Math.round(24 + 231 * Math.sqrt(t));
    }
    pixels.data[k + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return c;
}
export interface PlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}
export function drawImageView(
  canvas: HTMLCanvasElement,
  image: HTMLCanvasElement,
  d: DisplayParams,
  kind: string,
  result: AnalysisResult | null,
  roi: { x: number; y: number; width: number; height: number } | null,
): PlotRect {
  const parentWidth = canvas.parentElement?.clientWidth || 720;
  const native =
    kind !== "fft" && kind !== "autocorrelation" && d.imageZoom === "100%";
  const width = Math.max(280, parentWidth, native ? image.width + 64 : 0),
    height = native
      ? Math.max(240, image.height + 54)
      : Math.max(240, Math.min(480, width * 0.62));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#090d11";
  ctx.fillRect(0, 0, width, height);
  const spectral = kind === "fft",
    ac = kind === "autocorrelation";
  const zoom = spectral ? d.frequencyZoom : 1;
  const sw = image.width / zoom,
    sh = image.height / zoom,
    sx =
      spectral && zoom > 1
        ? Math.floor(image.width / 2) + 0.5 - sw / 2
        : (image.width - sw) / 2,
    sy =
      spectral && zoom > 1
        ? Math.floor(image.height / 2) + 0.5 - sh / 2
        : (image.height - sh) / 2;
  const ratio = Math.min((width - 64) / sw, (height - 54) / sh);
  const scale = !spectral && !ac && d.imageZoom === "100%" ? 1 : ratio;
  const dw = sw * scale,
    dh = sh * scale,
    left = (width - dw) / 2,
    top = (height - dh) / 2;
  ctx.imageSmoothingEnabled = d.interpolation === "bilinear";
  ctx.save();
  ctx.beginPath();
  ctx.rect(32, 20, width - 64, height - 54);
  ctx.clip();
  ctx.drawImage(image, sx, sy, sw, sh, left, top, dw, dh);
  if (d.grid) {
    ctx.strokeStyle = "rgba(175,214,231,.22)";
    ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      ctx.beginPath();
      ctx.moveTo(left + (dw * k) / 4, top);
      ctx.lineTo(left + (dw * k) / 4, top + dh);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(left, top + (dh * k) / 4);
      ctx.lineTo(left + dw, top + (dh * k) / 4);
      ctx.stroke();
    }
  }
  const px = (x: number) => left + ((x - sx + 0.5) / sw) * dw,
    py = (y: number) => top + ((y - sy + 0.5) / sh) * dh;
  if (result && (spectral || ac)) {
    ctx.strokeStyle = "#d8eef6";
    ctx.beginPath();
    ctx.moveTo(
      px(Math.floor(image.width / 2)) - 7,
      py(Math.floor(image.height / 2)),
    );
    ctx.lineTo(
      px(Math.floor(image.width / 2)) + 7,
      py(Math.floor(image.height / 2)),
    );
    ctx.moveTo(
      px(Math.floor(image.width / 2)),
      py(Math.floor(image.height / 2)) - 7,
    );
    ctx.lineTo(
      px(Math.floor(image.width / 2)),
      py(Math.floor(image.height / 2)) + 7,
    );
    ctx.stroke();
    ctx.font = "10px ui-monospace,monospace";
    for (const c of result.candidates) {
      if (
        (spectral && c.source !== "fft-2d") ||
        (ac && c.source !== "autocorrelation")
      )
        continue;
      const x = spectral
          ? c.binX!
          : (Math.floor(image.width / 2) + (c.lagX ?? 0)) % image.width,
        y = spectral
          ? c.binY!
          : (Math.floor(image.height / 2) + (c.lagY ?? 0)) % image.height;
      const points = [[x, y]];
      if (spectral && d.conjugates)
        points.push([
          (((2 * Math.floor(image.width / 2) - x) % image.width) +
            image.width) %
            image.width,
          (((2 * Math.floor(image.height / 2) - y) % image.height) +
            image.height) %
            image.height,
        ]);
      for (const [xx, yy] of points) {
        ctx.strokeStyle = "#58c8f0";
        ctx.strokeRect(px(xx) - 4, py(yy) - 4, 8, 8);
        if (d.labels) {
          ctx.fillStyle = "#e0f4ff";
          ctx.fillText(
            `${(c.periodX ?? c.periodY ?? 0).toFixed(1)} px`,
            px(xx) + 7,
            py(yy) - 5,
          );
        }
      }
    }
  }
  if (kind === "original" && roi) {
    ctx.strokeStyle = "#62d2fa";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      left + (roi.x / image.width) * dw,
      top + (roi.y / image.height) * dh,
      (roi.width / image.width) * dw,
      (roi.height / image.height) * dh,
    );
  }
  ctx.restore();
  if (d.grid) {
    ctx.fillStyle = "#9bb0bc";
    ctx.font = "10px ui-monospace,monospace";
    const xLabel = spectral
      ? "fx · cycles / analyzed px"
      : ac
        ? "lag X · analyzed px"
        : "X · image pixels";
    ctx.fillText(xLabel, 32, height - 9);
    ctx.fillText(spectral ? "fy" : ac ? "lag Y" : "Y", 5, 16);
    for (let k = 0; k <= 4; k++) {
      const sample = sx + (sw * k) / 4 - 0.5;
      const v = spectral
        ? (sample - Math.floor(image.width / 2)) / image.width
        : ac
          ? sample - Math.floor(image.width / 2)
          : sample;
      ctx.fillText(
        spectral ? v.toFixed(3) : Math.round(v).toString(),
        left + (dw * k) / 4 - 10,
        top + dh + 14,
      );
      const sampleY = sy + (sh * k) / 4 - 0.5;
      const valueY = spectral
        ? (sampleY - Math.floor(image.height / 2)) / image.height
        : ac
          ? sampleY - Math.floor(image.height / 2)
          : sampleY;
      ctx.fillText(
        spectral ? valueY.toFixed(3) : Math.round(valueY).toString(),
        2,
        top + (dh * k) / 4 + 3,
      );
    }
  }
  return { left, top, width: dw, height: dh, sx, sy, sw, sh };
}
export function readout(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  rect: PlotRect,
  kind: string,
  result: AnalysisResult | null,
) {
  const b = canvas.getBoundingClientRect(),
    x = Math.floor(
      rect.sx + ((event.clientX - b.left - rect.left) / rect.width) * rect.sw,
    ),
    y = Math.floor(
      rect.sy + ((event.clientY - b.top - rect.top) / rect.height) * rect.sh,
    );
  if (!result || kind === "original") return `x ${x} · y ${y} original px`;
  if (x < 0 || y < 0 || x >= result.width || y >= result.height)
    return "Outside image";
  if (kind === "fft") {
    const fx = (x - Math.floor(result.width / 2)) / result.width,
      fy = (y - Math.floor(result.height / 2)) / result.height;
    return `fx ${fx.toFixed(5)} · fy ${fy.toFixed(5)} cyc/px | period X ${fx ? (1 / Math.abs(fx)).toFixed(2) : "∞"} · Y ${fy ? (1 / Math.abs(fy)).toFixed(2) : "∞"} px | power ${result.power[y * result.width + x].toExponential(3)}`;
  }
  if (kind === "autocorrelation")
    return `lag X ${x - Math.floor(result.width / 2)} · Y ${y - Math.floor(result.height / 2)} px | AC ${result.autocorrelation[y * result.width + x].toPrecision(5)}`;
  return `x ${x} · y ${y} analyzed px | value ${result.preprocessed[y * result.width + x].toPrecision(5)}`;
}
