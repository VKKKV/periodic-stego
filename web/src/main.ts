import "./styles/tokens.css";
import "./styles/app.css";
import { mountUI } from "./ui/panels";
import {
  DEFAULT_ANALYSIS,
  DEFAULT_DISPLAY,
  parsePreset,
  preset,
  validateAnalysis,
  validateDisplay,
} from "./state";
import { AnalysisJobs, type WorkerLike } from "./jobs";
import { demoFile, loadImage, type LocalImage } from "./image";
import {
  createReport,
  downloadJSON,
  downloadPNG,
  downloadBlob,
} from "./export";
import { analyzeForensics } from "./forensics";
import { TOOL_VERSION, type AnalysisResult } from "./core/types";

import { initLocale } from "./i18n";
initLocale();
let analysis = structuredClone(DEFAULT_ANALYSIS);
let display = structuredClone(DEFAULT_DISPLAY);
let source: LocalImage | null = null;
let result: AnalysisResult | null = null;
let resultImage: LocalImage | null = null;
let loading = false;
let dirty = true;
let loadGeneration = 0;
let presetGeneration = 0;
let forensicGeneration = 0;
let forensicRun = 0;
let forensicSource: LocalImage | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastError = "";
const root = document.querySelector<HTMLElement>("#app")!;
const status = (text: string, busy = false) => {
  root.dataset.busy = String(busy);
  root.dataset.current = String(!dirty && !loading && resultImage === source);
  ui.setStatus(text, busy);
};
const fail = (error: unknown, preserveBusy = true) => {
  lastError = error instanceof Error ? error.message : String(error);
  ui.setError(lastError);
  if (!preserveBusy || root.dataset.busy !== "true")
    status(`Error · ${lastError}`);
};
function invalidate() {
  clearTimeout(timer);
  jobs.invalidate();
  dirty = true;
}
function schedule() {
  invalidate();
  ui.setError("");
  if (!source || loading) return;
  status(`Updating · job ${jobs.id} queued · previous result retained`, true);
  timer = setTimeout(() => {
    if (!source || loading) return;
    try {
      analysis = validateAnalysis(analysis);
      if (analysis.channel === "alpha" && !source.meta.hasAlpha)
        throw new Error(
          "This image has no transparency. Select another channel.",
        );
      status(`Updating · job ${jobs.id + 1} · preparing analysis`, true);
      jobs.run({
        rgba: new Uint8ClampedArray(source.rgba),
        width: source.meta.width,
        height: source.meta.height,
        params: structuredClone(analysis),
      });
    } catch (error) {
      fail(error, false);
    }
  }, 150);
}
function cancelForensic() {
  forensicGeneration++;
  forensicRun++;
  forensicSource = null;
  ui.clearForensic();
  ui.setToolSource(null);
}
function runForensic() {
  if (!source || loading) return;
  const currentSource = source;
  const currentGeneration = forensicGeneration;
  const currentRun = ++forensicRun;
  const isCurrent = () =>
    source === currentSource &&
    !loading &&
    currentGeneration === forensicGeneration &&
    currentRun === forensicRun;
  ui.setForensicState("running", "Running local forensic analysis…");
  void analyzeForensics(currentSource, currentSource.bytes, isCurrent)
    .then((next) => {
      if (
        source !== currentSource ||
        currentGeneration !== forensicGeneration ||
        currentRun !== forensicRun
      )
        return;
      forensicSource = currentSource;
      ui.setForensic(next);
      ui.setForensicState("ready", "Forensic screening ready");
    })
    .catch((error) => {
      if (
        currentGeneration === forensicGeneration &&
        currentRun === forensicRun
      )
        ui.setForensicState(
          "error",
          `Error · ${error instanceof Error ? error.message : String(error)}`,
        );
    });
}
async function openFile(file: File, generation?: number) {
  if (generation === undefined) {
    generation = ++loadGeneration;
    presetGeneration++;
    cancelForensic();
  }
  loading = true;
  invalidate();
  ui.setError("");
  status("Decoding local image…", true);
  try {
    const image = await loadImage(file, () => generation === loadGeneration);
    if (generation !== loadGeneration) return;
    source = image;
    result = null;
    resultImage = null;
    for (const key of [
      "jobId",
      "strong",
      "resultWindow",
      "resultChannel",
      "resultThreshold",
    ])
      delete root.dataset[key];
    analysis = {
      ...analysis,
      roi: null,
      padding: "none",
      paddingSize: DEFAULT_ANALYSIS.paddingSize,
      channel:
        analysis.channel === "alpha" && !image.meta.hasAlpha
          ? "luminance"
          : analysis.channel,
    };
    ui.setControls(analysis, display);
    ui.setImage(image.canvas, image.meta);
    ui.setToolSource(image.bytes);
    root.dataset.image = image.meta.name;
    loading = false;
    schedule();
    runForensic();
  } catch (error) {
    if (generation !== loadGeneration) return;
    loading = false;
    fail(error, false);
  }
}
async function exportView(kind: string) {
  try {
    if (kind === "preset") {
      downloadJSON(
        {
          schema: "periodic-stego-preset/v1",
          toolVersion: TOOL_VERSION,
          analysis: validateAnalysis(analysis),
          display: validateDisplay(display),
        },
        "periodic-stego-preset.json",
      );
      return;
    }
    if (dirty || loading || !result || !resultImage || resultImage !== source)
      throw new Error(
        "Wait for a successful analysis before exporting; stale results are not exported.",
      );
    if (kind === "report")
      downloadJSON(
        createReport(resultImage, result, display),
        "periodic-stego-report.json",
      );
    else {
      const canvas =
        kind === "original" ? resultImage.canvas : ui.getCanvas(kind);
      if (!canvas) throw new Error(`No ${kind} diagnostic is available.`);
      await downloadPNG(canvas, `periodic-stego-${kind}.png`);
    }
  } catch (error) {
    fail(error, true);
  }
}
const ui = mountUI(root, analysis, display, {
  onAnalysis: (params) => {
    presetGeneration++;
    analysis = structuredClone(params);
    schedule();
  },
  onDisplay: (params) => {
    presetGeneration++;
    try {
      display = validateDisplay(params);
      if (result) ui.setResult(result, display);
    } catch (error) {
      fail(error);
    }
  },
  onFile: (file) => {
    void openFile(file);
  },
  onDemo: (name) => {
    const generation = ++loadGeneration;
    presetGeneration++;
    cancelForensic();
    loading = true;
    invalidate();
    status("Generating synthetic image…", true);
    void demoFile(name)
      .then((file) => {
        if (generation === loadGeneration) return openFile(file, generation);
      })
      .catch((error) => {
        if (generation === loadGeneration) {
          loading = false;
          fail(error, false);
        }
      });
  },
  onPreset: (name) => {
    presetGeneration++;
    try {
      analysis = preset(name);
      ui.setControls(analysis, display);
      schedule();
    } catch (error) {
      fail(error);
    }
  },
  onReset: () => {
    presetGeneration++;
    analysis = structuredClone(DEFAULT_ANALYSIS);
    display = structuredClone(DEFAULT_DISPLAY);
    ui.setControls(analysis, display);
    schedule();
  },
  onExport: (kind) => {
    void exportView(kind);
  },
  onLoadPreset: async (file) => {
    const generation = ++presetGeneration;
    try {
      if (file.size > 65536) throw new Error("Preset exceeds 64 KiB.");
      const loaded = parsePreset(await file.text());
      if (generation !== presetGeneration) return;
      analysis = loaded.analysis;
      display = loaded.display;
      ui.setControls(analysis, display);
      schedule();
    } catch (error) {
      if (generation === presetGeneration) fail(error);
    }
  },
  onDebug: () => {
    const info = {
      toolVersion: TOOL_VERSION,
      jobId: jobs.id,
      error: lastError,
      analysis,
      display,
      dimensions: source ? [source.meta.width, source.meta.height] : null,
      userAgent: navigator.userAgent,
    };
    if (navigator.clipboard?.writeText)
      void navigator.clipboard
        .writeText(JSON.stringify(info, null, 2))
        .then(() => {
          if (root.dataset.busy !== "true") status("Debug info copied.");
        })
        .catch(() => downloadJSON(info, "periodic-stego-debug.json"));
    else downloadJSON(info, "periodic-stego-debug.json");
  },
  onForensicRetry: runForensic,
  onForensicExport: (canvas, name) => {
    if (loading || forensicSource !== source || !forensicSource) return;
    void downloadPNG(canvas, name).catch((error) => fail(error, true));
  },
  onForensicBytes: (bytes, name) => {
    if (loading || forensicSource !== source || !forensicSource) return;
    downloadBlob(new Blob([bytes.slice()], { type: "image/jpeg" }), name);
  },
});
const jobs = new AnalysisJobs(
  () =>
    new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }) as unknown as WorkerLike,
  {
    progress: (id, stage, progress) =>
      status(
        `Updating · job ${id} · ${stage} · ${Math.round(progress * 100)}%`,
        true,
      ),
    result: (id, next) => {
      result = next;
      resultImage = source;
      dirty = false;
      lastError = "";
      ui.setError("");
      ui.setResult(next, display);
      root.dataset.jobId = String(id);
      root.dataset.resultWindow = next.params.window;
      root.dataset.resultChannel = next.params.channel;
      root.dataset.resultThreshold = String(next.params.relativeThreshold);
      root.dataset.strong = String(next.stats.strongPeriodicity);
      status(
        `Ready · job ${id} · ${next.processedWidth} × ${next.processedHeight} analyzed px · ${Math.round(next.stats.elapsedMs)} ms`,
      );
    },
    error: (_id, error) => fail(new Error(error), false),
  },
);
window.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
});
window.addEventListener("drop", (event) => {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault();
  void openFile(event.dataTransfer.files[0]);
});
window.addEventListener("paste", (event) => {
  const item = Array.from(event.clipboardData?.items ?? []).find((item) =>
    ["image/png", "image/jpeg"].includes(item.type),
  );
  const file = item?.getAsFile();
  if (file) {
    event.preventDefault();
    void openFile(file);
  }
});
window.addEventListener("pagehide", () => {
  loadGeneration++;
  cancelForensic();
  invalidate();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    loading = false;
    if (source) {
      ui.setToolSource(source.bytes);
      schedule();
      runForensic();
    } else
      status("Ready for a local image · choose a file or run a synthetic demo");
  }
});
status("Ready for a local image · choose a file or run a synthetic demo");
