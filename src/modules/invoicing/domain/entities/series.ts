import type { SeriesMode } from "./series-mode.js";

/** Tipos de documento emitidos pelo Mezza (SAF-T InvoiceType / WorkType). Recibos (RC) numa fase seguinte. */
export type FiscalDocumentType = "FT" | "FS" | "FR" | "NC" | "ND" | "CM";

/** Estado de uma série tal como está gravado (o fim da cadeia de assinaturas). */
export interface SeriesState {
  ref: string;
  /** Emitente: a entidade legal (NIF), não a organização. */
  legalEntityId: string;
  locationId: string | null;
  documentType: FiscalDocumentType;
  /** Identificador comunicado à AT, ex.: "L01-2027". */
  seriesId: string;
  mode: SeriesMode;
  /** Código de validação atribuído pela AT; null enquanto a série não foi comunicada. */
  validationCode: string | null;
  lastSequence: number;
  lastHash: string | null;
  lastDocumentDate: string | null;
  /** Instante UTC (ISO) da última emissão — a cronologia não usa a hora local, que se repete em outubro. */
  lastSystemEntryAt: string | null;
}

/** O que a gravação compara para garantir que ninguém emitiu entretanto (compare-and-swap). */
export interface SeriesExpectation {
  lastSequence: number;
  lastHash: string | null;
}
