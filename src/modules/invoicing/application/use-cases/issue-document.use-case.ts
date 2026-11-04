import { dec, decToString, type Dec } from "../../../../kernel/money/decimal.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { exemptionMention } from "../../domain/entities/exemption-reasons.js";
import { FINAL_CONSUMER, type CustomerSnapshot, type DocumentReference, type PartyAddress } from "../../domain/entities/parties.js";
import type { IssueDocumentInput, IssueDocumentOutput, IssueDocumentPort, IssueLineInput } from "../../domain/ports/in/invoicing.ports.js";
import { INVOICE_TYPES, type SeriesState } from "../../domain/entities/series.js";
import { vatRate } from "../../domain/entities/vat-rates.js";
import {
  InvoicingNotFoundError,
  InvoicingRuleError,
  InvoicingUnavailableError,
  IssueNeedsConfirmationError,
  StaleSeriesError,
} from "../../domain/errors.js";
import type { ClockPort } from "../../domain/ports/out/clock.port.js";
import { PAYMENT_MECHANISMS, type DocumentSummary, type InvoicingStorePort } from "../../domain/ports/out/invoicing-store.port.js";
import type { IssuerDirectoryPort } from "../../domain/ports/out/issuer-directory.port.js";
import type { SignerPort } from "../../domain/ports/out/signer.port.js";
import { add, compare, sub } from "../../domain/services/decimal-ops.js";
import { computeDocumentTotals, type DocumentTotals, type DraftLine, type TaxRateCode, type TaxRegion } from "../../domain/services/document-totals.service.js";
import { checkIssue } from "../../domain/services/issue-guard.service.js";
import { planNextDocument } from "../../domain/services/next-document.service.js";
import { printedSignatureCode } from "../../domain/services/printed-mentions.service.js";
import { buildQrPayload, qrTaxFieldsFromTotals } from "../../domain/services/qr-payload.service.js";
import { isValidPtNif } from "../../domain/services/tax-id.service.js";

export type { IssueDocumentInput, IssueDocumentOutput, IssueLineInput } from "../../domain/ports/in/invoicing.ports.js";

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
const DECIMAL = /^\d{1,13}(\.\d{1,6})?$/;
const PRODUCT_TYPES = new Set(["P", "S", "O", "E", "I"]);
const TAX_REGIONS = new Set(["PT", "PT-AC", "PT-MA"]);
const RATE_CODES = new Set(["RED", "INT", "NOR"]);

/** Texto com tamanho dentro dos limites do SAF-T (recusa o que não é texto). */
function text(value: unknown, field: string, max: number, min = 1): string {
  if (typeof value !== "string") throw new InvoicingRuleError(`${field}: tem de ser texto`);
  const v = value.trim();
  if (v.length < min || v.length > max) throw new InvoicingRuleError(`${field}: entre ${min} e ${max} caracteres`);
  return v;
}

function decimal(value: unknown, field: string): Dec {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new InvoicingRuleError(`${field}: número inválido (ponto decimal, até 6 casas)`);
  return dec(value);
}

function draftLines(lines: IssueLineInput[]): DraftLine[] {
  if (lines.length > 500) throw new InvoicingRuleError("Documento com mais de 500 linhas");
  return lines.map((l, i) => {
    const at = `Linha ${i + 1}`;
    if (!PRODUCT_TYPES.has(l.productType)) throw new InvoicingRuleError(`${at}: tipo de produto inválido`);
    const tax = l.tax as Record<string, unknown> | null;
    if (!tax || typeof tax !== "object" || !TAX_REGIONS.has(String(tax.region))) throw new InvoicingRuleError(`${at}: espaço fiscal inválido`);
    const region = tax.region as TaxRegion;
    let lineTax: DraftLine["tax"];
    if ("rate" in tax) {
      if (!RATE_CODES.has(String(tax.rate))) throw new InvoicingRuleError(`${at}: taxa de IVA inválida`);
      lineTax = { kind: "rate", region, code: tax.rate as TaxRateCode, percentage: vatRate(region, tax.rate as TaxRateCode) };
    } else {
      const code = text(tax.exemptionCode, `${at}: motivo de isenção`, 3);
      const norm = tax.exemptionNorm === undefined ? undefined : text(tax.exemptionNorm, `${at}: norma da isenção`, 50);
      lineTax = { kind: "exempt", region, exemptionCode: code, exemptionReason: exemptionMention(code, norm) };
    }
    return {
      description: text(l.description, `${at}: descrição`, 200),
      product: { code: text(l.productCode, `${at}: código do produto`, 60), type: l.productType, unit: text(l.unit, `${at}: unidade`, 20) },
      quantity: decimal(l.quantity, `${at}: quantidade`),
      unitPrice: decimal(l.unitPrice, `${at}: preço unitário`),
      ...(l.discountPct !== undefined ? { discountPct: decimal(l.discountPct, `${at}: desconto`) } : {}),
      tax: lineTax,
    };
  });
}

