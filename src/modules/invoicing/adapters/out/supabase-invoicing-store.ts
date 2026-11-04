import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { dec, decToString, type Dec } from "../../../../kernel/money/decimal.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DocumentReference } from "../../domain/entities/parties.js";
import type { SeriesMode } from "../../domain/entities/series-mode.js";
import type { FiscalDocumentType, SeriesState } from "../../domain/entities/series.js";
import { InvoicingNotFoundError, InvoicingRuleError, StaleSeriesError } from "../../domain/errors.js";
import type {
  DocumentFilter,
  DocumentLineView,
  DocumentSummary,
  DocumentTaxView,
  IssuedDocumentRecord,
  InvoicingStorePort,
  NewSeries,
  SeriesListItem,
  StoredDocument,
} from "../../domain/ports/out/invoicing-store.port.js";
import { formatAmount } from "../../domain/services/amount-format.js";
import { add } from "../../domain/services/decimal-ops.js";
import { lisbonEntryDate } from "./lisbon-clock.js";
import type { LineTax } from "../../domain/services/document-totals.service.js";

interface SeriesRow {
  id: string;
  legal_entity_id: string;
  location_id: string | null;
  document_type: FiscalDocumentType;
  series_id: string;
  mode: SeriesMode;
  validation_code: string | null;
  last_sequence: number;
  last_hash: string | null;
  last_document_date: string | null;
  last_system_entry_at: string | null;
}

const SERIES_COLS =
  "id, legal_entity_id, location_id, document_type, series_id, mode, validation_code, last_sequence, last_hash, last_document_date, last_system_entry_at";

/** O PostgREST devolve timestamptz como "…+00:00"; o domínio usa ISO UTC ("…Z"). */
const toIsoInstant = (v: string | null) => (v === null ? null : new Date(v).toISOString());

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
  lastSystemEntryAt: toIsoInstant(r.last_system_entry_at),
});

/** Códigos das funções da BD (`raise exception '<código>'`) → texto para o utilizador (nunca a mensagem técnica). */
const RULE_MESSAGES: Record<string, string> = {
  series_not_active: "A série não está ativa",
  series_not_communicated: "A série ainda não foi comunicada à AT",
  number_mismatch: "Numeração fora de sequência — tente de novo",
  date_before_last_in_series: "Data anterior ao último documento da série",
  entry_before_last_in_series: "Hora de emissão anterior ao último documento da série",
  no_lines: "Documento sem linhas",
  issuer_mismatch: "O emitente não corresponde à entidade da série",
  references_required: "Nota de crédito/débito sem documento retificado",
  references_not_allowed: "Só notas de crédito/débito referem documentos retificados",
  order_references_not_allowed: "Só faturas referem consultas de mesa",
  invalid_reference: "Documento retificado inválido (anulado, de outro emitente, modo ou cliente)",
  credit_exceeds_remaining: "A nota de crédito excede o valor ainda por creditar",
  totals_mismatch: "Os impostos não batem com os totais do documento",
  order_already_invoiced: "Consulta de mesa já faturada",
  reason_required: "Motivo obrigatório",
  not_cancellable: "O documento já não está ativo",
  has_active_rectifications: "Anule primeiro a nota de crédito/débito que retifica este documento",
};

/** Mensagens das funções da BD (`raise exception '<código>'`) → texto para o utilizador. */
const NOT_FOUND: Record<string, string> = { series_not_found: "Série", document_not_found: "Documento" };

/**
 * `errcode` das funções da migração → erros de domínio. Só `stale_series` é
 * «repetir»: os triggers também saem com P0001 (código por omissão do
 * `raise exception`) e são violações de integridade, não concorrência.
 */
function toDomainError(error: { code?: string; message: string }, subject: string): Error {
  if (error.code === "P0001" && error.message === "stale_series") return new StaleSeriesError(subject);
  switch (error.code) {
    case "P0002":
      return new InvoicingNotFoundError(NOT_FOUND[error.message] ?? subject);
    case "P0003":
    case "P0004":
      return new InvoicingRuleError(RULE_MESSAGES[error.message] ?? "Operação recusada pelas regras fiscais");
    case "22P02":
      return new InvoicingRuleError("Identificador inválido");
    case "23514":
      return new InvoicingRuleError("Dados fora dos limites permitidos");
    default:
      return new Error(`Faturação: erro da base de dados (${error.code ?? "?"}): ${error.message}`);
  }
}

