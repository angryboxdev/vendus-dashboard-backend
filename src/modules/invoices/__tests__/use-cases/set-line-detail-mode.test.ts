import { SetLineDetailModeUseCase } from "../../application/use-cases/set-line-detail-mode.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";

const makeInvoice = () =>
  Invoice.create({
    supplierName: "Makro",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 100000,
    totalVat: 23000,
    totalWithVat: 123000,
  });

describe("SetLineDetailModeUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let useCase: SetLineDetailModeUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    useCase = new SetLineDetailModeUseCase(invoiceRepo);
  });

  it("switches invoice from simple to detailed mode", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(inv);

    const dto = await useCase.execute({ id: inv.id, mode: "detailed" });
    expect(dto.lineDetailMode).toBe("detailed");
  });

  it("switches invoice from detailed back to simple mode", async () => {
    const inv = makeInvoice().setLineDetailMode("detailed");
    await invoiceRepo.save(inv);

    const dto = await useCase.execute({ id: inv.id, mode: "simple" });
    expect(dto.lineDetailMode).toBe("simple");
  });

  it("throws InvoiceNotFoundError when invoice does not exist", async () => {
    await expect(useCase.execute({ id: "nonexistent", mode: "detailed" })).rejects.toThrow(InvoiceNotFoundError);
  });
});
