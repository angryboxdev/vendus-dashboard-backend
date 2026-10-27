import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetSummaryPort } from "../../../vendus/domain/ports/in/get-summary.port.js";
import type { RestaurantSales } from "../../domain/entities/dre.js";
import type { RestaurantSalesReadPort } from "../../domain/ports/out/restaurant-sales-read.port.js";

const cents = (eur: number) => Math.round(eur * 100);

/**
 * Bridges o `GetSummaryPort` do módulo `vendus` (D10). Restaurante = canais do Vendus menos o
 * antigo «apps» (entregas antes do AirMenu), que nas DRE novas entra pelas liquidações das
 * plataformas. O bruto por classe de pagamento (cartão, numerário, resto) serve para separar a
 * receita; o método «apps» fica de fora. Euros → cêntimos só aqui.
 */
export class VendusRestaurantSalesAdapter implements RestaurantSalesReadPort {
  constructor(private readonly getSummary: GetSummaryPort) {}

  async sales(_organizationId: OrganizationId, from: string, to: string): Promise<RestaurantSales> {
    const { analytics } = await this.getSummary.execute({ since: from, until: to });
    const channels = analytics.byChannel.filter((c) => c.channel !== "apps");
    const byKind = (kinds: string[]) =>
      cents(analytics.byPaymentMethod.filter((p) => kinds.includes(p.kind)).reduce((a, p) => a + p.amount, 0));
    return {
      netCents: cents(channels.reduce((a, c) => a + c.netRevenue, 0)),
      vatCents: cents(channels.reduce((a, c) => a + c.vatCollected, 0)),
      byPaymentGrossCents: { card: byKind(["card"]), cash: byKind(["cash"]), other: byKind(["eatz", "other"]) },
    };
  }
}
