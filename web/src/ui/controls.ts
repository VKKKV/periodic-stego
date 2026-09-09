import type { AnalysisParams, DisplayParams } from "../core/types";
type Spec = [string, string, string, string?, number?, number?, number?];
const groups: [string, Spec[]][] = [
  [
    "Preprocessing",
    [
      ["channel", "Channel", "select", "luminance,r,g,b,alpha"],
      ["normalize", "Normalize range", "checkbox"],
      ["removeMean", "Remove mean", "checkbox"],
      ["detrend", "Detrend", "select", "none,row,column,plane"],
      ["analysisGamma", "Analysis gamma", "number", "", 0.1, 5, 0.1],
      ["maxDimension", "Max dimension (px)", "number", "", 8, 1024, 1],
      ["padding", "Padding", "select", "none,power2,explicit"],
      ["paddingSize", "Explicit padded size", "number", "", 8, 2048, 1],
      ["window", "Window function", "select", "none,hann,hamming,blackman"],
    ],
  ],
  [
    "FFT detection",
    [
      ["dcRadius", "DC radius (bins)", "number", "", 0, 128, 1],
      ["peakCount", "Peak count / source", "number", "", 1, 32, 1],
      ["peakSeparation", "Separation (bins)", "number", "", 1, 128, 1],
      [
        "relativeThreshold",
        "Relative power threshold",
        "range",
        "",
        1,
        1000,
        1,
      ],
    ],
  ],
  [
    "Autocorrelation",
    [
      ["acMethod", "Method", "select", "fft,direct"],
      ["acNormalize", "Normalization", "select", "none,center"],
      ["maxLagX", "Max lag X (px)", "number", "", 1, 1024, 1],
      ["maxLagY", "Max lag Y (px)", "number", "", 1, 1024, 1],
      ["minLag", "Minimum lag (px)", "number", "", 1, 1024, 1],
      ["acThreshold", "Peak threshold / zero lag", "range", "", 0, 1, 0.05],
      ["acSeparation", "Lag separation (px)", "number", "", 1, 128, 1],
    ],
  ],
];
const display: Spec[] = [
  ["spectrum", "Spectrum display", "select", "magnitude,power,log-power"],
  ["gamma", "Display gamma", "range", "", 0.1, 5, 0.1],
  ["frequencyZoom", "Frequency zoom", "range", "", 1, 16, 1],
  ["conjugates", "Show conjugate peaks", "checkbox"],
  ["grid", "Show grid / axes", "checkbox"],
  ["labels", "Show period labels", "checkbox"],
  ["wrapWarning", "Show wraparound warning", "checkbox"],
  ["interpolation", "Image interpolation", "select", "nearest,bilinear"],
  ["imageZoom", "Image scale", "select", "fit,100%"],
  ["profileUnits", "FFT profile units", "select", "frequency,period"],
  ["profileZoom", "Profile zoom", "range", "", 1, 16, 1],
  ["profilePan", "Profile pan", "range", "", 0, 1, 0.01],
];
const hints: Record<string, string> = {
  channel:
    "RGB luminance weights: 0.2126, 0.7152, 0.0722. Alpha requires non-opaque pixels.",
  normalize:
    "Scale channel values to [0,1] before detrending. Constant data remains constant.",
  removeMean: "Subtract the mean before windowing to suppress DC.",
  detrend: "Remove row means, column means or a least-squares plane.",
  analysisGamma: "Changes analysis data, unlike display gamma.",
  maxDimension:
    "Area-average downsampling; periods are measured in analyzed pixels. Safe maximum: 1024.",
  padding:
    "Append zero samples after preprocessing. Padding interpolates the spectrum, not new evidence.",
  window:
    "A separable window reduces boundary leakage but broadens spectral peaks.",
  acMethod:
    "FFT circular correlation or direct verification for at most 32 × 32 padded pixels.",
  relativeThreshold:
    "Peak power divided by median background power; this is not a probability.",
  acThreshold:
    "Peak correlation relative to zero-lag energy, including when display normalization is none.",
  gamma: "Display only: remaps heatmap intensities without recomputing FFT.",
  profilePan:
    "Pan from the first to the last available profile interval when zoomed.",
};
function control(spec: Spec, kind: "analysis" | "display") {
  const [name, label, type, options, min, max, step] = spec;
  const hint =
    hints[name] ??
    `${label}. ${kind === "display" ? "Display only; does not change analysis." : "Changes numerical analysis."}`;
  const attrs = `name="${name}" data-kind="${kind}" title="${hint}" aria-label="${label}"`;
  const input =
    type === "select"
      ? `<select ${attrs}>${options!
          .split(",")
          .map((o) => `<option value="${o}">${o}</option>`)
          .join("")}</select>`
      : `<input ${attrs} type="${type}" ${min !== undefined ? `min="${min}" max="${max}" step="${type === "range" ? "any" : step}"` : ""}>`;
  return `<label class="control ${type === "checkbox" ? "check" : ""}"><span>${label}</span>${input}${type === "range" ? `<output data-value="${name}"></output>` : ""}</label>`;
}
export function controlsHTML() {
  return `<div class="section-title">PARAMETERS <button type="button" data-action="reset">Reset</button></div>
    <label class="control"><span>Experiment preset</span><select aria-label="Experiment preset" id="preset">
    ${[
      ["default", "Default detector"],
      ["stripe", "Periodic stripe"],
      ["subtle", "Subtle periodic noise"],
      ["ctf", "CTF forensic"],
      ["jpeg", "JPEG artifact inspection"],
      ["conservative", "Clean / conservative"],
    ]
      .map(([v, l]) => `<option value="${v}">${l}</option>`)
      .join("")}</select></label>
    ${groups.map(([title, specs], i) => `<details ${i === 0 ? "open" : ""}><summary>${title}</summary>${specs.map((s) => control(s, "analysis")).join("")}</details>`).join("")}
    <details><summary>Crop ROI · original pixels</summary><p class="hint">Drag on the original image or enter a rectangle. Coordinates start at zero.</p>
    ${["x", "y", "width", "height"].map((k) => `<label class="control"><span>ROI ${k}</span><input aria-label="ROI ${k}" name="roi.${k}" type="number" min="${k === "x" || k === "y" ? 0 : 1}" step="1"></label>`).join("")}
    <button type="button" data-action="roi-clear">Clear ROI</button></details>
    <details><summary>Display only</summary>${display.map((s) => control(s, "display")).join("")}</details>
    <div class="preset-actions"><button type="button" data-export="preset">Save preset</button><label class="button">Load preset<input type="file" id="preset-file" accept="application/json,.json" hidden></label></div>`;
}
export function syncControls(
  root: HTMLElement,
  a: AnalysisParams,
  d: DisplayParams,
) {
  for (const element of root.querySelectorAll<
    HTMLInputElement | HTMLSelectElement
  >("[data-kind]")) {
    const values = (element.dataset.kind === "analysis"
      ? a
      : d) as unknown as Record<string, unknown>;
    const value = values[element.name];
    if (element instanceof HTMLInputElement && element.type === "checkbox")
      element.checked = Boolean(value);
    else element.value = String(value);
    const output = root.querySelector<HTMLOutputElement>(
      `[data-value="${element.name}"]`,
    );
    if (output) output.value = String(value);
  }
  for (const k of ["x", "y", "width", "height"] as const) {
    const input = root.querySelector<HTMLInputElement>(`[name="roi.${k}"]`)!;
    input.value = a.roi ? String(a.roi[k]) : "";
  }
}
