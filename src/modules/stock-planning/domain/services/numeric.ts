/** Arredondamento consistente para quantidades (6 casas decimais) — mesma convenção de `stockAdjustmentFromLinesService.ts`. */
export function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
