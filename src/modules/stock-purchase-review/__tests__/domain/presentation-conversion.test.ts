import { invoiceLineToStock, orderForNeed, unitFactor, type PresentationShape } from "../../domain/services/presentation-conversion.service.js";
import { PurchasePresentation } from "../../domain/entities/purchase-presentation.js";
import { InvalidPurchasePresentationError } from "../../domain/errors.js";

// Casos da task «embalagens e conversões» (fatura Dream Plus FT 56892).
const mozzarella: PresentationShape = { packageUnit: "saco", contentQuantity: 2.5, contentUnit: "kg", invoicedBy: "content", minOrderPackages: 1, orderIncrementPackages: 1 };
const tomate: PresentationShape = { packageUnit: "saco", contentQuantity: 5, contentUnit: "kg", invoicedBy: "package", minOrderPackages: 1, orderIncrementPackages: 1 };

describe("apresentação de compra — fatura → Stock", () => {
  test("mozzarella faturada em kg (20 kg, 111,60 €), saco de 2,5 kg, artigo em g → 8 sacos, +20 000 g, 5,58 €/kg, 13,95 €/saco, 0,00558 €/g", () => {
    expect(invoiceLineToStock(mozzarella, 20, 11160, "g")).toEqual({
      conversionFactor: 1000, stockQuantity: 20000, packages: 8, netCostPerBaseUnit: 0.558, netCostPerContentUnit: 558, netCostPerPackage: 1395,
    });
  });

  test("tomate faturado em sacos («4,000» = 4 sacos, 38,45 €), saco de 5 kg, artigo em kg → +20 kg, 1,9225 €/kg", () => {
    expect(invoiceLineToStock(tomate, 4, 3845, "kg")).toMatchObject({ conversionFactor: 5, stockQuantity: 20, packages: 4, netCostPerBaseUnit: 192.25, netCostPerContentUnit: 192.25, netCostPerPackage: 961.25 });
    expect(invoiceLineToStock(tomate, 4, 3845, "g")).toMatchObject({ conversionFactor: 5000, stockQuantity: 20000 });
  });

  test("sem embalagem (ao peso): kg → g sem sacos", () => {
    expect(invoiceLineToStock({ ...mozzarella, packageUnit: null }, 5, 3895, "g")).toMatchObject({ conversionFactor: 1000, stockQuantity: 5000, packages: null, netCostPerPackage: null });
  });

  test("dimensões diferentes (kg → L, kg → un) → por configurar (null), nunca um fator inventado", () => {
    expect(invoiceLineToStock(mozzarella, 20, 11160, "l")).toBeNull();
    expect(invoiceLineToStock(mozzarella, 20, 11160, "un")).toBeNull();
    expect(unitFactor("cl", "ml")).toBe(10);
    expect(unitFactor("kg", "ml")).toBeNull();
  });
});

describe("apresentação de compra — necessidade → encomenda (P2)", () => {
  test.each([
    [12, 5, 12.5, 0.5],
    [0.5, 1, 2.5, 2],
    [10, 4, 10, 0],
    [20, 8, 20, 0],
    [0, 0, 0, 0],
  ])("preciso de %s kg → %s sacos (%s kg, excedente %s kg)", (need, packages, qty, surplus) => {
    expect(orderForNeed(mozzarella, need, "kg")).toEqual({ packages, quantityBase: qty, surplusBase: surplus });
  });

  test("artigo em g: 12 000 g → 5 sacos (12 500 g); mínimo e incremento respeitados", () => {
    expect(orderForNeed(mozzarella, 12000, "g")).toEqual({ packages: 5, quantityBase: 12500, surplusBase: 500 });
    expect(orderForNeed({ ...mozzarella, minOrderPackages: 4, orderIncrementPackages: 2 }, 2, "kg")).toMatchObject({ packages: 4 });
    expect(orderForNeed({ ...mozzarella, orderIncrementPackages: 2 }, 12, "kg")).toMatchObject({ packages: 6, quantityBase: 15 });
  });
});

describe("PurchasePresentation", () => {
  const base = { organizationId: "o", supplierId: "s", supplierReference: "44641004", description: "Q. Mozzarella ralado 100% Eurial kg", stockItemId: "i", source: "user" as const };

  test("chave pela referência do fornecedor, senão pela descrição", () => {
    expect(PurchasePresentation.matchKey("44641004", "q. mozzarella")).toBe("ref:44641004");
    expect(PurchasePresentation.matchKey(null, "q. mozzarella")).toBe("desc:q. mozzarella");
  });

  test("validações: conteúdo positivo; sem embalagem a fatura não pode contar embalagens; mínimo/incremento positivos", () => {
    expect(PurchasePresentation.create({ ...base, packageUnit: " Saco ", contentQuantity: 2.5, contentUnit: "kg", invoicedBy: "content" }).toProps()).toMatchObject({ packageUnit: "saco", minOrderPackages: 1, orderIncrementPackages: 1 });
    expect(() => PurchasePresentation.create({ ...base, packageUnit: "saco", contentQuantity: 0, contentUnit: "kg", invoicedBy: "content" })).toThrow(InvalidPurchasePresentationError);
    expect(() => PurchasePresentation.create({ ...base, packageUnit: null, contentQuantity: 1, contentUnit: "kg", invoicedBy: "package" })).toThrow(/sem embalagem/);
    expect(() => PurchasePresentation.create({ ...base, packageUnit: "saco", contentQuantity: 1, contentUnit: "kg", invoicedBy: "content", orderIncrementPackages: 0 })).toThrow(/incremento/);
  });
});
