import type { Dec } from "../../../../kernel/money/decimal.js";
import { InvoicingRuleError } from "../errors.js";
import type { SignatureVerifierPort } from "../ports/out/signer.port.js";
import { formatAmount } from "./amount-format.js";
import { chainKey, parseDocumentNumber } from "./series.service.js";

/**
 * Regras da assinatura (Portaria 363/2010, art. 6.º; Despacho 8632/2014,
 * pontos 2.1 e 4–7). A mensagem é
 * `Data;SystemEntryDate;Número;GrossTotal;HashAnterior`, sem fim de linha;
 * no 1.º documento da série/tipo o hash anterior fica vazio (termina em ";").
 */
export interface SignatureInput {
  /** InvoiceDate / WorkDate / MovementDate, AAAA-MM-DD. */
  documentDate: string;
  /** AAAA-MM-DDTHH:MM:SS, ao segundo, sem fuso. */
  systemEntryDate: string;
  /** `CÓDIGO SÉRIE/NÚMERO`, ex.: "FT A2027/1". */
  documentNumber: string;
  /** Contravalor em EUR; assina-se com 2 casas. */
  grossTotal: Dec;
  /** Hash do documento anterior da mesma série/tipo; null no primeiro. */
  previousHash: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SYSTEM_ENTRY_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export function buildSignatureMessage(input: SignatureInput): string {
  if (!DATE.test(input.documentDate)) throw new InvoicingRuleError(`Data do documento inválida: ${input.documentDate}`);
  if (!SYSTEM_ENTRY_DATE.test(input.systemEntryDate)) {
    throw new InvoicingRuleError(`SystemEntryDate inválida: ${input.systemEntryDate}`);
  }
  parseDocumentNumber(input.documentNumber);
  return [
    input.documentDate,
    input.systemEntryDate,
    input.documentNumber,
    formatAmount(input.grossTotal),
    input.previousHash ?? "",
  ].join(";");
}

/** Documento já assinado, tal como fica gravado (sem o hash anterior, que vem da cadeia). */
export type SignedDocumentRecord = Omit<SignatureInput, "previousHash"> & { hash: string };

export type ChainVerification = { valid: true } | { valid: false; firstInvalid: string };

/**
 * Verifica a cadeia de assinaturas (documentos pela ordem de emissão): cada
 * documento tem de estar assinado sobre os seus dados e o hash do anterior da
 * mesma série/tipo. Devolve o primeiro documento que não verifica.
 */
export async function verifySignatureChain(
  documents: SignedDocumentRecord[],
  verifier: SignatureVerifierPort,
): Promise<ChainVerification> {
  const lastHashByChain = new Map<string, string>();
  for (const doc of documents) {
    const key = chainKey(doc.documentNumber);
    const message = buildSignatureMessage({ ...doc, previousHash: lastHashByChain.get(key) ?? null });
    if (!(await verifier.verify(message, doc.hash))) return { valid: false, firstInvalid: doc.documentNumber };
    lastHashByChain.set(key, doc.hash);
  }
  return { valid: true };
}
