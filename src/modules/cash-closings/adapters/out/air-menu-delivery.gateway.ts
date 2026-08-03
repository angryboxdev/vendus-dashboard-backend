import type { AirMenuDeliveryGatewayPort, DeliveryTotals } from "../../domain/ports/out/air-menu-delivery-gateway.port.js";
import type { GetSummaryPort } from "../../../air-menu/domain/ports/in/get-summary.port.js";

function startOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * Adapter de saída do módulo cash-closings que consulta o AirMenu para obter
 * os totais de delivery (Uber Eats, Glovo, Bolt Food) de um dado dia.
 *
 * Usa GetSummaryPort do módulo air-menu (comunicação inter-módulo via port).
 * O enterpriseId é configurado no composition root (env AIRMENU_CLOSING_ENTERPRISE_ID).
 */
export class AirMenuDeliveryGateway implements AirMenuDeliveryGatewayPort {
  constructor(
    private readonly getSummary: GetSummaryPort,
    private readonly enterpriseId: string,
  ) {}

  async getDeliveryTotalsForDate(date: string): Promise<DeliveryTotals> {
    const { analytics } = await this.getSummary.execute(
      this.enterpriseId,
      startOfDay(date),
      endOfDay(date),
    );

    const totals: DeliveryTotals = { uber: 0, glovo: 0, bolt: 0 };

    for (const p of analytics.byPlatform) {
      const name = p.platform.toLowerCase();
      if (name.includes("uber")) {
        totals.uber = p.grossRevenue;
      } else if (name.includes("glovo")) {
        totals.glovo = p.grossRevenue;
      } else if (name.includes("bolt")) {
        totals.bolt = p.grossRevenue;
      }
    }

    return totals;
  }
}
