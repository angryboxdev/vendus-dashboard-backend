import { InvoicingRuleError } from "../errors.js";

/**
 * Menções obrigatórias na impressão (Portaria 363/2010, art. 6.º, n.º 3;
 * Despacho 8632/2014, pontos 1.5, 2.2.2 e 2.2.3; DL 28/2019, art. 7.º, n.º 6).
 */

/** RSA-1024 → 128 bytes → Base64 de 172 caracteres (171 + "="). */
const SIGNATURE = /^[A-Za-z0-9+/]{171}=$/;
const CERTIFICATE_NUMBER = /^\d{1,4}$/;

/** Caracteres nas posições 1, 11, 21 e 31 da assinatura. */
export function printedSignatureCode(hash: string): string {
  if (!SIGNATURE.test(hash)) throw new InvoicingRuleError("Assinatura inválida: esperados 172 caracteres Base64");
  return hash[0]! + hash[10]! + hash[20]! + hash[30]!;
}

function assertCertificateNumber(certificateNumber: string): void {
  if (!CERTIFICATE_NUMBER.test(certificateNumber)) throw new InvoicingRuleError(`N.º de certificado inválido: ${certificateNumber}`);
}

/** Ex.: "AxAx-Processado por programa certificado n.º 0000/AT". */
export function certifiedProgramMention(signatureCode: string, certificateNumber: string): string {
  assertCertificateNumber(certificateNumber);
  return `${signatureCode}-Processado por programa certificado n.º ${certificateNumber}/AT`;
}

/** Recibos (não assinados). */
export function receiptCertificationMention(certificateNumber: string): string {
  assertCertificateNumber(certificateNumber);
  return `Emitido por programa certificado n.º ${certificateNumber}/AT`;
}

export const TRAINING_MENTION = "Documento emitido para fins de Formação";

