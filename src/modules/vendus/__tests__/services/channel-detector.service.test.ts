import { detectChannel } from "../../domain/services/channel-detector.service.js";
import type { VendusDetailedDocumentRaw } from "../../domain/entities/vendus-document.js";

const EATZ_ID = 275787588;

function makeDoc(
  payments: Array<{ id: number; title: string; amount: string }>,
  itemTitles: string[] = [],
): VendusDetailedDocumentRaw {
  return {
    id: 1,
    type: "FS",
    number: "FS 1/1",
    date: "2026-08-01",
    system_time: "2026-08-01 12:00:00",
    amount_gross: "10.00",
    amount_net: "8.85",
    taxes: [],
    discounts: { total: "0.00" },
    payments,
    client: { name: "", fiscal_id: "" },
    items: itemTitles.map((title, i) => ({
      id: i,
      qty: 1,
      title,
      reference: "",
      amounts: {},
      discounts: {},
      tax: {},
    })),
    related_docs: null,
    store_id: 1,
    register_id: 1,
  };
}

describe("detectChannel", () => {
  it("returns 'eatz' when Eatz payment is present", () => {
    const doc = makeDoc([{ id: EATZ_ID, title: "Eatz", amount: "10.00" }]);
    expect(detectChannel(doc, EATZ_ID)).toBe("eatz");
  });

  it("returns 'salao' for Multibanco payment without embalagem", () => {
    const doc = makeDoc([{ id: 275787585, title: "Multibanco", amount: "10.00" }]);
    expect(detectChannel(doc, EATZ_ID)).toBe("salao");
  });

  it("returns 'salao' for Dinheiro payment without embalagem", () => {
    const doc = makeDoc([{ id: 275787584, title: "Dinheiro", amount: "10.00" }]);
    expect(detectChannel(doc, EATZ_ID)).toBe("salao");
  });

  it("returns 'take_away' for non-Eatz payment with embalagem item", () => {
    const doc = makeDoc(
      [{ id: 275787585, title: "Multibanco", amount: "10.00" }],
      ["Honey Pepperoni (Grande)", "Embalagem Take-Away"],
    );
    expect(detectChannel(doc, EATZ_ID)).toBe("take_away");
  });

  it("returns 'eatz' even when embalagem present — Eatz takes priority", () => {
    const doc = makeDoc(
      [{ id: EATZ_ID, title: "Eatz", amount: "10.00" }],
      ["Honey Pepperoni (Grande)", "Embalagem Take-Away"],
    );
    expect(detectChannel(doc, EATZ_ID)).toBe("eatz");
  });

  it("returns 'salao' for empty payments and no embalagem", () => {
    const doc = makeDoc([]);
    expect(detectChannel(doc, EATZ_ID)).toBe("salao");
  });

  it("returns 'salao' for multiple non-Eatz payments", () => {
    const doc = makeDoc([
      { id: 275787584, title: "Dinheiro", amount: "5.00" },
      { id: 275787585, title: "Multibanco", amount: "5.00" },
    ]);
    expect(detectChannel(doc, EATZ_ID)).toBe("salao");
  });
});
