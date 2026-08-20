import {
  collapseWhitespace,
  extractAbvPercent,
  hasExactGovernmentWarningPrefix,
  normalizeNetContents,
  normalizeWarningBody,
  softNormalize,
} from "./normalize";
import {
  FIELD_LABELS,
  type ApplicationFields,
  type ExtractedFields,
  type FieldComparison,
  type FieldKey,
  type MatchStatus,
  type VerificationResult,
} from "./types";

function tokenizeWords(value: string): string[] {
  // Keep punctuation as part of tokens; we only care about word boundaries.
  return value.trim().split(/\s+/g).filter(Boolean);
}

function wordDiffText(expected: string, found: string): string {
  const a = tokenizeWords(expected);
  const b = tokenizeWords(found);

  // Classic LCS DP to align words.
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const expectedParts: string[] = [];
  const foundParts: string[] = [];

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      expectedParts.push(a[i]);
      foundParts.push(b[j]);
      i++;
      j++;
      continue;
    }

    // Prefer the branch with the larger remaining LCS length.
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      // Delete from expected.
      expectedParts.push(`[[${a[i]}]]`);
      i++;
    } else {
      // Insert into found.
      foundParts.push(`[[${b[j]}]]`);
      j++;
    }
  }

  // Tail deletes/inserts.
  while (i < n) {
    expectedParts.push(`[[${a[i]}]]`);
    i++;
  }
  while (j < m) {
    foundParts.push(`[[${b[j]}]]`);
    j++;
  }

  const expectedMarked = expectedParts.join(" ");
  const foundMarked = foundParts.join(" ");

  return `Government warning word diff (mismatched words marked with [[...]]):\nExpected:\n${expectedMarked}\n\nFound:\n${foundMarked}`;
}

function brandComparison(
  application: string,
  extracted: string | null,
): FieldComparison {
  const label = FIELD_LABELS.brandName;
  if (!extracted) {
    return {
      field: "brandName",
      label,
      status: "missing",
      applicationValue: application,
      extractedValue: null,
      message: "Could not read a brand name from the label image.",
    };
  }

  if (collapseWhitespace(application) === collapseWhitespace(extracted)) {
    return {
      field: "brandName",
      label,
      status: "match",
      applicationValue: application,
      extractedValue: extracted,
      message: "Brand name matches the application exactly.",
    };
  }

  if (softNormalize(application) === softNormalize(extracted)) {
    return {
      field: "brandName",
      label,
      status: "soft_match",
      applicationValue: application,
      extractedValue: extracted,
      message:
        "Same brand after ignoring capitalization and punctuation (agent judgment recommended).",
    };
  }

  return {
    field: "brandName",
    label,
    status: "mismatch",
    applicationValue: application,
    extractedValue: extracted,
    message: "Brand name on the label does not match the application.",
  };
}

function classTypeComparison(
  application: string,
  extracted: string | null,
): FieldComparison {
  const label = FIELD_LABELS.classType;
  if (!extracted) {
    return {
      field: "classType",
      label,
      status: "missing",
      applicationValue: application,
      extractedValue: null,
      message: "Could not read a class/type designation from the label.",
    };
  }

  if (softNormalize(application) === softNormalize(extracted)) {
    const exact =
      collapseWhitespace(application).toLowerCase() ===
      collapseWhitespace(extracted).toLowerCase();
    return {
      field: "classType",
      label,
      status: exact ? "match" : "soft_match",
      applicationValue: application,
      extractedValue: extracted,
      message: exact
        ? "Class/type matches the application."
        : "Class/type matches after normalizing capitalization/punctuation.",
    };
  }

  return {
    field: "classType",
    label,
    status: "mismatch",
    applicationValue: application,
    extractedValue: extracted,
    message: "Class/type on the label does not match the application.",
  };
}

function alcoholComparison(
  application: string,
  extracted: string | null,
): FieldComparison {
  const label = FIELD_LABELS.alcoholContent;
  if (!extracted) {
    return {
      field: "alcoholContent",
      label,
      status: "missing",
      applicationValue: application,
      extractedValue: null,
      message: "Could not read alcohol content from the label.",
    };
  }

  const appAbv = extractAbvPercent(application);
  const labelAbv = extractAbvPercent(extracted);

  if (appAbv !== null && labelAbv !== null) {
    if (Math.abs(appAbv - labelAbv) < 0.05) {
      return {
        field: "alcoholContent",
        label,
        status: "match",
        applicationValue: application,
        extractedValue: extracted,
        message: `Alcohol content matches (${labelAbv}% ABV).`,
      };
    }
    return {
      field: "alcoholContent",
      label,
      status: "mismatch",
      applicationValue: application,
      extractedValue: extracted,
      message: `ABV differs: application ${appAbv}% vs label ${labelAbv}%.`,
    };
  }

  if (softNormalize(application) === softNormalize(extracted)) {
    return {
      field: "alcoholContent",
      label,
      status: "soft_match",
      applicationValue: application,
      extractedValue: extracted,
      message: "Alcohol text is similar; confirm ABV/proof formatting by eye.",
    };
  }

  return {
    field: "alcoholContent",
    label,
    status: "mismatch",
    applicationValue: application,
    extractedValue: extracted,
    message: "Alcohol content on the label does not match the application.",
  };
}

