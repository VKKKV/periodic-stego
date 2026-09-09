import type {
  AnalysisInput,
  AnalysisResult,
  WorkerResponse,
} from "./core/types";
export interface WorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (data: unknown, transfer: Transferable[]) => void;
  terminate: () => void;
}
export class AnalysisJobs {
  private worker: WorkerLike | null = null;
  private generation = 0;
  get id() {
    return this.generation;
  }
  constructor(
    private factory: () => WorkerLike,
    private callbacks: {
      progress: (id: number, stage: string, progress: number) => void;
      result: (id: number, result: AnalysisResult) => void;
      error: (id: number, error: string) => void;
    },
  ) {}
  invalidate() {
    this.generation++;
    this.worker?.terminate();
    this.worker = null;
    return this.generation;
  }
  run(input: AnalysisInput) {
    const id = this.invalidate();
    try {
      const worker = this.factory();
      this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (id !== this.generation || data.id !== id) return;
        if (data.type === "progress")
          this.callbacks.progress(id, data.stage, data.progress);
        else {
          worker.terminate();
          this.worker = null;
          if (data.type === "result") this.callbacks.result(id, data.result);
          else this.callbacks.error(id, data.error);
        }
      };
      worker.onerror = (event) => {
        if (id !== this.generation) return;
        worker.terminate();
        this.worker = null;
        this.callbacks.error(
          id,
          event.message || "Worker failed to start. Reload the page to retry.",
        );
      };
      worker.postMessage({ id, input }, [input.rgba.buffer as ArrayBuffer]);
    } catch (error) {
      this.worker?.terminate();
      this.worker = null;
      this.callbacks.error(
        id,
        error instanceof Error ? error.message : String(error),
      );
    }
    return id;
  }
}
