/** Collapse whitespace and trim. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Soft identity for brand / class: case, punctuation, and spacing ignored. */
export function softNormalize(value: string): string {
  return collapseWhitespace(value)
    .toLowerCase()
    .replace(/[''']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract percent ABV if present (e.g. 45, 45%, 45% Alc./Vol.). */
export function extractAbvPercent(value: string): number | null {
  const alcVol = value.match(
    /(\d+(?:\.\d+)?)\s*%?\s*(?:alc\.?\s*\/?\s*vol\.?|alcohol\s*by\s*volume)/i,
  );
  if (alcVol) return Number(alcVol[1]);

  const barePercent = value.match(/(\d+(?:\.\d+)?)\s*%/);
  if (barePercent) return Number(barePercent[1]);

  const proof = value.match(/(\d+(?:\.\d+)?)\s*proof/i);
  if (proof) return Number(proof[1]) / 2;

  return null;
}

/** Normalize net contents for comparison (750ml ≈ 750 mL). */
export function normalizeNetContents(value: string): string {
  const collapsed = collapseWhitespace(value).toLowerCase();

  const ml = collapsed.match(/(\d+(?:\.\d+)?)\s*m\.?\s*l\.?/);
  if (ml) return `${ml[1]} ml`;

  const liter = collapsed.match(/(\d+(?:\.\d+)?)\s*l(?:iter)?s?\b/);
  if (liter) return `${liter[1]} l`;

  const oz = collapsed.match(/(\d+(?:\.\d+)?)\s*(?:fl\.?\s*)?oz\b/);
  if (oz) return `${oz[1]} floz`;

  return softNormalize(collapsed);
}

/**
 * Normalize government warning text for strict content comparison.
 *
 * For the prototype we treat the warning as "verbatim" aside from:
 * - collapsing whitespace
 * - normalizing quote characters
 *
 * IMPORTANT: do NOT lowercase and do NOT strip the "GOVERNMENT WARNING:" prefix here.
 * The prefix/case is part of the strict regulatory match.
 */
export function normalizeWarningBody(value: string): string {
  return collapseWhitespace(value)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

export function hasExactGovernmentWarningPrefix(value: string): boolean {
  return /^GOVERNMENT WARNING\s*:/.test(collapseWhitespace(value));
}
