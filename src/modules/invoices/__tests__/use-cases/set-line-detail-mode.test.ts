import { SetLineDetailModeUseCase } from "../../application/use-cases/set-line-detail-mode.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_ID = mintOrganizationId("org-test");

const makeInvoice = () =>
  Invoice.create({
    supplierName: "Makro",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 100000,
    totalVat: 23000,
    totalWithVat: 123000,
  });

const makeLine = (invoiceId: string) =>
  InvoiceLine.create({ invoiceId, description: "Linha teste", quantity: 1, unitCostWithoutVat: 100000, vatRate: 23, vatAmount: 23000, totalWithVat: 123000 });

describe("SetLineDetailModeUseCase (F2 §2.2: trocar de modo preserva as linhas)", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let useCase: SetLineDetailModeUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    useCase = new SetLineDetailModeUseCase(invoiceRepo);
  });

  it("troca entre «Única», «Por artigo» e «Por valores»", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);
    expect((await useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "detailed" })).lineDetailMode).toBe("detailed");
    expect((await useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "by_values" })).financialMode).toBe("by_values");
    expect((await useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "simple" })).financialMode).toBe("single");
  });

  it("voltar a «Única» já não apaga as linhas reais do documento", async () => {
    const inv = makeInvoice().setLineDetailMode("detailed");
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [makeLine(inv.id)]);
    await useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "simple" });
    expect(await lineRepo.findByInvoiceId(ORG_ID, inv.id)).toHaveLength(1);
  });

  it("recusa modo inválido e fatura inexistente", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);
    await expect(useCase.execute({ organizationId: ORG_ID, id: inv.id, mode: "mixed" as never })).rejects.toThrow(/Modo inválido/);
    await expect(useCase.execute({ organizationId: ORG_ID, id: "nope", mode: "simple" })).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });
});
