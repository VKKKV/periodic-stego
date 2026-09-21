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
import type { ForensicAnalysis } from "../forensics";
import type { ImageStegoChallenge } from "../challenges";
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
  onForensicRetry: () => void;
  onForensicExport: (canvas: HTMLCanvasElement, name: string) => void;
  onChallenges: () => void;
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
    forensic: ForensicAnalysis | null = null,
    original: HTMLCanvasElement | null = null;
  let kind = "original",
    rect: PlotRect | null = null,
    hasAlpha = false;
  let images: Record<string, HTMLCanvasElement> = {};
  root.innerHTML = `<header class="masthead app-header"><div class="brand"><div><strong>PERIODIC <em>/ STEGO</em></strong><small>LOCAL IMAGE FORENSICS WORKBENCH</small></div></div><div class="header-tools"><select id="language" aria-label="Language / 语言"><option value="en" lang="en">English</option><option value="zh-CN" lang="zh-CN">中文</option></select></div></header>
    <div class="app-shell"><nav class="workflow" aria-label="Workflow"><div class="workflow-step is-active"><b>01</b><span>Load an image<small>PNG · JPEG · BMP · GIF</small></span></div><div class="workflow-line"></div><div class="workflow-step"><b>02</b><span>Automatic analysis<small>Signal · image forensics</small></span></div><div class="workflow-line"></div><div class="workflow-step"><b>03</b><span>Inspect the evidence<small>Compare · inspect · export</small></span></div></nav>
    <div class="command-bar"><div class="source-summary"><span class="step-kicker">CURRENT INPUT</span><strong id="image-meta">No image loaded</strong><span id="status" data-testid="status" role="status">Ready for a local image</span></div><div class="command-actions"><button type="button" id="open-image-button" class="primary">Open image</button><input id="image-file" type="file" accept="image/png,image/jpeg,image/bmp,image/gif" hidden><label class="demo-control">Sample <select id="demo" aria-label="Synthetic fixture"><option value="vertical">Vertical pattern</option><option value="horizontal">Horizontal pattern</option><option value="both">Cross pattern</option><option value="noise">Noise only</option><option value="constant">Constant</option></select></label><button id="demo-button" type="button">Try sample</button><button id="challenges-button" type="button">Challenge catalog</button><button id="parameters-toggle" aria-expanded="false" aria-controls="parameters">Controls</button></div></div>
    <div class="workstation"><aside id="parameters"><div class="panel-intro"><span class="step-kicker">SIGNAL ANALYSIS</span><h2>Controls</h2><p>Start with the defaults. Open a section only when you need to change how the image is measured.</p></div>${controlsHTML()}</aside><main class="workspace"><div id="error" role="alert" hidden></div><div class="result-toolbar"><div><span class="step-kicker">WORKSPACE</span><strong>Inspect the image</strong></div><div class="export-actions"><button type="button" id="forensic-toggle" aria-controls="forensic-panel" aria-expanded="false" disabled>Forensic results</button><select aria-label="Export diagnostic" id="export-select"><option value="report">JSON report</option><option value="fft">FFT PNG</option><option value="autocorrelation">Autocorrelation PNG</option><option value="profiles">Profiles PNG</option><option value="preprocessed">Preprocessed PNG</option><option value="original">Original PNG</option><option value="stereogram" disabled>Stereogram disparity PNG</option></select><button id="export-button" type="button">Export</button></div></div><div class="view-tabs" role="tablist" aria-label="Image views">${[
      ["original", "Original"],
      ["preprocessed", "Preprocessed"],
      ["fft", "FFT spectrum"],
      ["autocorrelation", "Autocorrelation"],
      ["stereogram", "Stereogram disparity"],
    ]
      .map(
        ([v, l]) =>
          `<button role="tab" id="view-${v}" aria-controls="image-panel" tabindex="${v === "original" ? 0 : -1}" aria-selected="${v === "original"}" ${v === "stereogram" ? "disabled" : ""} data-view="${v}">${l}</button>`,
      )
      .join("")}</div>
    <div class="canvas-stage" id="image-panel" role="tabpanel" aria-labelledby="view-original" data-testid="drop-zone"><div id="empty"><span class="eyebrow">STEP 01 · LOAD A LOCAL IMAGE</span><h1>Find the rhythm.<br><span>Question the signal.</span></h1><p>Drop an image here, choose <b>Open image</b>, or try a sample.</p><div class="empty-actions"><button type="button" id="empty-image-button" class="primary">Choose image</button><input type="file" accept="image/png,image/jpeg,image/bmp,image/gif" hidden><button type="button" id="empty-sample">Try a sample</button></div><p class="privacy"><b>Private by design.</b> Pixels stay in this browser. No account, upload, or cloud analysis.</p></div><canvas id="main-canvas" data-testid="main-canvas" aria-label="Interactive image diagnostic" hidden></canvas></div>
    <div class="forensic-panel" id="forensic-panel" hidden><div class="section-title"><span>IMAGE FORENSICS <small>LOCAL / SCREENING ONLY</small></span><button type="button" id="forensic-close">Close</button></div><p id="forensic-status" role="status" data-state="idle"></p><button type="button" id="forensic-retry" hidden>Retry forensic analysis</button><div class="forensic-toolbar"><label>Method <select id="forensic-tool" aria-label="Forensic tool"><option value="ela-90">ELA · JPEG quality 90</option><option value="ela-75">ELA · JPEG quality 75</option><option value="ela-50">ELA · JPEG quality 50</option><option value="ela-95">ELA · JPEG quality 95</option><option value="noise">Noise residual</option><option value="gradient">Luminance gradient</option><option value="level-sweep">Luminance bands</option><option value="pca">Weighted RGB grayscale</option><option value="clone">Clone candidates</option><option value="thumbnail">Decoded working image</option><option value="metadata">Metadata / JPEG structure</option><option value="strings">String extraction</option></select></label><button type="button" id="forensic-export">Export view</button></div><div class="forensic-grid"><canvas id="forensic-canvas" aria-label="Forensic diagnostic" hidden></canvas><pre id="forensic-meta"></pre></div><ul id="forensic-warnings"></ul></div>
    <div class="challenge-panel" id="challenge-panel" hidden><div class="section-title"><span>IMAGE STEGO CHALLENGES <small>BLOG-DERIVED CATALOG</small></span><button type="button" id="challenge-close">Close</button></div><p class="hint">Reference catalog only; listed methods are not all implemented. Assets are not downloaded automatically.</p><div id="challenge-list"></div></div>
    <div class="readout"><output id="cursor">Move over a plot for coordinates and values</output><span id="units">original pixels</span></div><div class="section-title profile-heading"><span>AXIS PROFILES <small>FFT / CIRCULAR AUTOCORRELATION</small></span></div><div class="profiles"><canvas id="profile-canvas" data-testid="profile-canvas" aria-label="X and Y FFT and autocorrelation profiles" hidden></canvas><p id="profile-empty" class="hint">Profiles appear after an image is analyzed.</p></div><footer><button id="debug" type="button">Copy debug info</button><div class="legal"><span>AGPL-3.0-only</span> · <a href="${licenseUrl}" download="LICENSE.txt">License</a> · <a href="https://github.com/VKKKV/periodic-stego" target="_blank" rel="noopener noreferrer">Source</a></div></footer></main>
    <aside class="findings"><div class="findings-intro"><span class="step-kicker">STEP 03 · EVIDENCE</span><h2>What did we find?</h2><p>Results are signals to inspect, not automatic proof of hidden content.</p></div><div class="section-title">DETECTION SUMMARY <span id="candidate-count">—</span></div><p id="result-note" class="hint" hidden>Previous result · not current; wait for a successful analysis.</p><div id="verdict"><h2>Waiting for an image</h2><p>Load an image to begin.</p></div><div id="stats"></div><div id="candidates"></div><details open class="caveats"><summary>Limits and interpretation</summary><ul id="warnings"><li>JPEG blocks, resizing, scanlines and ordinary textures can produce peaks.</li><li>Confidence is signal strength, not steganography probability.</li></ul></details></aside></div></div>`;
  const localizeStatic = bindStaticText(root);
  let statusText = "",
    errorText = "",
    forensicStatusText = "",
    forensicState = "idle";
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const main = $<HTMLCanvasElement>("#main-canvas"),
    profiles = $<HTMLCanvasElement>("#profile-canvas"),
    forensicCanvas = $<HTMLCanvasElement>("#forensic-canvas");
  function syncTabs() {
    for (const tab of root.querySelectorAll<HTMLButtonElement>("[data-view]")) {
      const selected = tab.dataset.view === kind;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.disabled =
        tab.dataset.view !== "original" &&
        (!result || (tab.dataset.view === "stereogram" && !result.stereogram));
    }
    $("#image-panel").setAttribute("aria-labelledby", `view-${kind}`);
  }
  function clearForensic() {
    forensic = null;
    forensicState = "idle";
    forensicStatusText = "";
    $("#forensic-panel").hidden = true;
    forensicCanvas.hidden = true;
    forensicCanvas.width = forensicCanvas.height = 1;
    $("#forensic-meta").textContent = "";
    $("#forensic-warnings").replaceChildren();
    $("#forensic-status").textContent = "";
    $("#forensic-status").dataset.state = "idle";
    $<HTMLButtonElement>("#forensic-export").disabled = true;
    $<HTMLButtonElement>("#forensic-toggle").disabled = true;
    $("#forensic-toggle").setAttribute("aria-expanded", "false");
  }
  function renderForensics() {
    if (!forensic) return;
    const tool = $<HTMLSelectElement>("#forensic-tool").value;
    const map =
      tool === "noise"
        ? forensic.noise
        : tool === "clone"
          ? forensic.clone
          : tool.startsWith("ela-")
            ? forensic.ela[tool.slice(4)]
            : tool === "gradient"
              ? forensic.gradient
              : tool === "level-sweep"
                ? forensic.levelSweep
                : tool === "pca"
                  ? forensic.pca
                  : tool === "thumbnail"
                    ? forensic.thumbnail
                    : null;
    const canvas = map && "canvas" in map ? map.canvas : map;
    $<HTMLButtonElement>("#forensic-export").disabled =
      !canvas || forensicState !== "ready";
    forensicCanvas.hidden = !canvas;
    if (canvas) {
      forensicCanvas.width = canvas.width;
      forensicCanvas.height = canvas.height;
      forensicCanvas.getContext("2d")!.drawImage(canvas, 0, 0);
    }
    $("#forensic-meta").textContent =
      tool === "metadata"
        ? JSON.stringify(forensic.metadata, null, 2)
        : tool === "strings"
          ? forensic.strings.join("\n") || t("No printable strings found.")
          : tool.startsWith("ela-")
            ? JSON.stringify(
                forensic.ela[tool.slice(4)]
                  ? (() => {
                      const { canvas: _canvas, ...stats } =
                        forensic.ela[tool.slice(4)];
                      return { quality: tool.slice(4), ...stats };
                    })()
                  : {},
                null,
                2,
              )
            : `${forensic.workWidth} × ${forensic.workHeight} px\n${t(tool === "clone" ? "Red regions are coarse repeated-block candidates." : "Use as a screening signal only.")}`;
    $("#forensic-warnings").replaceChildren(
      ...forensic.warnings.map((warning) => {
        const li = document.createElement("li");
        li.textContent = t(warning);
        return li;
      }),
    );
  }
  function showChallenges(challenges: ImageStegoChallenge[]) {
    const list = $("#challenge-list");
    list.replaceChildren(
      ...challenges.map((challenge) => {
        const article = document.createElement("article");
        article.className = "challenge-card";
        const title = document.createElement("h3");
        title.textContent = challenge.title;
        const meta = document.createElement("p");
        meta.textContent = `${challenge.status.toUpperCase()} · ${challenge.formats.join(" / ")} · ${challenge.methods.join(", ")}`;
        const note = document.createElement("p");
        note.textContent = challenge.note;
        const source = document.createElement("code");
        source.textContent = challenge.source;
        article.append(title, meta, note, source);
        if (challenge.asset) {
          const link = document.createElement("a");
          link.href = challenge.asset;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Asset URL";
          article.append(document.createTextNode(" · "), link);
        }
        return article;
      }),
    );
    $("#challenge-panel").hidden = false;
  }
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
    if (!available && kind === "stereogram") kind = "original";
    syncTabs();
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
        "Native ROI/channel pass, independent of FFT controls. This is a conservative heuristic, not a decoder. Horizontal repetition may be a stereogram or tiled texture; disparity is not decoded text or metric depth.",
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
    if (button.id === "forensic-retry") {
      callbacks.onForensicRetry();
      return;
    }
    if (button.id === "challenges-button") {
      callbacks.onChallenges();
      return;
    }
    if (button.id === "forensic-close") {
      $("#forensic-panel").hidden = true;
      $("#forensic-toggle").setAttribute("aria-expanded", "false");
      $("#forensic-toggle").focus();
      return;
    }
    if (button.id === "challenge-close") {
      $("#challenge-panel").hidden = true;
      return;
    }
    if (button.dataset.view) {
      kind = button.dataset.view;
      syncTabs();
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
  for (const input of root.querySelectorAll<HTMLInputElement>(
    '#image-file, #empty input[type="file"]',
  )) {
    input.onchange = () => {
      if (input.files?.[0]) callbacks.onFile(input.files[0]);
      input.value = "";
    };
  }
  $("#open-image-button").onclick = () => $("#image-file").click();
  $("#empty-image-button").onclick = () =>
    $('#empty input[type="file"]').click();
  $("#empty-sample").onclick = () =>
    callbacks.onDemo($<HTMLSelectElement>("#demo").value);
  $("#forensic-toggle").onclick = () => {
    const panel = $("#forensic-panel");
    panel.hidden = !panel.hidden;
    $("#forensic-toggle").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) {
      panel.scrollIntoView({ block: "nearest" });
      $("#forensic-tool").focus({ preventScroll: true });
    }
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
    $("#forensic-status").textContent = t(forensicStatusText);
    renderForensics();
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
  $("#forensic-tool").onchange = renderForensics;
  $("#forensic-export").onclick = () => {
    if (!forensic) return;
    const tool = $<HTMLSelectElement>("#forensic-tool").value;
    const map =
      tool === "noise"
        ? forensic.noise
        : tool === "clone"
          ? forensic.clone
          : tool.startsWith("ela-")
            ? forensic.ela[tool.slice(4)]
            : tool === "gradient"
              ? forensic.gradient
              : tool === "level-sweep"
                ? forensic.levelSweep
                : tool === "pca"
                  ? forensic.pca
                  : tool === "thumbnail"
                    ? forensic.thumbnail
                    : null;
    const canvas = map && "canvas" in map ? map.canvas : map;
    if (canvas)
      callbacks.onForensicExport(canvas, `periodic-stego-${tool}.png`);
  };
  root.addEventListener("keydown", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLButtonElement &&
      target.dataset.view &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    ) {
      const tabs = Array.from(
        root.querySelectorAll<HTMLButtonElement>("[data-view]:not(:disabled)"),
      );
      const index = tabs.indexOf(target);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      event.preventDefault();
      tabs[next].click();
      tabs[next].focus();
    }
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
  syncTabs();
  clearForensic();
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
      clearForensic();
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
      kind = "original";
      syncTabs();
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
    clearForensic,
    setForensicState: (state: "running" | "ready" | "error", text: string) => {
      const wasIdle = forensicState === "idle";
      forensicState = state;
      forensicStatusText = text;
      $("#forensic-status").dataset.state = state;
      $("#forensic-status").textContent = t(text);
      $("#forensic-panel").setAttribute(
        "aria-busy",
        String(state === "running"),
      );
      $<HTMLSelectElement>("#forensic-tool").disabled = state !== "ready";
      $("#forensic-retry").hidden = state !== "error";
      $<HTMLButtonElement>("#forensic-toggle").disabled = false;
      if (wasIdle) {
        $("#forensic-panel").hidden = false;
        $("#forensic-toggle").setAttribute("aria-expanded", "true");
      }
      renderForensics();
    },
    setForensic: (next: ForensicAnalysis) => {
      forensic = next;
      renderForensics();
    },
    showChallenges,
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
