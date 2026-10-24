import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { ObligationCandidatesPort } from "../../domain/ports/out/obligation-candidates.port.js";
import type { ExistingObligation } from "../../domain/services/reading/obligation-match.js";

/**
 * Candidatas a «mesma obrigação»: faturas e contas a pagar com o mesmo valor, ou
 * cujo número contém um dos números lidos (prefixo de 6 dígitos, para apanhar
 * leituras antigas com dígitos trocados). Só leitura.
 */
export class SupabaseObligationCandidatesAdapter implements ObligationCandidatesPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async find(organizationId: OrganizationId, query: { amountCents: number | null; numbers: string[] }): Promise<ExistingObligation[]> {
    const prefixes = [...new Set(query.numbers.filter((n) => n.length >= 6).map((n) => n.slice(0, 6)))];
    const invoiceFilters = [
      ...(query.amountCents !== null ? [`total_with_vat.eq.${query.amountCents}`] : []),
      ...prefixes.map((p) => `invoice_number.ilike.%${p}%`),
    ];
    const payableFilters = [
      ...(query.amountCents !== null ? [`amount.eq.${query.amountCents}`] : []),
      ...prefixes.map((p) => `description.ilike.%${p}%`),
    ];
    if (!invoiceFilters.length) return [];

    const [inv, pay] = await Promise.all([
      this.scopedQuery(organizationId)
        .table("invoices")
        .select("id, invoice_number, supplier_name, total_with_vat, due_date, invoice_date, status")
        .or(invoiceFilters.join(","))
        .limit(200),
      this.scopedQuery(organizationId)
        .table("payable_entries")
        .select("id, invoice_id, description, supplier_name, amount, due_date, status")
        .or(payableFilters.join(","))
        .limit(200),
    ]);
    if (inv.error) throw new Error(inv.error.message);
    if (pay.error) throw new Error(pay.error.message);
    type InvRow = { id: string; invoice_number: string | null; supplier_name: string; total_with_vat: number; due_date: string | null; invoice_date: string | null; status: string };
    type PayRow = { id: string; invoice_id: string | null; description: string; supplier_name: string; amount: number; due_date: string | null; status: string };
    return [
      ...((inv.data ?? []) as unknown as InvRow[]).map((r): ExistingObligation => ({
        source: "invoice",
        id: r.id,
        invoiceId: r.id,
        label: r.invoice_number ?? "",
        supplierName: r.supplier_name,
        amountCents: Math.abs(Number(r.total_with_vat)),
        dueDate: r.due_date ? String(r.due_date).slice(0, 10) : null,
        documentDate: r.invoice_date ? String(r.invoice_date).slice(0, 10) : null,
        status: r.status,
      })),
      ...((pay.data ?? []) as unknown as PayRow[]).map((r): ExistingObligation => ({
        source: "payable",
        id: r.id,
        invoiceId: r.invoice_id,
        label: r.description,
        supplierName: r.supplier_name,
        amountCents: Number(r.amount),
        dueDate: r.due_date ? String(r.due_date).slice(0, 10) : null,
        documentDate: null,
        status: r.status,
      })),
    ];
  }
}
