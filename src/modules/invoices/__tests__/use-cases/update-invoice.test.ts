import { UpdateInvoiceUseCase } from "../../application/use-cases/update-invoice.use-case.js";
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

describe("UpdateInvoiceUseCase", () => {
  let repo: FakeInvoiceRepository;
  let useCase: UpdateInvoiceUseCase;

  beforeEach(() => {
    repo = new FakeInvoiceRepository();
    useCase = new UpdateInvoiceUseCase(repo);
  });

  it("actualiza o nome do fornecedor", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({ id: inv.id, supplierName: "EDP" });
    expect(dto.supplierName).toBe("EDP");
  });

  it("actualiza número e data de fatura", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({
      id: inv.id,
      invoiceNumber: "MKR-002",
      invoiceDate: "2026-07-01",
    });
    expect(dto.invoiceNumber).toBe("MKR-002");
    expect(dto.invoiceDate).toBe("2026-07-01");
  });

  it("actualiza valores monetários", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({
      id: inv.id,
      subtotalWithoutVat: 200000,
      totalVat: 46000,
      totalWithVat: 246000,
    });
    expect(dto.subtotalWithoutVat).toBe(200000);
    expect(dto.totalVat).toBe(46000);
    expect(dto.totalWithVat).toBe(246000);
  });

  it("persiste a alteração no repositório", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    await useCase.execute({ id: inv.id, supplierName: "NOS" });

    const saved = await repo.findById(inv.id);
    expect(saved!.supplierName).toBe("NOS");
  });

  it("actualiza supplierNifSnapshot", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({ id: inv.id, supplierNifSnapshot: "500123456" });
    expect(dto.supplierNifSnapshot).toBe("500123456");
  });

  it("actualiza costCenterGroupId e financialType", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({
      id: inv.id,
      costCenterGroupId: "grp-ops",
      financialType: "fixed_opex",
    });
    expect(dto.costCenterGroupId).toBe("grp-ops");
    expect(dto.financialType).toBe("fixed_opex");
  });

  it("actualiza flags financeiras (affectsDre, affectsCashflow, affectsProfitability)", async () => {
    const inv = makeInvoice();
    await repo.save(inv);

    const dto = await useCase.execute({
      id: inv.id,
      affectsDre: false,
      affectsCashflow: false,
      affectsProfitability: false,
    });
    expect(dto.affectsDre).toBe(false);
    expect(dto.affectsCashflow).toBe(false);
    expect(dto.affectsProfitability).toBe(false);
  });

  it("lança InvoiceNotFoundError para id inexistente", async () => {
    await expect(
      useCase.execute({ id: "nao-existe", supplierName: "X" }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });
});
