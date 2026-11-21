import { DateTime } from "luxon";
import type { GetSummaryPort } from "../../../air-menu/domain/ports/in/get-summary.port.js";
import type { AirMenuChannel, DateRange, SalesBucket } from "../../domain/entities/sales-analysis.js";
import type { AirMenuSalesSourcePort } from "../../domain/ports/out/sales-analysis.ports.js";
import { airMenuToBuckets, type AirMenuSaleInput } from "../../domain/services/buckets.service.js";

const ZONE = "Europe/Lisbon";

function mapPlatform(platform: string): AirMenuChannel | null {
  const p = platform.toLowerCase();
  if (p.includes("uber")) return "uber_eats";
  if (p.includes("glovo")) return "glovo";
  if (p.includes("bolt")) return "bolt_food";
  return null;
}

/**
 * Ponte para o módulo air-menu (loja principal: AIRMENU_SALES_SUMMARY_ENTERPRISE_ID,
 * ADR-0012). Ao contrário do Resultados, um erro da AirMenu propaga-se: um mês
 * que falhou nunca fica guardado como «sem vendas».
 *
 * O IVA não vem por encomenda: o líquido de cada bloco usa a proporção
 * líquido/bruto do período pedido (aproximação documentada no README).
 */
export class AirMenuSalesSourceAdapter implements AirMenuSalesSourcePort {
  constructor(private readonly getSummary: GetSummaryPort, private readonly enterpriseId: string) {}

  async fetchBuckets(range: DateRange): Promise<SalesBucket[]> {
    const start = DateTime.fromISO(range.from, { zone: ZONE }).startOf("day").toJSDate();
    const end = DateTime.fromISO(range.to, { zone: ZONE }).endOf("day").toJSDate();
    const { orders, analytics } = await this.getSummary.execute(this.enterpriseId, start, end);
    const g = analytics.summary.grossRevenue;
    const ratio = g > 0 && analytics.summary.netRevenue > 0 ? analytics.summary.netRevenue / g : 1;
    const sales: AirMenuSaleInput[] = [];
    for (const o of orders) {
      const channel = mapPlatform(o.platform);
      if (!channel) continue;
      const when = DateTime.fromJSDate(o.documentDate, { zone: ZONE });
      const grossCents = Math.round(Math.abs(o.total) * 100);
      sales.push({
        date: when.toISODate()!,
        hour: when.hour,
        channel,
        grossCents,
        netCents: Math.round(grossCents * ratio),
        isCreditNote: o.documentType === "credit_note",
      });
    }
    return airMenuToBuckets(sales).filter((b) => b.date >= range.from && b.date <= range.to);
  }
}
