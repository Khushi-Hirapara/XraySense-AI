/**
 * Parse clinician-facing Grad-CAM affected-area text into structured fields.
 *
 * Expected format (new scans):
 *   Right Lung
 *   Lower Lobe
 *   Approximate infected region: 23%
 */

export interface AffectedAreaDetails {
  lung: string | null;
  lobe: string | null;
  infectedPct: string | null;
  heatmapConfidencePct: string | null;
  /** True when text matches the structured localization format. */
  structured: boolean;
  /** Original multi-line text for fallback rendering. */
  raw: string;
}

const INFECTED_RE = /^Approximate infected region:\s*(.+)$/i;
const HEATMAP_CONF_RE = /^Heatmap confidence:\s*(.+)$/i;

function parseStructuredLines(lines: string[]): AffectedAreaDetails {
  const infectedIdx = lines.findIndex((line) => INFECTED_RE.test(line));
  if (infectedIdx < 2) {
    return {
      lung: null,
      lobe: null,
      infectedPct: null,
      heatmapConfidencePct: null,
      structured: false,
      raw: lines.join("\n"),
    };
  }

  const infectedMatch = lines[infectedIdx]?.match(INFECTED_RE);
  const heatmapLine = lines.find((line) => HEATMAP_CONF_RE.test(line));
  const heatmapMatch = heatmapLine?.match(HEATMAP_CONF_RE);

  return {
    lung: lines[0] ?? null,
    lobe: lines[1] ?? null,
    infectedPct: infectedMatch?.[1]?.trim() ?? null,
    heatmapConfidencePct: heatmapMatch?.[1]?.trim() ?? null,
    structured: true,
    raw: lines.join("\n"),
  };
}

export function parseAffectedArea(text: string): AffectedAreaDetails {
  const raw = text.trim();
  if (!raw) {
    return {
      lung: null,
      lobe: null,
      infectedPct: null,
      heatmapConfidencePct: null,
      structured: false,
      raw: "",
    };
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 3 && lines.some((line) => INFECTED_RE.test(line))) {
    return parseStructuredLines(lines);
  }

  return {
    lung: null,
    lobe: null,
    infectedPct: null,
    heatmapConfidencePct: null,
    structured: false,
    raw,
  };
}

/** Parse numeric infected-region percent from observed-regions text, if present. */
export function parseInfectedPctNumber(text: string): number | null {
  const details = parseAffectedArea(text);
  if (!details.infectedPct) return null;
  const match = details.infectedPct.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(value) ? value : null;
}

/** Parse numeric heatmap-confidence percent from observed-regions text, if present. */
export function parseHeatmapConfidenceNumber(text: string): number | null {
  const details = parseAffectedArea(text);
  if (!details.heatmapConfidencePct) return null;
  const match = details.heatmapConfidencePct.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(value) ? value : null;
}

/** e.g. "Right Lung" + "Lower Lobe" → "Right Lower Lung" */
export function formatSuspiciousRegion(
  lung: string | null,
  lobe: string | null,
): string | null {
  if (!lung) return null;
  if (!lobe || /diffuse/i.test(lobe)) return lung;

  const side = lung.replace(/\s+lung$/i, "").trim();
  const lobePart = lobe.replace(/\s+lobe$/i, "").trim();
  if (!side || !lobePart) return lung;
  return `${side} ${lobePart} Lung`;
}
