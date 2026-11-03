import { decToString, type Dec } from "../../../../kernel/money/decimal.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { CANCEL_REASONS, cancelReasonText, type CancelReasonCode } from "../../domain/entities/cancel-reasons.js";
import { ENABLED_EXEMPTIONS, EXEMPTION_MENTIONS } from "../../domain/entities/exemption-reasons.js";
import type { SeriesMode } from "../../domain/entities/series-mode.js";
import type { FiscalDocumentType, SeriesState } from "../../domain/entities/series.js";
import { VAT_RATES } from "../../domain/entities/vat-rates.js";
import { InvoicingNotFoundError, InvoicingRuleError } from "../../domain/errors.js";
import type { DocumentFilter, DocumentSummary, InvoicingStorePort, SeriesListItem, StoredDocument } from "../../domain/ports/out/invoicing-store.port.js";
import { fiscalMentions } from "../../domain/services/printed-mentions.service.js";
import { printedAtcud, validateSeriesId } from "../../domain/services/series.service.js";

export const DOCUMENT_TYPES: readonly FiscalDocumentType[] = ["FT", "FS", "FR", "NC", "ND", "CM"];

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

export interface InvoicingUseCasesDeps {
  store: InvoicingStorePort;
  certificateNumber: string | null;
  signingAvailable: boolean;
  simplifiedInvoiceLimitNet: Dec;
}

/** Séries, consulta (2.ª via), anulação e configuração da faturação. A emissão está em `IssueDocumentUseCase`. */
export class InvoicingUseCases {
  constructor(private readonly deps: InvoicingUseCasesDeps) {}

  listSeries(org: OrganizationId): Promise<SeriesListItem[]> {
    return this.deps.store.listSeries(org);
  }

  async createSeries(org: OrganizationId, actor: string, input: NewSeriesInput): Promise<SeriesState> {
    if (!DOCUMENT_TYPES.includes(input.documentType)) throw new InvoicingRuleError(`Tipo de documento não suportado: ${String(input.documentType)}`);
    if (input.mode !== "training" && input.mode !== "normal") throw new InvoicingRuleError(`Modo de série inválido: ${String(input.mode)}`);
    if (input.mode === "normal" && this.deps.certificateNumber === null) {
      throw new InvoicingRuleError("Séries normais só depois de o programa ter certificado da AT — usar séries de formação");
    }
    validateSeriesId(input.seriesId);
    return this.deps.store.createSeries(org, { ...input, actor });
  }

  async setValidationCode(org: OrganizationId, seriesRef: string, code: string): Promise<void> {
    const normalized = code.trim().toUpperCase();
    if (normalized.length < 8 || /[\s*-]/.test(normalized)) throw new InvoicingRuleError("Código de validação da AT inválido (mín. 8 caracteres, sem espaços, «*» nem «-»)");
    await this.deps.store.setSeriesValidationCode(org, seriesRef, normalized);
  }

  listDocuments(org: OrganizationId, filter: DocumentFilter): Promise<DocumentSummary[]> {
    return this.deps.store.listDocuments(org, filter);
  }

  async getDocument(org: OrganizationId, documentId: string): Promise<DocumentView> {
    const doc = await this.deps.store.getDocument(org, documentId);
    if (!doc) throw new InvoicingNotFoundError("Documento");
    return {
      ...doc,
      printed: {
        atcud: printedAtcud(doc.atcud),
        mentions: fiscalMentions({ hash: doc.hash, certificateNumber: doc.softwareCertificateNumber, mode: doc.seriesMode, documentType: doc.documentType }),
      },
    };
  }

  async cancel(org: OrganizationId, actor: string, documentId: string, reasonCode: CancelReasonCode, note?: string): Promise<void> {
    await this.deps.store.cancel(org, documentId, cancelReasonText(reasonCode, note), actor);
  }

  meta() {
    return {
      certified: this.deps.certificateNumber !== null,
      certificateNumber: this.deps.certificateNumber ?? "0",
      signingAvailable: this.deps.signingAvailable,
      simplifiedInvoiceLimitNet: decToString(this.deps.simplifiedInvoiceLimitNet),
      documentTypes: DOCUMENT_TYPES,
      vatRates: Object.entries(VAT_RATES).flatMap(([region, rates]) => Object.entries(rates).map(([code, percentage]) => ({ region, code, percentage }))),
      exemptions: [...ENABLED_EXEMPTIONS].map((code) => ({ code, mention: EXEMPTION_MENTIONS[code]! })),
      cancelReasons: CANCEL_REASONS,
    };
  }
}
