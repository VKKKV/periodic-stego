import type {
  AnalysisParams,
  AnalysisResult,
  DisplayParams,
} from "../core/types";
import { controlsHTML, syncControls } from "./controls";
import {
  dataCanvas,
  drawImageView,
  readout,
  type PlotRect,
} from "../render/heatmap";
import { drawProfiles } from "../render/profile";
import { disparityCanvas } from "../render/disparity";
import { bindStaticText, getLocale, setLocale, t } from "../i18n";
import licenseUrl from "../../../LICENSE?url";
interface Callbacks {
  onAnalysis: (p: AnalysisParams) => void;
  onDisplay: (p: DisplayParams) => void;
  onFile: (f: File) => void;
  onDemo: (name: string) => void;
  onPreset: (name: string) => void;
  onReset: () => void;
  onExport: (kind: string) => void;
  onLoadPreset: (f: File) => void;
  onDebug: () => void;
}
export function mountUI(
  root: HTMLElement,
  analysis: AnalysisParams,
  display: DisplayParams,
  callbacks: Callbacks,
) {
  let a = structuredClone(analysis),
    d = structuredClone(display),
    result: AnalysisResult | null = null,
    original: HTMLCanvasElement | null = null;
  let kind = "original",
    rect: PlotRect | null = null,
    hasAlpha = false;
  let images: Record<string, HTMLCanvasElement> = {};
  root.innerHTML = `<header class="masthead"><div class="brand">PERIODIC<span> / STEGO</span><small>LOCAL IMAGE ANALYSIS WORKBENCH</small></div><div class="header-actions"><span class="local-badge">LOCAL ONLY</span><select id="language" aria-label="Language / 语言"><option value="en" lang="en">English</option><option value="zh-CN" lang="zh-CN">中文</option></select><button id="parameters-toggle" aria-expanded="false" aria-controls="parameters">Parameters</button><label class="button primary">Open image<input id="image-file" type="file" accept="image/png,image/jpeg" hidden></label><select aria-label="Export diagnostic" id="export-select"><option value="report">JSON report</option><option value="fft">FFT PNG</option><option value="autocorrelation">Autocorrelation PNG</option><option value="profiles">Profiles PNG</option><option value="preprocessed">Preprocessed PNG</option><option value="original">Original PNG</option><option value="stereogram" disabled>Stereogram disparity PNG</option></select><button id="export-button">Export</button></div></header>
    <div class="workstation"><aside id="parameters">${controlsHTML()}</aside><main class="workspace"><div class="source-bar"><span id="image-meta">No image loaded</span><label>Fixture <select id="demo" aria-label="Synthetic fixture"><option value="vertical">Vertical · 16 px</option><option value="horizontal">Horizontal · 16 px</option><option value="both">Both axes · 16 px</option><option value="noise">Noise only</option><option value="constant">Constant</option></select></label><button id="demo-button">Run demo</button></div>
    <div id="error" role="alert" hidden></div><div class="view-tabs" role="tablist" aria-label="Image views">${[
      ["original", "Original"],
      ["preprocessed", "Preprocessed"],
      ["fft", "FFT spectrum"],
      ["autocorrelation", "Autocorrelation"],
      ["stereogram", "Stereogram disparity"],
    ]
      .map(
        ([v, l]) =>
          `<button role="tab" aria-selected="${v === "original"}" ${v === "stereogram" ? "disabled" : ""} data-view="${v}">${l}</button>`,
      )
      .join("")}</div>
    <div class="canvas-stage" data-testid="drop-zone"><div id="empty"><span class="eyebrow">START AN EXPERIMENT</span><h1>Find the rhythm.<br>Question the signal.</h1><p>Drop a PNG or JPEG here.<br>Inspect repeated structure, one parameter at a time.</p><p class="privacy">Your image stays in this browser.<br>No upload. No account. No cloud analysis.</p></div><canvas id="main-canvas" data-testid="main-canvas" aria-label="Interactive image diagnostic" hidden></canvas></div>
    <div class="readout"><output id="cursor">Move over a plot for coordinates and values</output><span id="units">original pixels</span></div>
    <div class="section-title profile-heading">AXIS PROFILES <span>FFT / CIRCULAR AUTOCORRELATION</span></div><div class="profiles"><canvas id="profile-canvas" data-testid="profile-canvas" aria-label="X and Y FFT and autocorrelation profiles" hidden></canvas><p id="profile-empty" class="hint">Numerical profiles appear after an image is analyzed. Dashed amber lines mark detection thresholds.</p></div>
    <footer><span id="status" data-testid="status" role="status"></span><button id="debug">Copy debug info</button><div class="legal"><span>© 2026 periodic-stego contributors</span> · <a href="${licenseUrl}" download="LICENSE.txt">AGPL-3.0-only</a> · <a href="https://github.com/VKKKV/periodic-stego" target="_blank" rel="noopener noreferrer">Source code</a><span class="legal-note">No warranty. Redistribution permitted under AGPLv3.</span></div></footer></main>
    <aside class="findings"><div class="section-title">FINDINGS <span id="candidate-count">—</span></div><p id="result-note" class="hint" hidden>Previous result · not current; wait for a successful analysis.</p><div id="verdict"><h2>Evidence, not a verdict.</h2><p>A periodic peak can reveal repeated structure. It cannot prove a hidden message.</p></div><div id="stats"></div><div id="candidates"></div><details open class="caveats"><summary>Interpretation & limitations</summary><ul id="warnings"><li>JPEG blocks, resizing, scanlines and ordinary textures can also produce peaks.</li><li>Confidence describes signal strength, not steganography probability.</li></ul></details></aside></div>`;
  const localizeStatic = bindStaticText(root);
  let statusText = "",
    errorText = "";
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const main = $<HTMLCanvasElement>("#main-canvas"),
    profiles = $<HTMLCanvasElement>("#profile-canvas");
  function syncStereoView() {
    const available = Boolean(result?.stereogram);
    $<HTMLButtonElement>('[data-view="stereogram"]').disabled = !available;
    $<HTMLOptionElement>('#export-select option[value="stereogram"]').disabled =
      !available;
    if (
      !available &&
      $<HTMLSelectElement>("#export-select").value === "stereogram"
    )
      $<HTMLSelectElement>("#export-select").value = "report";
    if (!available && kind === "stereogram") {
      kind = "original";
      for (const tab of root.querySelectorAll<HTMLElement>("[data-view]"))
        tab.setAttribute("aria-selected", String(tab.dataset.view === kind));
    }
  }
  function render() {
    const image = kind === "original" ? original : images[kind];
    $("#empty").hidden = Boolean(original);
    main.hidden = !image;
    if (image) rect = drawImageView(main, image, d, kind, result, a.roi);
    if (result) {
      profiles.hidden = false;
      $("#profile-empty").hidden = true;
      drawProfiles(profiles, result, d);
    }
    $("#units").textContent = t(
      kind === "original"
        ? "original pixels"
        : kind === "stereogram"
          ? "disparity · original px · blue = unmatched"
          : kind === "autocorrelation"
            ? "circular lag · analyzed px"
            : "analyzed pixels",
    );
  }
  function findings() {
    if (!result) {
      if (original) $("#verdict").textContent = t("Evidence, not a verdict.");
      return;
    }
    $("#candidate-count").textContent = String(
      result.candidates.length + (result.stereogram ? 1 : 0),
    );
    $("#verdict").replaceChildren();
    const h = document.createElement("h2");
    h.textContent = t(
      !result.stats.usefulSignal
        ? "No useful signal"
        : result.stats.strongPeriodicity
          ? "Strong repeated structure"
          : "No strong periodic evidence",
    );
    const p = document.createElement("p");
    p.textContent = t("Detection confidence is not proof of hidden content.");
    $("#verdict").append(h, p);
    $("#stats").textContent = t(
      `${result.processedWidth} × ${result.processedHeight} analyzed px · FFT ${result.width} × ${result.height}\nμ ${result.stats.mean.toFixed(5)} · σ ${result.stats.stddev.toFixed(5)}\nOriginal scale X ${result.scaleX.toFixed(3)} / Y ${result.scaleY.toFixed(3)}`,
    );
    const list = $("#candidates");
    const openCaveats = Array.from(
      list.querySelectorAll<HTMLDetailsElement>(".candidate details"),
      (el) => el.open,
    );
    list.replaceChildren();
    const stereo = result.stereogram;
    if (stereo) {
      const item = document.createElement("article");
      item.className = "candidate stereo-candidate";
      const title = document.createElement("h3");
      title.textContent = `${t("Horizontal repeat")} · ${stereo.period} ${t("original px")}`;
      const body = document.createElement("p");
      body.textContent = `${t("Native row matching")}\n${t("Correlation")} ${stereo.correlation.toFixed(3)} · ${t("Row support")} ${(100 * stereo.rowSupport).toFixed(0)}%\n${t("Matched pixels")} ${(100 * stereo.matchedFraction).toFixed(0)}%`;
      const note = document.createElement("p");
      note.textContent = t(
        "Native ROI/channel pass, independent of FFT controls. Horizontal repetition may be a stereogram or tiled texture. View disparity; it is not decoded text or metric depth.",
      );
      item.append(title, body, note);
      list.append(item);
    }
    let caveatIndex = 0;
    for (const c of result.candidates) {
      const item = document.createElement("article");
      item.className = "candidate";
      const title = document.createElement("h3");
      title.textContent = `${c.axis.toUpperCase()} · ${(c.periodX ?? c.periodY ?? 0).toFixed(2)} px`;
      const originalPeriod = document.createElement("p");
      originalPeriod.textContent = `${t("Original period")} X ${c.periodX === null ? "—" : (c.periodX * result.scaleX).toFixed(2)} · Y ${c.periodY === null ? "—" : (c.periodY * result.scaleY).toFixed(2)} px`;
      const body = document.createElement("p");
      body.textContent = t(
        `${c.source}\nfx ${c.frequencyX?.toFixed(5) ?? "—"} · fy ${c.frequencyY?.toFixed(5) ?? "—"} cyc/px\nPx ${c.periodX?.toFixed(2) ?? "—"} · Py ${c.periodY?.toFixed(2) ?? "—"}\nPower ${c.power.toExponential(2)} · relative ${c.relativePower.toPrecision(3)}\nSignal score ${c.confidence.toFixed(2)} / 1 (uncalibrated)`,
      );
      const details = document.createElement("details"),
        summary = document.createElement("summary"),
        text = document.createElement("p");
      details.open = openCaveats[caveatIndex++] ?? false;
      summary.textContent = t("Caveats");
      text.textContent = c.caveats.map(t).join(" ");
      details.append(summary, text);
      item.append(title, originalPeriod, body, details);
      list.append(item);
    }
    $("#warnings").replaceChildren();
    for (const warning of result.warnings) {
      if (!d.wrapWarning && warning.startsWith("Circular autocorrelation"))
        continue;
      const li = document.createElement("li");
      li.textContent = t(warning);
      $("#warnings").append(li);
    }
  }
  function sync() {
    syncControls(root, a, d);
    const option = root.querySelector<HTMLOptionElement>(
      'select[name="channel"] option[value="alpha"]',
    );
    if (option) option.disabled = !hasAlpha;
  }
  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(
      target instanceof HTMLInputElement || target instanceof HTMLSelectElement
    ))
      return;
    if (target.dataset.kind) {
      const value =
        target instanceof HTMLInputElement && target.type === "checkbox"
          ? target.checked
          : target instanceof HTMLInputElement
            ? target.valueAsNumber
            : target.value;
      const values = (target.dataset.kind === "analysis"
        ? a
        : d) as unknown as Record<string, unknown>;
      values[target.name] = value;
      const output = root.querySelector<HTMLOutputElement>(
        `[data-value="${target.name}"]`,
      );
      if (output) output.value = String(value);
      if (target.dataset.kind === "analysis")
        callbacks.onAnalysis(structuredClone(a));
      else callbacks.onDisplay(structuredClone(d));
    } else if (target.name.startsWith("roi.") && original) {
      const roi = a.roi ?? {
        x: 0,
        y: 0,
        width: original.width,
        height: original.height,
      };
      roi[target.name.slice(4) as keyof typeof roi] = (
        target as HTMLInputElement
      ).valueAsNumber;
      a.roi = roi;
      callbacks.onAnalysis(structuredClone(a));
      render();
    }
  });
  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!button) return;
    if (button.dataset.view) {
      kind = button.dataset.view;
      for (const tab of root.querySelectorAll("[data-view]"))
        tab.setAttribute(
          "aria-selected",
          String((tab as HTMLElement).dataset.view === kind),
        );
      render();
    }
    if (button.dataset.export) callbacks.onExport(button.dataset.export);
    if (button.dataset.action === "reset") callbacks.onReset();
    if (button.dataset.action === "roi-clear") {
      a.roi = null;
      sync();
      render();
      callbacks.onAnalysis(structuredClone(a));
    }
  });
  $<HTMLInputElement>("#image-file").onchange = (event) => {
    const el = event.target as HTMLInputElement;
    if (el.files?.[0]) callbacks.onFile(el.files[0]);
    el.value = "";
  };
  $<HTMLInputElement>("#preset-file").onchange = (event) => {
    const el = event.target as HTMLInputElement;
    if (el.files?.[0]) callbacks.onLoadPreset(el.files[0]);
    el.value = "";
  };
  $<HTMLSelectElement>("#preset").onchange = (event) =>
    callbacks.onPreset((event.target as HTMLSelectElement).value);
  $("#demo-button").onclick = () =>
    callbacks.onDemo($<HTMLSelectElement>("#demo").value);
  $("#export-button").onclick = () =>
    callbacks.onExport($<HTMLSelectElement>("#export-select").value);
  $("#debug").onclick = callbacks.onDebug;
  function localize() {
    localizeStatic();
    $("#status").textContent = t(statusText);
    $("#error").textContent = t(errorText);
    $("#cursor").textContent = t("Move over a plot for coordinates and values");
    profiles.removeAttribute("title");
    render();
    findings();
  }
  const language = $<HTMLSelectElement>("#language");
  language.value = getLocale();
  language.onchange = () => {
    setLocale(language.value);
    localize();
  };
  $("#parameters-toggle").onclick = () => {
    const open = root.classList.toggle("drawer-open");
    $("#parameters-toggle").setAttribute("aria-expanded", String(open));
  };
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      root.classList.remove("drawer-open");
      $("#parameters-toggle").setAttribute("aria-expanded", "false");
    }
  });
  let drag: { x: number; y: number } | null = null;
  const point = (event: PointerEvent) => {
    const b = main.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          original!.width - 1,
          Math.floor(
            rect!.sx +
              ((event.clientX - b.left - rect!.left) / rect!.width) * rect!.sw,
          ),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          original!.height - 1,
          Math.floor(
            rect!.sy +
              ((event.clientY - b.top - rect!.top) / rect!.height) * rect!.sh,
          ),
        ),
      ),
    };
  };
  main.onpointermove = (event) => {
    if (rect)
      $<HTMLOutputElement>("#cursor").value = readout(
        event,
        main,
        rect,
        kind,
        result,
      );
  };
  main.onpointerdown = (event) => {
    if (kind !== "original" || !original || !rect) return;
    const bounds = main.getBoundingClientRect();
    const x = event.clientX - bounds.left,
      y = event.clientY - bounds.top;
    if (
      x < rect.left ||
      y < rect.top ||
      x >= rect.left + rect.width ||
      y >= rect.top + rect.height
    )
      return;
    drag = point(event);
    main.setPointerCapture(event.pointerId);
  };
  main.onpointerup = (event) => {
    if (!drag || !original || !rect) return;
    const end = point(event);
    if (Math.abs(end.x - drag.x) < 2 && Math.abs(end.y - drag.y) < 2) {
      drag = null;
      return;
    }
    a.roi = {
      x: Math.min(drag.x, end.x),
      y: Math.min(drag.y, end.y),
      width: Math.abs(end.x - drag.x) + 1,
      height: Math.abs(end.y - drag.y) + 1,
    };
    drag = null;
    sync();
    render();
    callbacks.onAnalysis(structuredClone(a));
  };
  main.onpointercancel = () => {
    drag = null;
  };
  new ResizeObserver(() => render()).observe($(".workspace"));
  sync();
  localize();
  return {
    setStatus: (text: string, busy: boolean) => {
      statusText = text;
      $("#status").textContent = t(text);
      $<HTMLButtonElement>("#export-button").disabled =
        root.dataset.current !== "true";
      $("#status").classList.toggle("busy", busy);
      $("#result-note").hidden = !result || root.dataset.current === "true";
    },
    setError: (message: string) => {
      errorText = message;
      $("#error").textContent = t(message);
      $("#error").hidden = !message;
    },
    setControls: (nextA: AnalysisParams, nextD: DisplayParams) => {
      a = structuredClone(nextA);
      d = structuredClone(nextD);
      sync();
      render();
    },
    setImage: (
      canvas: HTMLCanvasElement,
      meta: { name: string; width: number; height: number; hasAlpha: boolean },
    ) => {
      drag = null;
      result = null;
      images = {};
      syncStereoView();
      profiles.hidden = true;
      $("#profile-empty").hidden = false;
      $("#result-note").hidden = true;
      $("#candidate-count").textContent = "—";
      for (const id of ["#stats", "#candidates", "#warnings"])
        $(id).replaceChildren();
      $("#verdict").textContent = t("Evidence, not a verdict.");
      original = canvas;
      hasAlpha = meta.hasAlpha;
      $("#image-meta").textContent =
        `${meta.name} · ${meta.width} × ${meta.height} px`;
      sync();
      render();
    },
    setResult: (next: AnalysisResult, nextD: DisplayParams) => {
      const remap =
        result !== next || images.fft?.dataset.gamma !== String(nextD.gamma);
      const remapFFT = remap || images.fft?.dataset.spectrum !== nextD.spectrum;
      result = next;
      d = structuredClone(nextD);
      syncStereoView();
      images = {
        preprocessed:
          !remap && images.preprocessed
            ? images.preprocessed
            : dataCanvas(
                next.preprocessed,
                next.width,
                next.height,
                "gray",
                d.gamma,
              ),
        fft:
          !remapFFT && images.fft
            ? images.fft
            : dataCanvas(
                next.power,
                next.width,
                next.height,
                d.spectrum,
                d.gamma,
              ),
        autocorrelation:
          !remap && images.autocorrelation
            ? images.autocorrelation
            : dataCanvas(
                next.autocorrelation,
                next.width,
                next.height,
                "ac",
                d.gamma,
              ),
      };
      images.fft.dataset.gamma = String(d.gamma);
      if (next.stereogram)
        images.stereogram = disparityCanvas(next.stereogram, d.gamma);
      images.fft.dataset.spectrum = d.spectrum;
      render();
      findings();
    },
    getCanvas: (name: string) => {
      if (name === "profiles") return profiles;
      if (name === "original") return original;
      const image = images[name];
      if (!image) return null;
      const output = document.createElement("canvas");
      drawImageView(output, image, d, name, result, null);
      return output;
    },
  };
}
