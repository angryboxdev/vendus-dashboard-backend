/**
 * Identificação do colaborador de um recibo de vencimento importado em massa
 * (Base Organizacional, ticket 10 — task §25). Só usa o que já existe: o
 * texto do PDF (quando o PDF tem texto — sem OCR nem IA) e o nome do
 * ficheiro, comparados com o NIF, o id e o nome normalizado de cada
 * colaborador.
 *
 * Regra de ouro (§24): na dúvida, `review` — um recibo nunca é associado
 * automaticamente a um colaborador se houver mais de um candidato ou se os
 * sinais se contradisserem.
 */

export interface PayslipCandidate {
  id: string;
  fullName: string;
  nif: string | null;
}

export interface PayslipSource {
  fileName: string;
  /** Texto extraído do PDF; `null` se o PDF não tiver texto (ex: digitalizado). */
  text: string | null;
}

export type PayslipMatchReason = "nif" | "employee_id" | "name" | "file_name";
export type PayslipReviewReason = "no_match" | "ambiguous" | "conflict";

export type PayslipMatch =
  | { status: "identified"; employeeId: string; reason: PayslipMatchReason }
  | { status: "review"; reason: PayslipReviewReason; candidateIds: string[] };

/** Minúsculas, sem acentos, só letras/dígitos separados por um espaço. */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Números de 9 dígitos no texto — juntos ("123456789") ou em blocos de 3 ("123 456 789"). */
function nineDigitNumbers(text: string): Set<string> {
  const found = new Set<string>();
  for (const m of text.matchAll(/(?<!\d)\d{9}(?!\d)/g)) found.add(m[0]);
  for (const m of text.matchAll(/(?<!\d[ .\u00a0]?)\d{3}[ .\u00a0]\d{3}[ .\u00a0]\d{3}(?![ .\u00a0]?\d)/g)) found.add(digitsOnly(m[0]));
  return found;
}

function containsPhrase(haystack: string, phrase: string): boolean {
  if (phrase.length === 0) return false;
  return ` ${haystack} `.includes(` ${phrase} `);
}

/** Tira candidatos cujo nome está contido no nome de outro candidato ("Ana Silva" ⊂ "Ana Silva Costa"). */
function dropContainedNames(ids: string[], names: Map<string, string>): string[] {
  return ids.filter((id) => !ids.some((other) => other !== id && names.get(other)!.length > names.get(id)!.length && containsPhrase(names.get(other)!, names.get(id)!)));
}

function single(ids: string[]): string | null {
  return ids.length === 1 ? ids[0]! : null;
}

export function identifyPayslipEmployee(source: PayslipSource, candidates: readonly PayslipCandidate[]): PayslipMatch {
  const text = source.text ?? "";
  const baseName = source.fileName.replace(/\.[a-z0-9]+$/i, "");
  const normText = normalizeForMatch(text);
  const normFile = normalizeForMatch(baseName);
  const names = new Map(candidates.map((c) => [c.id, normalizeForMatch(c.fullName)]));

  // 1. Sinais fortes: NIF ou id do colaborador, no texto ou no nome do ficheiro.
  const numbers = new Set([...nineDigitNumbers(text), ...nineDigitNumbers(baseName)]);
  const byNif = candidates.filter((c) => c.nif && digitsOnly(c.nif).length === 9 && numbers.has(digitsOnly(c.nif))).map((c) => c.id);
  const lowerRaw = `${text} ${baseName}`.toLowerCase();
  // Só ids com formato UUID — um id curto apareceria por acaso em qualquer texto.
  const byId = candidates.filter((c) => c.id.length >= 32 && lowerRaw.includes(c.id.toLowerCase())).map((c) => c.id);
  const strong = [...new Set([...byNif, ...byId])];

  // 2. Nome completo normalizado no texto; se o texto não o tiver, no nome do ficheiro.
  const nameInText = dropContainedNames(candidates.filter((c) => containsPhrase(normText, names.get(c.id)!)).map((c) => c.id), names);
  const nameInFile = dropContainedNames(candidates.filter((c) => containsPhrase(normFile, names.get(c.id)!)).map((c) => c.id), names);
  const byName = nameInText.length > 0 ? nameInText : nameInFile;

  if (strong.length > 1) return { status: "review", reason: "ambiguous", candidateIds: strong };
  if (strong.length === 1) {
    const id = strong[0]!;
    // Um nome de OUTRO colaborador no recibo contradiz o NIF/id → rever.
    if (byName.length > 0 && !byName.includes(id)) return { status: "review", reason: "conflict", candidateIds: [id, ...byName] };
    return { status: "identified", employeeId: id, reason: byNif.includes(id) ? "nif" : "employee_id" };
  }

  if (byName.length > 1) return { status: "review", reason: "ambiguous", candidateIds: byName };
  const nameMatch = single(byName);
  if (nameMatch) return { status: "identified", employeeId: nameMatch, reason: "name" };

  // 3. Sinal fraco: todas as palavras do nome do ficheiro pertencem ao nome de
  //    UM só colaborador (ex: "carlos.pdf", "recibo_andres_carlos.pdf").
  const fileTokens = normFile.split(" ").filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !GENERIC_FILE_WORDS.has(t));
  if (fileTokens.length > 0) {
    const byTokens = candidates
      .filter((c) => {
        const tokens = new Set(names.get(c.id)!.split(" "));
        return fileTokens.every((t) => tokens.has(t));
      })
      .map((c) => c.id);
    if (byTokens.length > 1) return { status: "review", reason: "ambiguous", candidateIds: byTokens };
    const tokenMatch = single(byTokens);
    if (tokenMatch) return { status: "identified", employeeId: tokenMatch, reason: "file_name" };
  }

  return { status: "review", reason: "no_match", candidateIds: [] };
}

/** Palavras comuns em nomes de ficheiros de recibos, ignoradas na comparação por nome de ficheiro. */
const GENERIC_FILE_WORDS = new Set([
  "recibo",
  "recibos",
  "vencimento",
  "vencimentos",
  "salario",
  "payslip",
  "nomina",
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
]);
