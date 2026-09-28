import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetSummaryPort } from "../../../vendus/domain/ports/in/get-summary.port.js";
import type { SalesVatReadPort, SalesVatRateStatsDTO } from "../../domain/ports/out/sales-vat-read.port.js";

/**
 * Bridges o `GetSummaryPort` do módulo `vendus` (D10) → `SalesVatReadPort`
 * deste módulo. Mesmo padrão de `VendusSummaryAdapter` em `sales-summary`.
 *
 * `vendus` devolve euros (floats, `round2`); este módulo trabalha sempre em
 * cêntimos (mesma convenção de `invoices`/`financial-base`) — a conversão
 * acontece só aqui, nunca no use case.
 */
export class VendusSalesVatReadAdapter implements SalesVatReadPort {
  constructor(private readonly getSummary: GetSummaryPort) {}

  async getVatByRate(_organizationId: OrganizationId, from: string, to: string): Promise<SalesVatRateStatsDTO[]> {
    const { analytics } = await this.getSummary.execute({ since: from, until: to });
    return analytics.byVatRate.map((r) => ({
      rate: r.rate,
      grossRevenue: Math.round(r.grossRevenue * 100),
      vatAmount: Math.round(r.vatAmount * 100),
      netRevenue: Math.round(r.netRevenue * 100),
    }));
  }
}
