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
import { createReport, downloadJSON, downloadPNG } from "./export";
import { TOOL_VERSION, type AnalysisResult } from "./core/types";

let analysis = structuredClone(DEFAULT_ANALYSIS);
let display = structuredClone(DEFAULT_DISPLAY);
let source: LocalImage | null = null;
let result: AnalysisResult | null = null;
let resultImage: LocalImage | null = null;
let loading = false;
let dirty = true;
let loadGeneration = 0;
let presetGeneration = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastError = "";
const root = document.querySelector<HTMLElement>("#app")!;
const status = (text: string, busy = false) => {
  root.dataset.busy = String(busy);
  ui.setStatus(text, busy);
};
const fail = (error: unknown) => {
  lastError = error instanceof Error ? error.message : String(error);
  ui.setError(lastError);
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
      fail(error);
    }
  }, 150);
}
async function openFile(file: File, generation = ++loadGeneration) {
  presetGeneration++;
  loading = true;
  invalidate();
  ui.setError("");
  status("Decoding local image…", true);
  try {
    const image = await loadImage(file, () => generation === loadGeneration);
    if (generation !== loadGeneration) return;
    source = image;
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
    root.dataset.image = image.meta.name;
    loading = false;
    schedule();
  } catch (error) {
    if (generation !== loadGeneration) return;
    loading = false;
    fail(error);
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
    fail(error);
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
          fail(error);
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
        .then(() => status("Debug info copied."))
        .catch(() => downloadJSON(info, "periodic-stego-debug.json"));
    else downloadJSON(info, "periodic-stego-debug.json");
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
    error: (_id, error) => fail(new Error(error)),
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
  invalidate();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && source) {
    loading = false;
    schedule();
  }
});
status("Ready for a local image · choose a file or run a synthetic demo");
