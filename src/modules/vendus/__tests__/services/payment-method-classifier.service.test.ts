import { classifyPayment } from "../../domain/services/payment-method-classifier.service.js";

const IDS = { eatz: 900, apps: 901 };

describe("classifyPayment", () => {
  it("usa os IDs configurados de Eatz e Apps", () => {
    expect(classifyPayment({ id: 900, title: "Qualquer" }, IDS)).toBe("eatz");
    expect(classifyPayment({ id: 901, title: "Qualquer" }, IDS)).toBe("apps");
  });

  it.each([
    ["Numerário", "cash"],
    ["Dinheiro", "cash"],
    ["Multibanco", "card"],
    ["TPA", "card"],
    ["Cartão de Crédito", "card"],
    ["Visa", "card"],
    ["MB Way", "other"],
    ["Transferência Bancária", "other"],
    ["Eatz", "eatz"],
  ] as const)("«%s» → %s", (title, kind) => {
    expect(classifyPayment({ id: 1, title }, IDS)).toBe(kind);
  });

  it("sem IDs classifica só pelo título", () => {
    expect(classifyPayment({ id: 900, title: "Numerário" })).toBe("cash");
  });
});
