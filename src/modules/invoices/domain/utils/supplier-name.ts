/**
 * Utilitários de normalização e similaridade de nomes de fornecedor.
 *
 * Usado no matching fuzzy durante importação de faturas: quando o NIF não casa
 * ou não foi extraído, compara-se o nome extraído pela IA com os nomes na BD
 * usando coeficiente de Jaccard sobre tokens ≥ 3 caracteres, após remoção de
 * acentos, pontuação e formas jurídicas (SA, Lda, SL, etc.).
 */

const LEGAL_FORM_RE =
  /\b(s\.?\s*a\.?|lda\.?|sl|s\.?\s*l\.?|ltd\.?|limited|unipessoal|unip\.?|sociedade\s+anonima|sociedade\s+por\s+quotas|s\.?r\.?l\.?)\b/gi;

const MIN_TOKEN_LEN = 3;
const FUZZY_MATCH_THRESHOLD = 0.5;

export { FUZZY_MATCH_THRESHOLD };

/**
 * Normaliza um nome de fornecedor para comparação:
 * - lowercase
 * - remove acentos (NFD)
 * - remove formas jurídicas (SA, Lda, ...)
 * - remove pontuação, substitui por espaço
 * - colapsa espaços múltiplos
 */
export function normalizeSupplierName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(LEGAL_FORM_RE, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Coeficiente de Jaccard sobre tokens ≥ 3 caracteres dos nomes normalizados.
 * Devolve 1.0 para nomes idênticos após normalização, 0 se sem tokens comuns.
 *
 * Exemplos:
 *   "Makro Portugal, SA"  vs "Makro Portugal S.A."  → 1.0
 *   "NOS Comunicações SA" vs "NOS Comunicações, S.A." → 1.0
 *   "Makro Portugal SA"   vs "Metro Portugal SA"    → 0.33 (abaixo do threshold)
 */
export function supplierNameSimilarity(nameA: string, nameB: string): number {
  const na = normalizeSupplierName(nameA);
  const nb = normalizeSupplierName(nameB);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const tokensA = new Set(na.split(" ").filter((t) => t.length >= MIN_TOKEN_LEN));
  const tokensB = new Set(nb.split(" ").filter((t) => t.length >= MIN_TOKEN_LEN));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection = [...tokensA].filter((t) => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}
