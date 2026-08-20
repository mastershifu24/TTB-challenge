import type { ExtractedFields } from "./types";

export type VisionExtractor = (imageDataUrl: string) => Promise<ExtractedFields>;

