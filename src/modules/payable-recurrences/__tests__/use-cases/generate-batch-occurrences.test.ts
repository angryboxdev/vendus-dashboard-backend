import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateBatchOccurrencesUseCase } from "../../application/use-cases/generate-batch-occurrences.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";

const organizationId = mintOrganizationId("org-a");

function make() {
  const recurrenceRepo = new FakeRecurrenceRepository();
  const occurrenceRepo = new FakeOccurrenceRepository();
  return {
    recurrenceRepo,
    occurrenceRepo,
    create: new CreateRecurrenceUseCase(recurrenceRepo),
    batch: new GenerateBatchOccurrencesUseCase(recurrenceRepo, occurrenceRepo),
  };
}

const MONTHLY = {
  organizationId,
  name: "Internet NOS",
  supplierName: "NOS",
  type: "fixed_contract" as const,
  estimatedAmountCents: 4500,
  dayOfMonth: 15,
  startDate: "2026-01-01",
  paymentMethod: "direct_debit" as const,
};

const QUARTERLY = {
  organizationId,
  name: "Manutenção equipamentos",
  supplierName: "TechServ",
  type: "recurring_service" as const,
  estimatedAmountCents: 30000,
  dayOfMonth: 10,
  startDate: "2026-01-01",
  frequency: "quarterly" as const,
  paymentMethod: "transfer" as const,
};

describe("GenerateBatchOccurrencesUseCase", () => {
  it("gera ocorrências para todas as recorrências activas no mês", async () => {
    const { create, batch } = make();
    await create.execute(MONTHLY);
    await create.execute({ ...MONTHLY, name: "Energia" });

    const result = await batch.execute({ organizationId, year: 2026, month: 9 });

    expect(result.period).toBe("2026-09");
    expect(result.generated).toHaveLength(2);
    expect(result.skippedAlreadyExists).toBe(0);
    expect(result.skippedOutOfScope).toBe(0);
  });

  it("salta recorrência que já tem ocorrência no período", async () => {
    const { create, batch } = make();
    await create.execute(MONTHLY);

    await batch.execute({ organizationId, year: 2026, month: 9 });
    const result2 = await batch.execute({ organizationId, year: 2026, month: 9 });

    expect(result2.generated).toHaveLength(0);
    expect(result2.skippedAlreadyExists).toBe(1);
  });

  it("salta recorrência quarterly em mês fora do ciclo", async () => {
    const { create, batch } = make();
    await create.execute(QUARTERLY); // ciclo: Jan, Abr, Jul, Out

    const result = await batch.execute({ organizationId, year: 2026, month: 2 }); // Fev — fora

    expect(result.generated).toHaveLength(0);
    expect(result.skippedOutOfScope).toBe(1);
  });

  it("gera quarterly em mês do ciclo", async () => {
    const { create, batch } = make();
    await create.execute(QUARTERLY);

    const result = await batch.execute({ organizationId, year: 2026, month: 4 }); // Abr — em ciclo

    expect(result.generated).toHaveLength(1);
    expect(result.generated[0]!.status).toBe("forecast");
  });

  it("não gera nada quando não há recorrências activas", async () => {
    const { batch } = make();
    const result = await batch.execute({ organizationId, year: 2026, month: 9 });
    expect(result.generated).toHaveLength(0);
    expect(result.skippedAlreadyExists).toBe(0);
    expect(result.skippedOutOfScope).toBe(0);
  });

  it("não gera a partir de recorrências activas de outra organização", async () => {
    const { create, batch } = make();
    await create.execute(MONTHLY);
    const otherOrganizationId = mintOrganizationId("org-b");

    const result = await batch.execute({ organizationId: otherOrganizationId, year: 2026, month: 9 });
    expect(result.generated).toHaveLength(0);
  });
});
