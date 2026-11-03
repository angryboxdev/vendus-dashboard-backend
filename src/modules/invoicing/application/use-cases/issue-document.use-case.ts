import { dec, decToString, type Dec } from "../../../../kernel/money/decimal.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { exemptionMention } from "../../domain/entities/exemption-reasons.js";
import { FINAL_CONSUMER, type CustomerSnapshot, type DocumentReference, type PartyAddress } from "../../domain/entities/parties.js";
import type { SeriesState } from "../../domain/entities/series.js";
import { vatRate } from "../../domain/entities/vat-rates.js";
import {
  InvoicingNotFoundError,
  InvoicingRuleError,
  InvoicingUnavailableError,
  IssueNeedsConfirmationError,
  StaleSeriesError,
} from "../../domain/errors.js";
import type { ClockPort } from "../../domain/ports/out/clock.port.js";
import type { DocumentSummary, InvoicingStorePort, PaymentMechanism } from "../../domain/ports/out/invoicing-store.port.js";
import type { IssuerDirectoryPort } from "../../domain/ports/out/issuer-directory.port.js";
import type { SignerPort } from "../../domain/ports/out/signer.port.js";
import { add, compare, sub } from "../../domain/services/decimal-ops.js";
import {
  computeDocumentTotals,
  type DocumentTotals,
  type DraftLine,
  type ProductType,
  type TaxRateCode,
  type TaxRegion,
} from "../../domain/services/document-totals.service.js";
import { checkIssue } from "../../domain/services/issue-guard.service.js";
import { planNextDocument } from "../../domain/services/next-document.service.js";
import { printedSignatureCode } from "../../domain/services/printed-mentions.service.js";
import { buildQrPayload, qrTaxFieldsFromTotals } from "../../domain/services/qr-payload.service.js";
import { isValidPtNif } from "../../domain/services/tax-id.service.js";

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
  /** Sem cliente → consumidor final (999999990). */
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

export interface IssueDocumentDeps {
  store: InvoicingStorePort;
  /** null sem chave configurada. */
  signer: SignerPort | null;
  clock: ClockPort;
  issuers: IssuerDirectoryPort;
  /** N.º de certificado da AT; null enquanto o programa não está certificado. */
  certificateNumber: string | null;
  /** Limite da fatura simplificada, sem IVA (CIVA art. 40.º, n.º 1, al. b): 100 €). */
  simplifiedInvoiceLimitNet: Dec;
}

const MAX_ATTEMPTS = 3;
const INVOICES = new Set(["FT", "FS", "FR"]);

function draftLines(lines: IssueLineInput[]): DraftLine[] {
  return lines.map((l) => ({
    description: l.description.trim(),
    product: { code: l.productCode.trim(), type: l.productType, unit: l.unit.trim() },
    quantity: dec(l.quantity),
    unitPrice: dec(l.unitPrice),
    ...(l.discountPct ? { discountPct: dec(l.discountPct) } : {}),
    tax:
      "rate" in l.tax
        ? { kind: "rate", region: l.tax.region, code: l.tax.rate, percentage: vatRate(l.tax.region, l.tax.rate) }
        : { kind: "exempt", region: l.tax.region, exemptionCode: l.tax.exemptionCode, exemptionReason: exemptionMention(l.tax.exemptionCode, l.tax.exemptionNorm) },
  }));
}

function customerSnapshot(c: IssueDocumentInput["customer"]): CustomerSnapshot {
  if (!c) return FINAL_CONSUMER;
  const taxId = c.taxId.replace(/\s/g, "");
  const country = (c.country ?? "PT").toUpperCase();
  const name = c.name.trim();
  if (!name) throw new InvoicingRuleError("Cliente sem nome");
  if (country === "PT" && !isValidPtNif(taxId)) throw new InvoicingRuleError(`NIF português inválido: ${taxId}`);
  return { customerId: taxId, taxId, name, country, address: c.address ?? null };
}

/**
 * Emite um documento fiscal: valida séries, bloqueios e regras por tipo,
 * calcula os totais com as taxas e menções oficiais, numera, assina, monta o
 * QR e grava por compare-and-swap (recomeça se outro terminal emitiu antes).
 */
export class IssueDocumentUseCase {
  constructor(private readonly deps: IssueDocumentDeps) {}

