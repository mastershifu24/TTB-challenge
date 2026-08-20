import { NextResponse } from "next/server";
import { z } from "zod";
import { compareFields } from "@/lib/compare";
import { extractFieldsFromImage } from "@/lib/extract";
import { getDemoSample } from "@/lib/samples";
import { STANDARD_GOVERNMENT_WARNING } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const applicationSchema = z.object({
  brandName: z.string().min(1),
  classType: z.string().min(1),
  alcoholContent: z.string().min(1),
  netContents: z.string().min(1),
  governmentWarning: z.string().min(1).default(STANDARD_GOVERNMENT_WARNING),
  bottlerNameAddress: z.string().optional(),
  countryOfOrigin: z.string().optional(),
});

const bodySchema = z.object({
  application: applicationSchema,
  imageDataUrl: z.string().optional(),
  demoSampleId: z.string().optional(),
});

export async function POST(request: Request) {
  const started = Date.now();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request. Check application fields and try again." },
      { status: 400 },
    );
  }

  const { application, imageDataUrl, demoSampleId } = parsed.data;

  try {
    if (demoSampleId) {
      const sample = getDemoSample(demoSampleId);
      if (!sample) {
        return NextResponse.json(
          { error: `Unknown demo sample: ${demoSampleId}` },
          { status: 404 },
        );
      }

      const result = compareFields(application, sample.extracted, {
        elapsedMs: Date.now() - started,
        mode: "demo",
      });
      return NextResponse.json(result);
    }

    if (!imageDataUrl?.startsWith("data:image/")) {
      return NextResponse.json(
        {
          error:
            "Upload a label image, or choose a demo sample to try without an API key.",
        },
        { status: 400 },
      );
    }

    // Rough guard: ~7MB base64 payload ceiling for prototype.
    if (imageDataUrl.length > 10_000_000) {
      return NextResponse.json(
        { error: "Image is too large. Please use a smaller photo (under ~7MB)." },
        { status: 413 },
      );
    }

    const extracted = await extractFieldsFromImage(imageDataUrl);
    const result = compareFields(application, extracted, {
      elapsedMs: Date.now() - started,
      mode: "live",
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verification failed.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
