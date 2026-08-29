import { ListInvoicesUseCase } from "../../application/use-cases/list-invoices.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeCostCenterCategoryReader } from "../fakes/fake-cost-center-category-reader.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_ID = mintOrganizationId("org-test");

const CAT_A = { id: "cat-a", code: "OPD.01", name: "CMV / Ingredientes", financialType: "opex" };

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
  let categoryReader: FakeCostCenterCategoryReader;
  let useCase: ListInvoicesUseCase;

  beforeEach(() => {
    repo = new FakeInvoiceRepository();
    categoryReader = new FakeCostCenterCategoryReader();
    categoryReader.seedLookup(CAT_A);
    useCase = new ListInvoicesUseCase(repo, categoryReader);
  });

  it("retorna lista vazia quando não há faturas", async () => {
    const result = await useCase.execute(ORG_ID);
    expect(result).toHaveLength(0);
  });

  it("retorna todas as faturas sem filtro", async () => {
    await repo.save(ORG_ID,makeInvoice({ invoiceNumber: "MKR-001" }));
    await repo.save(ORG_ID,makeInvoice({ invoiceNumber: "MKR-002" }));
    const result = await useCase.execute(ORG_ID);
    expect(result).toHaveLength(2);
  });

  it("filtra por status", async () => {
    const pending = makeInvoice({ invoiceNumber: "P-001" });
    const paid = makeInvoice({ invoiceNumber: "P-002" }).markPaid(new Date("2026-06-10"));
    await repo.save(ORG_ID,pending);
    await repo.save(ORG_ID,paid);

    const result = await useCase.execute(ORG_ID, { status: "paid" });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe("paid");
  });

  it("filtra por supplierId", async () => {
    const inv1 = makeInvoice({ supplierId: "sup-1", invoiceNumber: "S1-001" });
    const inv2 = makeInvoice({ supplierId: "sup-2", invoiceNumber: "S2-001" });
    await repo.save(ORG_ID,inv1);
    await repo.save(ORG_ID,inv2);

    const result = await useCase.execute(ORG_ID, { supplierId: "sup-1" });
    expect(result).toHaveLength(1);
    expect(result[0]!.supplierId).toBe("sup-1");
  });

  it("filtra por intervalo de datas", async () => {
    const jan = makeInvoice({ invoiceNumber: "JAN", invoiceDate: new Date("2026-01-15") });
    const jun = makeInvoice({ invoiceNumber: "JUN", invoiceDate: new Date("2026-06-15") });
    await repo.save(ORG_ID,jan);
    await repo.save(ORG_ID,jun);

    const result = await useCase.execute(ORG_ID, { from: "2026-06-01", to: "2026-06-30" });
    expect(result).toHaveLength(1);
    expect(result[0]!.invoiceNumber).toBe("JUN");
  });

  it("filtra por search — nome do fornecedor (case-insensitive)", async () => {
    await repo.save(ORG_ID,makeInvoice({ invoiceNumber: "EDP-001", supplierName: "EDP Comercial" }));
    await repo.save(ORG_ID,makeInvoice({ invoiceNumber: "MKR-001", supplierName: "Makro Portugal" }));

    const result = await useCase.execute(ORG_ID, { search: "edp" });
    expect(result).toHaveLength(1);
    expect(result[0]!.supplierName).toBe("EDP Comercial");
  });

  it("filtra por search — número de fatura", async () => {
    await repo.save(ORG_ID,makeInvoice({ invoiceNumber: "FAT-2026-001", supplierName: "Makro" }));
    await repo.save(ORG_ID,makeInvoice({ invoiceNumber: "FAT-2026-002", supplierName: "EDP" }));

    const result = await useCase.execute(ORG_ID, { search: "FAT-2026-001" });
    expect(result).toHaveLength(1);
    expect(result[0]!.invoiceNumber).toBe("FAT-2026-001");
  });

  it("search sem correspondência devolve lista vazia", async () => {
    await repo.save(ORG_ID,makeInvoice({ invoiceNumber: "MKR-001", supplierName: "Makro" }));

    const result = await useCase.execute(ORG_ID, { search: "xyz-inexistente" });
    expect(result).toHaveLength(0);
  });

  it("retorna DTOs com campos correctos", async () => {
    const inv = makeInvoice({ invoiceNumber: "TEST-001", supplierName: "EDP" });
    await repo.save(ORG_ID,inv);

    const [dto] = await useCase.execute(ORG_ID);
    expect(dto!.invoiceNumber).toBe("TEST-001");
    expect(dto!.supplierName).toBe("EDP");
    expect(dto!.totalWithVat).toBe(123000);
    expect(dto!.status).toBe("pending");
  });

  // ── classificationSummary ────────────────────────────────────────────────────

  it("classificationSummary mode=none quando fatura não tem categoria", async () => {
    await repo.save(ORG_ID,makeInvoice({ invoiceNumber: "X-001" }));
    const [dto] = await useCase.execute(ORG_ID);
    expect(dto!.classificationSummary.mode).toBe("none");
    expect(dto!.classificationSummary.entries).toHaveLength(0);
  });

  it("classificationSummary mode=unique com code e name corretos quando fatura tem categoria", async () => {
    await repo.save(ORG_ID,makeInvoice({ invoiceNumber: "X-002", costCenterCategoryId: CAT_A.id }));
    const [dto] = await useCase.execute(ORG_ID);
    expect(dto!.classificationSummary.mode).toBe("unique");
    expect(dto!.classificationSummary.entries).toHaveLength(1);
    expect(dto!.classificationSummary.entries[0]!.code).toBe("OPD.01");
    expect(dto!.classificationSummary.entries[0]!.name).toBe("CMV / Ingredientes");
    expect(dto!.classificationSummary.entries[0]!.totalWithVat).toBe(123000);
  });

  it("faz uma única chamada a findManyByIds mesmo com múltiplas faturas da mesma categoria", async () => {
    await repo.save(ORG_ID,makeInvoice({ invoiceNumber: "X-003", costCenterCategoryId: CAT_A.id }));
    await repo.save(ORG_ID,makeInvoice({ invoiceNumber: "X-004", costCenterCategoryId: CAT_A.id }));
    const spy = jest.spyOn(categoryReader, "findManyByIds");
    await useCase.execute(ORG_ID);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(ORG_ID, [CAT_A.id]); // IDs deduplicados
  });

  it("não chama findManyByIds quando nenhuma fatura tem categoria", async () => {
    await repo.save(ORG_ID,makeInvoice({ invoiceNumber: "X-005" }));
    const spy = jest.spyOn(categoryReader, "findManyByIds");
    await useCase.execute(ORG_ID);
    expect(spy).not.toHaveBeenCalled();
  });
});
