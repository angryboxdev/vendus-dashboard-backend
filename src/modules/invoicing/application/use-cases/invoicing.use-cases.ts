import { decToString, type Dec } from "../../../../kernel/money/decimal.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { CANCEL_REASONS, cancelReasonText, type CancelReasonCode } from "../../domain/entities/cancel-reasons.js";
import { ENABLED_EXEMPTIONS, EXEMPTION_MENTIONS } from "../../domain/entities/exemption-reasons.js";
import { DOCUMENT_TYPES, type SeriesState } from "../../domain/entities/series.js";
import type { DocumentView, InvoicingMeta, InvoicingPort, NewSeriesInput, SaftExport, SaftQuery } from "../../domain/ports/in/invoicing.ports.js";
import { VAT_RATES } from "../../domain/entities/vat-rates.js";
import { InvoicingNotFoundError, InvoicingRuleError } from "../../domain/errors.js";
import type { DocumentFilter, DocumentSummary, InvoicingStorePort, SeriesListItem } from "../../domain/ports/out/invoicing-store.port.js";
import { fiscalMentions } from "../../domain/services/printed-mentions.service.js";
import { buildSaftXml } from "../../domain/services/saft.service.js";
import type { ClockPort } from "../../domain/ports/out/clock.port.js";
import type { IssuerDirectoryPort } from "../../domain/ports/out/issuer-directory.port.js";
import { printedAtcud, validateSeriesId } from "../../domain/services/series.service.js";

export type { DocumentView, NewSeriesInput } from "../../domain/ports/in/invoicing.ports.js";

/** Software que produz o SAF-T: produtora (por omissão, o próprio emitente) e versão. */
export interface SaftSoftwareConfig {
  producerTaxId: string | null;
  producerName: string | null;
  version: string;
}

export interface InvoicingUseCasesDeps {
  store: InvoicingStorePort;
  certificateNumber: string | null;
  signingAvailable: boolean;
  simplifiedInvoiceLimitNet: Dec;
  issuers: IssuerDirectoryPort;
  clock: ClockPort;
  software: SaftSoftwareConfig;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Séries, consulta (2.ª via), anulação e configuração da faturação. A emissão está em `IssueDocumentUseCase`. */
export class InvoicingUseCases implements InvoicingPort {
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

  async setValidationCode(org: OrganizationId, seriesRef: string, code: string): Promise<SeriesState> {
    const normalized = code.trim().toUpperCase();
    if (normalized.length < 8 || /[\s*-]/.test(normalized)) throw new InvoicingRuleError("Código de validação da AT inválido (mín. 8 caracteres, sem espaços, «*» nem «-»)");
    await this.deps.store.setSeriesValidationCode(org, seriesRef, normalized);
    const series = await this.deps.store.getSeries(org, seriesRef);
    if (!series) throw new InvoicingNotFoundError("Série");
    return series;
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

  async cancel(org: OrganizationId, actor: string, documentId: string, reasonCode: CancelReasonCode, note?: string): Promise<DocumentView> {
    await this.deps.store.cancel(org, documentId, cancelReasonText(reasonCode, note), actor);
    return this.getDocument(org, documentId);
  }

  /**
   * SAF-T (PT) 1.04_01 do emitente para um período dentro de um ano fiscal
   * (o ficheiro tem um só FiscalYear). Documentos de formação só se pedido.
   */
  async exportSaft(org: OrganizationId, q: SaftQuery): Promise<SaftExport> {
    if (!DATE.test(q.from) || !DATE.test(q.to) || Number.isNaN(Date.parse(q.from)) || Number.isNaN(Date.parse(q.to))) {
      throw new InvoicingRuleError("Período inválido (datas AAAA-MM-DD)");
    }
    if (q.from > q.to) throw new InvoicingRuleError("O início do período é depois do fim");
    if (q.from.slice(0, 4) !== q.to.slice(0, 4)) throw new InvoicingRuleError("O SAF-T cobre um só ano fiscal — divida o período por ano");
    const issuer = await this.deps.issuers.getIssuer(org, q.legalEntityId);
    if (!issuer) throw new InvoicingNotFoundError("Entidade emitente");
    const documents = await this.deps.store.saftDocuments(org, q);
    const { software } = this.deps;
    const xml = buildSaftXml({
      issuer,
      startDate: q.from,
      endDate: q.to,
      dateCreated: this.deps.clock.now().date,
      producerTaxId: software.producerTaxId ?? issuer.taxId,
      productId: `Mezza/${(software.producerName ?? issuer.name).replace(/\//g, "-")}`,
      productVersion: software.version,
      certificateNumber: this.deps.certificateNumber ?? "0",
      documents,
    });
    return { fileName: `SAFT_${issuer.taxId}_${q.from}_${q.to}.xml`, xml };
  }

  meta(): InvoicingMeta {
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
