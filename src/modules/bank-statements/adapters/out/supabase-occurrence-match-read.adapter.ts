import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  OccurrenceMatchCandidate,
  OccurrenceMatchReadPort,
} from "../../domain/ports/out/occurrence-match-read.port.js";

interface OccurrenceRow {
  id: string;
  recurrence_id: string;
  period: string;
  estimated_amount_cents: number;
  real_amount_cents: number | null;
  due_date: string;
  status: string;
  invoice_id: string | null;
  recurring_contracts: {
    name: string;
    supplier_name: string;
    supplier_id: string | null;
  } | null;
}

function toCandidate(row: OccurrenceRow): OccurrenceMatchCandidate {
  const rec = row.recurring_contracts;
  const estimated = row.estimated_amount_cents;
  const real = row.real_amount_cents;
  return {
    id: row.id,
    recurrenceId: row.recurrence_id,
    recurrenceName: rec?.name ?? "",
    supplierId: rec?.supplier_id ?? null,
    supplierName: rec?.supplier_name ?? "",
    period: row.period,
    estimatedAmountCents: estimated,
    realAmountCents: real,
    effectiveAmountCents: real ?? estimated,
    dueDate: row.due_date.slice(0, 10),
    status: row.status,
  };
}

export class SupabaseOccurrenceMatchReadAdapter implements OccurrenceMatchReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async search(
    organizationId: OrganizationId,
    opts: {
      q?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
    }
  ): Promise<OccurrenceMatchCandidate[]> {
    // Note: the embedded recurring_contracts(...) select rides along
    // unfiltered by organization — only the top-level recurring_occurrences
    // table gets the organization predicate via .table(). This is a known,
    // accepted, pre-existing gap (spec.md D16), not addressed here.
    let query = this.scopedQuery(organizationId)
      .table("recurring_occurrences")
      .select("id, recurrence_id, period, estimated_amount_cents, real_amount_cents, due_date, status, invoice_id, recurring_contracts(name, supplier_name, supplier_id)")
      .not("status", "eq", "cancelled")
      .is("invoice_id", null)
      .order("due_date", { ascending: false })
      .limit(opts.limit ?? 50);

    if (opts.dateFrom) query = query.gte("due_date", opts.dateFrom);
    if (opts.dateTo)   query = query.lte("due_date", opts.dateTo);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let results = ((data ?? []) as unknown as OccurrenceRow[]).map(toCandidate);

    if (opts.q && opts.q.trim().length > 0) {
      const needle = opts.q.trim().toLowerCase();
      results = results.filter(
        (r) =>
          r.recurrenceName.toLowerCase().includes(needle) ||
          r.supplierName.toLowerCase().includes(needle),
      );
    }

    return results;
  }

  async findByIds(organizationId: OrganizationId, ids: string[]): Promise<OccurrenceMatchCandidate[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.scopedQuery(organizationId)
      .table("recurring_occurrences")
      .select("id, recurrence_id, period, estimated_amount_cents, real_amount_cents, due_date, status, invoice_id, recurring_contracts(name, supplier_name, supplier_id)")
      .in("id", ids);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as OccurrenceRow[]).map(toCandidate);
  }
}
