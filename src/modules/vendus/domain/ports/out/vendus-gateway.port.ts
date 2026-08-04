import type { VendusDocument, VendusDetailedDocumentRaw } from "../../entities/vendus-document.js";

export interface ListDocumentsParams {
  since: string;
  until: string;
  /** Tipos de documento separados por vírgula (ex: "FS,FT,NC"). Default: "FS,FT,NC" */
  type?: string;
  /** Documentos por página. O adapter trata a paginação internamente. Default: 500 */
  per_page?: number;
}

// ─── Selfconsumption raw types ─────────────────────────────────────────────────

export interface RawSelfConsumptionProduct {
  reference?: string;
  title?: string;
  name?: string;
  qty?: number | string;
  quantity?: number | string;
}

export interface RawSelfConsumptionRecord {
  id?: string | number;
  consumption_datetime?: string;
  employee_name?: string;
  total?: number | string | null;
  observations?: string;
  products?: RawSelfConsumptionProduct[];
}

export interface SelfConsumptionListParams {
  date_start: string;
  date_end: string;
  page?: number;
}

export interface SelfConsumptionPage {
  records: RawSelfConsumptionRecord[];
  pagesCount: number;
}

/**
 * Gateway para a API REST Vendus — documentos, produtos e autoconsumo.
 *
 * Implementado por VendusHttpGateway (adapter/out).
 * O domínio nunca importa o adapter — apenas este port.
 */
export interface VendusGatewayPort {
  /**
   * Busca TODOS os documentos do período (paginação transparente).
   * Trata "404 A001 No data" como lista vazia.
   */
  listDocuments(params: ListDocumentsParams): Promise<VendusDocument[]>;

  /**
   * Busca o detalhe de um documento (items, payments, taxes, related_docs).
   */
  fetchDetail(id: number): Promise<VendusDetailedDocumentRaw>;

  /**
   * Lista registos de autoconsumo do período (uma página).
   * Usa Basic Auth — endpoint distinto dos documentos de venda.
   * Trata "404 A001 No data" como lista vazia.
   */
  listSelfConsumption(params: SelfConsumptionListParams): Promise<SelfConsumptionPage>;

  /**
   * Busca os produtos de um registo de autoconsumo pelo id.
   * Necessário quando a listagem devolve registos sem array `products`.
   */
  fetchSelfConsumptionDetail(id: string | number): Promise<RawSelfConsumptionProduct[]>;
}