/** Colunas de imposto de uma linha ou do resumo: taxa (RED/INT/NOR) ou isenção (ISE, 0 %). */
function taxColumns(tax: LineTax) {
  return tax.kind === "rate"
    ? { tax_region: tax.region, tax_code: tax.code, tax_percentage: decToString(tax.percentage), exemption_code: null, exemption_reason: null }
    : { tax_region: tax.region, tax_code: "ISE", tax_percentage: "0", exemption_code: tax.exemptionCode, exemption_reason: tax.exemptionReason };
}

/** A BD lê as referências em snake_case (`document_id` — anulação bloqueada por NC ativa; CM → F). */
const toReferenceRows = (refs: DocumentReference[] | undefined) =>
  refs && refs.length > 0
    ? refs.map((r) => ({ document_id: r.documentId, document_number: r.documentNumber, ...(r.reason ? { reason: r.reason } : {}) }))
    : null;

/** Valores exatos como texto (o Postgres converte para numeric sem perder casas). */
function rpcPayload(r: IssuedDocumentRecord) {
  const document = {
    sequence: r.sequence,
    document_number: r.documentNumber,
    document_date: r.documentDate,
    tax_point_date: r.taxPointDate,
    system_entry_date: r.systemEntryDate,
    system_entry_at: r.systemEntryAt,
    software_certificate_number: r.softwareCertificateNumber,
    hash: r.hash,
    key_version: r.keyVersion,
    atcud: r.atcud,
    qr_payload: r.qrPayload,
    currency: "EUR",
    prices_include_tax: r.pricesIncludeTax,
    net_total: formatAmount(r.totals.netTotal),
    tax_payable: formatAmount(r.totals.taxPayable),
    gross_total: formatAmount(r.totals.grossTotal),
    payment_mechanism: r.paymentMechanism ?? null,
    customer: r.customer,
    issuer: r.issuer,
    references_to: toReferenceRows(r.referencesTo),
    order_references: toReferenceRows(r.orderReferences),
  };
  const lines = r.totals.lines.map(({ line, amount }, i) => {
    if (!line.product) throw new InvoicingRuleError(`Linha ${i + 1} sem código de produto (obrigatório no SAF-T)`);
    return {
      line_number: i + 1,
      product_code: line.product.code,
      product_type: line.product.type,
      unit_of_measure: line.product.unit,
      description: line.description,
      quantity: decToString(line.quantity),
      unit_price: decToString(line.unitPrice),
      discount_pct: line.discountPct ? decToString(line.discountPct) : null,
      line_amount: decToString(amount),
      ...taxColumns(line.tax),
      reference_line: null,
    };
  });
  const taxes = [
    ...r.totals.taxSummary.map((t) => ({
      ...taxColumns({ kind: "rate", region: t.region, code: t.code, percentage: t.percentage }),
      taxable_base: formatAmount(t.taxableBase),
      tax_amount: formatAmount(t.taxAmount),
    })),
    ...r.totals.exemptions.map((e) => ({
      ...taxColumns({ kind: "exempt", region: e.region, exemptionCode: e.code, exemptionReason: e.reason }),
      taxable_base: formatAmount(e.taxableBase),
      tax_amount: "0.00",
    })),
  ];
  return { document, lines, taxes };
}

interface SummaryRow {
  id: string;
  legal_entity_id: string;
  document_type: FiscalDocumentType;
  document_number: string;
  document_date: string;
  status: DocumentSummary["status"];
  series_mode: SeriesMode;
  customer_tax_id: string;
  gross_total: string;
}

/** Montantes lidos como texto (`::text`), para não passarem por vírgula flutuante. */
const SUMMARY_COLS = "id, legal_entity_id, document_type, series_mode, customer_tax_id:customer->>taxId, document_number, document_date, status, gross_total::text";

