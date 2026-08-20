export type BeverageCategory = "distilled_spirits" | "wine" | "malt_beverage";

export type MatchStatus = "match" | "soft_match" | "mismatch" | "missing";

export type FieldKey =
  | "brandName"
  | "classType"
  | "alcoholContent"
  | "netContents"
  | "governmentWarning";

export interface ApplicationFields {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  governmentWarning: string;
  bottlerNameAddress?: string;
  countryOfOrigin?: string;
  beverageCategory?: BeverageCategory;
}

export interface ExtractedFields {
  brandName: string | null;
  classType: string | null;
  alcoholContent: string | null;
  netContents: string | null;
  governmentWarning: string | null;
  governmentWarningPrefixExact: boolean | null;
  /**
   * Best-effort formatting extraction:
   * - Header ("GOVERNMENT WARNING:") should be bold
   * - Remainder should NOT be bold
   *
   * Because this is inferred from an image, values may be null when
   * the model is not confident.
   */
  governmentWarningHeaderBold: boolean | null;
  governmentWarningRemainderBold: boolean | null;
  rawText: string | null;
  confidenceNotes: string | null;
}

export interface FieldComparison {
  field: FieldKey;
  label: string;
  status: MatchStatus;
  applicationValue: string;
  extractedValue: string | null;
  message: string;
  /**
   * Optional additional detail for humans (e.g., word-level diff).
   * Keep it deterministic and derived from normalized strings.
   */
  diffText?: string;
}

export interface VerificationResult {
  overall: "pass" | "review" | "fail";
  summary: string;
  elapsedMs: number;
  mode: "live" | "demo";
  comparisons: FieldComparison[];
  extracted: ExtractedFields;
}

export const FIELD_LABELS: Record<FieldKey, string> = {
  brandName: "Brand name",
  classType: "Class / type",
  alcoholContent: "Alcohol content",
  netContents: "Net contents",
  governmentWarning: "Government warning",
};

/** Canonical TTB health warning statement (27 CFR 16). */
export const STANDARD_GOVERNMENT_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";
