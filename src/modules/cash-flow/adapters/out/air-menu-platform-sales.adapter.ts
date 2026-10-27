import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetSummaryPort } from "../../../air-menu/domain/ports/in/get-summary.port.js";
import type { SalesFigures } from "../../domain/entities/dre.js";
import type { PlatformSalesReadPort } from "../../domain/ports/out/platform-sales-read.port.js";

const cents = (eur: number) => Math.round(eur * 100);
const ZONE = "Europe/Lisbon";

/**
 * Bridges o `GetSummaryPort` do módulo `air-menu` (D10), com o mesmo enterprise do Resumo de Vendas.
 * Indisponível (ex.: antes da integração) → zeros, como no `sales-summary`.
 */
export class AirMenuPlatformSalesAdapter implements PlatformSalesReadPort {
  constructor(
    private readonly getSummary: GetSummaryPort,
    private readonly enterpriseId: string,
  ) {}

  async sales(_organizationId: OrganizationId, from: string, to: string): Promise<SalesFigures> {
    try {
      const { analytics } = await this.getSummary.execute(
        this.enterpriseId,
        DateTime.fromISO(from, { zone: ZONE }).startOf("day").toJSDate(),
        DateTime.fromISO(to, { zone: ZONE }).endOf("day").toJSDate(),
      );
      return { netCents: cents(analytics.summary.netRevenue), vatCents: cents(analytics.summary.vatCollected) };
    } catch (e) {
      console.warn(`[AirMenuPlatformSalesAdapter] ${from}..${to}: sem dados — ${String(e)}`);
      return { netCents: 0, vatCents: 0 };
    }
  }
}
