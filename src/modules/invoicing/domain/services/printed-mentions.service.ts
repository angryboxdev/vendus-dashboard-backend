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

/** Documentos de conferência (consulta de mesa) e outros que não são fatura (Despacho 1.2). */
export const NOT_AN_INVOICE_MENTION = "Este documento não serve de fatura";

/**
 * Enquanto o programa não tem certificado (n.º «0»), não se imprime a frase do
 * programa certificado; os documentos levam esta marca (pesquisa-perguntas-abertas.md §4).
 */
export const UNCERTIFIED_TEST_MARK = "DOCUMENTO DE TESTE – SEM VALOR FISCAL";

/** Linhas fiscais a imprimir no rodapé de um documento assinado, pela ordem. */
export function fiscalMentions(input: {
  hash: string;
  /** "0" enquanto o programa não está certificado. */
  certificateNumber: string;
  mode: "normal" | "training";
  documentType: string;
}): string[] {
  const code = printedSignatureCode(input.hash);
  assertCertificateNumber(input.certificateNumber);
  const lines = input.certificateNumber === "0" ? [code, UNCERTIFIED_TEST_MARK] : [certifiedProgramMention(code, input.certificateNumber)];
  if (input.mode === "training") lines.push(TRAINING_MENTION);
  if (input.documentType === "CM") lines.push(NOT_AN_INVOICE_MENTION);
  return lines;
}

