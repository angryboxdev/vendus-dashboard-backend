import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { decToString } from "../../../../kernel/money/decimal.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { SeriesMode } from "../../domain/entities/series-mode.js";
import type { SeriesState } from "../../domain/entities/series.js";
import { InvoicingNotFoundError, InvoicingRuleError, StaleSeriesError } from "../../domain/errors.js";
import type { IssuedDocumentRecord, InvoicingStorePort } from "../../domain/ports/out/invoicing-store.port.js";
import { formatAmount } from "../../domain/services/amount-format.js";

interface SeriesRow {
  id: string;
  legal_entity_id: string;
  location_id: string | null;
  document_type: string;
  series_id: string;
  mode: SeriesMode;
  validation_code: string | null;
  last_sequence: number;
  last_hash: string | null;
  last_document_date: string | null;
  last_system_entry_date: string | null;
}

const SERIES_COLS =
  "id, legal_entity_id, location_id, document_type, series_id, mode, validation_code, last_sequence, last_hash, last_document_date, last_system_entry_date";

const toSeries = (r: SeriesRow): SeriesState => ({
  ref: r.id,
  legalEntityId: r.legal_entity_id,
  locationId: r.location_id,
  documentType: r.document_type,
  seriesId: r.series_id,
  mode: r.mode,
  validationCode: r.validation_code,
  lastSequence: Number(r.last_sequence),
  lastHash: r.last_hash,
  lastDocumentDate: r.last_document_date,
  lastSystemEntryDate: r.last_system_entry_date,
});

/** Códigos `errcode` das RPC da migração → erros de domínio. */
function toDomainError(error: { code?: string; message: string }, seriesRef: string): Error {
  switch (error.code) {
    case "P0001":
      return new StaleSeriesError(seriesRef);
    case "P0002":
      return new InvoicingNotFoundError(error.message);
    case "P0003":
    case "P0004":
      return new InvoicingRuleError(error.message);
    default:
      return new Error(`Faturação: erro da base de dados (${error.code ?? "?"}): ${error.message}`);
  }
}

/** Valores exatos como texto (o Postgres converte para numeric sem perder casas). */
function rpcPayload(r: IssuedDocumentRecord) {
  const document = {
    sequence: r.sequence,
    document_number: r.documentNumber,
    document_date: r.documentDate,
    tax_point_date: r.taxPointDate,
    system_entry_date: r.systemEntryDate,
    source_billing: "P",
    hash: r.hash,
    hash_control: r.hashControl,
    key_version: r.keyVersion,
    atcud: r.atcud,
    qr_payload: r.qrPayload,
    currency: "EUR",
    prices_include_tax: r.pricesIncludeTax,
    net_total: formatAmount(r.totals.netTotal),
    tax_payable: formatAmount(r.totals.taxPayable),
    gross_total: formatAmount(r.totals.grossTotal),
    customer: r.customer,
    issuer: r.issuer,
    references_to: r.referencesTo ?? null,
    order_references: r.orderReferences ?? null,
  };
  const lines = r.totals.lines.map(({ line, amount }, i) => {
    const tax = line.tax;
    return {
      line_number: i + 1,
      product_code: null,
      description: line.description,
      quantity: decToString(line.quantity),
      unit_price: decToString(line.unitPrice),
      discount_pct: line.discountPct ? decToString(line.discountPct) : null,
      line_amount: decToString(amount),
      tax_region: tax.region,
      tax_code: tax.kind === "rate" ? tax.code : "ISE",
      tax_percentage: tax.kind === "rate" ? decToString(tax.percentage) : "0",
      exemption_code: tax.kind === "exempt" ? tax.exemptionCode : null,
      exemption_reason: tax.kind === "exempt" ? tax.exemptionReason : null,
    };
  });
  const taxes = [
    ...r.totals.taxSummary.map((t) => ({
      tax_region: t.region,
      tax_code: t.code,
      tax_percentage: decToString(t.percentage),
      exemption_code: null,
      exemption_reason: null,
      taxable_base: formatAmount(t.taxableBase),
      tax_amount: formatAmount(t.taxAmount),
    })),
    ...r.totals.exemptions.map((e) => ({
      tax_region: e.region,
      tax_code: "ISE",
      tax_percentage: "0",
      exemption_code: e.code,
      exemption_reason: e.reason,
      taxable_base: formatAmount(e.taxableBase),
      tax_amount: "0.00",
    })),
  ];
  return { document, lines, taxes };
}

/** Persistência fiscal no Supabase: leituras pelo helper, escritas só pelas RPC. */
export class SupabaseInvoicingStore implements InvoicingStorePort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async getSeries(orgId: OrganizationId, seriesRef: string): Promise<SeriesState | null> {
    const { data, error } = await this.scoped(orgId).table("invoicing_series").select(SERIES_COLS).eq("id", seriesRef).maybeSingle();
    if (error) throw new Error(`Faturação: erro a ler a série: ${error.message}`);
    return data ? toSeries(data as unknown as SeriesRow) : null;
  }

  async lastSystemEntryDate(orgId: OrganizationId, legalEntityId: string): Promise<string | null> {
    const { data, error } = await this.scoped(orgId)
      .table("invoicing_documents")
      .select("system_entry_date")
      .eq("legal_entity_id", legalEntityId)
      .order("system_entry_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Faturação: erro a ler a última emissão: ${error.message}`);
    return (data as { system_entry_date: string } | null)?.system_entry_date ?? null;
  }

  async saveIssued(orgId: OrganizationId, record: IssuedDocumentRecord): Promise<{ documentId: string }> {
    const { document, lines, taxes } = rpcPayload(record);
    const { data, error } = await this.scoped(orgId).issueInvoicingDocument({
      seriesRef: record.seriesRef,
      expectedLastSequence: record.expected.lastSequence,
      expectedLastHash: record.expected.lastHash,
      document,
      lines,
      taxes,
      actor: record.actor,
    });
    if (error) throw toDomainError(error, record.seriesRef);
    return { documentId: data as string };
  }

  async cancel(orgId: OrganizationId, documentId: string, reason: string, actor: string): Promise<void> {
    const { error } = await this.scoped(orgId).cancelInvoicingDocument(documentId, reason, actor);
    if (error) throw toDomainError(error, documentId);
  }
}
