import { analyze } from "./core/pipeline";
import type { WorkerRequest, WorkerResponse } from "./core/types";
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (value: WorkerResponse, transfer?: Transferable[]) => void;
};
scope.onmessage = ({ data }) => {
  try {
    const result = analyze(data.input, (stage, progress) =>
      scope.postMessage({ id: data.id, type: "progress", stage, progress }),
    );
    const arrays = [
      result.preprocessed,
      result.power,
      result.autocorrelation,
      ...Object.values(result.profiles),
    ];
    const buffers = [
      ...new Set(arrays.map((array) => array.buffer as ArrayBuffer)),
    ];
    scope.postMessage({ id: data.id, type: "result", result }, buffers);
  } catch (error) {
    scope.postMessage({
      id: data.id,
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
