/**
 * Lightweight self-check for comparison rules.
 * Run: npx tsx src/lib/compare.selfcheck.ts
 */
import { compareFields } from "./compare";
import { DEMO_SAMPLES } from "./samples";
import { STANDARD_GOVERNMENT_WARNING } from "./types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const soft = DEMO_SAMPLES.find((s) => s.id === "stones-throw-soft")!;
const softResult = compareFields(soft.application, soft.extracted, {
  elapsedMs: 1,
  mode: "demo",
});
assert(softResult.overall === "review", "soft brand should be review");
assert(
  softResult.comparisons.find((c) => c.field === "brandName")?.status ===
    "soft_match",
  "brand casing should soft-match",
);

const warn = DEMO_SAMPLES.find((s) => s.id === "warning-title-case")!;
const warnResult = compareFields(warn.application, warn.extracted, {
  elapsedMs: 1,
  mode: "demo",
});
assert(warnResult.overall === "fail", "title-case warning should fail");
assert(
  warnResult.comparisons.find((c) => c.field === "governmentWarning")
    ?.status === "mismatch",
  "warning prefix must be exact",
);

const pass = DEMO_SAMPLES.find((s) => s.id === "old-tom-pass")!;
const passResult = compareFields(pass.application, pass.extracted, {
  elapsedMs: 1,
  mode: "demo",
});
assert(passResult.overall === "pass", "clean sample should pass");

const abv = compareFields(
  {
    brandName: "X",
    classType: "Y",
    alcoholContent: "45% Alc./Vol.",
    netContents: "750 mL",
    governmentWarning: STANDARD_GOVERNMENT_WARNING,
  },
  {
    brandName: "X",
    classType: "Y",
    alcoholContent: "90 Proof",
    netContents: "750ml",
    governmentWarning: STANDARD_GOVERNMENT_WARNING,
    governmentWarningPrefixExact: true,
    governmentWarningHeaderBold: true,
    governmentWarningRemainderBold: false,
    rawText: null,
    confidenceNotes: null,
  },
  { elapsedMs: 1, mode: "demo" },
);
assert(
  abv.comparisons.find((c) => c.field === "alcoholContent")?.status === "match",
  "proof should convert to ABV",
);

console.log("compare.selfcheck: all assertions passed");
