import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { ListOccurrencesUseCase } from "../../application/use-cases/list-occurrences.use-case.js";
import { GetOccurrenceUseCase } from "../../application/use-cases/get-occurrence.use-case.js";
import { CancelOccurrenceUseCase } from "../../application/use-cases/cancel-occurrence.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { OccurrenceNotFoundError } from "../../domain/errors.js";

// fixed_contract com requireInvoice=false → ocorrências em "forecast"
const BASE_CMD = {
  name: "Renda",
  supplierName: "Proprietário Lda",
  type: "fixed_contract" as const,
  estimatedAmountCents: 25000,
  dayOfMonth: 5,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

// variable_invoice → ocorrências em "awaiting_invoice"
const VARIABLE_CMD = {
  name: "Energia",
  supplierName: "Gold Energy",
  type: "variable_invoice" as const,
  estimatedAmountCents: 25000,
  dayOfMonth: 20,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

function make() {
  const recurrenceRepo = new FakeRecurrenceRepository();
  const occurrenceRepo = new FakeOccurrenceRepository();
  return {
    recurrenceRepo,
    occurrenceRepo,
    create: new CreateRecurrenceUseCase(recurrenceRepo),
    generate: new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo),
    list: new ListOccurrencesUseCase(occurrenceRepo),
    get: new GetOccurrenceUseCase(occurrenceRepo),
    cancel: new CancelOccurrenceUseCase(occurrenceRepo),
  } as const;
}

describe("ListOccurrencesUseCase", () => {
  it("retorna lista vazia quando não há ocorrências", async () => {
    const { list } = make();
    const result = await list.execute({});
    expect(result).toHaveLength(0);
  });

  it("retorna ocorrências geradas para a recorrência", async () => {
    const { create, generate, list } = make();
    const rec = await create.execute(VARIABLE_CMD);
    await generate.execute({ recurrenceId: rec.id, year: 2026, month: 7 });
    await generate.execute({ recurrenceId: rec.id, year: 2026, month: 8 });

    const result = await list.execute({ recurrenceId: rec.id });
    expect(result).toHaveLength(2);
  });

  it("filtra por período", async () => {
    const { create, generate, list } = make();
    const rec = await create.execute(VARIABLE_CMD);
    await generate.execute({ recurrenceId: rec.id, year: 2026, month: 7 });
    await generate.execute({ recurrenceId: rec.id, year: 2026, month: 8 });

    const result = await list.execute({ recurrenceId: rec.id, period: "2026-07" });
    expect(result).toHaveLength(1);
    expect(result[0]!.period).toBe("2026-07");
  });

  it("filtra por status — fixed_contract gera forecast, cancel apaga a ocorrência", async () => {
    const { create, generate, list, cancel } = make();
    const rec = await create.execute(BASE_CMD); // fixed_contract → forecast
    const occ1 = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 7 });
    await generate.execute({ recurrenceId: rec.id, year: 2026, month: 8 });
    await cancel.execute(occ1.id);

    const forecast = await list.execute({ recurrenceId: rec.id, status: "forecast" });
    expect(forecast).toHaveLength(1);
  });

  it("retorna DTOs com effectiveAmountCents igual ao estimado quando não há valor real", async () => {
    const { create, generate, list } = make();
    const rec = await create.execute(VARIABLE_CMD);
    await generate.execute({ recurrenceId: rec.id, year: 2026, month: 7 });

    const [dto] = await list.execute({ recurrenceId: rec.id });
    expect(dto!.effectiveAmountCents).toBe(25000);
    expect(dto!.realAmountCents).toBeNull();
  });
});

describe("GetOccurrenceUseCase", () => {
  it("retorna a ocorrência pelo id", async () => {
    const { create, generate, get } = make();
    const rec = await create.execute(BASE_CMD);
    const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 7 });

    const dto = await get.execute(occ.id);
    expect(dto.id).toBe(occ.id);
    expect(dto.period).toBe("2026-07");
  });

  it("lança OccurrenceNotFoundError para id inexistente", async () => {
    const { get } = make();
    await expect(get.execute("nao-existe")).rejects.toThrow(OccurrenceNotFoundError);
  });
});

describe("CancelOccurrenceUseCase", () => {
  it("apaga uma ocorrência em forecast", async () => {
    const { create, generate, cancel, get } = make();
    const rec = await create.execute(BASE_CMD);
    const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 7 });

    await cancel.execute(occ.id);
    await expect(get.execute(occ.id)).rejects.toThrow(OccurrenceNotFoundError);
  });

  it("lança OccurrenceNotFoundError para id inexistente", async () => {
    const { cancel } = make();
    await expect(cancel.execute("nao-existe")).rejects.toThrow(OccurrenceNotFoundError);
  });

  it("lança OccurrenceNotFoundError ao apagar ocorrência já apagada", async () => {
    const { create, generate, cancel } = make();
    const rec = await create.execute(BASE_CMD);
    const occ = await generate.execute({ recurrenceId: rec.id, year: 2026, month: 7 });
    await cancel.execute(occ.id);

    await expect(cancel.execute(occ.id)).rejects.toThrow(OccurrenceNotFoundError);
  });
});
