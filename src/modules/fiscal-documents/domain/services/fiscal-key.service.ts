import type { FiscalIdentityInput, FiscalKey, MissingField } from "../entities/fiscal-identity.js";

/**
 * Regras puras da identidade fiscal. Não inventa: NIF sem país explícito só
 * é aceite como português se tiver 9 dígitos e dígito de controlo válido;
 * série/número mantém zeros e separadores (só se ignora maiúsculas e espaços
 * repetidos).
 */

/** NIF português válido (9 dígitos, dígito de controlo módulo 11). */
export function isValidPtNif(nif: string): boolean {
  if (!/^\d{9}$/.test(nif)) return false;
  const sum = nif
    .slice(0, 8)
    .split("")
    .reduce((s, d, i) => s + Number(d) * (9 - i), 0);
  const check = 11 - (sum % 11);
  return (check >= 10 ? 0 : check) === Number(nif[8]);
}

/**
 * País + NIF normalizado. Aceita "PT 123 456 789", "PT123456789",
 * "123456789" (PT só se válido) e NIF estrangeiro com prefixo de país.
 */
export function normalizeTaxId(raw: string | null, country: string | null): { country: string; taxId: string } | null {
  if (!raw) return null;
  const compact = raw.toUpperCase().replace(/[\s.\-/]/g, "");
  if (!compact) return null;
  const prefixed = /^([A-Z]{2})([A-Z0-9]{2,})$/.exec(compact);
  if (prefixed && !/^\d/.test(compact)) {
    const [, cc, rest] = prefixed;
    if (cc === "PT" && !isValidPtNif(rest!)) return null;
    return { country: cc!, taxId: rest! };
  }
  const cc = country?.trim().toUpperCase() || null;
  if (cc && cc !== "PT") return /^[A-Z0-9]{2,}$/.test(compact) ? { country: cc, taxId: compact } : null;
  return isValidPtNif(compact) ? { country: "PT", taxId: compact } : null;
}

/** Série/número para comparar: maiúsculas e espaços colapsados; zeros e separadores mantidos. */
export function normalizeSeriesNumber(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
  return s || null;
}

/**
 * Grupos numéricos sem zeros à esquerda ("FT 2026/064311" → "2026|64311"),
 * só para SINALIZAR possíveis duplicados com formatações diferentes — a
 * chave forte continua a contar os zeros e os separadores.
 */
export function numberDigits(seriesNumberNorm: string): string {
  return (seriesNumberNorm.match(/\d+/g) ?? []).map((g) => g.replace(/^0+(?=\d)/, "")).join("|");
}

export function buyerKeyOf(legalEntityId: string | null): string {
  return legalEntityId ?? "org";
}

/**
 * Porque é que o NIF não serve: em falta; 9 dígitos portugueses com dígito
 * de controlo errado (tipicamente erro de leitura — dizê-lo, em vez de pedir
 * um país que não é o problema); ou sem país identificável.
 */
function taxIdProblem(raw: string | null, country: string | null): MissingField {
  if (!raw?.trim()) return "issuer_tax_id";
  const compact = raw.toUpperCase().replace(/[\s.\-/]/g, "");
  const digits = compact.startsWith("PT") ? compact.slice(2) : compact;
  const cc = country?.trim().toUpperCase() || null;
  if ((!cc || cc === "PT") && /^\d{9}$/.test(digits)) return "issuer_tax_id_invalid";
  return "issuer_country";
}

/** Chave forte, ou o que falta para a ter. */
export function fiscalKeyOf(input: FiscalIdentityInput): { key: FiscalKey } | { missing: MissingField[] } {
  const missing: MissingField[] = [];
  const tax = normalizeTaxId(input.issuerTaxId, input.issuerCountry);
  if (!tax) missing.push(taxIdProblem(input.issuerTaxId, input.issuerCountry));
  const series = normalizeSeriesNumber(input.seriesNumber);
  if (!series) missing.push("series_number");
  if (!tax || !series) return { missing };
  return { key: { buyerKey: buyerKeyOf(input.buyerLegalEntityId), issuerCountry: tax.country, issuerTaxId: tax.taxId, documentType: input.documentType, seriesNumberNorm: series } };
}
