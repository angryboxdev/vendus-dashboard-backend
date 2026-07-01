import { ProcessDirectDebitsUseCase } from "../../application/use-cases/process-direct-debits.use-case.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";

function makeDirectDebitInvoice(overrides: {
  directDebitDate: Date;
  status?: "pending" | "paid" | "cancelled" | "overdue";
}): Invoice {
  const inv = Invoice.create({
    supplierName: "EDP Comercial",
    invoiceNumber: `DD-${Math.random()}`,
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 85000,
    totalVat: 5100,
    totalWithVat: 90100,
    isDirectDebit: true,
    directDebitDate: overrides.directDebitDate,
  });
  if (overrides.status && overrides.status !== "pending") {
    return inv.setStatus(overrides.status);
  }
  return inv;
}

describe("ProcessDirectDebitsUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let payableWrite: FakePayableEntryWrite;
  let useCase: ProcessDirectDebitsUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    payableWrite = new FakePayableEntryWrite();
    useCase = new ProcessDirectDebitsUseCase(invoiceRepo, payableWrite);
  });

  it("processa faturas com directDebitDate <= hoje e status não paid/cancelled", async () => {
    const past = makeDirectDebitInvoice({ directDebitDate: new Date("2026-06-15") });
    await invoiceRepo.save(past);

    const result = await useCase.execute();

    expect(result.processed).toBe(1);
    const updated = await invoiceRepo.findById(past.id);
    expect(updated?.status).toBe("paid");
    expect(updated?.paidAt?.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("não processa faturas com directDebitDate no futuro", async () => {
    const future = makeDirectDebitInvoice({ directDebitDate: new Date("2099-01-01") });
    await invoiceRepo.save(future);

    const result = await useCase.execute();

    expect(result.processed).toBe(0);
    const unchanged = await invoiceRepo.findById(future.id);
    expect(unchanged?.status).toBe("pending");
  });

  it("não processa faturas já pagas", async () => {
    const paid = makeDirectDebitInvoice({ directDebitDate: new Date("2026-06-01"), status: "paid" });
    await invoiceRepo.save(paid);

    const result = await useCase.execute();

    expect(result.processed).toBe(0);
  });

  it("não processa faturas canceladas", async () => {
    const cancelled = makeDirectDebitInvoice({ directDebitDate: new Date("2026-06-01"), status: "cancelled" });
    await invoiceRepo.save(cancelled);

    const result = await useCase.execute();

    expect(result.processed).toBe(0);
  });

  it("sincroniza payable entry ao processar cada fatura", async () => {
    const inv = makeDirectDebitInvoice({ directDebitDate: new Date("2026-06-20") });
    await invoiceRepo.save(inv);

    await useCase.execute();

    expect(payableWrite.markedPaid).toHaveLength(1);
    expect(payableWrite.markedPaid[0]!.invoiceId).toBe(inv.id);
    expect(payableWrite.markedPaid[0]!.paidAt).toEqual(new Date("2026-06-20"));
  });

  it("processa múltiplas faturas elegíveis e devolve a contagem correta", async () => {
    const inv1 = makeDirectDebitInvoice({ directDebitDate: new Date("2026-06-10") });
    const inv2 = makeDirectDebitInvoice({ directDebitDate: new Date("2026-06-15") });
    const inv3 = makeDirectDebitInvoice({ directDebitDate: new Date("2099-01-01") }); // futuro
    await invoiceRepo.save(inv1);
    await invoiceRepo.save(inv2);
    await invoiceRepo.save(inv3);

    const result = await useCase.execute();

    expect(result.processed).toBe(2);
  });

  it("não processa faturas normais sem isDirectDebit mesmo que tenham data no passado", async () => {
    const normal = Invoice.create({
      supplierName: "Makro",
      invoiceNumber: "MKR-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 123000,
      // isDirectDebit omitted (defaults to false)
      dueDate: new Date("2026-06-01"),
    });
    await invoiceRepo.save(normal);

    const result = await useCase.execute();

    expect(result.processed).toBe(0);
    const unchanged = await invoiceRepo.findById(normal.id);
    expect(unchanged?.status).toBe("pending");
  });

  it("processa faturas com status overdue (não está na lista de exclusão)", async () => {
    const inv = makeDirectDebitInvoice({ directDebitDate: new Date("2026-06-15"), status: "overdue" });
    await invoiceRepo.save(inv);

    const result = await useCase.execute();

    expect(result.processed).toBe(1);
    const updated = await invoiceRepo.findById(inv.id);
    expect(updated?.status).toBe("paid");
  });

  it("usa directDebitDate como paidAt ao marcar paga", async () => {
    const debitDate = new Date("2026-06-25");
    const inv = makeDirectDebitInvoice({ directDebitDate: debitDate });
    await invoiceRepo.save(inv);

    await useCase.execute();

    const updated = await invoiceRepo.findById(inv.id);
    expect(updated?.paidAt?.toISOString().slice(0, 10)).toBe("2026-06-25");
  });
});
