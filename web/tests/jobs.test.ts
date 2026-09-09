import { describe, it, expect } from "vitest";
import { AnalysisJobs, type WorkerLike } from "../src/jobs";
import { DEFAULT_ANALYSIS } from "../src/state";
import type { AnalysisResult, WorkerResponse } from "../src/core/types";
describe("worker generations", () => {
  it("terminates superseded jobs and ignores stale progress/result/error", () => {
    const workers: (WorkerLike & { terminated: boolean })[] = [],
      results: number[] = [],
      errors: string[] = [],
      progress: number[] = [];
    const jobs = new AnalysisJobs(
      () => {
        const w = {
          onmessage: null,
          onerror: null,
          terminated: false,
          postMessage: () => {},
          terminate() {
            this.terminated = true;
          },
        };
        workers.push(w);
        return w;
      },
      {
        result: (id) => results.push(id),
        error: (_id, e) => errors.push(e),
        progress: (id) => progress.push(id),
      },
    );
    const input = () => ({
      rgba: new Uint8ClampedArray(64 * 4),
      width: 8,
      height: 8,
      params: DEFAULT_ANALYSIS,
    });
    const first = jobs.run(input());
    const old = workers[0].onmessage!;
    const oldError = workers[0].onerror!;
    jobs.invalidate();
    expect(workers[0].terminated).toBe(true);
    const second = jobs.run(input());
    const send = (handler: typeof old, data: WorkerResponse) =>
      handler({ data } as MessageEvent<WorkerResponse>);
    send(old, { id: first, type: "progress", stage: "old", progress: 1 });
    send(old, { id: first, type: "result", result: {} as AnalysisResult });
    oldError({ message: "old" } as ErrorEvent);
    send(workers[1].onmessage!, {
      id: second,
      type: "result",
      result: {} as AnalysisResult,
    });
    expect(results).toEqual([second]);
    expect(errors).toEqual([]);
    expect(progress).toEqual([]);
    expect(workers[1].terminated).toBe(true);
  });
});
