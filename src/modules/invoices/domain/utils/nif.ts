/** Normaliza NIF removendo espaços, pontos e hífens para comparação fiável. */
export function normalizeNif(nif: string): string {
  return nif.replace(/[\s.\-]/g, "");
}
