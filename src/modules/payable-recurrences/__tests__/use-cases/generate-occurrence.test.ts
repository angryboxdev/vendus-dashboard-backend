import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { OccurrenceAlreadyExistsError, RecurrenceNotFoundError } from "../../domain/errors.js";

function make() {
  const recurrenceRepo = new FakeRecurrenceRepository();
  const occurrenceRepo = new FakeOccurrenceRepository();
  return {
    recurrenceRepo,
    occurrenceRepo,
    create: new CreateRecurrenceUseCase(recurrenceRepo),
    generate: new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo),
  };
}

const VARIABLE_CMD = {
  name: "Energia - Gold Energy",
  supplierName: "Gold Energy",
  type: "variable_invoice" as const,
  estimatedAmountCents: 26175,
  dayOfMonth: 20,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
  requireInvoice: true,
};

const FIXED_CMD = {
  name: "Renda da loja",
  supplierName: "Proprietário Lda",
  type: "fixed_contract" as const,
  estimatedAmountCents: 120000,
  dayOfMonth: 5,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

describe("GenerateOccurrenceUseCase", () => {
  it("gera ocorrência para variável (requireInvoice=true) → status awaiting_invoice", async () => {
    const { create, generate } = make();
    const rec = await create.execute(VARIABLE_CMD);
    const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 9 });

    expect(occ.period).toBe("2026-09");
    expect(occ.status).toBe("awaiting_invoice");
    expect(occ.dueDate).toBe("2026-09-20");
    expect(occ.estimatedAmountCents).toBe(26175);
  });

  it("gera ocorrência para fixed (requireInvoice=false) → status forecast", async () => {
    const { create, generate } = make();
    const rec = await create.execute(FIXED_CMD);
    const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 9 });

    expect(occ.status).toBe("forecast");
    expect(occ.paidAt).toBeNull();
  });

  it("lança OccurrenceAlreadyExistsError se ocorrência já existe para esse período", async () => {
    const { create, generate } = make();
    const rec = await create.execute(VARIABLE_CMD);
    await generate.execute({ recurrenceId: rec.id, year: 2026, month: 9 });
    await expect(generate.execute({ recurrenceId: rec.id, year: 2026, month: 9 }))
      .rejects.toThrow(OccurrenceAlreadyExistsError);
  });

  it("lança RecurrenceNotFoundError para id inexistente", async () => {
    const { generate } = make();
    await expect(generate.execute({ recurrenceId: "nao-existe", year: 2026, month: 9 }))
      .rejects.toThrow(RecurrenceNotFoundError);
  });

  it("lança erro se recorrência está fora de scope (mês antes de startDate)", async () => {
    const { create, generate } = make();
    const rec = await create.execute({ ...VARIABLE_CMD, startDate: "2026-10-01" });
    await expect(generate.execute({ recurrenceId: rec.id, year: 2026, month: 9 }))
      .rejects.toThrow(/not active or out of scope/);
  });

  it("persiste a ocorrência no repositório", async () => {
    const { create, generate, occurrenceRepo } = make();
    const rec = await create.execute(VARIABLE_CMD);
    const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 9 });

    const saved = await occurrenceRepo.findById(occ.id);
    expect(saved).not.toBeNull();
    expect(saved!.period).toBe("2026-09");
  });
});
