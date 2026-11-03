/**
 * Séries, números de documento e ATCUD (DL 28/2019, art. 35.º; Portaria
 * 195/2020, arts. 3.º–4.º; Despacho 8632/2014, 1.6–1.8; Manual de Comunicação
 * de Séries, §1.3.2).
 */

const SERIES_ID = /^[A-Za-z0-9]+([._-][A-Za-z0-9]+)*$/;
const SERIES_MAX = 35;
const DOCUMENT_TYPE = /^[A-Z0-9]{1,10}$/;

/** Identificador da série: máx. 35 de [A-Za-z0-9._-], sem separador no início/fim/seguido, não começa por «AT». */
export function validateSeriesId(id: string): void {
  if (id.length === 0 || id.length > SERIES_MAX) throw new Error(`Série com tamanho inválido: "${id}"`);
  if (!SERIES_ID.test(id)) throw new Error(`Série com caracteres ou separadores inválidos: "${id}"`);
  if (id.toUpperCase().startsWith("AT")) throw new Error(`Série não pode começar por "AT": "${id}"`);
}

/** «TIPO SÉRIE/NÚMERO»; o número é só numérico (ano/terminal vão na série). */
export function documentNumber(documentType: string, seriesId: string, sequence: number): string {
  if (!DOCUMENT_TYPE.test(documentType)) throw new Error(`Tipo de documento inválido: ${documentType}`);
  validateSeriesId(seriesId);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error(`Número sequencial inválido: ${sequence}`);
  return `${documentType} ${seriesId}/${sequence}`;
}

/** Código de validação da série (≥ 8 caracteres, atribuído pela AT) + «-» + número que segue a «/». */
export function atcud(validationCode: string, docNumber: string): string {
  if (validationCode.length < 8 || /[\s*-]/.test(validationCode)) throw new Error(`Código de validação inválido: ${validationCode}`);
  const m = /\/([0-9]+)$/.exec(docNumber);
  if (!m) throw new Error(`Número de documento inválido: ${docNumber}`);
  return `${validationCode}-${m[1]}`;
}

export const printedAtcud = (code: string): string => `ATCUD:${code}`;
