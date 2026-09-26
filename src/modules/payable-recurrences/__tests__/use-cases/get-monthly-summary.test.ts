import { describe, it, expect } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { MarkOccurrenceAsPaidUseCase } from "../../application/use-cases/mark-occurrence-as-paid.use-case.js";
import { PauseRecurrenceUseCase } from "../../application/use-cases/pause-recurrence.use-case.js";
import { RecurrenceOccurrence } from "../../domain/entities/recurrence-occurrence.js";
import { GetMonthlySummaryUseCase } from "../../application/use-cases/get-monthly-summary.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { FakeBankMovementLinkReadAdapter } from "../fakes/fake-bank-movement-link-read.js";
import { FakeInvoiceAllocatedAmountReadAdapter } from "../fakes/fake-invoice-allocated-amount-read.js";

// Data de "hoje" do sistema durante esta sessão: 2026-09-25.
const organizationId = mintOrganizationId("org-a");

const BASE_CMD = {
  organizationId,
  name: "Renda",
  supplierName: "Proprietário Lda",
  type: "fixed_contract" as const,
  estimatedAmountCents: 100_000,
  dayOfMonth: 5,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

const BANK_LINK = {
  id: "mov-1",
  bookingDate: "2026-09-05",
  amountCents: 100_000,
  description: "TRF renda",
};

function make() {
  const recurrenceRepo = new FakeRecurrenceRepository();
  const occurrenceRepo = new FakeOccurrenceRepository();
  const bankLinkRead = new FakeBankMovementLinkReadAdapter();
  const invoiceAllocatedAmountRead = new FakeInvoiceAllocatedAmountReadAdapter();
  return {
    recurrenceRepo,
    occurrenceRepo,
    bankLinkRead,
    invoiceAllocatedAmountRead,
    create: new CreateRecurrenceUseCase(recurrenceRepo),
    generate: new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo),
    markPaid: new MarkOccurrenceAsPaidUseCase(occurrenceRepo),
    pause: new PauseRecurrenceUseCase(recurrenceRepo),
    summary: new GetMonthlySummaryUseCase(recurrenceRepo, occurrenceRepo, bankLinkRead, invoiceAllocatedAmountRead),
  };
}