function address(a: unknown): PartyAddress | null {
  if (a === null || a === undefined) return null;
  if (typeof a !== "object") throw new InvoicingRuleError("Morada do cliente inválida");
  const r = a as Record<string, unknown>;
  const country = text(r.country, "País da morada", 2, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new InvoicingRuleError("País da morada: código ISO de 2 letras");
  return { street: text(r.street, "Morada", 100), postalCode: text(r.postalCode, "Código postal", 20), city: text(r.city, "Localidade", 50), country };
}

/** Sem cliente ou com NIF 999999990 → consumidor final, com o nome fixo (Despacho 2.2.5). */
function customerSnapshot(c: IssueDocumentInput["customer"]): CustomerSnapshot {
  if (!c) return FINAL_CONSUMER;
  const taxId = text(c.taxId, "NIF do cliente", 30).replace(/\s/g, "").toUpperCase();
  if (taxId === FINAL_CONSUMER.taxId) return FINAL_CONSUMER;
  if (!/^[A-Z0-9]+$/.test(taxId)) throw new InvoicingRuleError("NIF do cliente só com letras e dígitos");
  const country = c.country === undefined ? "PT" : text(c.country, "País do cliente", 2, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new InvoicingRuleError("País do cliente: código ISO de 2 letras");
  if (country === "PT" && !isValidPtNif(taxId)) throw new InvoicingRuleError(`NIF português inválido: ${taxId}`);
  return { customerId: taxId, taxId, name: text(c.name, "Nome do cliente", 100), country, address: address(c.address) };
}

/**
 * Emite um documento fiscal: valida séries, bloqueios e regras por tipo,
 * calcula os totais com as taxas e menções oficiais, numera, assina, monta o
 * QR e grava por compare-and-swap (recomeça se outro terminal emitiu antes).
 */
export class IssueDocumentUseCase implements IssueDocumentPort {
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
    const referencesTo = await this.references(org, initial, input, totals, customer);
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
    if (input.paymentMechanism !== undefined && !(PAYMENT_MECHANISMS as readonly string[]).includes(input.paymentMechanism)) {
      throw new InvoicingRuleError("Meio de pagamento inválido");
    }
    if (series.documentType === "FR" && !input.paymentMechanism) throw new InvoicingRuleError("Fatura-recibo sem meio de pagamento");
  }

  /**
   * NC/ND: documentos ativos do mesmo emitente, do mesmo modo (formação/real) e do mesmo
   * cliente; a NC não credita mais do que falta creditar (a BD volta a conferir com os documentos bloqueados).
   */
  private async references(
    org: OrganizationId,
    series: SeriesState,
    input: IssueDocumentInput,
    totals: DocumentTotals,
    customer: CustomerSnapshot,
  ): Promise<DocumentReference[]> {
    const refs = input.references ?? [];
    if (series.documentType !== "NC" && series.documentType !== "ND") {
      if (refs.length > 0) throw new InvoicingRuleError("Só notas de crédito/débito referem documentos retificados");
      return [];
    }
    if (refs.length === 0) throw new InvoicingRuleError("Nota de crédito/débito sem documento retificado");
    const found = await this.deps.store.documentsByIds(org, refs.map((r) => r.documentId));
    const byId = new Map(found.map((d) => [d.id, d]));
    const docs = refs.map((r) => {
      const d = byId.get(r.documentId);
      if (!d || d.legalEntityId !== series.legalEntityId || d.status !== "N" || !INVOICE_TYPES.has(d.documentType) || d.seriesMode !== series.mode) {
        throw new InvoicingRuleError(`Documento retificado inválido (inexistente, anulado, de outro emitente ou de outro modo): ${r.documentId}`);
      }
      if (d.customerTaxId !== customer.taxId) throw new InvoicingRuleError(`O cliente da retificação tem de ser o do documento ${d.documentNumber}`);
      return { doc: d, reason: text(r.reason, `Motivo da retificação de ${d.documentNumber}`, 50) };
    });
    if (series.documentType === "NC") {
      let remaining = dec("0");
      for (const { doc } of docs) remaining = add(remaining, sub(doc.grossTotal, await this.deps.store.creditedTotal(org, doc.id)));
      if (compare(totals.grossTotal, remaining) > 0) throw new InvoicingRuleError("A nota de crédito excede o valor ainda por creditar");
    }
    return docs.map(({ doc, reason }) => ({ documentId: doc.id, documentNumber: doc.documentNumber, reason }));
  }

  /** Consultas de mesa ativas, do mesmo emitente, faturadas por uma FT/FS/FR. */
  private async orderReferences(org: OrganizationId, series: SeriesState, input: IssueDocumentInput): Promise<DocumentReference[]> {
    const ids = input.orderReferences ?? [];
    if (ids.length === 0) return [];
    if (!INVOICE_TYPES.has(series.documentType)) throw new InvoicingRuleError("Só faturas referem consultas de mesa");
    const found: DocumentSummary[] = await this.deps.store.documentsByIds(org, ids);
    const byId = new Map(found.map((d) => [d.id, d]));
    return ids.map((id) => {
      const d = byId.get(id);
      if (!d || d.documentType !== "CM" || d.status !== "N" || d.legalEntityId !== series.legalEntityId || d.seriesMode !== series.mode) {
        throw new InvoicingRuleError(`Consulta de mesa inválida ou já faturada: ${id}`);
      }
      return { documentId: d.id, documentNumber: d.documentNumber };
    });
  }

}
