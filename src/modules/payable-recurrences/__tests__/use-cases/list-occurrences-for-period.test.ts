import { describe, it, expect } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { ListOccurrencesForPeriodUseCase } from "../../application/use-cases/list-occurrences-for-period.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { FakeBankMovementLinkReadAdapter } from "../fakes/fake-bank-movement-link-read.js";
import { FakeInvoiceAllocatedAmountReadAdapter } from "../fakes/fake-invoice-allocated-amount-read.js";

const organizationId = mintOrganizationId("org-a");

const SALARY_CMD = {
  organizationId,
  name: "Salário Gabriel",
  supplierName: "Dispensa Fornecedor",
  type: "payroll" as const,
  estimatedAmountCents: 135_000,
  dayOfMonth: 5,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

function make() {
  const recurrenceRepo = new FakeRecurrenceRepository();
  const occurrenceRepo = new FakeOccurrenceRepository();
  const bankLinkRead = new FakeBankMovementLinkReadAdapter();
  const invoiceAllocatedAmountRead = new FakeInvoiceAllocatedAmountReadAdapter();
  return {
    recurrenceRepo,
    occurrenceRepo,
    create: new CreateRecurrenceUseCase(recurrenceRepo),
    generate: new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo),
    list: new ListOccurrencesForPeriodUseCase(recurrenceRepo, occurrenceRepo, bankLinkRead, invoiceAllocatedAmountRead),
  };
}

describe("ListOccurrencesForPeriodUseCase", () => {
  it("garante que as ocorrências existem antes de listar — recorrência ativa sem geração manual aparece na primeira consulta", async () => {
    const { create, list, occurrenceRepo } = make();
    await create.execute(SALARY_CMD);

    const result = await list.execute({ organizationId, period: "2026-09" });
    expect(result).toHaveLength(1);
    expect(result[0]!.period).toBe("2026-09");
    expect(await occurrenceRepo.findAll(organizationId, { period: "2026-09" })).toHaveLength(1);
  });

  it("lista cross-recorrência — várias recorrências ativas, uma só ocorrência cada", async () => {
    const { create, list } = make();
    await create.execute(SALARY_CMD);
    await create.execute({ ...SALARY_CMD, name: "Salário Kleiton", dayOfMonth: 5 });

    const result = await list.execute({ organizationId, period: "2026-09" });
    expect(result).toHaveLength(2);
  });

  it("não duplica quando a ocorrência já tinha sido gerada manualmente", async () => {
    const { create, generate, list } = make();
    const rec = await create.execute(SALARY_CMD);
    await generate.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 9 });

    const result = await list.execute({ organizationId, period: "2026-09" });
    expect(result).toHaveLength(1);
  });

  it("sem recorrências ativas: devolve lista vazia", async () => {
    const { list } = make();
    const result = await list.execute({ organizationId, period: "2026-09" });
    expect(result).toEqual([]);
  });
});
