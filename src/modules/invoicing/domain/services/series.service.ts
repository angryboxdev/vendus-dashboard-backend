import { InvoicingRuleError } from "../errors.js";

/**
 * Séries, números de documento e ATCUD (DL 28/2019, art. 35.º; Portaria
 * 195/2020, arts. 3.º–4.º; Despacho 8632/2014, 1.6–1.8; Manual de Comunicação
 * de Séries, §1.3.2).
 */

const SERIES_ID = /^[A-Za-z0-9]+([._-][A-Za-z0-9]+)*$/;
const SERIES_MAX = 35;
const DOCUMENT_TYPE = /^[A-Z0-9]{1,10}$/;
/** Regex do SAF-T para InvoiceNo/DocumentNumber: `[^ ]+ [^/^ ]+/[0-9]+`. */
const DOCUMENT_NUMBER = /^([^ ]+) ([^/^ ]+)\/([0-9]+)$/;

export interface ParsedDocumentNumber {
  /** Código interno do tipo, ex.: "FT". */
  typeCode: string;
  seriesId: string;
  /** Número tal como escrito (mantém zeros à esquerda, ex.: "0035"). */
  sequence: string;
}

export function parseDocumentNumber(docNumber: string): ParsedDocumentNumber {
  const m = DOCUMENT_NUMBER.exec(docNumber);
  if (!m) throw new InvoicingRuleError(`Número de documento inválido: ${docNumber}`);
  return { typeCode: m[1]!, seriesId: m[2]!, sequence: m[3]! };
}

/** A série/tipo da cadeia de assinaturas: tudo o que vem antes da «/». */
export function chainKey(docNumber: string): string {
  const { typeCode, seriesId } = parseDocumentNumber(docNumber);
  return `${typeCode} ${seriesId}`;
}

/** Identificador da série: máx. 35 de [A-Za-z0-9._-], sem separador no início/fim/seguido, não começa por «AT». */
export function validateSeriesId(id: string): void {
  if (id.length === 0 || id.length > SERIES_MAX) throw new InvoicingRuleError(`Série com tamanho inválido: "${id}"`);
  if (!SERIES_ID.test(id)) throw new InvoicingRuleError(`Série com caracteres ou separadores inválidos: "${id}"`);
  if (id.toUpperCase().startsWith("AT")) throw new InvoicingRuleError(`Série não pode começar por "AT": "${id}"`);
}

/** «TIPO SÉRIE/NÚMERO»; o número é só numérico (ano/terminal vão na série). */
export function documentNumber(documentType: string, seriesId: string, sequence: number): string {
  if (!DOCUMENT_TYPE.test(documentType)) throw new InvoicingRuleError(`Tipo de documento inválido: ${documentType}`);
  validateSeriesId(seriesId);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new InvoicingRuleError(`Número sequencial inválido: ${sequence}`);
  return `${documentType} ${seriesId}/${sequence}`;
}

/** Código de validação da série (≥ 8 caracteres, atribuído pela AT) + «-» + número que segue a «/». */
export function atcud(validationCode: string, docNumber: string): string {
  if (validationCode.length < 8 || /[\s*-]/.test(validationCode)) {
    throw new InvoicingRuleError(`Código de validação inválido: ${validationCode}`);
  }
  return `${validationCode}-${parseDocumentNumber(docNumber).sequence}`;
}

export const printedAtcud = (code: string): string => `ATCUD:${code}`;
