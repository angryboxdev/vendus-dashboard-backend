import { AirMenuDeliveryGateway } from "../../adapters/out/air-menu-delivery.gateway.js";
import type { GetSummaryPort, AirMenuSummary } from "../../../air-menu/domain/ports/in/get-summary.port.js";

function makeSummary(byPlatform: { platform: string; grossRevenue: number }[]): AirMenuSummary {
  return {
    orders: [],
    analytics: {
      summary: {
        totalOrders: 0, totalCancellations: 0, cancellationRate: 0,
        grossRevenue: 0, vatCollected: 0, netRevenue: 0, averageTicket: 0,
      },
      byPlatform: byPlatform.map((p) => ({
        ...p,
        orderCount: 0, cancellationCount: 0, vatCollected: 0, netRevenue: 0, averageTicket: 0,
      })),
      byCategory: [],
      byVatRate: [],
      byDocumentType: { invoices: { count: 0, grossRevenue: 0 }, creditNotes: { count: 0, grossRevenue: 0 } },
      topItems: [],
      temporalDistribution: [],
    },
  };
}

class FakeGetSummary implements GetSummaryPort {
  capturedArgs: { enterpriseId: string; startDate: Date; endDate: Date } | null = null;
  private result: AirMenuSummary = makeSummary([]);

  setResult(byPlatform: { platform: string; grossRevenue: number }[]) {
    this.result = makeSummary(byPlatform);
  }

  async execute(enterpriseId: string, startDate: Date, endDate: Date): Promise<AirMenuSummary> {
    this.capturedArgs = { enterpriseId, startDate, endDate };
    return this.result;
  }
}

const ENTERPRISE_ID = "1783676282106";

function makeGateway(fake: FakeGetSummary) {
  return new AirMenuDeliveryGateway(fake, ENTERPRISE_ID);
}

describe("AirMenuDeliveryGateway", () => {
  it("mapeia plataformas correctamente a partir de byPlatform", async () => {
    const fake = new FakeGetSummary();
    fake.setResult([
      { platform: "Uber Eats", grossRevenue: 89.20 },
      { platform: "Glovo",     grossRevenue: 30.00 },
      { platform: "Bolt Food", grossRevenue: 21.50 },
    ]);

    const totals = await makeGateway(fake).getDeliveryTotalsForDate("2026-08-04");

    expect(totals.uber).toBe(89.20);
    expect(totals.glovo).toBe(30.00);
    expect(totals.bolt).toBe(21.50);
  });

  it("devolve 0 para plataformas ausentes no byPlatform", async () => {
    const fake = new FakeGetSummary();
    fake.setResult([{ platform: "Uber Eats", grossRevenue: 50.00 }]);

    const totals = await makeGateway(fake).getDeliveryTotalsForDate("2026-08-04");

    expect(totals.uber).toBe(50.00);
    expect(totals.glovo).toBe(0);
    expect(totals.bolt).toBe(0);
  });

  it("devolve zeros quando não há ordens no dia", async () => {
    const fake = new FakeGetSummary();

    const totals = await makeGateway(fake).getDeliveryTotalsForDate("2026-08-04");

    expect(totals.uber).toBe(0);
    expect(totals.glovo).toBe(0);
    expect(totals.bolt).toBe(0);
  });

  it("passa o enterpriseId correcto ao GetSummaryPort", async () => {
    const fake = new FakeGetSummary();

    await makeGateway(fake).getDeliveryTotalsForDate("2026-08-04");

    expect(fake.capturedArgs?.enterpriseId).toBe(ENTERPRISE_ID);
  });

  it("passa startDate como início do dia e endDate como fim do dia", async () => {
    const fake = new FakeGetSummary();

    await makeGateway(fake).getDeliveryTotalsForDate("2026-08-04");

    const { startDate, endDate } = fake.capturedArgs!;
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(endDate.getHours()).toBe(23);
    expect(endDate.getMinutes()).toBe(59);
    // mesma data de calendário
    expect(startDate.getDate()).toBe(endDate.getDate());
    expect(startDate.getMonth()).toBe(endDate.getMonth());
  });

  it("match de plataforma é case-insensitive (substring)", async () => {
    const fake = new FakeGetSummary();
    fake.setResult([
      { platform: "uber eats", grossRevenue: 10.00 },
      { platform: "GLOVO",     grossRevenue: 20.00 },
      { platform: "Bolt",      grossRevenue: 30.00 },
    ]);

    const totals = await makeGateway(fake).getDeliveryTotalsForDate("2026-08-04");

    expect(totals.uber).toBe(10.00);
    expect(totals.glovo).toBe(20.00);
    expect(totals.bolt).toBe(30.00);
  });
});
