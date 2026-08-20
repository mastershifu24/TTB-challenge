import { describe, expect, it, vi } from "vitest";
import { verifyBatch } from "./verifyBatch";
import { STANDARD_GOVERNMENT_WARNING, type ExtractedFields } from "./types";
import type { ApplicationFields } from "./types";
import type { VisionExtractor } from "./visionTypes";

function makeApplication(overrides: Partial<ApplicationFields> = {}): ApplicationFields {
  return {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    alcoholContent: "45% Alc./Vol. (90 Proof)",
    netContents: "750 mL",
    governmentWarning: STANDARD_GOVERNMENT_WARNING,
    ...overrides,
  };
}

function makeExtractedFields(overrides: Partial<ExtractedFields> = {}): ExtractedFields {
  return {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    alcoholContent: "45% Alc./Vol. (90 Proof)",
    netContents: "750 mL",
    governmentWarning: STANDARD_GOVERNMENT_WARNING,
    governmentWarningPrefixExact: true,
    governmentWarningHeaderBold: true,
    governmentWarningRemainderBold: false,
    rawText: null,
    confidenceNotes: null,
    ...overrides,
  };
}

describe("verifyBatch", () => {
  it("returns ok results for each item", async () => {
    const extractor: VisionExtractor = vi.fn(async () => {
      return makeExtractedFields();
    });

    const items = [
      { id: "1", application: makeApplication() },
      { id: "2", application: makeApplication() },
    ].map((x) => ({ ...x, imageDataUrl: "data:image/fake;base64,xyz" }));

    const out = await verifyBatch(items, extractor, {
      elapsedMsStart: Date.now(),
      mode: "live",
      concurrency: 2,
    });

    expect(out).toHaveLength(2);
    for (const row of out) {
      expect(row.kind).toBe("ok");
      if (row.kind === "ok") {
        expect(row.result.overall).toBe("pass");
      }
    }
    expect(extractor).toHaveBeenCalledTimes(2);
  });

  it("isolates per-item failures (one error does not fail whole batch)", async () => {
    const extractor: VisionExtractor = vi.fn(async () => {
      return makeExtractedFields();
    });

    const items = [
      { id: "ok", application: makeApplication(), imageDataUrl: "data:image/fake;base64,1" },
      // Missing both imageDataUrl and demoSampleId triggers a deterministic error.
      { id: "bad", application: makeApplication() },
    ];

    const out = await verifyBatch(items, extractor, {
      elapsedMsStart: Date.now(),
      mode: "live",
      concurrency: 2,
    });

    expect(out).toHaveLength(2);
    const okRow = out.find((r) => r.id === "ok")!;
    const badRow = out.find((r) => r.id === "bad")!;
    expect(okRow.kind).toBe("ok");
    expect(badRow.kind).toBe("error");
    if (badRow.kind === "error") expect(badRow.error).toMatch(/Missing imageDataUrl/i);
  });

  it("enforces concurrency limit for extractor calls", async () => {
    let current = 0;
    let max = 0;

    const extractor: VisionExtractor = vi.fn(async () => {
      current++;
      max = Math.max(max, current);
      // Simulate latency so multiple calls overlap.
      await new Promise((r) => setTimeout(r, 30));
      current--;
      return makeExtractedFields();
    });

    const items = Array.from({ length: 5 }, (_, i) => ({
      id: `i${i}`,
      application: makeApplication(),
      imageDataUrl: "data:image/fake;base64,xyz",
    }));

    await verifyBatch(items, extractor, {
      elapsedMsStart: Date.now(),
      mode: "live",
      concurrency: 2,
    });

    expect(max).toBeLessThanOrEqual(2);
  });
});

