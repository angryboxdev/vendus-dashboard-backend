import type { Dec } from "../../../../kernel/money/decimal.js";
import type { SeriesExpectation, SeriesState } from "../entities/series.js";
import { InvoicingRuleError } from "../errors.js";
import { atcud, documentNumber } from "./series.service.js";
import { buildSignatureMessage } from "./signature.service.js";

export interface NextDocumentInput {
  documentDate: string;
  /** Hora de Lisboa (o que se assina). */
  systemEntryDate: string;
  /** Instante UTC da emissão (cronologia). */
  systemEntryAt: string;
  grossTotal: Dec;
}

export interface PlannedDocument {
  sequence: number;
  documentNumber: string;
  atcud: string;
  /** Mensagem a assinar com a chave do produtor. */
  signatureMessage: string;
  /** Estado da série em que este plano assenta; a gravação falha se tiver mudado. */
  expected: SeriesExpectation;
}

/**
 * Próximo documento da série: número contínuo, ATCUD e mensagem encadeada no
 * hash do último documento da mesma série/tipo (Despacho 8632/2014, 1.6,
 * 2.1.5 e 3.2.1; Portaria 195/2020, art. 3.º). Pura: quem grava garante que
 * a série não mudou entretanto.
 */
export function planNextDocument(series: SeriesState, input: NextDocumentInput): PlannedDocument {
  if (!series.validationCode) {
    throw new InvoicingRuleError(`A série ${series.seriesId} ainda não foi comunicada à AT (sem código de validação)`);
  }
  if (series.lastDocumentDate !== null && input.documentDate < series.lastDocumentDate) {
    throw new InvoicingRuleError(`Data ${input.documentDate} anterior ao último documento da série (${series.lastDocumentDate})`);
  }
  if (series.lastSystemEntryAt !== null && Date.parse(input.systemEntryAt) < Date.parse(series.lastSystemEntryAt)) {
    throw new InvoicingRuleError(`Emissão anterior à do último documento da série (${series.lastSystemEntryAt})`);
  }

  const sequence = series.lastSequence + 1;
  const number = documentNumber(series.documentType, series.seriesId, sequence);
  return {
    sequence,
    documentNumber: number,
    atcud: atcud(series.validationCode, number),
    signatureMessage: buildSignatureMessage({
      documentDate: input.documentDate,
      systemEntryDate: input.systemEntryDate,
      documentNumber: number,
      grossTotal: input.grossTotal,
      previousHash: series.lastHash,
    }),
    expected: { lastSequence: series.lastSequence, lastHash: series.lastHash },
  };
}
