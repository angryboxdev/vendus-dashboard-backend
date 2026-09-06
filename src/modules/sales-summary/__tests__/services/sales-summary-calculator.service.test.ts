import { SalesSummaryCalculatorService } from "../../domain/services/sales-summary-calculator.service.js";
import type { VendusSummaryData } from "../../domain/ports/out/vendus-summary.port.js";
import type { AirMenuSummaryData } from "../../domain/ports/out/air-menu-summary.port.js";
import { makeEmptyVendusSummary } from "../fakes/fake-vendus-summary.port.js";
import { makeEmptyAirMenuSummary } from "../fakes/fake-air-menu-summary.port.js";

function calc(v: VendusSummaryData, a: AirMenuSummaryData) {
  return new SalesSummaryCalculatorService().calculate(v, a, 2026, 9, new Date());
}

describe("SalesSummaryCalculatorService", () => {
  // ─── Totals ───────────────────────────────────────────────────────────────

  describe("grossRevenue = faturadoTotal - creditNoteValue", () => {
    it("subtracts NC from invoices across both sources", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        faturadoTotalCents: 10000, // 100€
        creditNoteValueCents: 2000, // 20€
        invoiceCount: 3,
        creditNoteCount: 1,
      };
      const airMenu: AirMenuSummaryData = {
        ...makeEmptyAirMenuSummary(),
        faturadoTotalCents: 5000,
        creditNoteValueCents: 500,
        invoiceCount: 2,
      };
      const result = calc(vendus, airMenu);
      expect(result.totals.faturadoTotal).toBe(15000);
      expect(result.totals.creditNoteValue).toBe(2500);
      expect(result.totals.grossRevenue).toBe(12500);
    });
  });

  describe("faturadoTotal = invoices only, NC not subtracted", () => {
    it("equals sum of both sources' faturadoTotal regardless of NC", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        faturadoTotalCents: 8000,
        creditNoteValueCents: 8000, // all cancelled
        invoiceCount: 4,
        creditNoteCount: 4,
      };
      const result = calc(vendus, makeEmptyAirMenuSummary());
      expect(result.totals.faturadoTotal).toBe(8000);
      expect(result.totals.grossRevenue).toBe(0);
    });
  });

  describe("vatCollected and netRevenue", () => {
    it("sums vat from both sources", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        faturadoTotalCents: 10000,
        invoiceVatCollectedCents: 2300,
        invoiceCount: 1,
      };
      const airMenu: AirMenuSummaryData = {
        ...makeEmptyAirMenuSummary(),
        faturadoTotalCents: 5000,
        invoiceVatCollectedCents: 1150,
        invoiceCount: 1,
      };
      const result = calc(vendus, airMenu);
      expect(result.totals.vatCollected).toBe(3450);
      expect(result.totals.netRevenue).toBe(15000 - 3450);
    });
  });

  describe("transactionCount and averageTicket", () => {
    it("counts invoices only from both sources", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        faturadoTotalCents: 12000,
        invoiceCount: 3,
        creditNoteCount: 1,
        creditNoteValueCents: 2000,
      };
      const airMenu: AirMenuSummaryData = {
        ...makeEmptyAirMenuSummary(),
        faturadoTotalCents: 8000,
        invoiceCount: 2,
      };
      const result = calc(vendus, airMenu);
      // grossRevenue = 12000+8000-2000 = 18000; transactionCount = 5
      expect(result.totals.transactionCount).toBe(5);
      expect(result.totals.averageTicket).toBe(Math.round(18000 / 5));
    });
  });

  // ─── Channel merge ────────────────────────────────────────────────────────

  describe("channel merge", () => {
    it("always includes the 6 canonical channels even with zero sales", () => {
      const result = calc(makeEmptyVendusSummary(), makeEmptyAirMenuSummary());
      const channels = result.byChannel.map((c) => c.channel);
      expect(channels).toContain("salao");
      expect(channels).toContain("take_away");
      expect(channels).toContain("eatz");
      expect(channels).toContain("uber_eats");
      expect(channels).toContain("glovo");
      expect(channels).toContain("bolt_food");
    });

    it("does NOT include 'apps' when vendus has no apps data", () => {
      const result = calc(makeEmptyVendusSummary(), makeEmptyAirMenuSummary());
      expect(result.byChannel.map((c) => c.channel)).not.toContain("apps");
    });

    it("includes 'apps' when vendus has apps invoices", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        byChannel: [
          { channel: "apps", grossRevenueCents: 5000, invoiceCount: 2, creditNoteCount: 0, creditNoteValueCents: 0 },
        ],
      };
      const result = calc(vendus, makeEmptyAirMenuSummary());
      expect(result.byChannel.map((c) => c.channel)).toContain("apps");
    });

    it("sums grossRevenue from both sources for a channel", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        byChannel: [
          { channel: "eatz", grossRevenueCents: 3000, invoiceCount: 1, creditNoteCount: 0, creditNoteValueCents: 0 },
        ],
      };
      // eatz is a vendus-only channel; uber_eats is AirMenu
      const airMenu: AirMenuSummaryData = {
        ...makeEmptyAirMenuSummary(),
        byChannel: [
          { channel: "uber_eats", grossRevenueCents: 7000, invoiceCount: 2, creditNoteCount: 0, creditNoteValueCents: 0 },
        ],
      };
      const result = calc(vendus, airMenu);
      const eatz = result.byChannel.find((c) => c.channel === "eatz")!;
      const uberEats = result.byChannel.find((c) => c.channel === "uber_eats")!;
      expect(eatz.grossRevenue).toBe(3000);
      expect(uberEats.grossRevenue).toBe(7000);
    });
  });

  describe("sharePercent", () => {
    it("sums to 100 across all channels (within floating-point tolerance)", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        faturadoTotalCents: 7000,
        invoiceCount: 3,
        byChannel: [
          { channel: "salao", grossRevenueCents: 4000, invoiceCount: 2, creditNoteCount: 0, creditNoteValueCents: 0 },
          { channel: "eatz", grossRevenueCents: 3000, invoiceCount: 1, creditNoteCount: 0, creditNoteValueCents: 0 },
        ],
      };
      const airMenu: AirMenuSummaryData = {
        ...makeEmptyAirMenuSummary(),
        faturadoTotalCents: 3000,
        invoiceCount: 1,
        byChannel: [
          { channel: "uber_eats", grossRevenueCents: 3000, invoiceCount: 1, creditNoteCount: 0, creditNoteValueCents: 0 },
        ],
      };
      const result = calc(vendus, airMenu);
      const total = result.byChannel.reduce((s, c) => s + c.sharePercent, 0);
      expect(total).toBeCloseTo(100, 1);
    });
  });

  // ─── Category mapping ─────────────────────────────────────────────────────

  describe("category mapping", () => {
    it("maps Vendus 'pizza' to Unified 'Pizzas'", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        byCategory: [{ category: "pizza", itemsSold: 10, grossRevenueCents: 5000, vatCollectedCents: 650, netRevenueCents: 4350 }],
      };
      const result = calc(vendus, makeEmptyAirMenuSummary());
      const pizzas = result.byCategory.find((c) => c.category === "Pizzas")!;
      expect(pizzas.grossRevenue).toBe(5000);
    });

    it("maps Vendus 'bebida_alcoolica' to 'Bebidas Alcoólicas'", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        byCategory: [{ category: "bebida_alcoolica", itemsSold: 3, grossRevenueCents: 1500, vatCollectedCents: 300, netRevenueCents: 1200 }],
      };
      const result = calc(vendus, makeEmptyAirMenuSummary());
      expect(result.byCategory.find((c) => c.category === "Bebidas Alcoólicas")!.grossRevenue).toBe(1500);
    });

    it("maps Vendus 'bebida_nao_alcoolica' to 'Bebidas'", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        byCategory: [{ category: "bebida_nao_alcoolica", itemsSold: 5, grossRevenueCents: 2000, vatCollectedCents: 260, netRevenueCents: 1740 }],
      };
      const result = calc(vendus, makeEmptyAirMenuSummary());
      expect(result.byCategory.find((c) => c.category === "Bebidas")!.grossRevenue).toBe(2000);
    });

    it("maps Vendus 'sacos' and 'outros' both to 'Outros'", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        byCategory: [
          { category: "sacos", itemsSold: 2, grossRevenueCents: 400, vatCollectedCents: 52, netRevenueCents: 348 },
          { category: "outros", itemsSold: 1, grossRevenueCents: 300, vatCollectedCents: 39, netRevenueCents: 261 },
        ],
      };
      const result = calc(vendus, makeEmptyAirMenuSummary());
      expect(result.byCategory.find((c) => c.category === "Outros")!.grossRevenue).toBe(700);
    });

    it("maps AirMenu 'Pizzas' to 'Pizzas' and 'Drinks' to 'Bebidas'", () => {
      const airMenu: AirMenuSummaryData = {
        ...makeEmptyAirMenuSummary(),
        byCategory: [
          { category: "Pizzas", itemsSold: 8, grossRevenueCents: 6400, vatCollectedCents: 832, netRevenueCents: 5568 },
          { category: "Drinks", itemsSold: 4, grossRevenueCents: 1200, vatCollectedCents: 156, netRevenueCents: 1044 },
        ],
      };
      const result = calc(makeEmptyVendusSummary(), airMenu);
      expect(result.byCategory.find((c) => c.category === "Pizzas")!.grossRevenue).toBe(6400);
      expect(result.byCategory.find((c) => c.category === "Bebidas")!.grossRevenue).toBe(1200);
    });

    it("sums Vendus + AirMenu contributions into the same Unified Category", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        byCategory: [{ category: "pizza", itemsSold: 5, grossRevenueCents: 3000, vatCollectedCents: 390, netRevenueCents: 2610 }],
      };
      const airMenu: AirMenuSummaryData = {
        ...makeEmptyAirMenuSummary(),
        byCategory: [{ category: "Pizzas", itemsSold: 3, grossRevenueCents: 2000, vatCollectedCents: 260, netRevenueCents: 1740 }],
      };
      const result = calc(vendus, airMenu);
      const pizzas = result.byCategory.find((c) => c.category === "Pizzas")!;
      expect(pizzas.itemsSold).toBe(8);
      expect(pizzas.grossRevenue).toBe(5000);
    });

    it("all four Unified Categories are always present", () => {
      const result = calc(makeEmptyVendusSummary(), makeEmptyAirMenuSummary());
      const cats = result.byCategory.map((c) => c.category);
      expect(cats).toContain("Pizzas");
      expect(cats).toContain("Bebidas Alcoólicas");
      expect(cats).toContain("Bebidas");
      expect(cats).toContain("Outros");
    });
  });

  // ─── Product deduplication ────────────────────────────────────────────────

  describe("product deduplication", () => {
    it("merges same normalized title from Vendus and AirMenu into one row", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        topProducts: [{ normalizedTitle: "Pizza Margherita", category: "pizza", quantitySold: 5, grossRevenueCents: 5000, channelsSeen: ["salao"] }],
      };
      const airMenu: AirMenuSummaryData = {
        ...makeEmptyAirMenuSummary(),
        topProducts: [{ normalizedTitle: "Pizza Margherita", quantitySold: 3, grossRevenueCents: 3000, channelsSeen: ["uber_eats"] }],
      };
      const result = calc(vendus, airMenu);
      const merged = result.topProducts.filter((p) => p.normalizedTitle === "Pizza Margherita");
      expect(merged).toHaveLength(1);
      expect(merged[0]!.quantitySold).toBe(8);
      expect(merged[0]!.grossRevenue).toBe(8000);
      expect(merged[0]!.channels).toContain("salao");
      expect(merged[0]!.channels).toContain("uber_eats");
    });

    it("keeps distinct titles as separate rows", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        topProducts: [
          { normalizedTitle: "Pizza A", category: "pizza", quantitySold: 2, grossRevenueCents: 2000, channelsSeen: [] },
          { normalizedTitle: "Pizza B", category: "pizza", quantitySold: 1, grossRevenueCents: 1000, channelsSeen: [] },
        ],
      };
      const result = calc(vendus, makeEmptyAirMenuSummary());
      expect(result.topProducts).toHaveLength(2);
    });

    it("caps result at 50 products ordered by grossRevenue descending", () => {
      const topProducts = Array.from({ length: 60 }, (_, i) => ({
        normalizedTitle: `Produto ${i}`,
        category: "pizza" as const,
        quantitySold: 1,
        grossRevenueCents: (60 - i) * 100,
        channelsSeen: [],
      }));
      const vendus: VendusSummaryData = { ...makeEmptyVendusSummary(), topProducts };
      const result = calc(vendus, makeEmptyAirMenuSummary());
      expect(result.topProducts).toHaveLength(50);
      // First product should have highest revenue
      expect(result.topProducts[0]!.grossRevenue).toBe(6000);
      expect(result.topProducts[49]!.grossRevenue).toBe(1100);
    });
  });

  // ─── Temporal distribution ────────────────────────────────────────────────

  describe("temporal distribution", () => {
    it("always has 24 hourly buckets", () => {
      const result = calc(makeEmptyVendusSummary(), makeEmptyAirMenuSummary());
      expect(result.temporalDistribution).toHaveLength(24);
      expect(result.temporalDistribution[0]!.hour).toBe(0);
      expect(result.temporalDistribution[23]!.hour).toBe(23);
    });

    it("keeps invoiceCount and creditNoteCount separate", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        temporalDistribution: [
          ...Array.from({ length: 24 }, (_, hour) => ({
            hour,
            invoiceCount: hour === 12 ? 3 : 0,
            creditNoteCount: hour === 12 ? 1 : 0,
            grossRevenueCents: hour === 12 ? 3000 : 0,
          })),
        ],
      };
      const result = calc(vendus, makeEmptyAirMenuSummary());
      const noon = result.temporalDistribution.find((b) => b.hour === 12)!;
      expect(noon.invoiceCount).toBe(3);
      expect(noon.creditNoteCount).toBe(1);
    });

    it("NC contribute negatively to grossRevenue in their bucket", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        temporalDistribution: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          invoiceCount: 0,
          creditNoteCount: hour === 15 ? 2 : 0,
          grossRevenueCents: hour === 15 ? -2000 : 0,
        })),
      };
      const result = calc(vendus, makeEmptyAirMenuSummary());
      const bucket = result.temporalDistribution.find((b) => b.hour === 15)!;
      expect(bucket.grossRevenue).toBe(-2000);
      expect(bucket.creditNoteCount).toBe(2);
    });

    it("merges vendus + airMenu buckets for the same hour", () => {
      const vendus: VendusSummaryData = {
        ...makeEmptyVendusSummary(),
        temporalDistribution: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          invoiceCount: hour === 20 ? 2 : 0,
          creditNoteCount: 0,
          grossRevenueCents: hour === 20 ? 2000 : 0,
        })),
      };
      const airMenu: AirMenuSummaryData = {
        ...makeEmptyAirMenuSummary(),
        temporalDistribution: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          invoiceCount: hour === 20 ? 3 : 0,
          creditNoteCount: 0,
          grossRevenueCents: hour === 20 ? 3000 : 0,
        })),
      };
      const result = calc(vendus, airMenu);
      const h20 = result.temporalDistribution.find((b) => b.hour === 20)!;
      expect(h20.invoiceCount).toBe(5);
      expect(h20.grossRevenue).toBe(5000);
    });
  });
});
