import type { VendusDocument } from "../../entities/vendus-document.js";

export interface ListDocumentsParams {
  since: string;
  until: string;
  type?: string;
  per_page?: number;
  page?: number;
}

export interface ListDocumentsResult {
  documents: VendusDocument[];
  pagesFetched: number;
}

/**
 * Lista documentos com paginação (proxy limpo da API Vendus).
 * Não enriquece com channel — usar GetSummaryPort para analytics.
 */
export interface ListDocumentsPort {
  execute(params: ListDocumentsParams): Promise<ListDocumentsResult>;
}