const toSummary = (r: SummaryRow): DocumentSummary => ({
  id: r.id,
  legalEntityId: r.legal_entity_id,
  documentType: r.document_type,
  seriesMode: r.series_mode,
  customerTaxId: r.customer_tax_id,
  documentNumber: r.document_number,
  documentDate: r.document_date,
  status: r.status,
  grossTotal: dec(r.gross_total),
});

const DOCUMENT_COLS =
  SUMMARY_COLS +
  ", series_ref, sequence, tax_point_date, system_entry_date, system_entry_at, software_certificate_number, hash, hash_control, atcud, qr_payload, prices_include_tax, net_total::text, tax_payable::text, payment_mechanism, customer, issuer, references_to, order_references, status_reason, status_changed_at, created_by";
const LINE_COLS =
  "line_number, product_code, product_type, unit_of_measure, description, quantity::text, unit_price::text, discount_pct::text, line_amount::text, tax_region, tax_code, tax_percentage::text, exemption_code, exemption_reason";
const TAX_COLS = "tax_region, tax_code, tax_percentage::text, exemption_code, exemption_reason, taxable_base::text, tax_amount::text";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const fromReferenceRows = (v: unknown): DocumentReference[] =>
  Array.isArray(v)
    ? (v as Row[]).map((r) => ({ documentId: String(r.document_id), documentNumber: String(r.document_number), ...(r.reason ? { reason: String(r.reason) } : {}) }))
    : [];

const toLineView = (l: Row): DocumentLineView => ({
  lineNumber: Number(l.line_number),
  productCode: String(l.product_code),
  productType: String(l.product_type),
  unitOfMeasure: String(l.unit_of_measure),
  description: String(l.description),
  quantity: String(l.quantity),
  unitPrice: String(l.unit_price),
  discountPct: str(l.discount_pct),
  lineAmount: String(l.line_amount),
  taxRegion: String(l.tax_region),
  taxCode: String(l.tax_code),
  taxPercentage: String(l.tax_percentage),
  exemptionCode: str(l.exemption_code),
  exemptionReason: str(l.exemption_reason),
});

const toTaxView = (t: Row): DocumentTaxView => ({
  taxRegion: String(t.tax_region),
  taxCode: String(t.tax_code),
  taxPercentage: String(t.tax_percentage),
  exemptionCode: str(t.exemption_code),
  exemptionReason: str(t.exemption_reason),
  taxableBase: String(t.taxable_base),
  taxAmount: String(t.tax_amount),
});

const SAFT_MAX_DOCUMENTS = 50_000;
const SAFT_CHUNK = 200;

function toStoredDocument(d: Row, lines: Row[], taxes: Row[]): StoredDocument {
  const changedAt = str(d.status_changed_at);
  return {
    ...toSummary(d as unknown as SummaryRow),
    seriesRef: String(d.series_ref),
    sequence: Number(d.sequence),
    taxPointDate: String(d.tax_point_date),
    systemEntryDate: String(d.system_entry_date),
    systemEntryAt: new Date(String(d.system_entry_at)).toISOString(),
    softwareCertificateNumber: String(d.software_certificate_number),
    hash: String(d.hash),
    hashControl: String(d.hash_control),
    atcud: String(d.atcud),
    qrPayload: String(d.qr_payload),
    pricesIncludeTax: Boolean(d.prices_include_tax),
    netTotal: String(d.net_total),
    taxPayable: String(d.tax_payable),
    paymentMechanism: (d.payment_mechanism ?? null) as StoredDocument["paymentMechanism"],
    customer: d.customer as StoredDocument["customer"],
    issuer: d.issuer as StoredDocument["issuer"],
    referencesTo: fromReferenceRows(d.references_to),
    orderReferences: fromReferenceRows(d.order_references),
    statusReason: str(d.status_reason),
    statusChangedAt: changedAt,
    // O instante da mudança de estado, em hora de Lisboa (formato do SAF-T).
    statusEntryDate: changedAt ? lisbonEntryDate(new Date(changedAt)) : null,
    createdBy: String(d.created_by),
    lines: lines.map(toLineView),
    taxes: taxes.map(toTaxView),
  };
}

