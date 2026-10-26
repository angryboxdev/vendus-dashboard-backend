import { normalizeBankDescription } from "../utils/bank-description.js";

/**
 * Pontuação de um documento (fatura / conta a pagar) como candidato a conciliar um movimento — pura, sem I/O.
 *
 * Confiança (0–1): valor (até 0,6, exato = 0,6), data — a mais próxima do movimento entre pagamento,
 * vencimento e emissão (≤ 7 dias +0,15; ≤ 30 dias +0,05) — e nome
 * (fornecedor aprendido em conciliações anteriores +0,35, senão nome do fornecedor na descrição +0,2).
 * Além da confiança devolve se o NOME e o VALOR batem: uma «sugestão» só é mostrada quando os dois
 * batem e a confiança é ≥ 70% (`isStrongSuggestion`, decisão do utilizador 2026-10-26: «abaixo de 70% não
 * interessa»; com nome e valor a bater a confiança já é ≥ 80%).
 */

const HINT_MATCH_BOOST = 0.35;
const SUPPLIER_NAME_BOOST = 0.2;
const EXACT_AMOUNT_CONFIDENCE = 0.6;
const DATE_CLOSE_BONUS = 0.15;
const DATE_NEAR_BONUS = 0.05;
const TOLERANCE_PCT = 0.02;

/** Candidatos abaixo disto nem entram na lista do painel. */
export const MIN_CANDIDATE_CONFIDENCE = 0.4;
/** Abaixo disto não é sugestão (separador «Sugestões», «Sugestões automáticas» do painel). */
export const SUGGESTION_MIN_CONFIDENCE = 0.7;
/** «Valor bate»: diferença até 1 € (igual à tolerância da conciliação). */
export const AMOUNT_MATCH_TOLERANCE_CENTS = 100;

/** Formas jurídicas e termos genéricos que não identificam o fornecedor. */
const NAME_STOP_WORDS = new Set([
  "lda", "limitada", "sa", "unipessoal", "ltda", "sl", "slu", "sociedade", "comercial", "comercio", "portugal",
  "portuguesa", "servicos", "industria", "distribuicao", "grupo", "cia", "companhia", "the", "and",
]);

/**
 * O nome do fornecedor aparece na descrição do banco: alguma palavra do nome com ≥ 3 letras (EDP, NOS, MEO
 * contam; formas jurídicas não) aparece como palavra inteira na descrição normalizada.
 */
export function supplierNameInDescription(supplierName: string, movementDesc: string): boolean {
  const desc = ` ${normalizeBankDescription(movementDesc)} `;
  return supplierName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !NAME_STOP_WORDS.has(w) && !/^\d+$/.test(w))
    .some((w) => desc.includes(` ${w} `));
}

export interface CandidateScore {
  confidence: number;
  /** Fornecedor aprendido para esta descrição, ou o nome do fornecedor aparece na descrição. */
  nameMatched: boolean;
  /** Valor do documento (total ou saldo em aberto) a ≤ 1 € do movimento. */
  amountMatched: boolean;
}

export function scoreCandidate(opts: {
  /** Valor usado para pontuar (total, ou saldo em aberto para faturas já parcialmente pagas). */
  candidateAmount: number;
  candidateOpenBalance: number;
  /** Datas do documento (pagamento, vencimento, emissão — YYYY-MM-DD); conta a mais próxima do movimento. */
  candidateDates: (string | null)[];
  candidateName: string;
  candidateSupplierId: string | null;
  movementAmount: number;
  movementDate: Date;
  movementDesc: string;
  hintSupplierId: string | null;
}): CandidateScore {
  let score = 0;

  const amountDiff = Math.abs(opts.candidateAmount - opts.movementAmount);
  if (amountDiff === 0) {
    score += EXACT_AMOUNT_CONFIDENCE;
  } else {
    const pct = amountDiff / opts.movementAmount;
    score += Math.max(0, EXACT_AMOUNT_CONFIDENCE * (1 - pct / TOLERANCE_PCT));
  }

  // A data mais próxima: numa compra com cartão a fatura é do próprio dia mas vence 30 dias depois —
  // usar só o vencimento tirava o bónus a uma correspondência certa.
  const diffs = opts.candidateDates
    .filter((d): d is string => !!d)
    .map((d) => Math.abs((opts.movementDate.getTime() - new Date(d.slice(0, 10) + "T00:00:00.000Z").getTime()) / 86_400_000));
  if (diffs.length > 0) {
    const diff = Math.min(...diffs);
    if (diff <= 7) score += DATE_CLOSE_BONUS;
    else if (diff <= 30) score += DATE_NEAR_BONUS;
  }

  // Fornecedor aprendido (sinal mais forte — confirmado por conciliações anteriores); senão o nome na descrição.
  const hinted = !!opts.hintSupplierId && opts.candidateSupplierId === opts.hintSupplierId;
  const named = !hinted && supplierNameInDescription(opts.candidateName, opts.movementDesc);
  if (hinted) score += HINT_MATCH_BOOST;
  else if (named) score += SUPPLIER_NAME_BOOST;

  const amountMatched =
    amountDiff <= AMOUNT_MATCH_TOLERANCE_CENTS ||
    Math.abs(opts.candidateOpenBalance - opts.movementAmount) <= AMOUNT_MATCH_TOLERANCE_CENTS;

  return { confidence: Math.min(1, score), nameMatched: hinted || named, amountMatched };
}

/** Uma sugestão só aparece com nome E valor a bater e confiança ≥ 70%. */
export function isStrongSuggestion(c: CandidateScore): boolean {
  return c.nameMatched && c.amountMatched && c.confidence >= SUGGESTION_MIN_CONFIDENCE;
}
