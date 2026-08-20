import OpenAI from "openai";
import { z } from "zod";
import type { ExtractedFields } from "./types";

const extractedSchema = z.object({
  brandName: z.string().nullable(),
  classType: z.string().nullable(),
  alcoholContent: z.string().nullable(),
  netContents: z.string().nullable(),
  governmentWarning: z.string().nullable(),
  governmentWarningPrefixExact: z.boolean().nullable(),
  governmentWarningHeaderBold: z.boolean().nullable(),
  governmentWarningRemainderBold: z.boolean().nullable(),
  rawText: z.string().nullable(),
  confidenceNotes: z.string().nullable(),
});

const SYSTEM_PROMPT = `You are assisting TTB alcohol label compliance agents.
Extract text fields from the alcohol beverage label image.

Rules:
- Return ONLY valid JSON matching the schema.
- Copy text as it appears on the label when possible.
- brandName: the brand / fanciful name.
- classType: class/type designation (e.g. Kentucky Straight Bourbon Whiskey).
- alcoholContent: alcohol statement as printed (include proof if shown).
- netContents: net contents as printed.
- governmentWarning: the full health warning statement if present, including the prefix.
- governmentWarningPrefixExact: true only if the warning begins with exactly "GOVERNMENT WARNING:" in all caps with a colon.
- governmentWarningHeaderBold: best-effort true only if the "GOVERNMENT WARNING:" header text is bold in the image.
- governmentWarningRemainderBold: best-effort true only if the remainder of the warning text appears bold in the image.
- If a field is unreadable or absent, use null.
- confidenceNotes: brief note about image quality or uncertainty.`;

export async function extractFieldsFromImage(
  imageDataUrl: string,
): Promise<ExtractedFields> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Use a demo sample, or add the key to .env.local.",
    );
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the alcohol label fields from this image as JSON.",
          },
          {
            type: "image_url",
            image_url: { url: imageDataUrl, detail: "high" },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    // Non-fatal: degrade gracefully for blurry/low-quality images.
    return {
      brandName: null,
      classType: null,
      alcoholContent: null,
      netContents: null,
      governmentWarning: null,
      governmentWarningPrefixExact: null,
      governmentWarningHeaderBold: null,
      governmentWarningRemainderBold: null,
      rawText: null,
      confidenceNotes: "Vision model returned an empty response.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      brandName: null,
      classType: null,
      alcoholContent: null,
      netContents: null,
      governmentWarning: null,
      governmentWarningPrefixExact: null,
      governmentWarningHeaderBold: null,
      governmentWarningRemainderBold: null,
      rawText: content,
      confidenceNotes: "Vision model returned invalid JSON; fields could not be extracted.",
    };
  }

  const result = extractedSchema.safeParse(parsed);
  if (!result.success) {
    return {
      brandName: null,
      classType: null,
      alcoholContent: null,
      netContents: null,
      governmentWarning: null,
      governmentWarningPrefixExact: null,
      governmentWarningHeaderBold: null,
      governmentWarningRemainderBold: null,
      rawText: content,
      confidenceNotes:
        "Vision model returned an unexpected JSON shape; fields could not be extracted.",
    };
  }

  return result.data;
}
