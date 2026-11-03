import type { Dec } from "../../../../../kernel/money/decimal.js";
import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CustomerSnapshot, DocumentReference, IssuerSnapshot } from "../../entities/parties.js";
import type { SeriesMode } from "../../entities/series-mode.js";
import type { FiscalDocumentType, SeriesExpectation, SeriesState } from "../../entities/series.js";
import type { DocumentTotals } from "../../services/document-totals.service.js";

/** SAF-T PaymentMechanism. */
export const PAYMENT_MECHANISMS = ["CC", "CD", "CH", "CI", "CO", "CS", "DE", "LC", "MB", "NU", "OU", "PR", "TB", "TR"] as const;
export type PaymentMechanism = (typeof PAYMENT_MECHANISMS)[number];

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

export type DocumentStatus = "N" | "A" | "F";

/** O essencial de um documento para validar referências (NC/ND, consultas de mesa). */
export interface DocumentSummary {
  id: string;
  legalEntityId: string;
  documentType: FiscalDocumentType;
  /** Modo da série à data de emissão (formação não se mistura com documentos reais). */
  seriesMode: SeriesMode;
  customerTaxId: string;
  documentNumber: string;
  documentDate: string;
  status: DocumentStatus;
  grossTotal: Dec;
}

export interface NewSeries {
  legalEntityId: string;
  locationId: string | null;
  documentType: FiscalDocumentType;
  seriesId: string;
  mode: SeriesMode;
  actor: string;
}

export interface SeriesListItem extends SeriesState {
  status: "active" | "finalized" | "cancelled";
  createdAt: string;
}

export interface DocumentLineView {
  lineNumber: number;
  productCode: string;
  productType: string;
  unitOfMeasure: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string | null;
  lineAmount: string;
  taxRegion: string;
  taxCode: string;
  taxPercentage: string;
  exemptionCode: string | null;
  exemptionReason: string | null;
}

export interface DocumentTaxView {
  taxRegion: string;
  taxCode: string;
  taxPercentage: string;
  exemptionCode: string | null;
  exemptionReason: string | null;
  taxableBase: string;
  taxAmount: string;
}

/** Documento tal como foi gravado (2.ª via com os dados originais). */
export interface StoredDocument extends DocumentSummary {
  seriesRef: string;
  sequence: number;
  taxPointDate: string;
  systemEntryDate: string;
  systemEntryAt: string;
  softwareCertificateNumber: string;
  hash: string;
  hashControl: string;
  atcud: string;
  qrPayload: string;
  pricesIncludeTax: boolean;
  netTotal: string;
  taxPayable: string;
  paymentMechanism: PaymentMechanism | null;
  customer: CustomerSnapshot;
  issuer: IssuerSnapshot;
  referencesTo: DocumentReference[];
  orderReferences: DocumentReference[];
  statusReason: string | null;
  statusChangedAt: string | null;
  createdBy: string;
  lines: DocumentLineView[];
  taxes: DocumentTaxView[];
}

export interface DocumentFilter {
  from?: string;
  to?: string;
  documentType?: FiscalDocumentType;
  status?: DocumentStatus;
  limit?: number;
}

/**
 * Persistência fiscal. A gravação é atómica e falha com `StaleSeriesError`
 * se outro documento entrou na série depois de `expected` (quem chama recomeça).
 */
export interface InvoicingStorePort {
  getSeries(orgId: OrganizationId, seriesRef: string): Promise<SeriesState | null>;
  listSeries(orgId: OrganizationId): Promise<SeriesListItem[]>;
  createSeries(orgId: OrganizationId, series: NewSeries): Promise<SeriesState>;
  /** Código de validação da AT (preenche-se uma vez; a BD recusa alterar). */
  setSeriesValidationCode(orgId: OrganizationId, seriesRef: string, validationCode: string): Promise<void>;
  /** Instante UTC da última emissão do emitente, em qualquer série (Despacho 3.4.3). */
  lastSystemEntryAt(orgId: OrganizationId, legalEntityId: string): Promise<string | null>;
  documentsByIds(orgId: OrganizationId, ids: string[]): Promise<DocumentSummary[]>;
  /** Total (com IVA) das NC ativas que retificam o documento. */
  creditedTotal(orgId: OrganizationId, documentId: string): Promise<Dec>;
  getDocument(orgId: OrganizationId, documentId: string): Promise<StoredDocument | null>;
  listDocuments(orgId: OrganizationId, filter: DocumentFilter): Promise<DocumentSummary[]>;
  saveIssued(orgId: OrganizationId, record: IssuedDocumentRecord): Promise<{ documentId: string }>;
  cancel(orgId: OrganizationId, documentId: string, reason: string, actor: string): Promise<void>;
}
