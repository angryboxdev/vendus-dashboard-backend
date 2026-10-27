import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetSummaryPort } from "../../../vendus/domain/ports/in/get-summary.port.js";
import type { DailyRestaurantPayments } from "../../domain/entities/sales-reconciliation.js";
import type { RestaurantDailyPaymentsReadPort } from "../../domain/ports/out/restaurant-daily-payments-read.port.js";

const cents = (eur: number) => Math.round(eur * 100);

/**
 * Bridges o `GetSummaryPort` do módulo `vendus` (D10): `analytics.dailyPayments` → cartão e numerário
 * por dia. Eatz, Apps e outros métodos (MB Way…) não passam pelo TPA nem por depósitos — ficam de fora.
 */
export class VendusDailyPaymentsAdapter implements RestaurantDailyPaymentsReadPort {
  constructor(private readonly getSummary: GetSummaryPort) {}

  async dailyPayments(_organizationId: OrganizationId, from: string, to: string): Promise<DailyRestaurantPayments[]> {
    const { analytics } = await this.getSummary.execute({ since: from, until: to });
    return analytics.dailyPayments.map((d) => ({ date: d.date, cardCents: cents(d.card), cashCents: cents(d.cash) }));
  }
}
