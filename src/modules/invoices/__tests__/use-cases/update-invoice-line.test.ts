import { UpdateInvoiceLineUseCase } from "../../application/use-cases/update-invoice-line.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import {
  InvoiceNotFoundError,
  InvoiceLineNotFoundError,
  LineDetailModeError,
  LinesTotalMismatchError,
} from "../../domain/errors.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_ID = mintOrganizationId("org-test");

const makeInvoice = (lineDetailMode: "simple" | "detailed" = "detailed") => {
  const inv = Invoice.create({
    supplierName: "Makro",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 10000,
    totalVat: 2300,
    totalWithVat: 12300,
  });
  return lineDetailMode === "detailed" ? inv.setLineDetailMode("detailed") : inv;
};

const makeLine = (invoiceId: string, overrides: Partial<{
  description: string;
  quantity: number;
  unitCostWithoutVat: number;
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
}> = {}) =>
  InvoiceLine.create({
    invoiceId,
    description: overrides.description ?? "Serviço de limpeza",
    quantity: overrides.quantity ?? 1,
    unitCostWithoutVat: overrides.unitCostWithoutVat ?? 10000,
    vatRate: overrides.vatRate ?? 23,
    vatAmount: overrides.vatAmount ?? 2300,
    totalWithVat: overrides.totalWithVat ?? 12300,
  });

describe("UpdateInvoiceLineUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let useCase: UpdateInvoiceLineUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    useCase = new UpdateInvoiceLineUseCase(invoiceRepo, lineRepo);
  });

  it("updates description of an existing line", async () => {
    const inv = makeInvoice();
    const line = makeLine(inv.id);
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [line]);

    const dto = await useCase.execute({
      organizationId: ORG_ID,
      invoiceId: inv.id,
      lineId: line.id,
      description: "Serviço de limpeza exterior",
    });

    expect(dto.description).toBe("Serviço de limpeza exterior");
    expect(dto.id).toBe(line.id);
  });

  it("updates quantity, unitCost, vatRate and totals", async () => {
    const inv = makeInvoice();
    const line = makeLine(inv.id);
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [line]);

    const dto = await useCase.execute({
      organizationId: ORG_ID,
      invoiceId: inv.id,
      lineId: line.id,
      quantity: 2,
      unitCostWithoutVat: 5000,
      vatRate: 23,
      vatAmount: 2300,
      totalWithVat: 12300,
    });

    expect(dto.quantity).toBe(2);
    expect(dto.unitCostWithoutVat).toBe(5000);
    expect(dto.totalWithVat).toBe(12300);
  });

  it("throws InvoiceNotFoundError when invoice does not exist", async () => {
    await expect(
      useCase.execute({ organizationId: ORG_ID, invoiceId: "nonexistent", lineId: "any" }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it("throws LineDetailModeError when invoice is in simple mode", async () => {
    const inv = makeInvoice("simple");
    const line = makeLine(inv.id);
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [line]);

    await expect(
      useCase.execute({ organizationId: ORG_ID, invoiceId: inv.id, lineId: line.id, description: "x" }),
    ).rejects.toThrow(LineDetailModeError);
  });

  it("throws InvoiceLineNotFoundError when line does not belong to invoice", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);
    // no lines saved

    await expect(
      useCase.execute({ organizationId: ORG_ID, invoiceId: inv.id, lineId: "nonexistent-line" }),
    ).rejects.toThrow(InvoiceLineNotFoundError);
  });

  it("throws LinesTotalMismatchError when updated total exceeds invoice total", async () => {
    const inv = makeInvoice();
    const line = makeLine(inv.id);
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [line]);

    // totalWithVat=99999 far exceeds invoice.totalWithVat=12300
    await expect(
      useCase.execute({
        organizationId: ORG_ID,
        invoiceId: inv.id,
        lineId: line.id,
        unitCostWithoutVat: 80000,
        vatAmount: 18400,
        totalWithVat: 98400,
      }),
    ).rejects.toThrow(LinesTotalMismatchError);
  });

  it("allows update within 1-cent tolerance", async () => {
    const inv = makeInvoice();
    const line = makeLine(inv.id);
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [line]);

    // totalWithVat=12301 is invoice total (12300) + 1 cent — within tolerance
    const dto = await useCase.execute({
      organizationId: ORG_ID,
      invoiceId: inv.id,
      lineId: line.id,
      vatAmount: 2301,
      totalWithVat: 12301,
    });

    expect(dto.totalWithVat).toBe(12301);
  });

  it("persists the updated line in the repository", async () => {
    const inv = makeInvoice();
    const line = makeLine(inv.id);
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [line]);

    await useCase.execute({
      organizationId: ORG_ID,
      invoiceId: inv.id,
      lineId: line.id,
      description: "Descrição actualizada",
    });

    const persisted = await lineRepo.findByInvoiceId(ORG_ID, inv.id);
    expect(persisted[0]?.description).toBe("Descrição actualizada");
  });

  // ── Validação simplificada (apenas totalWithVat) ──────────────────────────

  it("aceita update cujo vatAmount excederia o totalVat mas totalWithVat está dentro do limite", async () => {
    // Faturas importadas por IA: vatAmount e subtotalWithoutVat podem ter arredondamentos
    // diferentes dos totais cabeçalho — só totalWithVat é verificado.
    const inv = makeInvoice(); // totalWithVat=12300, totalVat=2300
    const line = makeLine(inv.id);
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [line]);

    // vatAmount=3000 excede invoice.totalVat=2300, mas totalWithVat=12300 está dentro do limite
    const dto = await useCase.execute({
      organizationId: ORG_ID,
      invoiceId: inv.id,
      lineId: line.id,
      vatAmount: 3000, // > invoice.totalVat
      totalWithVat: 12300,
    });

    expect(dto.vatAmount).toBe(3000);
    expect(dto.totalWithVat).toBe(12300);
  });
});
