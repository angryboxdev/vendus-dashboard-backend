import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CustomerSnapshot, DocumentReference, IssuerSnapshot } from "../../entities/parties.js";
import type { SeriesExpectation, SeriesState } from "../../entities/series.js";
import type { DocumentTotals } from "../../services/document-totals.service.js";

/** Documento pronto a gravar: numerado, assinado e com totais fixados. */
export interface IssuedDocumentRecord {
  seriesRef: string;
  /** Estado da série em que o documento foi montado (compare-and-swap). */
  expected: SeriesExpectation;
  sequence: number;
  documentNumber: string;
  documentDate: string;
  taxPointDate: string;
  systemEntryDate: string;
  hash: string;
  hashControl: string;
  keyVersion: number;
  atcud: string;
  qrPayload: string;
  pricesIncludeTax: boolean;
  totals: DocumentTotals;
  customer: CustomerSnapshot;
  issuer: IssuerSnapshot;
  referencesTo?: DocumentReference[];
  orderReferences?: DocumentReference[];
  /** Utilizador que emite (SourceID). */
  actor: string;
}

/**
 * Persistência fiscal. A gravação é atómica e falha com `StaleSeriesError`
 * se outro documento entrou na série depois de `expected` (quem chama recomeça).
 */
export interface InvoicingStorePort {
  getSeries(orgId: OrganizationId, seriesRef: string): Promise<SeriesState | null>;
  /** Último SystemEntryDate do emitente, em qualquer série (Despacho 3.4.3). */
  lastSystemEntryDate(orgId: OrganizationId, legalEntityId: string): Promise<string | null>;
  saveIssued(orgId: OrganizationId, record: IssuedDocumentRecord): Promise<{ documentId: string }>;
  cancel(orgId: OrganizationId, documentId: string, reason: string, actor: string): Promise<void>;
}
