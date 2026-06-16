import { SetInvoiceStatusUseCase } from "../../application/use-cases/set-invoice-status.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";

const makeInvoice = () =>
  Invoice.create({
    supplierName: "EDP",
    invoiceNumber: "EDP-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 85000,
    totalVat: 5100,
    totalWithVat: 90100,
  });

describe("SetInvoiceStatusUseCase", () => {
  let repo: FakeInvoiceRepository;
  let useCase: SetInvoiceStatusUseCase;

  beforeEach(() => {
    repo = new FakeInvoiceRepository();
    useCase = new SetInvoiceStatusUseCase(repo);
  });

  it("muda estado para overdue", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({ id: inv.id, status: "overdue" });
    expect(dto.status).toBe("overdue");
  });

  it("muda estado para review", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({ id: inv.id, status: "review" });
    expect(dto.status).toBe("review");
  });

  it("muda estado para cancelled", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({ id: inv.id, status: "cancelled" });
    expect(dto.status).toBe("cancelled");
  });

  it("persiste o novo estado no repositório", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    await useCase.execute({ id: inv.id, status: "overdue" });

    const saved = await repo.findById(inv.id);
    expect(saved!.status).toBe("overdue");
  });

  it("lança InvoiceNotFoundError para id inexistente", async () => {
    await expect(
      useCase.execute({ id: "nao-existe", status: "overdue" }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });
});
