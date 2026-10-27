import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import { InvalidRuleError } from "../../domain/errors.js";
import { applyRulesToAccount } from "../../application/use-cases/apply-rules-to-account.js";
import { CreateReconciliationRuleUseCase } from "../../application/use-cases/create-reconciliation-rule.use-case.js";
import type { RecurrenceRuleTarget, RecurrenceRuleTargetPort } from "../../domain/ports/out/recurrence-rule-target.port.js";
import type { OccurrencePaymentPort } from "../../domain/ports/out/occurrence-payment.port.js";
import type { OccurrenceMatchCandidate } from "../../domain/ports/out/occurrence-match-read.port.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { FakeBankReconciliationRuleRepository } from "../fakes/fake-bank-reconciliation-rule-repository.js";
import { FakeOccurrenceMatchReadAdapter } from "../fakes/fake-occurrence-match-read.js";

// Dados fictícios.
const organizationId = mintOrganizationId("org-a");
const ACCOUNT = "acc-1";

/** Simula o payable-recurrences: uma ocorrência por recorrência e mês; só o primeiro pagamento a fecha. */
class FakeRecurrenceTarget implements RecurrenceRuleTargetPort {
  readonly recurrences = new Map<string, RecurrenceRuleTarget>();
  readonly paidBy = new Map<string, string>(); // occurrenceId → movementId
  async describe(_org: OrganizationId, id: string) {
    return this.recurrences.get(id) ?? null;
  }
  async settle(_org: OrganizationId, input: { recurrenceId: string; movementId: string; paidAt: string }) {
    const occurrenceId = `${input.recurrenceId}:${input.paidAt.slice(0, 7)}`;
    if (this.paidBy.has(occurrenceId)) return null;
    this.paidBy.set(occurrenceId, input.movementId);
    return { occurrenceId, paidNow: true };
  }
}

class RecordingOccurrencePayment implements OccurrencePaymentPort {
  readonly reopened: { occurrenceId: string; movementId: string }[] = [];
  async settle() {}
  async reopen(_org: OrganizationId, input: { occurrenceId: string; movementId: string }) {
    this.reopened.push(input);
  }
}

const transfer = (description: string, amount: number, date: string) =>
  BankMovement.create({
    bankAccountId: ACCOUNT,
    statementImportId: "stmt-1",
    bookingDate: new Date(`${date}T00:00:00.000Z`),
    valueDate: new Date(`${date}T00:00:00.000Z`),
    description,
    amount,
    balanceAfter: 0,
    movementType: "debit",
    deduplicationHash: `h-${description}-${amount}-${date}`,
  });

const rentRule = (over: Partial<Parameters<typeof BankReconciliationRule.create>[0]> = {}) =>
  BankReconciliationRule.create({
    name: "Renda — Senhorio Exemplo",
    descriptionContains: "TRF P/ Senhorio Exemplo",
    bankAccountId: ACCOUNT,
    justificationType: "contrato_recorrencia",
    recurrenceId: "rec-renda",
    ...over,
  });

describe("Regra ligada a uma recorrência", () => {
  let movementRepo: FakeBankMovementRepository;
  let statementRepo: FakeBankStatementImportRepository;
  let target: FakeRecurrenceTarget;
  let payment: RecordingOccurrencePayment;

  beforeEach(() => {
    movementRepo = new FakeBankMovementRepository();
    statementRepo = new FakeBankStatementImportRepository();
    target = new FakeRecurrenceTarget();
    target.recurrences.set("rec-renda", { id: "rec-renda", name: "Renda — Senhorio Exemplo", status: "active", requireInvoice: false });
    payment = new RecordingOccurrencePayment();
  });

  it("liga cada movimento à ocorrência do seu mês (fica paga)", async () => {
    const sep = transfer("TRF P/ Senhorio Exemplo", 40_000, "2026-09-09");
    const oct = transfer("TRF P/ Senhorio Exemplo", 40_000, "2026-10-09");
    await movementRepo.saveBulk(organizationId, [sep, oct]);
    const n = await applyRulesToAccount({ movementRepo, statementRepo, recurrenceLinking: { target, occurrencePayment: payment } }, organizationId, ACCOUNT, [rentRule()]);
    expect(n).toBe(2);
    const saved = await movementRepo.findById(organizationId, sep.id);
    expect(saved).toMatchObject({ justificationType: "contrato_recorrencia", matchedEntityType: "recurrence_occurrence", matchedEntityId: "rec-renda:2026-09" });
    expect((await movementRepo.findById(organizationId, oct.id))!.matchedEntityId).toBe("rec-renda:2026-10");
  });

  it("dois pagamentos no mesmo mês: o maior fica com a ocorrência, o outro fica por conciliar", async () => {
    const big = transfer("TRF P/ Senhorio Exemplo", 110_085, "2026-09-09");
    const small = transfer("TRF P/ Senhorio Exemplo", 24_179, "2026-09-09");
    await movementRepo.saveBulk(organizationId, [small, big]);
    await applyRulesToAccount({ movementRepo, statementRepo, recurrenceLinking: { target, occurrencePayment: payment } }, organizationId, ACCOUNT, [rentRule()]);
    expect((await movementRepo.findById(organizationId, big.id))!.matchedEntityId).toBe("rec-renda:2026-09");
    expect((await movementRepo.findById(organizationId, small.id))!.isUntouched).toBe(true);
  });

  it("sem a ligação às recorrências, a regra não concilia (nunca classifica sem pagar)", async () => {
    const m = transfer("TRF P/ Senhorio Exemplo", 40_000, "2026-09-09");
    await movementRepo.saveBulk(organizationId, [m]);
    expect(await applyRulesToAccount({ movementRepo, statementRepo }, organizationId, ACCOUNT, [rentRule()])).toBe(0);
  });

  it("se a gravação falhar, reabre as ocorrências pagas", async () => {
    const m = transfer("TRF P/ Senhorio Exemplo", 40_000, "2026-09-09");
    await movementRepo.saveBulk(organizationId, [m]);
    movementRepo.update = async () => {
      throw new Error("falha simulada");
    };
    await expect(
      applyRulesToAccount({ movementRepo, statementRepo, recurrenceLinking: { target, occurrencePayment: payment } }, organizationId, ACCOUNT, [rentRule()]),
    ).rejects.toThrow("falha simulada");
    expect(payment.reopened).toEqual([{ occurrenceId: "rec-renda:2026-09", movementId: m.id }]);
  });

  it("a regra tem de ser «Contrato / Recorrência» e de uma conta", () => {
    expect(() => rentRule({ justificationType: "recibo_comprovativo" })).toThrow(InvalidRuleError);
    expect(() => rentRule({ bankAccountId: null })).toThrow(InvalidRuleError);
  });
});

