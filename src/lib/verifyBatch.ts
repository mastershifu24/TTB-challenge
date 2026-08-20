import type { VerificationResult, ApplicationFields } from "./types";
import type { VisionExtractor } from "./visionTypes";
import { compareFields } from "./compare";
import { getDemoSample } from "./samples";

export type VerifyItemInput = {
  id: string;
  application: ApplicationFields;
  imageDataUrl?: string;
  demoSampleId?: string;
};

export type VerifyItemOutput =
  | {
      id: string;
      kind: "ok";
      result: VerificationResult;
    }
  | {
      id: string;
      kind: "error";
      error: string;
    };

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<void>,
) {
  const queue = items.map((item, idx) => ({ item, idx }));
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) return;
      await worker(next.item, next.idx);
    }
  });
  await Promise.all(workers);
}

export async function verifyBatch(
  items: VerifyItemInput[],
  extractor: VisionExtractor,
  options: { elapsedMsStart: number; mode: "live" | "demo"; concurrency: number },
): Promise<VerifyItemOutput[]> {
  const outputs: VerifyItemOutput[] = new Array(items.length);
  await runWithConcurrency(
    items,
    Math.max(1, options.concurrency),
    async (item, idx) => {
      try {
        if (item.demoSampleId) {
          const sample = getDemoSample(item.demoSampleId);
          if (!sample) throw new Error(`Unknown demo sample: ${item.demoSampleId}`);
          outputs[idx] = {
            id: item.id,
            kind: "ok",
            result: compareFields(item.application, sample.extracted, {
              elapsedMs: Date.now() - options.elapsedMsStart,
              mode: "demo",
            }),
          };
          return;
        }

        if (!item.imageDataUrl) {
          throw new Error("Missing imageDataUrl for an item.");
        }

        const extracted = await extractor(item.imageDataUrl);
        outputs[idx] = {
          id: item.id,
          kind: "ok",
          result: compareFields(item.application, extracted, {
            elapsedMs: Date.now() - options.elapsedMsStart,
            mode: options.mode,
          }),
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Verification failed.";
        outputs[idx] = { id: item.id, kind: "error", error: message };
      }
    },
  );
  return outputs;
}