  async execute(org: OrganizationId, input: IssueDocumentInput): Promise<IssueDocumentOutput> {
    const { store, clock, issuers } = this.deps;
    const signer = this.deps.signer;
    if (!signer) throw new InvoicingUnavailableError("Emissão indisponível: chave de assinatura não configurada");

    const initial = await store.getSeries(org, input.seriesRef);
    if (!initial) throw new InvoicingNotFoundError("Série");

    const now = clock.now();
    const documentDate = input.documentDate ?? now.date;
    const check = checkIssue({
      seriesMode: initial.mode,
      certificateNumber: this.deps.certificateNumber,
      now,
      documentDate,
      lastSystemEntryAtAnySeries: await store.lastSystemEntryAt(org, initial.legalEntityId),
    });
    if (check.blocked.length > 0) throw new InvoicingRuleError(`Emissão bloqueada: ${check.blocked.join(", ")}`);
    if (check.warnings.length > 0 && !input.confirmWarnings) throw new IssueNeedsConfirmationError(check.warnings);

    const pricesIncludeTax = input.pricesIncludeTax ?? true;
    const totals = computeDocumentTotals({ lines: draftLines(input.lines), pricesIncludeTax });
    const customer = customerSnapshot(input.customer);
    const referencesTo = await this.references(org, initial, input, totals);
    const orderReferences = await this.orderReferences(org, initial, input);
    this.typeRules(initial, input, totals);

    const issuer = await issuers.getIssuer(org, initial.legalEntityId);
    if (!issuer) throw new InvoicingNotFoundError("Entidade emitente");
    const certificateNumber = this.deps.certificateNumber ?? "0";

    let series: SeriesState = initial;
    for (let attempt = 1; ; attempt++) {
      const at = attempt === 1 ? now : clock.now();
      const plan = planNextDocument(series, { documentDate, systemEntryDate: at.systemEntryDate, systemEntryAt: at.instant, grossTotal: totals.grossTotal });
      const { hash, keyVersion } = await signer.sign(plan.signatureMessage);
      const qrPayload = buildQrPayload({
        issuerTaxId: issuer.taxId,
        customerTaxId: customer.taxId,
        customerCountry: customer.country,
        documentType: series.documentType,
        documentStatus: "N",
        documentDate,
        documentNumber: plan.documentNumber,
        atcud: plan.atcud,
        ...qrTaxFieldsFromTotals(totals),
        taxPayable: totals.taxPayable,
        grossTotal: totals.grossTotal,
        signatureCode: printedSignatureCode(hash),
        certificateNumber,
      });
      try {
        const { documentId } = await store.saveIssued(org, {
          seriesRef: series.ref,
          expected: plan.expected,
          sequence: plan.sequence,
          documentNumber: plan.documentNumber,
          documentDate,
          taxPointDate: documentDate,
          systemEntryDate: at.systemEntryDate,
          systemEntryAt: at.instant,
          softwareCertificateNumber: certificateNumber,
          hash,
          keyVersion,
          atcud: plan.atcud,
          qrPayload,
          pricesIncludeTax,
          totals,
          customer,
          issuer,
          ...(input.paymentMechanism ? { paymentMechanism: input.paymentMechanism } : {}),
          ...(referencesTo.length > 0 ? { referencesTo } : {}),
          ...(orderReferences.length > 0 ? { orderReferences } : {}),
          actor: input.actor,
        });
        return { documentId, documentNumber: plan.documentNumber, atcud: plan.atcud };
      } catch (e) {
        if (!(e instanceof StaleSeriesError) || attempt >= MAX_ATTEMPTS) throw e;
        const fresh = await store.getSeries(org, input.seriesRef);
        if (!fresh) throw new InvoicingNotFoundError("Série");
        series = fresh;
      }
    }
  }

  private typeRules(series: SeriesState, input: IssueDocumentInput, totals: DocumentTotals): void {
    if (series.documentType === "FS" && compare(totals.netTotal, this.deps.simplifiedInvoiceLimitNet) > 0) {
      throw new InvoicingRuleError(`Fatura simplificada só até ${decToString(this.deps.simplifiedInvoiceLimitNet)} € sem IVA — emitir fatura ou fatura-recibo`);
    }
    if (series.documentType === "FR" && !input.paymentMechanism) throw new InvoicingRuleError("Fatura-recibo sem meio de pagamento");
  }

  /** NC/ND: documentos ativos do mesmo emitente; a NC não credita mais do que falta creditar. */
  private async references(org: OrganizationId, series: SeriesState, input: IssueDocumentInput, totals: DocumentTotals): Promise<DocumentReference[]> {
    const refs = input.references ?? [];
    if (series.documentType !== "NC" && series.documentType !== "ND") {
      if (refs.length > 0) throw new InvoicingRuleError("Só notas de crédito/débito referem documentos retificados");
      return [];
    }
    if (refs.length === 0) throw new InvoicingRuleError("Nota de crédito/débito sem documento retificado");
    const found = await this.store.documentsByIds(org, refs.map((r) => r.documentId));
    const byId = new Map(found.map((d) => [d.id, d]));
    const docs = refs.map((r) => {
      const d = byId.get(r.documentId);
      if (!d || d.legalEntityId !== series.legalEntityId || d.status !== "N" || !INVOICES.has(d.documentType)) {
        throw new InvoicingRuleError(`Documento retificado inválido (inexistente, anulado ou de outro emitente): ${r.documentId}`);
      }
      if (!r.reason.trim()) throw new InvoicingRuleError(`Motivo da retificação em falta: ${d.documentNumber}`);
      return { doc: d, reason: r.reason.trim() };
    });
    if (series.documentType === "NC") {
      let remaining = dec("0");
      for (const { doc } of docs) remaining = add(remaining, sub(doc.grossTotal, await this.store.creditedTotal(org, doc.id)));
      if (compare(totals.grossTotal, remaining) > 0) throw new InvoicingRuleError("A nota de crédito excede o valor ainda por creditar");
    }
    return docs.map(({ doc, reason }) => ({ documentId: doc.id, documentNumber: doc.documentNumber, reason }));
  }

  /** Consultas de mesa ativas, do mesmo emitente, faturadas por uma FT/FS/FR. */
  private async orderReferences(org: OrganizationId, series: SeriesState, input: IssueDocumentInput): Promise<DocumentReference[]> {
    const ids = input.orderReferences ?? [];
    if (ids.length === 0) return [];
    if (!INVOICES.has(series.documentType)) throw new InvoicingRuleError("Só faturas referem consultas de mesa");
    const found: DocumentSummary[] = await this.store.documentsByIds(org, ids);
    const byId = new Map(found.map((d) => [d.id, d]));
    return ids.map((id) => {
      const d = byId.get(id);
      if (!d || d.documentType !== "CM" || d.status !== "N" || d.legalEntityId !== series.legalEntityId) {
        throw new InvoicingRuleError(`Consulta de mesa inválida ou já faturada: ${id}`);
      }
      return { documentId: d.id, documentNumber: d.documentNumber };
    });
  }

  private get store() {
    return this.deps.store;
  }
}
