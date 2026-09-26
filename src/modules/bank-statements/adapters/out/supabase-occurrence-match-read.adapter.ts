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
    cost_center_id: string | null;
    cost_center_category_id: string | null;
    vat_rate: number | null;
    vat_included: boolean | null;
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
    costCenterGroupId: rec?.cost_center_id ?? null,
    costCenterCategoryId: rec?.cost_center_category_id ?? null,
    vatRate: rec?.vat_rate ?? null,
    vatIncluded: rec?.vat_included ?? null,
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
      referenceDate?: string;
      limit?: number;
    }
  ): Promise<OccurrenceMatchCandidate[]> {
    // Note: the embedded recurring_contracts(...) select rides along
    // unfiltered by organization — only the top-level recurring_occurrences
    // table gets the organization predicate via .table(). This is a known,
    // accepted, pre-existing gap (spec.md D16), not addressed here.
    //
    // The `q` text filter runs in memory (below), against `recurrence_name`/
    // `supplier_name` from the embedded `recurring_contracts` — PostgREST
    // doesn't let us filter on an embedded resource's columns without an
    // `!inner` join, which would also change what counts as a match. Because
    // of that, the SQL `.limit()` must NOT be applied before the text filter,
    // or a real match can be cut off by unrelated, more-recent-due-date rows
    // (this got materially worse once occurrences started being generated
    // proactively — see ensureOccurrencesForPeriod, payable-recurrences — so
    // there are simply more rows competing for the same window now). Whenever
    // there's search text OR a reference date to prioritize by, fetch a
    // generous batch first and only cap the *filtered/sorted* result to
    // `opts.limit`.
    const requestedLimit = opts.limit ?? 50;
    const hasQuery = !!opts.q && opts.q.trim().length > 0;
    const fetchLimit = hasQuery || opts.referenceDate ? Math.max(requestedLimit, 500) : requestedLimit;

    let query = this.scopedQuery(organizationId)
      .table("recurring_occurrences")
      .select("id, recurrence_id, period, estimated_amount_cents, real_amount_cents, due_date, status, invoice_id, recurring_contracts!recurring_occurrences_recurrence_id_fkey(name, supplier_name, supplier_id, cost_center_id, cost_center_category_id, vat_rate, vat_included)")
      .not("status", "eq", "cancelled")
      .is("invoice_id", null)
      .order("due_date", { ascending: false })
      .limit(fetchLimit);

    if (opts.dateFrom) query = query.gte("due_date", opts.dateFrom);
    if (opts.dateTo)   query = query.lte("due_date", opts.dateTo);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let results = ((data ?? []) as unknown as OccurrenceRow[]).map(toCandidate);

    if (hasQuery) {
      const needle = opts.q!.trim().toLowerCase();
      results = results.filter(
        (r) =>
          r.recurrenceName.toLowerCase().includes(needle) ||
          r.supplierName.toLowerCase().includes(needle),
      );
    }

    // Prioriza (nunca exclui) as ocorrências mais próximas do mês do
    // movimento bancário — normalmente muito mais relevante do que "o
    // vencimento mais recente em toda a organização".
    if (opts.referenceDate) {
      const reference = Date.parse(opts.referenceDate);
      results = [...results].sort(
        (a, b) => Math.abs(Date.parse(a.dueDate) - reference) - Math.abs(Date.parse(b.dueDate) - reference),
      );
    }

    return results.slice(0, requestedLimit);
  }

  async findByIds(organizationId: OrganizationId, ids: string[]): Promise<OccurrenceMatchCandidate[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.scopedQuery(organizationId)
      .table("recurring_occurrences")
      .select("id, recurrence_id, period, estimated_amount_cents, real_amount_cents, due_date, status, invoice_id, recurring_contracts!recurring_occurrences_recurrence_id_fkey(name, supplier_name, supplier_id, cost_center_id, cost_center_category_id, vat_rate, vat_included)")
      .in("id", ids);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as OccurrenceRow[]).map(toCandidate);
  }
}
