/**
 * Impressão digital da configuração e do plano usados num apuramento (TK-13).
 * Determinística (chaves ordenadas) e sem dependências: FNV-1a 32 bits em hex.
 */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

export function configHash(v: unknown): string {
  let h = 0x811c9dc5;
  for (const ch of stable(v)) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
