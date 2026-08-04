import { computeVendusAnalytics } from "../../domain/services/analytics-calculator.service.js";
import type { VendusDetailedDocument } from "../../domain/entities/vendus-document.js";
import type { VendusProduct } from "../../domain/entities/vendus-product.js";

const EATZ_ID = 275787588;

function makeDoc(overrides: Partial<VendusDetailedDocument> & { id: number }): VendusDetailedDocument {
  return {
    id: overrides.id,
    type: overrides.type ?? "FS",
    number: overrides.number ?? `FS 1/${overrides.id}`,
    date: overrides.date ?? "2026-08-01",
    system_time: overrides.system_time ?? "2026-08-01 13:00:00",
    amount_gross: overrides.amount_gross ?? "10.00",
    amount_net: overrides.amount_net ?? "8.85",
    taxes: overrides.taxes ?? [{ total: "10.00", base: "8.85", amount: "1.15", rate: 13 }],
    discounts: overrides.discounts ?? { total: "0.00" },
    payments: overrides.payments ?? [{ id: 275787585, title: "Multibanco", amount: "10.00" }],
    client: { name: "", fiscal_id: "" },
    items: overrides.items ?? [
      {
        id: 1,
        qty: 1,
        title: "Honey Pepperoni (Grande)",
        reference: "ANB-001",
        amounts: { gross_total: "10.00", net_total: "8.85" },
        discounts: {},
        tax: { rate: 13 },
      },
    ],
    related_docs: null,
    store_id: 1,
    register_id: 1,
    channel: overrides.channel ?? "salao",
  };
}

const emptyMap = new Map<string, VendusProduct>();
const start = new Date("2026-08-01T00:00:00");
const end = new Date("2026-08-01T23:59:59");

describe("computeVendusAnalytics", () => {
  it("computes summary totals for a single invoice", () => {
    const docs = [makeDoc({ id: 1, amount_gross: "27.80", amount_net: "24.59" })];
    const result = computeVendusAnalytics(docs, emptyMap, start, end);

    expect(result.summary.totalDocuments).toBe(1);
    expect(result.summary.totalCreditNotes).toBe(0);
    expect(result.summary.grossRevenue).toBe(27.8);
    expect(result.summary.averageTicket).toBe(27.8);
  });

  it("subtracts NC from grossRevenue", () => {
    const invoice = makeDoc({ id: 1, type: "FS", amount_gross: "27.80", amount_net: "24.59" });
    const nc = makeDoc({ id: 2, type: "NC", amount_gross: "27.80", amount_net: "24.59", channel: "salao" });
    const result = computeVendusAnalytics([invoice, nc], emptyMap, start, end);

    expect(result.summary.totalDocuments).toBe(1);
    expect(result.summary.totalCreditNotes).toBe(1);
    expect(result.summary.grossRevenue).toBe(0);
    expect(result.byDocumentType.invoices.count).toBe(1);
    expect(result.byDocumentType.creditNotes.count).toBe(1);
  });

  it("splits byChannel correctly — salao vs eatz", () => {
    const salao = makeDoc({ id: 1, amount_gross: "20.00", amount_net: "17.70", channel: "salao" });
    const eatz = makeDoc({ id: 2, amount_gross: "15.00", amount_net: "13.27", channel: "eatz",
      payments: [{ id: EATZ_ID, title: "Eatz", amount: "15.00" }] });
    const result = computeVendusAnalytics([salao, eatz], emptyMap, start, end);

    const salaoStats = result.byChannel.find((c) => c.channel === "salao")!;
    const eatzStats = result.byChannel.find((c) => c.channel === "eatz")!;
    expect(salaoStats.documentCount).toBe(1);
    expect(eatzStats.documentCount).toBe(1);
    expect(salaoStats.grossRevenue).toBe(20);
    expect(eatzStats.grossRevenue).toBe(15);
  });

  it("groups take_away into salao channel with takeAwayCount", () => {
    const ta = makeDoc({ id: 1, amount_gross: "10.00", amount_net: "8.85", channel: "take_away" });
    const result = computeVendusAnalytics([ta], emptyMap, start, end);

    const salaoStats = result.byChannel.find((c) => c.channel === "salao")!;
    expect(salaoStats.documentCount).toBe(1);
    expect(salaoStats.takeAwayCount).toBe(1);
    expect(result.byChannel.find((c) => c.channel === "eatz")!.documentCount).toBe(0);
  });

  it("uses product catalog for category lookup by reference", () => {
    const catalog = new Map<string, VendusProduct>([
      ["anb-001", {
        id: 1, reference: "ANB-001", title: "Honey Pepperoni (Grande)",
        category_id: 278665754, category: "pizza",
        salaoPrice: 19.9, eatzPrice: 24.9,
      }],
    ]);
    const doc = makeDoc({ id: 1, amount_gross: "19.90", amount_net: "19.90",
      items: [{ id: 1, qty: 1, title: "Honey Pepperoni (Grande)", reference: "ANB-001",
        amounts: { gross_total: "19.90", net_total: "19.90" }, discounts: {}, tax: { rate: 0 } }],
    });
    const result = computeVendusAnalytics([doc], catalog, start, end);

    expect(result.byCategory.find((c) => c.category === "pizza")).toBeDefined();
    expect(result.topProducts[0]!.category).toBe("pizza");
  });

  it("falls back to title-based category detection when not in catalog", () => {
    const doc = makeDoc({ id: 1 }); // item: "Honey Pepperoni (Grande)" not in catalog
    const result = computeVendusAnalytics([doc], emptyMap, start, end);
    expect(result.byCategory.find((c) => c.category === "pizza")).toBeDefined();
  });

  it("generates temporal distribution with 24 hour buckets for single day", () => {
    const doc = makeDoc({ id: 1, system_time: "2026-08-01 13:00:00" });
    const result = computeVendusAnalytics([doc], emptyMap, start, end);
    expect(result.temporalDistribution).toHaveLength(24);
    const bucket = result.temporalDistribution.find((t) => t.period === "13:00")!;
    expect(bucket.documentCount).toBe(1);
  });

  it("sorts topProducts by grossRevenue descending", () => {
    const items = [
      { id: 1, qty: 2, title: "Produto A", reference: "A", amounts: { gross_total: "10.00" }, discounts: {}, tax: { rate: 0 } },
      { id: 2, qty: 1, title: "Produto B", reference: "B", amounts: { gross_total: "20.00" }, discounts: {}, tax: { rate: 0 } },
    ];
    const doc = makeDoc({ id: 1, amount_gross: "30.00", amount_net: "30.00",
      taxes: [], items });
    const result = computeVendusAnalytics([doc], emptyMap, start, end);
    expect(result.topProducts[0]!.reference).toBe("B");
    expect(result.topProducts[1]!.reference).toBe("A");
  });
});
