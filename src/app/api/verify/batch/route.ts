import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyBatch } from "@/lib/verifyBatch";
import { extractFieldsFromImage } from "@/lib/extract";
import { getDemoSample } from "@/lib/samples";
import { STANDARD_GOVERNMENT_WARNING } from "@/lib/types";
import type { VisionExtractor } from "@/lib/visionTypes";

export const runtime = "nodejs";
export const maxDuration = 60;

const applicationSchema = z.object({
  brandName: z.string().min(1),
  classType: z.string().min(1),
  alcoholContent: z.string().min(1),
  netContents: z.string().min(1),
  governmentWarning: z.string().min(1).default(STANDARD_GOVERNMENT_WARNING),
  bottlerNameAddress: z.string().optional(),
  countryOfOrigin: z.string().optional(),
});

const itemSchema = z
  .object({
    id: z.string().min(1),
    application: applicationSchema,
    imageDataUrl: z.string().optional(),
    demoSampleId: z.string().optional(),
  })
  .refine((v) => Boolean(v.imageDataUrl) || Boolean(v.demoSampleId), {
    message: "Each item must include either imageDataUrl or demoSampleId.",
  })
  .superRefine((v, ctx) => {
    if (v.imageDataUrl) {
      if (!v.imageDataUrl.startsWith("data:image/")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["imageDataUrl"],
          message: "imageDataUrl must be a data URL (data:image/...).",
        });
      }
      // Rough guard: ~7-10MB base64 payload.
      if (v.imageDataUrl.length > 10_000_000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["imageDataUrl"],
          message: "imageDataUrl is too large. Please use a smaller image.",
        });
      }
    }
  });

const bodySchema = z.object({
  items: z.array(itemSchema).min(1),
  mode: z.enum(["auto", "live", "demo"]).default("auto"),
  concurrency: z.number().int().min(1).max(12).default(6),
});

export async function POST(request: Request) {
  const startedAt = Date.now();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request. Provide a non-empty items[] array with application data." },
      { status: 400 },
    );
  }

  const { items, mode, concurrency } = parsed.data;

  // Vision extractor: for demo items we never call it.
  const extractor: VisionExtractor = async (imageDataUrl: string) => {
    return await extractFieldsFromImage(imageDataUrl);
  };

  // Pre-validate demoSampleId to return a useful error (instead of failing later).
  if (mode !== "live") {
    for (const item of items) {
      if (item.demoSampleId) {
        const sample = getDemoSample(item.demoSampleId);
        if (!sample) {
          return NextResponse.json(
            { error: `Unknown demo sample: ${item.demoSampleId}` },
            { status: 404 },
          );
        }
      }
    }
  }

  try {
    const results = await verifyBatch(items, extractor, {
      elapsedMsStart: startedAt,
      mode:
        mode === "auto"
          ? "live"
          : mode,
      concurrency,
    });

    return NextResponse.json({ items: results, elapsedMs: Date.now() - startedAt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Batch verification failed.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