describe("Travas ao criar uma regra ligada a uma recorrência", () => {
  let ruleRepo: FakeBankReconciliationRuleRepository;
  let movementRepo: FakeBankMovementRepository;
  let target: FakeRecurrenceTarget;
  let occurrenceRead: FakeOccurrenceMatchReadAdapter;
  let create: CreateReconciliationRuleUseCase;
  const cmd = { organizationId, name: "Salário — António Exemplo", descriptionContains: "TRF P/ ANTONIO J", bankAccountId: ACCOUNT, justificationType: "contrato_recorrencia" as const, recurrenceId: "rec-a" };

  beforeEach(() => {
    ruleRepo = new FakeBankReconciliationRuleRepository();
    movementRepo = new FakeBankMovementRepository();
    target = new FakeRecurrenceTarget();
    target.recurrences.set("rec-a", { id: "rec-a", name: "Salário — António Exemplo", status: "active", requireInvoice: false });
    occurrenceRead = new FakeOccurrenceMatchReadAdapter();
    create = new CreateReconciliationRuleUseCase(ruleRepo, {
      movementRepo, statementRepo: new FakeBankStatementImportRepository(), occurrenceRead, recurrenceLinking: { target, occurrencePayment: new RecordingOccurrencePayment() },
    });
  });

  it("aceita uma recorrência ativa sem fatura", async () => {
    await expect(create.execute(cmd)).resolves.toMatchObject({ recurrenceId: "rec-a" });
  });

  it("recusa recorrência inexistente, encerrada ou que exige fatura", async () => {
    await expect(create.execute({ ...cmd, recurrenceId: "nao-existe" })).rejects.toThrow(InvalidRuleError);
    target.recurrences.set("rec-a", { id: "rec-a", name: "X", status: "closed", requireInvoice: false });
    await expect(create.execute(cmd)).rejects.toThrow(/encerrada/);
    target.recurrences.set("rec-a", { id: "rec-a", name: "X", status: "active", requireInvoice: true });
    await expect(create.execute(cmd)).rejects.toThrow(/exige fatura/);
  });

  it("recusa outra regra ativa com o mesmo texto na conta", async () => {
    await ruleRepo.save(organizationId, BankReconciliationRule.create({ name: "Antiga", descriptionContains: "TRF P/ ANTONIO J", bankAccountId: ACCOUNT, justificationType: "recibo_comprovativo" }));
    await expect(create.execute(cmd)).rejects.toThrow(/Já existe/);
  });

  it("recusa um texto que apanha pagamentos ligados a outra recorrência (outro «António J…»)", async () => {
    const m = transfer("TRF P/ ANTONIO JOAO OUTRO", 90_000, "2026-09-05").classify({
      justificationType: "contrato_recorrencia", matchedEntityType: "recurrence_occurrence", matchedEntityId: "occ-outro",
    });
    await movementRepo.saveBulk(organizationId, [m]);
    occurrenceRead.seed(organizationId, [{ id: "occ-outro", recurrenceId: "rec-b", recurrenceName: "Salário — António Outro" } as OccurrenceMatchCandidate]);
    await expect(create.execute(cmd)).rejects.toThrow(/António Outro/);
  });
});
