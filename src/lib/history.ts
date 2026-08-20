import type { ApplicationFields, VerificationResult } from "./types";

export type AgentDeterminationValue = "accept" | "reject" | "hold";

export type SavedReview = {
  id: string;
  savedAt: string;
  label: string;
  determination: AgentDeterminationValue;
  overall: VerificationResult["overall"];
  application: ApplicationFields;
  result: VerificationResult;
  imageDataUrl?: string | null;
  demoSampleId?: string;
};

const STORAGE_KEY = "proofcheck.savedReviews.v1";

export function loadSavedReviews(): SavedReview[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedReview[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(reviews: SavedReview[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
}

export function saveReview(review: Omit<SavedReview, "id" | "savedAt">): SavedReview[] {
  const next: SavedReview = {
    ...review,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  };
  const reviews = [next, ...loadSavedReviews()].slice(0, 40);
  persist(reviews);
  return reviews;
}

export function deleteReview(id: string): SavedReview[] {
  const reviews = loadSavedReviews().filter((r) => r.id !== id);
  persist(reviews);
  return reviews;
}

export function clearReviews(): SavedReview[] {
  persist([]);
  return [];
}