describe("GetMonthlySummaryUseCase", () => {
  it("ocorrência paga via banco (link cobrindo o total): conta em Previsto e Pago, não em pendente/vencida", async () => {
    const { create, generate, summary, bankLinkRead } = make();
    const rec = await create.execute(BASE_CMD); // dayOfMonth 5, estimated 100_000
    const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });
    bankLinkRead.seedLink(organizationId, occ.id, BANK_LINK);

    const result = await summary.execute({ organizationId, period: "2026-09" });
    expect(result.activeRecurrencesCount).toBe(1);
    expect(result.forecastedAmountCents).toBe(100_000);
    expect(result.paidAmountCents).toBe(100_000);
    expect(result.pendingCount).toBe(0);
    expect(result.overdueCount).toBe(0);
  });

  it("marcada paga manualmente (sem link bancário): settled, mas Pago fica a 0 (sem dinheiro rastreado)", async () => {
    const { create, generate, markPaid, summary } = make();
    const rec = await create.execute(BASE_CMD);
    const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });
    await markPaid.execute({ organizationId, occurrenceId: occ.id, paidAt: "2026-09-05" });

    const result = await summary.execute({ organizationId, period: "2026-09" });
    expect(result.forecastedAmountCents).toBe(100_000);
    expect(result.paidAmountCents).toBe(0);
    expect(result.pendingCount).toBe(0);
    expect(result.overdueCount).toBe(0);
  });

  it("parcialmente paga, vencimento já passado → Vencidas (com o valor em falta)", async () => {
    const { create, generate, summary, bankLinkRead } = make();
    const rec = await create.execute(BASE_CMD); // dayOfMonth 5
    const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 }); // vence 2026-09-05, já passou (hoje: 2026-09-25)
    bankLinkRead.seedLink(organizationId, occ.id, { ...BANK_LINK, amountCents: 40_000 });

    const result = await summary.execute({ organizationId, period: "2026-09" });
    expect(result.paidAmountCents).toBe(40_000);
    expect(result.overdueCount).toBe(1);
    expect(result.overdueAmountCents).toBe(60_000);
    expect(result.pendingCount).toBe(0);
  });

  it("parcialmente paga, vencimento ainda no prazo → Pagamentos por realizar", async () => {
    const { create, generate, summary, bankLinkRead } = make();
    const rec = await create.execute({ ...BASE_CMD, dayOfMonth: 28 }); // ainda não venceu em setembro/2026
    const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });
    bankLinkRead.seedLink(organizationId, occ.id, { ...BANK_LINK, amountCents: 40_000 });

    const result = await summary.execute({ organizationId, period: "2026-09" });
    expect(result.paidAmountCents).toBe(40_000);
    expect(result.pendingCount).toBe(1);
    expect(result.pendingAmountCents).toBe(60_000);
    expect(result.overdueCount).toBe(0);
  });

  it("ocorrência cancelada: excluída de todos os totais (e não gera a versão virtual por baixo, já que a recorrência já tem ocorrência nesse período)", async () => {
    const { create, occurrenceRepo, summary } = make();
    const rec = await create.execute(BASE_CMD);
    // A UI atual apaga a ocorrência em vez de a marcar "cancelled" (ver
    // CancelOccurrenceUseCase), mas o estado "cancelled" continua a ser um
    // estado de domínio válido (ex: dados antigos, ou uma futura mudança para
    // soft-cancel) — testado aqui semeando-o diretamente.
    const created = RecurrenceOccurrence.create({
      recurrenceId: rec.id,
      period: "2026-09",
      estimatedAmountCents: 100_000,
      dueDate: new Date(2026, 8, 5),
      requireInvoice: false,
    });
    await occurrenceRepo.save(organizationId, created.cancel());

    const result = await summary.execute({ organizationId, period: "2026-09" });
    expect(result.forecastedAmountCents).toBe(0);
    expect(result.paidAmountCents).toBe(0);
    expect(result.pendingCount).toBe(0);
    expect(result.overdueCount).toBe(0);
    // a recorrência continua ativa mesmo com a ocorrência do mês cancelada
    expect(result.activeRecurrencesCount).toBe(1);
  });

  it("recorrência ativa SEM ocorrência gerada, dia de vencimento já passado → conta como Vencida, e a ocorrência passa a existir de verdade (ensureOccurrencesForPeriod)", async () => {
    const { create, summary, occurrenceRepo } = make();
    await create.execute({ ...BASE_CMD, dayOfMonth: 5 }); // hoje é 2026-09-25 → dia 5 já passou

    const result = await summary.execute({ organizationId, period: "2026-09" });
    expect(result.forecastedAmountCents).toBe(100_000);
    expect(result.paidAmountCents).toBe(0);
    expect(result.overdueCount).toBe(1);
    expect(result.overdueAmountCents).toBe(100_000);
    expect(result.pendingCount).toBe(0);
    // a ocorrência foi gerada de verdade — necessário para a conciliação bancária poder ligar-se a ela
    expect(await occurrenceRepo.findAll(organizationId, { period: "2026-09" })).toHaveLength(1);
  });

  it("recorrência ativa SEM ocorrência gerada, dia de vencimento ainda no prazo → Pagamentos por realizar", async () => {
    const { create, summary } = make();
    await create.execute({ ...BASE_CMD, dayOfMonth: 28 }); // hoje é 2026-09-25 → dia 28 ainda não chegou

    const result = await summary.execute({ organizationId, period: "2026-09" });
    expect(result.forecastedAmountCents).toBe(100_000);
    expect(result.pendingCount).toBe(1);
    expect(result.pendingAmountCents).toBe(100_000);
    expect(result.overdueCount).toBe(0);
  });

  it("recorrência ativa cujo startDate só começa depois do mês consultado → fora de âmbito, não conta em nada (nem em activeRecurrencesCount, que agora reflete vigência no mês)", async () => {
    const { create, summary } = make();
    await create.execute({ ...BASE_CMD, startDate: "2026-12-01" });

    const result = await summary.execute({ organizationId, period: "2026-09" });
    expect(result.activeRecurrencesCount).toBe(0);
    expect(result.forecastedAmountCents).toBe(0);
    expect(result.pendingCount).toBe(0);
    expect(result.overdueCount).toBe(0);
  });

  it("recorrência pausada com ocorrência já gerada no período: conta nos totais monetários, mas não em activeRecurrencesCount", async () => {
    const { create, generate, pause, summary } = make();
    const rec = await create.execute({ ...BASE_CMD, dayOfMonth: 28 }); // não vencida
    await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });
    await pause.execute({ organizationId, id: rec.id });

    const result = await summary.execute({ organizationId, period: "2026-09" });
    expect(result.activeRecurrencesCount).toBe(0);
    expect(result.forecastedAmountCents).toBe(100_000);
    expect(result.pendingCount).toBe(1);
  });

  it("sem nenhuma recorrência ou ocorrência: devolve tudo a zero", async () => {
    const { summary } = make();
    const result = await summary.execute({ organizationId, period: "2026-09" });
    expect(result).toEqual({
      period: "2026-09",
      activeRecurrencesCount: 0,
      forecastedAmountCents: 0,
      paidAmountCents: 0,
      pendingCount: 0,
      pendingAmountCents: 0,
      overdueCount: 0,
      overdueAmountCents: 0,
      paidVsForecastedPercent: null,
    });
  });

  it("paidVsForecastedPercent: null enquanto houver algo pendente/vencido", async () => {
    const { create, generate, summary, bankLinkRead } = make();
    const rec = await create.execute({ ...BASE_CMD, dayOfMonth: 28 });
    const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });
    bankLinkRead.seedLink(organizationId, occ.id, { ...BANK_LINK, amountCents: 40_000 });

    const result = await summary.execute({ organizationId, period: "2026-09" });
    expect(result.pendingCount).toBe(1);
    expect(result.paidVsForecastedPercent).toBeNull();
  });

  it("paidVsForecastedPercent: preenchido quando tudo concluído, com sinal correto", async () => {
    const { create, generate, summary, markPaid } = make();
    const rec = await create.execute(BASE_CMD); // estimated 100_000
    const occ = await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });
    // Marcado como pago diretamente (ex: pagamento negociado por um valor menor,
    // aceite como total via "É o pagamento total" na conciliação) — sem link
    // bancário a cobrir o valor todo, mas ainda assim settled (não pendente/vencido).
    await markPaid.execute({ organizationId, occurrenceId: occ.id, paidAt: "2026-09-05" });

    const result = await summary.execute({ organizationId, period: "2026-09" });
    expect(result.pendingCount).toBe(0);
    expect(result.overdueCount).toBe(0);
    expect(result.paidAmountCents).toBe(0);
    expect(result.paidVsForecastedPercent).toBeCloseTo(-100, 5);
  });
});
