import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CustomerSnapshot, DocumentReference, IssuerSnapshot } from "../../entities/parties.js";
import type { SeriesExpectation, SeriesState } from "../../entities/series.js";
import type { DocumentTotals } from "../../services/document-totals.service.js";

/** SAF-T PaymentMechanism. */
export type PaymentMechanism = "CC" | "CD" | "CH" | "CI" | "CO" | "CS" | "DE" | "LC" | "MB" | "NU" | "OU" | "PR" | "TB" | "TR";

/** Documento pronto a gravar: numerado, assinado e com totais fixados. */
export interface IssuedDocumentRecord {
  seriesRef: string;
  /** Estado da série em que o documento foi montado (compare-and-swap). */
  expected: SeriesExpectation;
  sequence: number;
  documentNumber: string;
  documentDate: string;
  taxPointDate: string;
  /** Hora de Lisboa assinada. */
  systemEntryDate: string;
  /** Instante UTC correspondente. */
  systemEntryAt: string;
  /** SoftwareCertificateNumber ("0" enquanto não há certificado; a BD põe HashControl "0"). */
  softwareCertificateNumber: string;
  hash: string;
  keyVersion: number;
  atcud: string;
  qrPayload: string;
  pricesIncludeTax: boolean;
  totals: DocumentTotals;
  customer: CustomerSnapshot;
  issuer: IssuerSnapshot;
  paymentMechanism?: PaymentMechanism;
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
  /** Instante UTC da última emissão do emitente, em qualquer série (Despacho 3.4.3). */
  lastSystemEntryAt(orgId: OrganizationId, legalEntityId: string): Promise<string | null>;
  saveIssued(orgId: OrganizationId, record: IssuedDocumentRecord): Promise<{ documentId: string }>;
  cancel(orgId: OrganizationId, documentId: string, reason: string, actor: string): Promise<void>;
}
