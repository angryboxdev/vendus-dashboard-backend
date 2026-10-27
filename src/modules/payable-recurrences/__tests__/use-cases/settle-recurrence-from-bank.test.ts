import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { MarkOccurrenceAsPaidUseCase } from "../../application/use-cases/mark-occurrence-as-paid.use-case.js";
import {
  GetRecurrenceForBankRuleUseCase,
  SettleRecurrenceFromBankUseCase,
} from "../../application/use-cases/occurrence-bank-payment.use-cases.js";
import { Recurrence } from "../../domain/entities/recurrence.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeEmployeeDirectoryRead } from "../fakes/fake-employee-directory-read.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { FakeBankMovementLinkReadAdapter } from "../fakes/fake-bank-movement-link-read.js";

// Dados fictícios.
const organizationId = mintOrganizationId("org-a");

async function setup(opts: { offset?: 0 | -1; requireInvoice?: boolean } = {}) {
  const recurrenceRepo = new FakeRecurrenceRepository();
  const occurrenceRepo = new FakeOccurrenceRepository();
  const links = new FakeBankMovementLinkReadAdapter();
  const rec = await new CreateRecurrenceUseCase(recurrenceRepo, new FakeEmployeeDirectoryRead()).execute({
    organizationId,
    name: opts.offset === -1 ? "Salário — Colaborador Exemplo" : "Renda — Senhorio Exemplo",
    supplierName: opts.offset === -1 ? "Colaborador Exemplo" : "Senhorio Exemplo",
    type: opts.requireInvoice ? "variable_invoice" : "fixed_contract",
    estimatedAmountCents: 40_000,
    dayOfMonth: 9,
    startDate: "2026-01-01",
    paymentMethod: "transfer",
    ...(opts.offset !== undefined && { paymentPeriodOffset: opts.offset }),
  });
  const settle = new SettleRecurrenceFromBankUseCase(recurrenceRepo, occurrenceRepo, links);
  const pay = (paidAt: string, movementId = "mov-1") =>
    settle.execute({ organizationId, recurrenceId: rec.id, movementId, paidAt, bankAccountId: "acc-1" });
  const generate = (month: number) => new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo).execute({ organizationId, recurrenceId: rec.id, year: 2026, month });
  return { recurrenceRepo, occurrenceRepo, links, rec, pay, generate };
}

describe("Movimento recorrente ligado a uma recorrência → paga a ocorrência do mês certo", () => {
  it("renda (mês do pagamento): gera a ocorrência de setembro e deixa-a paga", async () => {
    const { occurrenceRepo, rec, pay } = await setup();
    const r = await pay("2026-09-09");
    expect(r).toMatchObject({ result: "paid", period: "2026-09" });
    const occ = await occurrenceRepo.findByRecurrenceAndPeriod(organizationId, rec.id, "2026-09");
    expect(occ!.status).toBe("paid");
    expect(occ!.paymentNotes).toContain("mov-1");
  });

  it("salário (mês anterior): o pagamento de outubro paga setembro; de janeiro paga dezembro", async () => {
    const { pay } = await setup({ offset: -1 });
    expect(await pay("2026-10-05")).toMatchObject({ result: "paid", period: "2026-09" });
    expect(await pay("2027-01-05", "mov-2")).toMatchObject({ result: "paid", period: "2026-12" });
  });

  it("segundo pagamento no mesmo mês: não vai pagar o mês seguinte — fica por conciliar", async () => {
    const { occurrenceRepo, rec, pay, generate } = await setup({ offset: -1 });
    await generate(10); // outubro já gerado (em aberto)
    await pay("2026-10-05", "mov-1");
    expect(await pay("2026-10-05", "mov-2")).toEqual({ result: "not_applicable", reason: "not_open" });
    expect((await occurrenceRepo.findByRecurrenceAndPeriod(organizationId, rec.id, "2026-10"))!.status).toBe("forecast");
  });

  it("mês pago à mão e sem movimento: liga o movimento sem mexer no pagamento; com movimento já ligado, não", async () => {
    const { occurrenceRepo, links, rec, pay, generate } = await setup();
    const occ = await generate(8);
    await new MarkOccurrenceAsPaidUseCase(occurrenceRepo).execute({ organizationId, occurrenceId: occ.id, paidAt: "2026-08-10" });
    expect(await pay("2026-08-09")).toEqual({ result: "linked", occurrenceId: occ.id, period: "2026-08" });
    expect((await occurrenceRepo.findByRecurrenceAndPeriod(organizationId, rec.id, "2026-08"))!.paidAt!.toISOString().slice(0, 10)).toBe("2026-08-10");

    links.seedLink(organizationId, occ.id, { id: "mov-0", bookingDate: "2026-08-09", amountCents: 40_000, description: "TRF" });
    expect(await pay("2026-08-09", "mov-2")).toEqual({ result: "not_applicable", reason: "not_open" });
  });

  it("recorrência que exige fatura, ou mês antes do início: não liga", async () => {
    expect(await (await setup({ requireInvoice: true })).pay("2026-09-09")).toEqual({ result: "not_applicable", reason: "invoice_required" });
    expect(await (await setup()).pay("2025-12-09")).toEqual({ result: "not_applicable", reason: "no_occurrence" });
  });

  it("resumo para validar a regra", async () => {
    const { recurrenceRepo, rec } = await setup({ offset: -1 });
    expect(await new GetRecurrenceForBankRuleUseCase(recurrenceRepo).execute({ organizationId, recurrenceId: rec.id })).toEqual({
      id: rec.id, name: rec.name, status: "active", requireInvoice: false, paymentPeriodOffset: -1,
    });
  });
});

describe("Recurrence.paymentPeriodOffset", () => {
  const base = { name: "Renda", supplierName: "Senhorio Exemplo", type: "fixed_contract" as const, estimatedAmountCents: 40_000, dayOfMonth: 9, startDate: new Date("2026-01-01"), paymentMethod: "transfer" as const };
  it("por defeito é o próprio mês; aceita -1 e altera-se", () => {
    const r = Recurrence.create(base);
    expect(r.paymentPeriodOffset).toBe(0);
    expect(r.update({ paymentPeriodOffset: -1 }).paymentPeriodOffset).toBe(-1);
  });
  it("recusa outros valores", () => {
    expect(() => Recurrence.create({ ...base, paymentPeriodOffset: 1 as never })).toThrow();
  });
});
