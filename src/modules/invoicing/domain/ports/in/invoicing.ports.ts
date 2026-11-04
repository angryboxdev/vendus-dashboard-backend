import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CancelReasonCode } from "../../entities/cancel-reasons.js";
import type { PartyAddress } from "../../entities/parties.js";
import type { SeriesMode } from "../../entities/series-mode.js";
import type { FiscalDocumentType, SeriesState } from "../../entities/series.js";
import type { ProductType, TaxRateCode, TaxRegion } from "../../services/document-totals.service.js";
import type { DocumentFilter, DocumentSummary, PaymentMechanism, SeriesListItem, StoredDocument } from "../out/invoicing-store.port.js";

export interface IssueLineInput {
  productCode: string;
  productType: ProductType;
  unit: string;
  description: string;
  /** Decimais em texto, ponto decimal (ex.: "2", "12.50"). */
  quantity: string;
  unitPrice: string;
  discountPct?: string;
  tax: { region: TaxRegion; rate: TaxRateCode } | { region: TaxRegion; exemptionCode: string; exemptionNorm?: string };
}

export interface IssueDocumentInput {
  seriesRef: string;
  /** Por omissão, hoje (hora de Lisboa). */
  documentDate?: string;
  /** Sem cliente (ou NIF 999999990) → consumidor final. */
  customer?: { taxId: string; name: string; country?: string; address?: PartyAddress | null } | null;
  /** Por omissão, preços com IVA incluído (restauração). */
  pricesIncludeTax?: boolean;
  lines: IssueLineInput[];
  /** Obrigatório na fatura-recibo. */
  paymentMechanism?: PaymentMechanism;
  /** NC/ND: documentos retificados. */
  references?: Array<{ documentId: string; reason: string }>;
  /** FT/FS/FR: consultas de mesa que esta fatura fatura. */
  orderReferences?: string[];
  /** Confirma os avisos de data futura / relógio atrasado. */
  confirmWarnings?: boolean;
  actor: string;
}

export interface IssueDocumentOutput {
  documentId: string;
  documentNumber: string;
  atcud: string;
}

/** Emitir um documento fiscal assinado. */
export interface IssueDocumentPort {
  execute(org: OrganizationId, input: IssueDocumentInput): Promise<IssueDocumentOutput>;
}

export interface NewSeriesInput {
  legalEntityId: string;
  locationId: string | null;
  documentType: FiscalDocumentType;
  seriesId: string;
  mode: SeriesMode;
}

export interface DocumentView extends StoredDocument {
  /** O que se imprime: ATCUD (acima do QR) e menções fiscais do rodapé. */
  printed: { atcud: string; mentions: string[] };
}

export interface InvoicingMeta {
  certified: boolean;
  certificateNumber: string;
  signingAvailable: boolean;
  simplifiedInvoiceLimitNet: string;
  documentTypes: readonly FiscalDocumentType[];
  vatRates: Array<{ region: string; code: string; percentage: string }>;
  exemptions: Array<{ code: string; mention: string }>;
  cancelReasons: ReadonlyArray<{ code: CancelReasonCode; label: string }>;
}

export interface SaftQuery {
  legalEntityId: string;
  from: string;
  to: string;
  /** Inclui os documentos de formação (para testes e para o dossiê de certificação). */
  includeTraining: boolean;
}

export interface SaftExport {
  fileName: string;
  xml: string;
}

/** Séries, consulta (2.ª via), anulação, SAF-T e configuração. */
export interface InvoicingPort {
  listSeries(org: OrganizationId): Promise<SeriesListItem[]>;
  createSeries(org: OrganizationId, actor: string, input: NewSeriesInput): Promise<SeriesState>;
  /** Devolve a série atualizada. */
  setValidationCode(org: OrganizationId, seriesRef: string, code: string): Promise<SeriesState>;
  listDocuments(org: OrganizationId, filter: DocumentFilter): Promise<DocumentSummary[]>;
  getDocument(org: OrganizationId, documentId: string): Promise<DocumentView>;
  /** Devolve o documento anulado (2.ª via). */
  cancel(org: OrganizationId, actor: string, documentId: string, reasonCode: CancelReasonCode, note?: string): Promise<DocumentView>;
  exportSaft(org: OrganizationId, q: SaftQuery): Promise<SaftExport>;
  meta(): InvoicingMeta;
}
