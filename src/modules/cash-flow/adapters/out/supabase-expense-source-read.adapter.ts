import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { TableName } from "../../../../infra/scoped-db/table-registry.js";
import type {
  CategoryWeight,
  ExpenseReferences,
  ExpenseSources,
  InvoiceCategoryData,
  UnpaidInvoice,
} from "../../domain/entities/cash-flow.js";
import type { ExpenseSourceReadPort } from "../../domain/ports/out/expense-source-read.port.js";
import type { UnpaidInvoicesReadPort } from "../../domain/ports/out/unpaid-invoices-read.port.js";

const IN_CHUNK = 200;

interface InvoiceRow {
  id: string;
  line_detail_mode: string | null;
  cost_center_group_id: string | null;
  cost_center_category_id: string | null;
  subtotal_without_vat: number | string | null;
  total_with_vat: number | string | null;
  invoice_date: string | null;
  competence_date: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
}

/** Sem IVA ÷ com IVA; null quando não há total (não se sabe o IVA). */
function ratio(net: number, gross: number): number | null {
  return gross > 0 && net >= 0 ? Math.min(1, net / gross) : null;
}

/** Estados de uma fatura válida ainda não paga. */
const UNPAID_STATUSES = ["pending", "overdue"];

/**
 * Leitura (só leitura) da categoria dos documentos conciliados: faturas (cabeçalho, linhas,
 * repartições), contas a pagar e ocorrências de recorrência → contrato; e as faturas do mês por pagar.
 */
