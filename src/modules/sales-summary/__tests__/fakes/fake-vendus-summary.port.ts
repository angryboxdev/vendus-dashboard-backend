import type { VendusSummaryPort, VendusSummaryData } from "../../domain/ports/out/vendus-summary.port.js";

export class FakeVendusSummaryPort implements VendusSummaryPort {
  private responses = new Map<string, VendusSummaryData>();
  callCount = 0;

  set(year: number, month: number, data: VendusSummaryData): void {
    this.responses.set(`${year}-${month}`, data);
  }

  async getSummary(year: number, month: number): Promise<VendusSummaryData> {
    this.callCount++;
    const data = this.responses.get(`${year}-${month}`);
    if (!data) throw new Error(`FakeVendusSummaryPort: no response for ${year}-${month}`);
    return data;
  }
}

export function makeEmptyVendusSummary(): VendusSummaryData {
  return {
    faturadoTotalCents: 0,
    invoiceVatCollectedCents: 0,
    invoiceCount: 0,
    creditNoteCount: 0,
    creditNoteValueCents: 0,
    byChannel: [],
    byCategory: [],
    topProducts: [],
    temporalDistribution: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      invoiceCount: 0,
      creditNoteCount: 0,
      grossRevenueCents: 0,
    })),
  };
}
