import { describe, it, expect, beforeEach } from "@jest/globals";
import { MarkObligationAsPaidUseCase } from "../../application/use-cases/mark-obligation-as-paid.use-case.js";
import { FakeObligationRepository } from "../fakes/fake-obligation-repository.js";
import { FakeOccurrenceSync } from "../fakes/fake-occurrence-sync.js";
import { FakeInvoiceMarkPaid } from "../fakes/fake-invoice-mark-paid.js";
import { FinancialObligation } from "../../domain/entities/financial-obligation.js";
import { ObligationNotFoundError } from "../../domain/errors.js";

function makeManual() {
  return FinancialObligation.create({
    source: "manual",
    supplierName: "Fornecedor",
    description: "Despesa",
    amountCents: 10000,
    dueDate: new Date("2026-08-10"),
  });
}

function makeRecurrence() {
  return FinancialObligation.create({
    source: "recurrence",
    supplierName: "Renda",
    description: "Renda agosto",
    amountCents: 80000,
    dueDate: new Date("2026-08-01"),
  });
}

describe("MarkObligationAsPaidUseCase", () => {
  let repo: FakeObligationRepository;
  let occurrenceSync: FakeOccurrenceSync;
  let invoiceMarkPaid: FakeInvoiceMarkPaid;
  let useCase: MarkObligationAsPaidUseCase;

  beforeEach(() => {
    repo = new FakeObligationRepository();
    occurrenceSync = new FakeOccurrenceSync();
    invoiceMarkPaid = new FakeInvoiceMarkPaid();
    useCase = new MarkObligationAsPaidUseCase(repo, occurrenceSync, invoiceMarkPaid);
  });

  it("marca obrigação manual como paga", async () => {
    const o = makeManual();
    await repo.save(o);

    const result = await useCase.execute({ id: o.id, paidAt: "2026-08-10" });

    expect(result.status).toBe("paid");
    expect(result.paidAt).toBe("2026-08-10");
  });

  it("usa a data de hoje se paidAt não for fornecido", async () => {
    const o = makeManual();
    await repo.save(o);

    const result = await useCase.execute({ id: o.id });

    expect(result.status).toBe("paid");
    expect(result.paidAt).not.toBeNull();
  });

  it("regista o método de pagamento", async () => {
    const o = makeManual();
    await repo.save(o);

    const result = await useCase.execute({ id: o.id, paymentMethod: "transfer" });

    expect(result.paymentMethod).toBe("transfer");
  });

  it("lança ObligationNotFoundError quando não encontrada", async () => {
    await expect(useCase.execute({ id: "nao-existe" })).rejects.toBeInstanceOf(ObligationNotFoundError);
  });

  it("não sincroniza ocorrência para obrigação manual", async () => {
    const o = makeManual();
    await repo.save(o);

    await useCase.execute({ id: o.id });

    expect(occurrenceSync.synced).toHaveLength(0);
  });

  it("sincroniza ocorrência para obrigação de recorrência", async () => {
    const o = makeRecurrence();
    await repo.save(o);

    await useCase.execute({ id: o.id });

    expect(occurrenceSync.synced).toContain(o.id);
  });

  it("não sincroniza fatura quando invoiceId é null", async () => {
    const o = makeManual();
    await repo.save(o);

    await useCase.execute({ id: o.id });

    expect(invoiceMarkPaid.marked).toHaveLength(0);
  });

  it("lança erro ao tentar pagar obrigação já paga", async () => {
    const o = makeManual();
    const paid = o.markPaid(new Date());
    await repo.save(paid);

    await expect(useCase.execute({ id: paid.id })).rejects.toThrow("already paid");
  });

  it("lança erro ao tentar pagar obrigação cancelada", async () => {
    // Persiste directamente uma obrigação cancelled via reconstitute
    const cancelled = FinancialObligation.reconstitute({
      id: "cancelled-id",
      source: "manual",
      supplierId: null,
      supplierName: "X",
      description: "Despesa",
      amountCents: 1000,
      dueDate: new Date("2026-08-01"),
      paidAt: null,
      paymentMethod: null,
      status: "cancelled",
      invoiceId: null,
      recurrenceId: null,
      recurrenceName: null,
      documentUrl: null,
      costCenterId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.save(cancelled);

    await expect(useCase.execute({ id: "cancelled-id" })).rejects.toThrow("cancelled");
  });
});
