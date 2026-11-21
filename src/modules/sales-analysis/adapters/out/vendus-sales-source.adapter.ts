import type { GetSummaryPort } from "../../../vendus/domain/ports/in/get-summary.port.js";
import type { DateRange, SalesBucket, VendusChannel } from "../../domain/entities/sales-analysis.js";
import { VENDUS_CHANNELS } from "../../domain/entities/sales-analysis.js";
import type { VendusSalesSourcePort } from "../../domain/ports/out/sales-analysis.ports.js";
import { vendusToBuckets, type VendusSaleInput } from "../../domain/services/buckets.service.js";

const cents = (s: string) => Math.round(parseFloat(s || "0") * 100);

/** Hora (0–23) de «AAAA-MM-DD HH:mm:ss», lida do texto — não depende do fuso do servidor. */
export function hourOfSystemTime(systemTime: string | null | undefined): number {
  const m = /(\d{2}):\d{2}/.exec(systemTime ?? "");
  const h = m ? Number(m[1]) : NaN;
  return Number.isInteger(h) && h >= 0 && h < 24 ? h : 0;
}

/**
 * Ponte para o módulo vendus (porta de entrada GetSummary). A hora vem de
 * `system_time`, registado pela Vendus em hora de Portugal.
 */
export class VendusSalesSourceAdapter implements VendusSalesSourcePort {
  constructor(private readonly getSummary: GetSummaryPort) {}

  async fetchBuckets(range: DateRange): Promise<SalesBucket[]> {
    const { documents } = await this.getSummary.execute({ since: range.from, until: range.to });
    const sales: VendusSaleInput[] = [];
    for (const d of documents) {
      if (!(VENDUS_CHANNELS as readonly string[]).includes(d.channel)) continue;
      sales.push({
        type: d.type,
        date: d.date.slice(0, 10),
        hour: hourOfSystemTime(d.system_time),
        channel: d.channel as VendusChannel,
        grossCents: cents(d.amount_gross),
        netCents: cents(d.amount_net),
      });
    }
    return vendusToBuckets(sales).filter((b) => b.date >= range.from && b.date <= range.to);
  }
}
