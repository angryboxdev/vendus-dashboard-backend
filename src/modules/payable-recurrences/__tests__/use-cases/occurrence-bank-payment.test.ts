import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { MarkOccurrenceAsPaidUseCase } from "../../application/use-cases/mark-occurrence-as-paid.use-case.js";
import {
  ReopenOccurrenceFromBankUseCase,
  SettleOccurrenceFromBankUseCase,
} from "../../application/use-cases/occurrence-bank-payment.use-cases.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeEmployeeDirectoryRead } from "../fakes/fake-employee-directory-read.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";

// Dados fictícios.
const organizationId = mintOrganizationId("org-a");

async function setup(requireInvoice = false) {
  const recurrenceRepo = new FakeRecurrenceRepository();
  const occurrenceRepo = new FakeOccurrenceRepository();
  const rec = await new CreateRecurrenceUseCase(recurrenceRepo, new FakeEmployeeDirectoryRead()).execute({
    organizationId,
    name: "Salário — Colaborador Exemplo",
    supplierName: "Colaborador Exemplo",
    type: requireInvoice ? "variable_contract" : "fixed_contract",
    estimatedAmountCents: 135_000,
    dayOfMonth: 1,
    startDate: "2026-01-01",
    paymentMethod: "transfer",
    ...(requireInvoice && { requireInvoice: true }),
  } as Parameters<CreateRecurrenceUseCase["execute"]>[0]);
  const occ = await new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo).execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });
  return {
    occurrenceRepo,
    occ,
    settle: new SettleOccurrenceFromBankUseCase(occurrenceRepo),
    reopen: new ReopenOccurrenceFromBankUseCase(occurrenceRepo),
    markPaid: new MarkOccurrenceAsPaidUseCase(occurrenceRepo),
  };
}

describe("Pagamento de ocorrências pela conciliação bancária", () => {
  it("movimento ligado → paga com a data do movimento (mesmo com valor diferente: a diferença vem dos movimentos)", async () => {
    const { occurrenceRepo, occ, settle } = await setup();
    expect(await settle.execute({ organizationId, occurrenceId: occ.id, movementId: "mov-1", paidAt: "2026-09-01", bankAccountId: "acc-1" })).toBe("paid");
    const saved = (await occurrenceRepo.findById(organizationId, occ.id))!;
    expect(saved.status).toBe("paid");
    expect(saved.paidAt!.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(saved.paymentMethod).toBe("transfer");
    expect(saved.paymentBankAccountId).toBe("acc-1");
  });

  it("já paga: não mexe", async () => {
    const { occ, settle } = await setup();
    await settle.execute({ organizationId, occurrenceId: occ.id, movementId: "mov-1", paidAt: "2026-09-01", bankAccountId: null });
    expect(await settle.execute({ organizationId, occurrenceId: occ.id, movementId: "mov-2", paidAt: "2026-09-02", bankAccountId: null })).toBe("already_paid");
  });

  it("recorrência que exige fatura: não paga pela ocorrência — o movimento concilia-se com a fatura", async () => {
    const { occurrenceRepo, occ, settle } = await setup(true);
    expect(await settle.execute({ organizationId, occurrenceId: occ.id, movementId: "mov-1", paidAt: "2026-09-01", bankAccountId: null })).toBe("invoice_required");
    expect((await occurrenceRepo.findById(organizationId, occ.id))!.status).not.toBe("paid");
  });

  it("desconciliar o movimento que a pagou → volta a por pagar", async () => {
    const { occurrenceRepo, occ, settle, reopen } = await setup();
    await settle.execute({ organizationId, occurrenceId: occ.id, movementId: "mov-1", paidAt: "2026-09-01", bankAccountId: null });
    expect(await reopen.execute({ organizationId, occurrenceId: occ.id, movementId: "mov-1" })).toBe(true);
    const saved = (await occurrenceRepo.findById(organizationId, occ.id))!;
    expect(saved.status).toBe("forecast");
    expect(saved.paidAt).toBeNull();
  });

  it("nunca reabre um pagamento feito por outra via (ex.: marcado à mão) nem por outro movimento", async () => {
    const { occurrenceRepo, occ, reopen, markPaid } = await setup();
    await markPaid.execute({ organizationId, occurrenceId: occ.id, paidAt: "2026-09-01" });
    expect(await reopen.execute({ organizationId, occurrenceId: occ.id, movementId: "mov-1" })).toBe(false);
    expect((await occurrenceRepo.findById(organizationId, occ.id))!.status).toBe("paid");

    const other = await setup();
    await other.settle.execute({ organizationId, occurrenceId: other.occ.id, movementId: "mov-1", paidAt: "2026-09-01", bankAccountId: null });
    expect(await other.reopen.execute({ organizationId, occurrenceId: other.occ.id, movementId: "mov-9" })).toBe(false);
  });
});
