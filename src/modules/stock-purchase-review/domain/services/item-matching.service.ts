/**
 * Conciliação linha da fatura ↔ artigo de stock (F3b), sem I/O: semelhança de nomes
 * e fator de conversão a partir da embalagem impressa na descrição. Só propõe —
 * quem confirma é sempre uma pessoa.
 */

export interface CatalogItem {
  id: string;
  name: string;
  baseUnit: string;
}

export interface RankedCandidate {
  item: CatalogItem;
  score: number;
}

type Dimension = "mass" | "volume";
const UNIT_INFO: Record<string, { dimension: Dimension; toBase: number }> = {
  g: { dimension: "mass", toBase: 1 },
  gr: { dimension: "mass", toBase: 1 },
  kg: { dimension: "mass", toBase: 1000 },
  ml: { dimension: "volume", toBase: 1 },
  cl: { dimension: "volume", toBase: 10 },
  dl: { dimension: "volume", toBase: 100 },
  l: { dimension: "volume", toBase: 1000 },
  lt: { dimension: "volume", toBase: 1000 },
  lts: { dimension: "volume", toBase: 1000 },
};

// Palavras que não distinguem artigos (embalagem, preposições, marcas de origem genéricas).
const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "com", "sem", "c", "s", "p", "para", "em", "a", "o",
  "un", "und", "uni", "unid", "cx", "caixa", "emb", "pack", "pct", "pacote", "saco", "garrafa", "gf", "lata",
  "kg", "g", "gr", "l", "lt", "lts", "ml", "cl", "dl", "x", "aprox", "ref", "nr",
]);

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Tokens significativos: minúsculas, sem acentos, sem tamanhos de embalagem nem números soltos. */
export function nameTokens(text: string): string[] {
  const clean = stripAccents(text.toLowerCase())
    .replace(/\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:kg|gr|g|lts|lt|l|ml|cl|dl|un|und|uni)\b/g, " ")
    .replace(/\b\d+\s*x\b|\bx\s*\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ");
  return [...new Set(clean.split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t)))];
}

/** Semelhança 0..1 entre dois tokens (igual, prefixo ≥ 4 letras, plural simples). */
function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const sa = a.replace(/(es|s)$/, "");
  const sb = b.replace(/(es|s)$/, "");
  if (sa === sb) return 0.95;
  if (sa.length >= 4 && sb.length >= 4 && (sa.startsWith(sb) || sb.startsWith(sa))) return 0.8;
  return 0;
}

/**
 * Pontuação 0..1: média, nos dois sentidos, da melhor correspondência de cada token — o nome
 * do artigo tem de estar quase todo na descrição e a descrição não pode ter muito a mais.
 */
export function nameScore(description: string, itemName: string): number {
  const d = nameTokens(description);
  const n = nameTokens(itemName);
  if (!d.length || !n.length) return 0;
  const cover = (from: string[], to: string[]) => from.reduce((acc, t) => acc + Math.max(...to.map((u) => tokenSimilarity(t, u))), 0) / from.length;
  const itemCovered = cover(n, d);
  const descCovered = cover(d, n);
  return Math.round((0.65 * itemCovered + 0.35 * descCovered) * 1000) / 1000;
}

export function rankCandidates(description: string, items: CatalogItem[], limit = 10): RankedCandidate[] {
  return items
    .map((item) => ({ item, score: nameScore(description, item.name) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit);
}

/** Correspondência de nome suficientemente clara para sugerir sem IA. */
export function confidentNameMatch(ranked: RankedCandidate[]): RankedCandidate | null {
  const [first, second] = ranked;
  if (!first || first.score < 0.75) return null;
  if (second && first.score - second.score < 0.15) return null;
  return first;
}

export interface PackSize {
  /** Unidades por embalagem (ex.: «x6», «6x1L»); 1 quando não impresso. */
  count: number;
  /** Conteúdo de cada unidade, se impresso (ex.: 1,5 L). */
  size: { quantity: number; unit: string } | null;
}

const num = (s: string) => parseFloat(s.replace(",", "."));

/** Embalagem impressa na descrição: «25kg», «1,5L x6», «6x1L», «12 x 33cl», «cx 24». */
export function parsePackSize(description: string): PackSize | null {
  const t = stripAccents(description.toLowerCase());
  const multi = t.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|gr|g|lts|lt|l|ml|cl|dl)\b/);
  if (multi) return { count: Number(multi[1]), size: { quantity: num(multi[2]!), unit: multi[3]! } };
  const size = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|gr|g|lts|lt|l|ml|cl|dl)\b/);
  const count = t.match(/\bx\s*(\d+)\b|\b(\d+)\s*(?:un|und|unid|uni)\b|\b(?:cx|caixa|pack)\s*(\d+)\b/);
  const n = count ? Number(count[1] ?? count[2] ?? count[3]) : 1;
  if (!size && !count) return null;
  return { count: n > 0 ? n : 1, size: size ? { quantity: num(size[1]!), unit: size[2]! } : null };
}

/**
 * Fator «unidade de compra → unidade base do artigo» a partir da embalagem. Null quando não
 * há informação segura (a pessoa preenche); nunca converte massa em volume.
 */
export function suggestConversionFactor(description: string, purchaseUnit: string, baseUnit: string): number | null {
  const base = baseUnit.trim().toLowerCase();
  const purchase = stripAccents(purchaseUnit.trim().toLowerCase());
  const baseInfo = UNIT_INFO[base];
  const purchaseInfo = UNIT_INFO[purchase];
  // Comprado já numa unidade de medida (kg, L…): converte diretamente.
  if (baseInfo && purchaseInfo && baseInfo.dimension === purchaseInfo.dimension) return round(purchaseInfo.toBase / baseInfo.toBase);
  if (purchase === base) return 1;
  const pack = parsePackSize(description);
  if (!pack) return null;
  if (baseInfo) {
    if (!pack.size) return null;
    const info = UNIT_INFO[pack.size.unit];
    if (!info || info.dimension !== baseInfo.dimension) return null;
    return round((pack.count * pack.size.quantity * info.toBase) / baseInfo.toBase);
  }
  if (base === "un" || base === "und") return pack.count > 1 ? pack.count : null;
  return null;
}

const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
