import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { FiscalIdentity, FiscalKey } from "../../domain/entities/fiscal-identity.js";
import { FiscalKeyTakenError, type FiscalAuditPort, type FiscalIdentityRepositoryPort, type NewFiscalIdentity } from "../../domain/ports/out/fiscal-identity.ports.js";

const T = "fiscal_document_identities";
const COLS = "id, buyer_key, legal_entity_id, issuer_country, issuer_tax_id, document_type, series_number, series_number_norm, number_digits, atcud, first_origin, invoice_id, stock_import_id, created_at";

type Row = {
  id: string;
  buyer_key: string;
  legal_entity_id: string | null;
  issuer_country: string;
  issuer_tax_id: string;
  document_type: FiscalIdentity["documentType"];
  series_number: string;
  series_number_norm: string;
  number_digits: string;
  atcud: string | null;
  first_origin: FiscalIdentity["firstOrigin"];
  invoice_id: string | null;
  stock_import_id: string | null;
  created_at: string;
};
type Res = { data: unknown; error: { message: string; code?: string } | null };

const toIdentity = (r: Row): FiscalIdentity => ({
  id: r.id,
  buyerKey: r.buyer_key,
  legalEntityId: r.legal_entity_id,
  issuerCountry: r.issuer_country,
  issuerTaxId: r.issuer_tax_id,
  documentType: r.document_type,
  seriesNumber: r.series_number,
  seriesNumberNorm: r.series_number_norm,
  numberDigits: r.number_digits,
  atcud: r.atcud,
  firstOrigin: r.first_origin,
  invoiceId: r.invoice_id,
  stockImportId: r.stock_import_id,
  createdAt: r.created_at,
});

function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Identidades fiscais em Supabase; a corrida é decidida pelo índice único da chave. */
export class SupabaseFiscalIdentityRepository implements FiscalIdentityRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  private byKey(org: OrganizationId, k: FiscalKey) {
    return this.scoped(org).table(T).select(COLS).eq("buyer_key", k.buyerKey).eq("issuer_country", k.issuerCountry).eq("issuer_tax_id", k.issuerTaxId).eq("document_type", k.documentType).eq("series_number_norm", k.seriesNumberNorm);
  }

  async findByKey(org: OrganizationId, key: FiscalKey) {
    const r = check<Row | null>(await this.byKey(org, key).maybeSingle());
    return r ? toIdentity(r) : null;
  }

  async insertIfAbsent(org: OrganizationId, row: NewFiscalIdentity) {
    const res = (await this.scoped(org)
      .table(T)
      .insert({
        buyer_key: row.buyerKey,
        legal_entity_id: row.legalEntityId,
        issuer_country: row.issuerCountry,
        issuer_tax_id: row.issuerTaxId,
        document_type: row.documentType,
        series_number: row.seriesNumber,
        series_number_norm: row.seriesNumberNorm,
        number_digits: row.numberDigits,
        atcud: row.atcud,
        first_origin: row.firstOrigin,
        invoice_id: row.invoiceId,
        stock_import_id: row.stockImportId,
        created_by: row.createdBy,
      })
      .select(COLS)
      .single()) as Res;
    if (!res.error) return { identity: toIdentity(res.data as Row), created: true };
    // 23505 = violação de unicidade: outro pedido ficou com a chave → devolve essa identidade.
    if (res.error.code !== "23505") throw new Error(res.error.message);
    const existing = await this.findByKey(org, row);
    if (existing) return { identity: existing, created: false };
    // A colisão foi na ligação (fatura/importação já com identidade): devolve essa.
    const linked = (row.invoiceId && (await this.findByInvoice(org, row.invoiceId))) || (row.stockImportId && (await this.findByStockImport(org, row.stockImportId)));
    if (linked) return { identity: linked, created: false };
    throw new Error(res.error.message);
  }

  async findSimilar(org: OrganizationId, key: FiscalKey, digits: string) {
    if (!digits) return [];
    const rows = check<Row[]>(
      await this.scoped(org).table(T).select(COLS).eq("buyer_key", key.buyerKey).eq("issuer_country", key.issuerCountry).eq("issuer_tax_id", key.issuerTaxId).eq("document_type", key.documentType).eq("number_digits", digits).neq("series_number_norm", key.seriesNumberNorm).limit(10),
    );
    return rows.map(toIdentity);
  }

  async findByInvoice(org: OrganizationId, invoiceId: string) {
    const r = check<Row | null>(await this.scoped(org).table(T).select(COLS).eq("invoice_id", invoiceId).maybeSingle());
    return r ? toIdentity(r) : null;
  }

  async findByStockImport(org: OrganizationId, stockImportId: string) {
    const r = check<Row | null>(await this.scoped(org).table(T).select(COLS).eq("stock_import_id", stockImportId).maybeSingle());
    return r ? toIdentity(r) : null;
  }

  async link(org: OrganizationId, id: string, link: { invoiceId?: string; stockImportId?: string }) {
    let q = this.scoped(org)
      .table(T)
      .update({ ...(link.invoiceId && { invoice_id: link.invoiceId }), ...(link.stockImportId && { stock_import_id: link.stockImportId }), updated_at: new Date().toISOString() })
      .eq("id", id);
    // Nunca substitui uma ligação já existente.
    if (link.invoiceId) q = q.is("invoice_id", null);
    if (link.stockImportId) q = q.is("stock_import_id", null);
    const r = check<Row | null>(await q.select(COLS).maybeSingle());
    if (!r) throw new Error("A identidade já está ligada a outro documento.");
    return toIdentity(r);
  }

  async rekey(org: OrganizationId, id: string, row: Pick<NewFiscalIdentity, keyof FiscalKey | "seriesNumber" | "numberDigits" | "atcud" | "legalEntityId">) {
    const res = (await this.scoped(org)
      .table(T)
      .update({
        buyer_key: row.buyerKey,
        legal_entity_id: row.legalEntityId,
        issuer_country: row.issuerCountry,
        issuer_tax_id: row.issuerTaxId,
        document_type: row.documentType,
        series_number: row.seriesNumber,
        series_number_norm: row.seriesNumberNorm,
        number_digits: row.numberDigits,
        atcud: row.atcud,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(COLS)
      .single()) as Res;
    if (res.error?.code === "23505") {
      const existing = await this.findByKey(org, row);
      if (existing) throw new FiscalKeyTakenError(existing);
    }
    return toIdentity(check<Row>(res));
  }

  async removeForDeletedInvoice(org: OrganizationId, invoiceId: string) {
    check(await this.scoped(org).table(T).delete().eq("invoice_id", invoiceId).is("stock_import_id", null));
  }
}

export class SupabaseFiscalAudit implements FiscalAuditPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}
  async record(org: OrganizationId, e: Parameters<FiscalAuditPort["record"]>[1]) {
    check(await this.scoped(org).table("fiscal_document_audit_logs").insert({ identity_id: e.identityId, actor: e.actor, action: e.action, origin: e.origin, before: e.before ?? null, after: e.after ?? null }));
  }
}