export class SupabaseExpenseSourceReadAdapter implements ExpenseSourceReadPort, UnpaidInvoicesReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  /** Por pagar e sem movimento conciliado, com competência (`competence_date`, senão `invoice_date`) no intervalo. */
  async unpaidInvoices(organizationId: OrganizationId, from: string, to: string): Promise<UnpaidInvoice[]> {
    const base = () =>
      this.scopedQuery(organizationId)
        .table("invoices")
        .select("id, total_with_vat")
        .in("status", UNPAID_STATUSES)
        .eq("reconciliation_status", "none")
        .gt("total_with_vat", 0);
    const [withCompetence, byInvoiceDate] = await Promise.all([
      base().gte("competence_date", from).lte("competence_date", to),
      base().is("competence_date", null).gte("invoice_date", from).lte("invoice_date", to),
    ]);
    for (const r of [withCompetence, byInvoiceDate]) if (r.error) throw new Error(r.error.message);
    const rows = [...(withCompetence.data ?? []), ...(byInvoiceDate.data ?? [])] as unknown as { id: string; total_with_vat: number | string }[];
    const data = await this.invoices(organizationId, rows.map((r) => r.id));
    return rows.flatMap((r) => {
      const d = data.get(r.id);
      // Valores das faturas já em cêntimos (bigint).
      return d ? [{ id: r.id, totalCents: Math.round(Number(r.total_with_vat)), data: d }] : [];
    });
  }

  async load(organizationId: OrganizationId, refs: ExpenseReferences): Promise<ExpenseSources> {
    const [payableRows, occurrenceRows] = await Promise.all([
      this.select<{ id: string; invoice_id: string | null; cost_center_id: string | null }>(
        organizationId, "payable_entries", "id, invoice_id, cost_center_id", "id", refs.payableIds,
      ),
      this.select<{ id: string; invoice_id: string | null; recurrence_id: string; period: string | null }>(
        organizationId, "recurring_occurrences", "id, invoice_id, recurrence_id, period", "id", refs.occurrenceIds,
      ),
    ]);
    const contractRows = await this.select<{ id: string; name: string | null; cost_center_id: string | null; cost_center_category_id: string | null }>(
      organizationId,
      "recurring_contracts",
      "id, name, cost_center_id, cost_center_category_id",
      "id",
      [...new Set(occurrenceRows.map((o) => o.recurrence_id))],
    );
    const contracts = new Map(contractRows.map((c) => [c.id, c]));

    const invoiceIds = new Set(refs.invoiceIds);
    for (const r of [...payableRows, ...occurrenceRows]) if (r.invoice_id) invoiceIds.add(r.invoice_id);

    return {
      invoices: await this.invoices(organizationId, [...invoiceIds]),
      payables: new Map(payableRows.map((p) => [p.id, { invoiceId: p.invoice_id, groupId: p.cost_center_id }])),
      occurrences: new Map(
        occurrenceRows.map((o) => {
          const c = contracts.get(o.recurrence_id);
          return [
            o.id,
            {
              invoiceId: o.invoice_id,
              groupId: c?.cost_center_id ?? null,
              categoryId: c?.cost_center_category_id ?? null,
              period: o.period,
              label: c?.name ?? null,
            },
          ];
        }),
      ),
    };
  }

  private async invoices(organizationId: OrganizationId, ids: string[]): Promise<Map<string, InvoiceCategoryData>> {
    const rows = await this.select<InvoiceRow>(
      organizationId,
      "invoices",
      "id, line_detail_mode, cost_center_group_id, cost_center_category_id, subtotal_without_vat, total_with_vat, invoice_date, competence_date, supplier_name, invoice_number",
      "id",
      ids,
    );
    const byValues = rows.filter((r) => r.line_detail_mode === "by_values").map((r) => r.id);
    const detailed = rows.filter((r) => r.line_detail_mode === "detailed").map((r) => r.id);

    const [allocationRows, lineRows] = await Promise.all([
      this.select<{ invoice_id: string; cost_center_group_id: string | null; cost_center_category_id: string | null; net_cents: number }>(
        organizationId, "invoice_allocations", "invoice_id, cost_center_group_id, cost_center_category_id, net_cents", "invoice_id", byValues,
      ),
      this.select<{ invoice_id: string; cost_center_id: string | null; cost_center_category_id: string | null; total_with_vat: number; vat_amount: number }>(
        organizationId, "invoice_lines", "invoice_id, cost_center_id, cost_center_category_id, total_with_vat, vat_amount", "invoice_id", detailed,
      ),
    ]);

    const group = <T extends { invoice_id: string }>(list: T[], toWeight: (r: T) => CategoryWeight) => {
      const out = new Map<string, CategoryWeight[]>();
      for (const r of list) out.set(r.invoice_id, [...(out.get(r.invoice_id) ?? []), toWeight(r)]);
      return out;
    };
    const allocations = group(allocationRows, (a) => ({
      groupId: a.cost_center_group_id,
      categoryId: a.cost_center_category_id,
      weight: Math.abs(Number(a.net_cents)),
    }));
    const lines = group(lineRows, (l) => ({
      groupId: l.cost_center_id,
      categoryId: l.cost_center_category_id,
      weight: Math.abs(Number(l.total_with_vat) - Number(l.vat_amount)),
      netRatio: ratio(Math.abs(Number(l.total_with_vat) - Number(l.vat_amount)), Math.abs(Number(l.total_with_vat))),
    }));

    return new Map(
      rows.map((r) => [
        r.id,
        {
          mode: r.line_detail_mode === "by_values" || r.line_detail_mode === "detailed" ? r.line_detail_mode : "simple",
          groupId: r.cost_center_group_id,
          categoryId: r.cost_center_category_id,
          netRatio: ratio(Math.abs(Number(r.subtotal_without_vat ?? 0)), Math.abs(Number(r.total_with_vat ?? 0))),
          allocations: allocations.get(r.id) ?? [],
          lines: lines.get(r.id) ?? [],
          date: r.competence_date ?? r.invoice_date,
          label: [r.supplier_name, r.invoice_number].filter(Boolean).join(" · ") || null,
        },
      ]),
    );
  }

  private async select<T>(organizationId: OrganizationId, table: TableName, columns: string, column: string, ids: string[]): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table(table)
        .select(columns)
        .in(column, ids.slice(i, i + IN_CHUNK));
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as unknown as T[]));
    }
    return out;
  }
}
