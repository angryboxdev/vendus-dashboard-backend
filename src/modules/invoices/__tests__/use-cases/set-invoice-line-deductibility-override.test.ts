import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { SetInvoiceLineDeductibilityOverrideUseCase } from "../../application/use-cases/set-invoice-line-deductibility-override.use-case.js";
import { InvoiceLineNotFoundError } from "../../domain/errors.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";

const ORG = mintOrganizationId("org-test");

describe("SetInvoiceLineDeductibilityOverrideUseCase", () => {
  it("aplica o override quando a percentagem e o motivo são dados", async () => {
    const lineRepo = new FakeInvoiceLineRepository();
    const line = InvoiceLine.create({
      invoiceId: "inv-1",
      description: "Compra",
      quantity: 1,
      unitCostWithoutVat: 1000,
      vatRate: 23,
      vatAmount: 230,
      totalWithVat: 1230,
    });
    await lineRepo.saveAll(ORG, [line]);
    const useCase = new SetInvoiceLineDeductibilityOverrideUseCase(lineRepo);

    const dto = await useCase.execute({
      organizationId: ORG,
      invoiceId: "inv-1",
      lineId: line.id,
      deductiblePercentage: 50,
      deductibilityOverrideReason: "Uso misto",
    });

    expect(dto.deductiblePercentage).toBe(50);
    expect(dto.deductibilityOverrideReason).toBe("Uso misto");
  });

  it("percentage: null remove o override e volta a usar a sugestão da subcategoria", async () => {
    const lineRepo = new FakeInvoiceLineRepository();
    const line = InvoiceLine.create({
      invoiceId: "inv-1",
      description: "Compra",
      quantity: 1,
      unitCostWithoutVat: 1000,
      vatRate: 23,
      vatAmount: 230,
      totalWithVat: 1230,
    }).applyDeductibilityOverride(50, "Uso misto");
    await lineRepo.saveAll(ORG, [line]);
    const useCase = new SetInvoiceLineDeductibilityOverrideUseCase(lineRepo);

    const dto = await useCase.execute({
      organizationId: ORG,
      invoiceId: "inv-1",
      lineId: line.id,
      deductiblePercentage: null,
      deductibilityOverrideReason: null,
    });

    expect(dto.deductiblePercentage).toBeNull();
    expect(dto.deductibilityOverrideReason).toBeNull();
  });

  it("lança InvoiceLineNotFoundError quando a linha não existe", async () => {
    const lineRepo = new FakeInvoiceLineRepository();
    const useCase = new SetInvoiceLineDeductibilityOverrideUseCase(lineRepo);
    await expect(
      useCase.execute({
        organizationId: ORG,
        invoiceId: "inv-1",
        lineId: "missing",
        deductiblePercentage: 50,
        deductibilityOverrideReason: "x",
      }),
    ).rejects.toThrow(InvoiceLineNotFoundError);
  });
});
