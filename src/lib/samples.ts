import {
  STANDARD_GOVERNMENT_WARNING,
  type ApplicationFields,
  type ExtractedFields,
} from "./types";

export interface DemoSample {
  id: string;
  name: string;
  description: string;
  /** Preview image under /public/samples (also usable for live upload tests). */
  imagePath: string;
  application: ApplicationFields;
  /** Simulated vision extraction for offline/demo mode. */
  extracted: ExtractedFields;
}

export const DEMO_SAMPLES: DemoSample[] = [
  {
    id: "old-tom-pass",
    name: "Old Tom — clean pass",
    description: "All fields match, including exact GOVERNMENT WARNING prefix.",
    imagePath: "/samples/old-tom-pass.svg",
    application: {
      brandName: "OLD TOM DISTILLERY",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45% Alc./Vol. (90 Proof)",
      netContents: "750 mL",
      governmentWarning: STANDARD_GOVERNMENT_WARNING,
      beverageCategory: "distilled_spirits",
    },
    extracted: {
      brandName: "OLD TOM DISTILLERY",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45% Alc./Vol. (90 Proof)",
      netContents: "750 mL",
      governmentWarning: STANDARD_GOVERNMENT_WARNING,
      governmentWarningPrefixExact: true,
      governmentWarningHeaderBold: true,
      governmentWarningRemainderBold: false,
      rawText: null,
      confidenceNotes: "Clear label scan.",
    },
  },
  {
    id: "stones-throw-soft",
    name: "Stone's Throw — soft brand match",
    description:
      "Brand casing differs (STONE'S THROW vs Stone's Throw). Should be soft_match, not a hard fail.",
    imagePath: "/samples/stones-throw.svg",
    application: {
      brandName: "Stone's Throw",
      classType: "Straight Rye Whiskey",
      alcoholContent: "50% Alc./Vol.",
      netContents: "750 mL",
      governmentWarning: STANDARD_GOVERNMENT_WARNING,
      beverageCategory: "distilled_spirits",
    },
    extracted: {
      brandName: "STONE'S THROW",
      classType: "Straight Rye Whiskey",
      alcoholContent: "50% Alc./Vol. (100 Proof)",
      netContents: "750ml",
      governmentWarning: STANDARD_GOVERNMENT_WARNING,
      governmentWarningPrefixExact: true,
      governmentWarningHeaderBold: true,
      governmentWarningRemainderBold: false,
      rawText: null,
      confidenceNotes: "Brand printed in all caps on label.",
    },
  },
  {
    id: "warning-title-case",
    name: "Warning — title case prefix",
    description:
      "Uses “Government Warning:” instead of required “GOVERNMENT WARNING:”.",
    imagePath: "/samples/warning-title-case.svg",
    application: {
      brandName: "RIVERBEND GIN",
      classType: "Distilled Gin",
      alcoholContent: "40% Alc./Vol.",
      netContents: "750 mL",
      governmentWarning: STANDARD_GOVERNMENT_WARNING,
      beverageCategory: "distilled_spirits",
    },
    extracted: {
      brandName: "RIVERBEND GIN",
      classType: "Distilled Gin",
      alcoholContent: "40% Alc./Vol. (80 Proof)",
      netContents: "750 mL",
      governmentWarning: STANDARD_GOVERNMENT_WARNING.replace(
        "GOVERNMENT WARNING:",
        "Government Warning:",
      ),
      governmentWarningPrefixExact: false,
      governmentWarningHeaderBold: true,
      governmentWarningRemainderBold: false,
      rawText: null,
      confidenceNotes: "Warning prefix is title case.",
    },
  },
  {
    id: "abv-mismatch",
    name: "ABV mismatch",
    description: "Application says 45%; label shows 40%.",
    imagePath: "/samples/abv-mismatch.svg",
    application: {
      brandName: "CEDAR CREEK",
      classType: "American Single Malt Whiskey",
      alcoholContent: "45% Alc./Vol.",
      netContents: "750 mL",
      governmentWarning: STANDARD_GOVERNMENT_WARNING,
      beverageCategory: "distilled_spirits",
    },
    extracted: {
      brandName: "CEDAR CREEK",
      classType: "American Single Malt Whiskey",
      alcoholContent: "40% Alc./Vol. (80 Proof)",
      netContents: "750 mL",
      governmentWarning: STANDARD_GOVERNMENT_WARNING,
      governmentWarningPrefixExact: true,
      governmentWarningHeaderBold: true,
      governmentWarningRemainderBold: false,
      rawText: null,
      confidenceNotes: null,
    },
  },
  {
    id: "missing-warning",
    name: "Missing government warning",
    description: "No health warning statement found on the label.",
    imagePath: "/samples/missing-warning.svg",
    application: {
      brandName: "HARBOR LIGHT",
      classType: "Silver Tequila",
      alcoholContent: "40% Alc./Vol.",
      netContents: "1 L",
      governmentWarning: STANDARD_GOVERNMENT_WARNING,
      beverageCategory: "distilled_spirits",
    },
    extracted: {
      brandName: "HARBOR LIGHT",
      classType: "Silver Tequila",
      alcoholContent: "40% Alc./Vol.",
      netContents: "1 L",
      governmentWarning: null,
      governmentWarningPrefixExact: null,
      governmentWarningHeaderBold: null,
      governmentWarningRemainderBold: null,
      rawText: null,
      confidenceNotes: "No government warning statement detected.",
    },
  },
];

export function getDemoSample(id: string): DemoSample | undefined {
  return DEMO_SAMPLES.find((sample) => sample.id === id);
}
