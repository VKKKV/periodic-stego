import type { AnalysisResult, DisplayParams } from "../core/types";
import { t } from "../i18n";
export function drawProfiles(
  canvas: HTMLCanvasElement,
  r: AnalysisResult,
  d: DisplayParams,
) {
  const width = Math.max(280, canvas.parentElement?.clientWidth || 720),
    height = 408,
    dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#0b1015";
  ctx.fillRect(0, 0, width, height);
  ctx.font = "10px ui-monospace,monospace";
  const data = [
    r.profiles.fftX,
    r.profiles.fftY,
    r.profiles.acX,
    r.profiles.acY,
  ];
  const labels = ["FFT X", "FFT Y", "AC X", "AC Y"];
  const ranges: {
    start: number;
    end: number;
    center: number;
    ac: boolean;
    normalized: Float64Array;
  }[] = [];
  data.forEach((values, k) => {
    const ac = k >= 2,
      center = Math.floor(values.length / 2),
      axis = k % 2 === 0 ? "x" : "y";
    const limit = ac
      ? Math.min(
          center + Math.floor(values.length / 2),
          center + (axis === "x" ? r.params.maxLagX : r.params.maxLagY),
        )
      : center + Math.floor(values.length / 2);
    const span = Math.max(1, (limit - center) / d.profileZoom),
      start = center + Math.max(0, limit - center - span) * d.profilePan,
      end = Math.min(limit, start + span);
    const base = ac
      ? Math.max(1e-18, values[center])
      : (() => {
          const a = Array.from(values)
            .filter((_v, i) => Math.abs(i - center) > r.params.dcRadius)
            .sort((a, b) => a - b);
          return Math.max(1e-18, a[Math.floor(a.length / 2)] ?? 0);
        })();
    const normalized = Float64Array.from(
      { length: values.length + 1 },
      (_, i) => {
        const v = values[i % values.length];
        return ac ? v / base : Math.log10(1 + v / base);
      },
    );
    const threshold = ac
      ? r.params.acThreshold
      : Math.log10(1 + r.params.relativeThreshold);
    let max = Math.max(1, threshold * 1.1);
    for (let i = Math.ceil(start); i <= end; i++)
      max = Math.max(max, normalized[i]);
    const top = k * 102 + 19,
      left = 48,
      pw = width - 68,
      ph = 62,
      min = ac ? -1 : 0;
    const px = (i: number) => left + ((i - start) / (end - start || 1)) * pw,
      py = (v: number) => top + ((max - v) / (max - min)) * ph;
    ctx.fillStyle = "#b0c4d0";
    ctx.fillText(
      labels[k] +
        t(ac ? " · correlation / zero lag" : " · log₁₀(1 + relative power)"),
      left,
      top - 7,
    );
    if (d.grid) {
      ctx.strokeStyle = "#21303a";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(left, top + (i * ph) / 2);
        ctx.lineTo(left + pw, top + (i * ph) / 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#7e95a4";
    ctx.fillText(max.toFixed(1), 6, top + 4);
    ctx.fillText(min.toFixed(1), 6, top + ph);
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, pw, ph);
    ctx.clip();
    ctx.strokeStyle = "#d5a553";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(left, py(threshold));
    ctx.lineTo(left + pw, py(threshold));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#5ac8ee";
    ctx.beginPath();
    let begun = false;
    for (let i = Math.ceil(start); i <= Math.floor(end); i++) {
      if (!begun) {
        ctx.moveTo(px(i), py(normalized[i]));
        begun = true;
      } else ctx.lineTo(px(i), py(normalized[i]));
    }
    ctx.stroke();
    if (d.labels)
      for (const c of r.candidates) {
        if (
          c.axis !== axis ||
          c.source !== (ac ? "autocorrelation" : "fft-profile")
        )
          continue;
        const period = axis === "x" ? c.periodX : c.periodY;
        if (!period) continue;
        const i = center + (ac ? period : values.length / period);
        if (i < start || i > end) continue;
        ctx.fillStyle = "#d8effa";
        ctx.fillText(
          `${period.toFixed(1)} px`,
          Math.min(left + pw - 48, px(i) + 3),
          top + 12,
        );
      }
    ctx.restore();
    ctx.fillStyle = "#7e95a4";
    for (let j = 0; j < 3; j++) {
      const i = start + ((end - start) * j) / 2,
        f = (i - center) / values.length;
      const text = ac
        ? `${(i - center).toFixed(0)} px`
        : d.profileUnits === "period"
          ? `${f ? (1 / f).toFixed(1) : "∞"} px`
          : `${f.toFixed(3)} cyc/px`;
      ctx.fillText(
        text,
        left + (j * pw) / 2 - (j === 2 ? 65 : 0),
        top + ph + 14,
      );
    }
    ranges.push({ start, end, center, ac, normalized });
  });
  canvas.onpointermove = (event) => {
    const b = canvas.getBoundingClientRect(),
      k = Math.floor((event.clientY - b.top) / 102),
      range = ranges[k];
    if (!range) return;
    const fraction = Math.max(
        0,
        Math.min(1, (event.clientX - b.left - 48) / (width - 68)),
      ),
      i = Math.round(range.start + fraction * (range.end - range.start));
    const lag = i - range.center,
      f = lag / data[k].length;
    canvas.title = t(
      range.ac
        ? `${labels[k]} lag ${lag} px · correlation ${range.normalized[i].toPrecision(4)}`
        : `${labels[k]} f ${f.toFixed(5)} cyc/px · period ${f ? (1 / f).toFixed(2) : "∞"} px · relative power ${(10 ** range.normalized[i] - 1).toPrecision(4)}`,
    );
    const out = document.querySelector<HTMLOutputElement>("#cursor");
    if (out) out.value = canvas.title;
  };
}
