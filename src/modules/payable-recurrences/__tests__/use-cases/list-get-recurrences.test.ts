import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { ListRecurrencesUseCase } from "../../application/use-cases/list-recurrences.use-case.js";
import { GetRecurrenceUseCase } from "../../application/use-cases/get-recurrence.use-case.js";
import { PauseRecurrenceUseCase } from "../../application/use-cases/pause-recurrence.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";

function make() {
  const repo = new FakeRecurrenceRepository();
  return {
    repo,
    create: new CreateRecurrenceUseCase(repo),
    list: new ListRecurrencesUseCase(repo),
    get: new GetRecurrenceUseCase(repo),
    pause: new PauseRecurrenceUseCase(repo),
  };
}

const BASE = {
  name: "Contabilidade",
  supplierName: "Contabilista Lda",
  type: "recurring_service" as const,
  estimatedAmountCents: 25000,
  dayOfMonth: 10,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

describe("ListRecurrencesUseCase", () => {
  it("retorna lista vazia quando não há recorrências", async () => {
    const { list } = make();
    const result = await list.execute();
    expect(result).toHaveLength(0);
  });

  it("retorna todas as recorrências criadas", async () => {
    const { create, list } = make();
    await create.execute(BASE);
    await create.execute({ ...BASE, name: "Energia" });

    const result = await list.execute();
    expect(result).toHaveLength(2);
  });

  it("filtra por status", async () => {
    const { create, list, pause } = make();
    const dto = await create.execute(BASE);
    await create.execute({ ...BASE, name: "Energia" });
    await pause.execute(dto.id);

    const active = await list.execute({ status: "active" });
    const paused = await list.execute({ status: "paused" });

    expect(active).toHaveLength(1);
    expect(paused).toHaveLength(1);
  });

  it("filtra por type", async () => {
    const { create, list } = make();
    await create.execute(BASE); // recurring_service
    await create.execute({ ...BASE, name: "Energia", type: "variable_invoice" });

    const result = await list.execute({ type: "variable_invoice" });
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("variable_invoice");
  });

  it("retorna DTOs com campos correctos", async () => {
    const { create, list } = make();
    await create.execute(BASE);

    const [dto] = await list.execute();
    expect(dto).toMatchObject({
      name: "Contabilidade",
      status: "active",
      estimatedAmountCents: 25000,
    });
  });
});

describe("GetRecurrenceUseCase", () => {
  it("retorna a recorrência pelo id", async () => {
    const { create, get } = make();
    const created = await create.execute(BASE);

    const dto = await get.execute(created.id);
    expect(dto.id).toBe(created.id);
    expect(dto.name).toBe("Contabilidade");
  });

  it("lança RecurrenceNotFoundError para id inexistente", async () => {
    const { get } = make();
    await expect(get.execute("nao-existe")).rejects.toThrow(RecurrenceNotFoundError);
  });
});