function netContentsComparison(
  application: string,
  extracted: string | null,
): FieldComparison {
  const label = FIELD_LABELS.netContents;
  if (!extracted) {
    return {
      field: "netContents",
      label,
      status: "missing",
      applicationValue: application,
      extractedValue: null,
      message: "Could not read net contents from the label.",
    };
  }

  if (normalizeNetContents(application) === normalizeNetContents(extracted)) {
    return {
      field: "netContents",
      label,
      status: "match",
      applicationValue: application,
      extractedValue: extracted,
      message: "Net contents match the application.",
    };
  }

  return {
    field: "netContents",
    label,
    status: "mismatch",
    applicationValue: application,
    extractedValue: extracted,
    message: "Net contents on the label do not match the application.",
  };
}

function warningComparison(
  application: string,
  extracted: string | null,
  prefixExactFromModel: boolean | null,
  headerBoldFromModel: boolean | null,
  remainderBoldFromModel: boolean | null,
): FieldComparison {
  const label = FIELD_LABELS.governmentWarning;
  if (!extracted) {
    return {
      field: "governmentWarning",
      label,
      status: "missing",
      applicationValue: application,
      extractedValue: null,
      message: "Government warning statement was not found on the label.",
    };
  }

  const prefixOk =
    prefixExactFromModel === true ||
    hasExactGovernmentWarningPrefix(extracted);
  const bodyOk =
    normalizeWarningBody(application) === normalizeWarningBody(extracted);

  if (prefixOk && bodyOk) {
    const boldHeaderOk =
      headerBoldFromModel === true && remainderBoldFromModel === false;
    const boldConfidenceOk =
      headerBoldFromModel !== null && remainderBoldFromModel !== null;

    if (!boldConfidenceOk) {
      return {
        field: "governmentWarning",
        label,
        status: "match",
        applicationValue: application,
        extractedValue: extracted,
        message:
          "Warning text matches exactly and required prefix is correct. Bold formatting could not be confirmed from this image.",
      };
    }

    if (boldHeaderOk) {
    return {
      field: "governmentWarning",
      label,
      status: "match",
      applicationValue: application,
      extractedValue: extracted,
      message:
        "Warning text matches and begins with exact “GOVERNMENT WARNING:”.",
    };
    }

    return {
      field: "governmentWarning",
      label,
      status: "soft_match",
      applicationValue: application,
      extractedValue: extracted,
      message:
        "Warning text matches, but bold formatting may not comply (header bold vs remainder not bold is best-effort).",
    };
  }

  if (!prefixOk) {
    return {
      field: "governmentWarning",
      label,
      status: "mismatch",
      applicationValue: application,
      extractedValue: extracted,
      message:
        "Government warning prefix is required to be exactly all-caps “GOVERNMENT WARNING:” with a colon.",
    };
  }

  const expectedNorm = normalizeWarningBody(application);
  const foundNorm = normalizeWarningBody(extracted);

  return {
    field: "governmentWarning",
    label,
    status: "mismatch",
    applicationValue: application,
    extractedValue: extracted,
    message:
      "Government warning must match word-for-word (verbatim text), including capitalization.",
    diffText: wordDiffText(expectedNorm, foundNorm),
  };
}

function overallFromComparisons(comparisons: FieldComparison[]): {
  overall: VerificationResult["overall"];
  summary: string;
} {
  const statuses = comparisons.map((c) => c.status);
  if (statuses.includes("mismatch") || statuses.includes("missing")) {
    return {
      overall: "fail",
      summary:
        "Issues found. Review the flagged fields before approving this label.",
    };
  }
  if (statuses.includes("soft_match")) {
    return {
      overall: "review",
      summary:
        "No hard mismatches. Soft matches need a quick human look (e.g. capitalization).",
    };
  }
  return {
    overall: "pass",
    summary: "All checked fields match the application.",
  };
}

const COMPARERS: Record<
  Exclude<FieldKey, "governmentWarning">,
  (app: string, extracted: string | null) => FieldComparison
> = {
  brandName: brandComparison,
  classType: classTypeComparison,
  alcoholContent: alcoholComparison,
  netContents: netContentsComparison,
};

export function compareFields(
  application: ApplicationFields,
  extracted: ExtractedFields,
  options: { elapsedMs: number; mode: "live" | "demo" },
): VerificationResult {
  const comparisons: FieldComparison[] = [
    COMPARERS.brandName(application.brandName, extracted.brandName),
    COMPARERS.classType(application.classType, extracted.classType),
    COMPARERS.alcoholContent(
      application.alcoholContent,
      extracted.alcoholContent,
    ),
    COMPARERS.netContents(application.netContents, extracted.netContents),
    warningComparison(
      application.governmentWarning,
      extracted.governmentWarning,
      extracted.governmentWarningPrefixExact,
      extracted.governmentWarningHeaderBold,
      extracted.governmentWarningRemainderBold,
    ),
  ];

  const { overall, summary } = overallFromComparisons(comparisons);

  return {
    overall,
    summary,
    elapsedMs: options.elapsedMs,
    mode: options.mode,
    comparisons,
    extracted,
  };
}

export function statusTone(status: MatchStatus): "ok" | "warn" | "bad" {
  if (status === "match") return "ok";
  if (status === "soft_match") return "warn";
  return "bad";
}
