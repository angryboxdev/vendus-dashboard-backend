/**
 * Utilitários de normalização de descrições bancárias.
 *
 * Usado no matching de hints de conciliação: quando o utilizador confirma
 * manualmente uma reconciliação, normalizamos a descrição do movimento bancário
 * e guardamos a associação normalizedDescription → supplierId.
 * Em importações futuras, a mesma normalização é aplicada e o hint é recuperado.
 *
 * A normalização remove o "envelope" das descrições bancárias (datas embutidas,
 * referências numéricas, termos genéricos bancários) e preserva o "conteúdo"
 * que identifica o fornecedor (e.g. "TRANSF CRED 20240715 GALP ENERGIA REF 123"
 * → "galp energia").
 */

/**
 * Termos genéricos que aparecem em muitas descrições bancárias e não identificam
 * o fornecedor. Listados em lowercase sem acentos.
 */
const BANK_NOISE_WORDS = new Set([
  "transf",
  "transferencia",
  "cred",
  "credito",
  "deb",
  "debito",
  "pagamento",
  "pag",
  "ref",
  "ord",
  "bene",
  "orig",
  "sepa",
  "sibs",
  "iban",
  "liq",
  "liquidacao",
  "dev",
  "devolucao",
  "aut",
  "autorizacao",
  "oper",
  "operacao",
  "doc",
  "num",
  "way", // MB WAY
]);

const MIN_TOKEN_LEN = 3;

/**
 * Normaliza uma descrição bancária para comparação:
 * - lowercase
 * - remove acentos (NFD)
 * - remove datas embutidas (DD-MM-YYYY, YYYY-MM-DD, YYYYMMDD, DDMMYYYY)
 * - remove sequências numéricas puras (referências, montantes)
 * - remove pontuação
 * - descarta tokens genéricos bancários e tokens com < 3 caracteres
 * - colapsa espaços
 *
 * Exemplos:
 *   "TRANSF CRED 20240715 GALP ENERGIA REF 12345678" → "galp energia"
 *   "PAGAMENTO MB WAY GALP ENERGIA"                  → "galp energia"
 *   "DEB SEPA NOS COMUNICACOES SA 20240701"          → "nos comunicacoes"
 */
export function normalizeBankDescription(desc: string): string {
  return desc
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Remove dates: DD-MM-YYYY / DD/MM/YYYY / YYYY-MM-DD
    .replace(/\b\d{2}[.\-/]\d{2}[.\-/]\d{2,4}\b/g, " ")
    .replace(/\b\d{4}[.\-]\d{2}[.\-]\d{2}\b/g, " ")
    // Remove 6+ digit sequences (YYYYMMDD, DDMMYYYY, references)
    .replace(/\b\d{6,}\b/g, " ")
    // Remove remaining punctuation
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(
      (t) =>
        t.length >= MIN_TOKEN_LEN &&
        !BANK_NOISE_WORDS.has(t) &&
        !/^\d+$/.test(t), // drop any remaining pure-numeric token
    )
    .join(" ");
}
