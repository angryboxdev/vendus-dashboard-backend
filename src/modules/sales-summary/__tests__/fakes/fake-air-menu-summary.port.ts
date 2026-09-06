import type { AirMenuSummaryPort, AirMenuSummaryData } from "../../domain/ports/out/air-menu-summary.port.js";

export class FakeAirMenuSummaryPort implements AirMenuSummaryPort {
  private responses = new Map<string, AirMenuSummaryData>();
  callCount = 0;

  set(year: number, month: number, data: AirMenuSummaryData): void {
    this.responses.set(`${year}-${month}`, data);
  }

  async getSummary(year: number, month: number): Promise<AirMenuSummaryData> {
    this.callCount++;
    const data = this.responses.get(`${year}-${month}`);
    if (!data) throw new Error(`FakeAirMenuSummaryPort: no response for ${year}-${month}`);
    return data;
  }
}

export function makeEmptyAirMenuSummary(): AirMenuSummaryData {
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
