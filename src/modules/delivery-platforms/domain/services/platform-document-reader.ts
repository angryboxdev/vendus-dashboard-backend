import { computedPayoutCents, type PlatformStatement } from "../entities/platform-statement.js";
import { InvalidPlatformDocumentError, UnsupportedPlatformDocumentError } from "../errors.js";
import { isGlovoStatement, parseGlovoStatement } from "./glovo-statement.parser.js";
import { isUberMonthlyStatement, parseUberMonthlyStatement } from "./uber-statement.parser.js";

/** Leitores conhecidos: reconhecem o documento pelo conteúdo (não pelo nome do ficheiro). */
const READERS: { matches: (text: string) => boolean; parse: (text: string) => PlatformStatement | { error: string } }[] = [
  { matches: isUberMonthlyStatement, parse: parseUberMonthlyStatement },
  { matches: isGlovoStatement, parse: parseGlovoStatement },
];

/** Diferença tolerada entre as linhas lidas e o total do documento (arredondamentos). */
const PAYOUT_TOLERANCE_CENTS = 2;

/**
 * Lê um documento de uma plataforma a partir do texto: escolhe o leitor, lê e confere que as linhas
 * somam o total a transferir que o próprio documento indica. Uma leitura que não confere nunca se grava.
 */
export function readPlatformDocument(fileName: string, text: string | null): PlatformStatement {
  const reader = text ? READERS.find((r) => r.matches(text)) : undefined;
  if (!text || !reader) throw new UnsupportedPlatformDocumentError(fileName);
  const result = reader.parse(text);
  if ("error" in result) throw new InvalidPlatformDocumentError(fileName, result.error);
  const diff = computedPayoutCents(result) - result.netPayoutCents;
  if (Math.abs(diff) > PAYOUT_TOLERANCE_CENTS) {
    throw new InvalidPlatformDocumentError(fileName, `as linhas lidas não somam o total a transferir (diferença de ${diff} cêntimos)`);
  }
  return result;
}
