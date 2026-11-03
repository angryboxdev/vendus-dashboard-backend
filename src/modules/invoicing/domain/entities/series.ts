import type { SeriesMode } from "./series-mode.js";

/** Estado de uma série tal como está gravado (o fim da cadeia de assinaturas). */
export interface SeriesState {
  ref: string;
  /** Emitente: a entidade legal (NIF), não a organização. */
  legalEntityId: string;
  locationId: string | null;
  /** FT, FS, FR, NC, ND, CM, RC… */
  documentType: string;
  /** Identificador comunicado à AT, ex.: "L01-2027". */
  seriesId: string;
  mode: SeriesMode;
  /** Código de validação atribuído pela AT; null enquanto a série não foi comunicada. */
  validationCode: string | null;
  lastSequence: number;
  lastHash: string | null;
  lastDocumentDate: string | null;
  lastSystemEntryDate: string | null;
}

/** O que a gravação compara para garantir que ninguém emitiu entretanto (compare-and-swap). */
export interface SeriesExpectation {
  lastSequence: number;
  lastHash: string | null;
}
