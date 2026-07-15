import { ListInvoicesUseCase } from "../../application/use-cases/list-invoices.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";

const makeInvoice = (overrides: Partial<Parameters<typeof Invoice.create>[0]> = {}) =>
  Invoice.create({
    supplierName: "Makro",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 100000,
    totalVat: 23000,
    totalWithVat: 123000,
    ...overrides,
  });

describe("ListInvoicesUseCase", () => {
  let repo: FakeInvoiceRepository;
  let useCase: ListInvoicesUseCase;

  beforeEach(() => {
    repo = new FakeInvoiceRepository();
    useCase = new ListInvoicesUseCase(repo);
  });

  it("retorna lista vazia quando não há faturas", async () => {
    const result = await useCase.execute();
    expect(result).toHaveLength(0);
  });

  it("retorna todas as faturas sem filtro", async () => {
    await repo.save(makeInvoice({ invoiceNumber: "MKR-001" }));
    await repo.save(makeInvoice({ invoiceNumber: "MKR-002" }));
    const result = await useCase.execute();
    expect(result).toHaveLength(2);
  });

  it("filtra por status", async () => {
    const pending = makeInvoice({ invoiceNumber: "P-001" });
    const paid = makeInvoice({ invoiceNumber: "P-002" }).markPaid(new Date("2026-06-10"));
    await repo.save(pending);
    await repo.save(paid);

    const result = await useCase.execute({ status: "paid" });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe("paid");
  });

  it("filtra por supplierId", async () => {
    const inv1 = makeInvoice({ supplierId: "sup-1", invoiceNumber: "S1-001" });
    const inv2 = makeInvoice({ supplierId: "sup-2", invoiceNumber: "S2-001" });
    await repo.save(inv1);
    await repo.save(inv2);

    const result = await useCase.execute({ supplierId: "sup-1" });
    expect(result).toHaveLength(1);
    expect(result[0]!.supplierId).toBe("sup-1");
  });

  it("filtra por intervalo de datas", async () => {
    const jan = makeInvoice({ invoiceNumber: "JAN", invoiceDate: new Date("2026-01-15") });
    const jun = makeInvoice({ invoiceNumber: "JUN", invoiceDate: new Date("2026-06-15") });
    await repo.save(jan);
    await repo.save(jun);

    const result = await useCase.execute({ from: "2026-06-01", to: "2026-06-30" });
    expect(result).toHaveLength(1);
    expect(result[0]!.invoiceNumber).toBe("JUN");
  });

  it("filtra por search — nome do fornecedor (case-insensitive)", async () => {
    await repo.save(makeInvoice({ invoiceNumber: "EDP-001", supplierName: "EDP Comercial" }));
    await repo.save(makeInvoice({ invoiceNumber: "MKR-001", supplierName: "Makro Portugal" }));

    const result = await useCase.execute({ search: "edp" });
    expect(result).toHaveLength(1);
    expect(result[0]!.supplierName).toBe("EDP Comercial");
  });

  it("filtra por search — número de fatura", async () => {
    await repo.save(makeInvoice({ invoiceNumber: "FAT-2026-001", supplierName: "Makro" }));
    await repo.save(makeInvoice({ invoiceNumber: "FAT-2026-002", supplierName: "EDP" }));

    const result = await useCase.execute({ search: "FAT-2026-001" });
    expect(result).toHaveLength(1);
    expect(result[0]!.invoiceNumber).toBe("FAT-2026-001");
  });

  it("search sem correspondência devolve lista vazia", async () => {
    await repo.save(makeInvoice({ invoiceNumber: "MKR-001", supplierName: "Makro" }));

    const result = await useCase.execute({ search: "xyz-inexistente" });
    expect(result).toHaveLength(0);
  });

  it("retorna DTOs com campos correctos", async () => {
    const inv = makeInvoice({ invoiceNumber: "TEST-001", supplierName: "EDP" });
    await repo.save(inv);

    const [dto] = await useCase.execute();
    expect(dto!.invoiceNumber).toBe("TEST-001");
    expect(dto!.supplierName).toBe("EDP");
    expect(dto!.totalWithVat).toBe(123000);
    expect(dto!.status).toBe("pending");
  });
});
