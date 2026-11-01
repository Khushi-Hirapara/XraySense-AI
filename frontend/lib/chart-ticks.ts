/** Round integer tick step (1, 2, 5, 10, 20, 50, …) at or above `raw`. */
export function niceCountStep(raw: number): number {
  if (raw <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Axis maximum and evenly spaced round ticks (0 … max) covering `dataMax`. */
export function niceCountTicks(dataMax: number, targetSteps = 4): { max: number; ticks: number[] } {
  const step = niceCountStep(Math.max(1, dataMax) / targetSteps);
  const max = Math.max(step, Math.ceil(dataMax / step) * step);
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
}
