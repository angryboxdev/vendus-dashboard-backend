import { GetSummaryUseCase } from "../../application/use-cases/get-summary.use-case.js";
import { FakeVendusGateway } from "../fakes/fake-vendus-gateway.js";
import { FakeProductCatalog } from "../fakes/fake-product-catalog.js";
import type { VendusDocument, VendusDetailedDocumentRaw } from "../../domain/entities/vendus-document.js";

const EATZ_ID = 275787588;
const CONCURRENCY = 4;

function makeListDoc(id: number, type = "FS", number = `FS 1/${id}`): VendusDocument {
  return { id, type, number, date: "2026-08-01", amount_gross: "10.00", amount_net: "8.85", store_id: 1, register_id: 1 };
}

function makeDetailDoc(id: number, overrides: Partial<VendusDetailedDocumentRaw> = {}): VendusDetailedDocumentRaw {
  return {
    id,
    type: overrides.type ?? "FS",
    number: overrides.number ?? `FS 1/${id}`,
    date: "2026-08-01",
    system_time: "2026-08-01 13:00:00",
    amount_gross: "10.00",
    amount_net: "8.85",
    taxes: [{ total: "10.00", base: "8.85", amount: "1.15", rate: 13 }],
    discounts: { total: "0.00" },
    payments: overrides.payments ?? [{ id: 275787585, title: "Multibanco", amount: "10.00" }],
    client: { name: "", fiscal_id: "" },
    items: [{ id: 1, qty: 1, title: "Honey Pepperoni (Grande)", reference: "ANB-001",
      amounts: { gross_total: "10.00", net_total: "8.85" }, discounts: {}, tax: { rate: 13 } }],
    related_docs: overrides.related_docs ?? null,
    store_id: 1,
    register_id: 1,
    ...overrides,
  };
}

describe("GetSummaryUseCase", () => {
  let gateway: FakeVendusGateway;
  let catalog: FakeProductCatalog;
  let useCase: GetSummaryUseCase;

  beforeEach(() => {
    gateway = new FakeVendusGateway();
    catalog = new FakeProductCatalog();
    useCase = new GetSummaryUseCase(gateway, catalog, EATZ_ID, CONCURRENCY);
  });

  it("returns documents and analytics for invoices only", async () => {
    gateway.setDocuments([makeListDoc(1), makeListDoc(2)]);
    gateway.setDetail(1, makeDetailDoc(1));
    gateway.setDetail(2, makeDetailDoc(2));

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    expect(result.documents).toHaveLength(2);
    expect(result.analytics.summary.totalDocuments).toBe(2);
    expect(result.analytics.summary.totalCreditNotes).toBe(0);
  });

  it("filters out FS that are cancelled by NC", async () => {
    gateway.setDocuments([
      makeListDoc(1, "FS", "FS 1/1"),
      makeListDoc(2, "FS", "FS 1/2"),
      makeListDoc(3, "NC", "NC 1/1"),
    ]);
    gateway.setDetail(1, makeDetailDoc(1, { number: "FS 1/1" }));
    gateway.setDetail(2, makeDetailDoc(2, { number: "FS 1/2" }));
    // NC cancels FS 1/1
    gateway.setDetail(3, makeDetailDoc(3, {
      type: "NC",
      number: "NC 1/1",
      related_docs: [{ id: 1, type: "FS", number: "FS 1/1" }],
    }));

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    // All 3 docs returned so cancelled FS is visible and linkable in the UI
    expect(result.documents).toHaveLength(3);
    const numbers = result.documents.map((d) => d.number);
    expect(numbers).toContain("FS 1/1");
    expect(numbers).toContain("FS 1/2");
    expect(numbers).toContain("NC 1/1");

    // But analytics exclude the same-period FS+NC pair
    expect(result.analytics.summary.totalDocuments).toBe(1); // only FS 1/2
    expect(result.analytics.summary.totalCreditNotes).toBe(0); // NC also excluded
  });

  it("assigns 'eatz' channel when Eatz payment present", async () => {
    gateway.setDocuments([makeListDoc(1)]);
    gateway.setDetail(1, makeDetailDoc(1, {
      payments: [{ id: EATZ_ID, title: "Eatz", amount: "10.00" }],
    }));

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    expect(result.documents[0]!.channel).toBe("eatz");
    expect(result.analytics.byChannel.find((c) => c.channel === "eatz")!.documentCount).toBe(1);
  });

  it("assigns 'salao' channel for regular payment", async () => {
    gateway.setDocuments([makeListDoc(1)]);
    gateway.setDetail(1, makeDetailDoc(1));

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    expect(result.documents[0]!.channel).toBe("salao");
  });

  it("returns empty result for empty period", async () => {
    gateway.setDocuments([]);

    const result = await useCase.execute({ since: "2026-08-01", until: "2026-08-01" });

    expect(result.documents).toHaveLength(0);
    expect(result.analytics.summary.totalDocuments).toBe(0);
    expect(result.analytics.summary.grossRevenue).toBe(0);
  });
});
