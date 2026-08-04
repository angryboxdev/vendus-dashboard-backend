import type { VendusDetailedDocument } from "../../entities/vendus-document.js";

export interface GetDocumentDetailResult extends VendusDetailedDocument {
  /** true se o documento contém pelo menos uma bebida (alcoólica ou não). */
  has_drinks: boolean;
}

/**
 * Detalhe de um documento — com channel derivado e flag has_drinks.
 */
export interface GetDocumentDetailPort {
  execute(id: number): Promise<GetDocumentDetailResult>;
}