/** Persistência fiscal no Supabase: leituras pelo helper, escritas só pelas funções da BD. */
export class SupabaseInvoicingStore implements InvoicingStorePort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async listSeries(orgId: OrganizationId): Promise<SeriesListItem[]> {
    const { data, error } = await this.scoped(orgId)
      .table("invoicing_series")
      .select(`${SERIES_COLS}, status, created_at`)
      .order("document_type")
      .order("series_id");
    if (error) throw new Error(`Faturação: erro a ler as séries: ${error.message}`);
    return ((data ?? []) as unknown as Array<SeriesRow & { status: SeriesListItem["status"]; created_at: string }>).map((r) => ({
      ...toSeries(r),
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  async createSeries(orgId: OrganizationId, n: NewSeries): Promise<SeriesState> {
    const { data, error } = await this.scoped(orgId)
      .table("invoicing_series")
      .insert({ legal_entity_id: n.legalEntityId, location_id: n.locationId, document_type: n.documentType, series_id: n.seriesId, mode: n.mode, created_by: n.actor })
      .select(SERIES_COLS)
      .single();
    if (error) {
      if (error.code === "23505") throw new InvoicingRuleError(`Já existe a série ${n.seriesId} para ${n.documentType} neste emitente`);
      if (error.code === "23503") throw new InvoicingRuleError("Entidade legal ou estabelecimento inexistente");
      if (error.code === "23514") throw new InvoicingRuleError("Série inválida (tipo, identificador ou modo)");
      if (error.code === "22P02") throw new InvoicingRuleError("Identificador inválido");
      throw new Error(`Faturação: erro a criar a série: ${error.message}`);
    }
    return toSeries(data as unknown as SeriesRow);
  }

  async setSeriesValidationCode(orgId: OrganizationId, seriesRef: string, validationCode: string): Promise<void> {
    const { data, error } = await this.scoped(orgId)
      .table("invoicing_series")
      .update({ validation_code: validationCode })
      .eq("id", seriesRef)
      .select("id")
      .maybeSingle();
    // O trigger recusa alterar um código já preenchido; o check recusa códigos inválidos.
    if (error) throw new InvoicingRuleError(error.code === "22P02" ? "Identificador inválido" : "O código de validação já foi registado ou é inválido");
    if (!data) throw new InvoicingNotFoundError("Série");
  }

  async documentsByIds(orgId: OrganizationId, ids: string[]): Promise<DocumentSummary[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.scoped(orgId).table("invoicing_documents").select(SUMMARY_COLS).in("id", ids);
    if (error) throw new Error(`Faturação: erro a ler documentos: ${error.message}`);
    return ((data ?? []) as unknown as SummaryRow[]).map(toSummary);
  }

  async creditedTotal(orgId: OrganizationId, documentId: string): Promise<Dec> {
    const { data, error } = await this.scoped(orgId)
      .table("invoicing_documents")
      .select("gross_total::text")
      .eq("document_type", "NC")
      .eq("status", "N")
      .contains("references_to", [{ document_id: documentId }]);
    if (error) throw new Error(`Faturação: erro a ler notas de crédito: ${error.message}`);
    return ((data ?? []) as unknown as Array<{ gross_total: string }>).reduce((sum, r) => add(sum, dec(r.gross_total)), dec("0"));
  }

  async listDocuments(orgId: OrganizationId, filter: DocumentFilter): Promise<DocumentSummary[]> {
    let q = this.scoped(orgId).table("invoicing_documents").select(SUMMARY_COLS);
    if (filter.from) q = q.gte("document_date", filter.from);
    if (filter.to) q = q.lte("document_date", filter.to);
    if (filter.documentType) q = q.eq("document_type", filter.documentType);
    if (filter.status) q = q.eq("status", filter.status);
    const { data, error } = await q.order("system_entry_at", { ascending: false }).limit(Math.min(filter.limit ?? 200, 500));
    if (error) throw new Error(`Faturação: erro a listar documentos: ${error.message}`);
    return ((data ?? []) as unknown as SummaryRow[]).map(toSummary);
  }

  async getDocument(orgId: OrganizationId, documentId: string): Promise<StoredDocument | null> {
    const scoped = this.scoped(orgId);
    const doc = await scoped.table("invoicing_documents").select(DOCUMENT_COLS).eq("id", documentId).maybeSingle();
    if (doc.error) throw new Error(`Faturação: erro a ler o documento: ${doc.error.message}`);
    if (!doc.data) return null;
    const d = doc.data as unknown as Row;
    const [lines, taxes] = await Promise.all([
      scoped.table("invoicing_document_lines").select(LINE_COLS).eq("document_id", documentId).order("line_number"),
      scoped.table("invoicing_document_taxes").select(TAX_COLS).eq("document_id", documentId),
    ]);
    for (const r of [lines, taxes]) if (r.error) throw new Error(`Faturação: erro a ler o documento: ${r.error.message}`);
    return toStoredDocument(d, (lines.data ?? []) as unknown as Row[], (taxes.data ?? []) as unknown as Row[]);
  }

  /** Documentos do período para o SAF-T, por ordem de emissão, com linhas e impostos (leitura em lotes). */
  async saftDocuments(orgId: OrganizationId, q: { legalEntityId: string; from: string; to: string; includeTraining: boolean }): Promise<StoredDocument[]> {
    const scoped = this.scoped(orgId);
    let docsQuery = scoped
      .table("invoicing_documents")
      .select(DOCUMENT_COLS)
      .eq("legal_entity_id", q.legalEntityId)
      .gte("document_date", q.from)
      .lte("document_date", q.to);
    if (!q.includeTraining) docsQuery = docsQuery.eq("series_mode", "normal");
    const docs = await docsQuery.order("system_entry_at", { ascending: true }).limit(SAFT_MAX_DOCUMENTS + 1);
    if (docs.error) throw new Error(`Faturação: erro a ler documentos para o SAF-T: ${docs.error.message}`);
    const rows = (docs.data ?? []) as unknown as Row[];
    if (rows.length > SAFT_MAX_DOCUMENTS) throw new InvoicingRuleError(`Período com mais de ${SAFT_MAX_DOCUMENTS} documentos — exporte por mês`);

    const lines = new Map<string, Row[]>();
    const taxes = new Map<string, Row[]>();
    const ids = rows.map((r) => String(r.id));
    for (let i = 0; i < ids.length; i += SAFT_CHUNK) {
      const chunk = ids.slice(i, i + SAFT_CHUNK);
      const [l, t] = await Promise.all([
        scoped.table("invoicing_document_lines").select(`document_id, ${LINE_COLS}`).in("document_id", chunk).order("line_number"),
        scoped.table("invoicing_document_taxes").select(`document_id, ${TAX_COLS}`).in("document_id", chunk),
      ]);
      for (const r of [l, t]) if (r.error) throw new Error(`Faturação: erro a ler linhas para o SAF-T: ${r.error.message}`);
      for (const row of (l.data ?? []) as unknown as Row[]) lines.set(String(row.document_id), [...(lines.get(String(row.document_id)) ?? []), row]);
      for (const row of (t.data ?? []) as unknown as Row[]) taxes.set(String(row.document_id), [...(taxes.get(String(row.document_id)) ?? []), row]);
    }
    return rows.map((d) => toStoredDocument(d, lines.get(String(d.id)) ?? [], taxes.get(String(d.id)) ?? []));
  }

  async getSeries(orgId: OrganizationId, seriesRef: string): Promise<SeriesState | null> {
    const { data, error } = await this.scoped(orgId).table("invoicing_series").select(SERIES_COLS).eq("id", seriesRef).maybeSingle();
    if (error) throw new Error(`Faturação: erro a ler a série: ${error.message}`);
    return data ? toSeries(data as unknown as SeriesRow) : null;
  }

  async lastSystemEntryAt(orgId: OrganizationId, legalEntityId: string): Promise<string | null> {
    const { data, error } = await this.scoped(orgId)
      .table("invoicing_documents")
      .select("system_entry_at")
      .eq("legal_entity_id", legalEntityId)
      .order("system_entry_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Faturação: erro a ler a última emissão: ${error.message}`);
    return toIsoInstant((data as { system_entry_at: string } | null)?.system_entry_at ?? null);
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
