import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { DeliveryPlatform, PlatformDocumentKind, PlatformPayout, PlatformStatement, SoldProduct, StatementLine } from "../../domain/entities/platform-statement.js";
import type { PlatformStatementRepositoryPort, StoredPlatformStatement } from "../../domain/ports/out/platform-statement-repository.port.js";

const COLUMNS =
  "id, platform, document_kind, document_number, period_from, period_to, issued_on, orders_count, lines, payouts, products, net_payout_cents, file_name, imported_by, imported_at";

interface Row {
  id: string;
  platform: DeliveryPlatform;
  document_kind: PlatformDocumentKind;
  document_number: string;
  period_from: string;
  period_to: string;
  issued_on: string | null;
  orders_count: number | null;
  lines: StatementLine[];
  payouts: PlatformPayout[];
  products: SoldProduct[] | null;
  net_payout_cents: number | string;
  file_name: string;
  imported_by: string | null;
  imported_at: string;
}

const toDomain = (r: Row): StoredPlatformStatement => ({
  id: r.id,
  platform: r.platform,
  documentKind: r.document_kind,
  documentNumber: r.document_number,
  periodFrom: r.period_from,
  periodTo: r.period_to,
  issuedOn: r.issued_on,
  ordersCount: r.orders_count,
  lines: r.lines ?? [],
  payouts: r.payouts ?? [],
  products: r.products ?? [],
  netPayoutCents: Number(r.net_payout_cents),
  fileName: r.file_name,
  importedBy: r.imported_by,
  importedAt: r.imported_at,
});

/** Extratos das plataformas (`delivery_platform_statements`, um por empresa, plataforma e número). */
export class SupabasePlatformStatementRepository implements PlatformStatementRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async save(organizationId: OrganizationId, s: PlatformStatement, meta: { fileName: string; importedBy: string | null }): Promise<{ replaced: boolean }> {
    const existing = await this.scopedQuery(organizationId)
      .table("delivery_platform_statements")
      .select("id")
      .eq("platform", s.platform)
      .eq("document_number", s.documentNumber)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    const { error } = await this.scopedQuery(organizationId)
      .table("delivery_platform_statements")
      .upsert(
        {
          platform: s.platform,
          document_kind: s.documentKind,
          document_number: s.documentNumber,
          period_from: s.periodFrom,
          period_to: s.periodTo,
          issued_on: s.issuedOn,
          orders_count: s.ordersCount,
          lines: s.lines,
          payouts: s.payouts,
          products: s.products ?? [],
          net_payout_cents: s.netPayoutCents,
          file_name: meta.fileName,
          imported_by: meta.importedBy,
          imported_at: new Date().toISOString(),
        },
        { onConflict: "org_id,platform,document_number" },
      );
    if (error) throw new Error(error.message);
    return { replaced: existing.data !== null };
  }

  async listOverlapping(organizationId: OrganizationId, from: string, to: string, platform?: DeliveryPlatform): Promise<StoredPlatformStatement[]> {
    let q = this.scopedQuery(organizationId)
      .table("delivery_platform_statements")
      .select(COLUMNS)
      .lte("period_from", to)
      .gte("period_to", from);
    if (platform) q = q.eq("platform", platform);
    const { data, error } = await q.order("period_from", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toDomain);
  }
}
