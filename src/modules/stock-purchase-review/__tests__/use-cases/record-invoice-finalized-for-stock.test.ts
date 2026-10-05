import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { RecordInvoiceFinalizedForStockUseCase } from "../../application/use-cases/record-invoice-finalized-for-stock.use-case.js";
import { FakeStockMovementWrite } from "../fakes/fake-stock-movement-write.js";
import { FakeCostCenterCategoryRead } from "../fakes/fake-cost-center-category-read.js";
import { FakeSupplierRead } from "../fakes/fake-supplier-read.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const stockMovementWrite = new FakeStockMovementWrite();
  const categoryRead = new FakeCostCenterCategoryRead();
  const supplierRead = new FakeSupplierRead();
  const useCase = new RecordInvoiceFinalizedForStockUseCase(stockMovementWrite, categoryRead, supplierRead);
  return { stockMovementWrite, categoryRead, supplierRead, useCase };
}

function baseCommand() {
  return {
    organizationId: ORG,
    invoiceId: "inv-1",
    invoiceNumber: "FT 1",
    invoiceDate: "2026-09-20",
    supplierId: "sup-1",
    supplierName: "Makro",
    supplierNif: "123456789",
    override: "auto" as const,
    overrideReason: null,
    lines: [
      {
        id: "line-1",
        description: "Mozzarella",
        quantity: 2,
        unit: "un",
        unitCostWithoutVat: 10,
        totalWithVat: 24.6,
        costCenterCategoryId: "cat-cmv",
        locationId: null,
      },
    ],
    actor: null,
  };
}

describe("RecordInvoiceFinalizedForStockUseCase", () => {
  it("categoria CREATE_REVIEW cria a revisão", async () => {
    const { categoryRead, stockMovementWrite, useCase } = makeUseCase();
    categoryRead.policies.set("cat-cmv", "CREATE_REVIEW");

    await useCase.execute(baseCommand());

    expect(stockMovementWrite.calls).toHaveLength(1);
    expect(stockMovementWrite.calls[0]?.decisionSource).toBe("category");
  });

  it("categoria NO_STOCK_EFFECT nunca cria revisão (fatura só-serviço)", async () => {
    const { categoryRead, stockMovementWrite, useCase } = makeUseCase();
    categoryRead.policies.set("cat-cmv", "NO_STOCK_EFFECT");

    await useCase.execute(baseCommand());

    expect(stockMovementWrite.calls).toHaveLength(0);
  });

  it("chamar duas vezes para a mesma fatura nunca cria uma segunda revisão (retry idempotente)", async () => {
    const { categoryRead, stockMovementWrite, useCase } = makeUseCase();
    categoryRead.policies.set("cat-cmv", "CREATE_REVIEW");

    await useCase.execute(baseCommand());
    await useCase.execute(baseCommand());

    expect(stockMovementWrite.calls).toHaveLength(2); // ambas as chamadas de decisão acontecem…
    // …mas o adapter (fake, simulando ON CONFLICT DO NOTHING) devolve o mesmo reviewId para as duas.
    const result1 = await stockMovementWrite.createReviewFromInvoice(ORG, stockMovementWrite.calls[0]!);
    const result2 = await stockMovementWrite.createReviewFromInvoice(ORG, stockMovementWrite.calls[1]!);
    expect(result1.reviewId).toBe(result2.reviewId);
  });

  it("categoria UNDEFINED + fornecedor sem preferência fica unresolved, mas a revisão é criada (não gera movimento sozinha)", async () => {
    const { stockMovementWrite, useCase } = makeUseCase();
    await useCase.execute(baseCommand());
    expect(stockMovementWrite.calls).toHaveLength(1);
    expect(stockMovementWrite.calls[0]?.decisionSource).toBe("unresolved");
  });

  it("fatura sem linhas (lineDetailMode=simple) nunca cria revisão — mesmo com override force_create", async () => {
    const { categoryRead, stockMovementWrite, useCase } = makeUseCase();
    categoryRead.policies.set("cat-cmv", "CREATE_REVIEW");

    await useCase.execute({ ...baseCommand(), override: "force_create", lines: [] });

    expect(stockMovementWrite.calls).toHaveLength(0);
  });

  it("mistura de categorias (mercadoria + serviço) ainda gera 1 revisão com todas as linhas", async () => {
    const { categoryRead, stockMovementWrite, useCase } = makeUseCase();
    categoryRead.policies.set("cat-cmv", "CREATE_REVIEW");
    categoryRead.policies.set("cat-servico", "NO_STOCK_EFFECT");

    await useCase.execute({
      ...baseCommand(),
      lines: [
        ...baseCommand().lines,
        {
          id: "line-2",
          description: "Transporte",
          quantity: 1,
          unit: "un",
          unitCostWithoutVat: 5,
          totalWithVat: 6.15,
          costCenterCategoryId: "cat-servico",
          locationId: null,
        },
      ],
    });

    expect(stockMovementWrite.calls).toHaveLength(1);
    expect(stockMovementWrite.calls[0]?.lines).toHaveLength(2);
  });
});
