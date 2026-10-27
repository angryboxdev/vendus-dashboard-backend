import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { CategoryVatRatioReadPort } from "../../domain/ports/out/category-vat-ratio-read.port.js";

/** Faturas lidas no máximo (as mais recentes) — chega para 10 por categoria num restaurante. */
const MAX_ROWS = 2000;
/** Estados que não contam: rascunhos por rever e anuladas. */
const IGNORED_STATUSES = "(draft_ai,pending_review,review,cancelled)";

interface Row {
  cost_center_category_id: string;
  subtotal_without_vat: number | string | null;
  total_with_vat: number | string | null;
}

/**
 * IVA médio das últimas faturas de cada categoria (ex.: Ingredientes ≈ as últimas 10 da Makro), lido
 * só do cabeçalho de `invoices` (só leitura). Rácio ponderado: Σ sem IVA ÷ Σ com IVA.
 */
export class SupabaseCategoryVatRatioReadAdapter implements CategoryVatRatioReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async recentNetRatios(organizationId: OrganizationId, until: string, sample: number): Promise<Map<string, number>> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .select("cost_center_category_id, subtotal_without_vat, total_with_vat")
      .not("cost_center_category_id", "is", null)
      .not("status", "in", IGNORED_STATUSES)
      .gt("total_with_vat", 0)
      .lte("invoice_date", until)
      .order("invoice_date", { ascending: false })
      .limit(MAX_ROWS);
    if (error) throw new Error(error.message);

    const acc = new Map<string, { n: number; net: number; gross: number }>();
    for (const r of (data ?? []) as unknown as Row[]) {
      const a = acc.get(r.cost_center_category_id) ?? { n: 0, net: 0, gross: 0 };
      if (a.n >= sample) continue;
      const net = Number(r.subtotal_without_vat ?? 0);
      const gross = Number(r.total_with_vat ?? 0);
      if (!(gross > 0) || net < 0 || net > gross) continue;
      acc.set(r.cost_center_category_id, { n: a.n + 1, net: a.net + net, gross: a.gross + gross });
    }
    return new Map([...acc.entries()].filter(([, a]) => a.gross > 0).map(([id, a]) => [id, a.net / a.gross]));
  }
}
