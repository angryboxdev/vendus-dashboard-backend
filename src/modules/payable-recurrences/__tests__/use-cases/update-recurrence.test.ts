import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { UpdateRecurrenceUseCase } from "../../application/use-cases/update-recurrence.use-case.js";
import { CloseRecurrenceUseCase } from "../../application/use-cases/close-recurrence.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { RecurrenceNotFoundError, RecurrenceClosedError } from "../../domain/errors.js";

const BASE_CMD = {
  name: "Renda da loja",
  supplierName: "Proprietário Lda",
  type: "fixed_contract" as const,
  estimatedAmountCents: 120000,
  dayOfMonth: 5,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

function make() {
  const repo = new FakeRecurrenceRepository();
  return {
    repo,
    create: new CreateRecurrenceUseCase(repo),
    update: new UpdateRecurrenceUseCase(repo),
    close: new CloseRecurrenceUseCase(repo),
  };
}

describe("UpdateRecurrenceUseCase", () => {
  it("actualiza o nome e persiste", async () => {
    const { create, update } = make();
    const dto = await create.execute(BASE_CMD);

    const updated = await update.execute({ id: dto.id, name: "Renda do armazém" });

    expect(updated.name).toBe("Renda do armazém");
    expect(updated.estimatedAmountCents).toBe(120000); // restante inalterado
  });

  it("actualiza estimatedAmountCents", async () => {
    const { create, update } = make();
    const dto = await create.execute(BASE_CMD);

    const updated = await update.execute({ id: dto.id, estimatedAmountCents: 150000 });

    expect(updated.estimatedAmountCents).toBe(150000);
  });

  it("actualiza apenas os campos fornecidos (patch semântico)", async () => {
    const { create, update } = make();
    const dto = await create.execute(BASE_CMD);

    const updated = await update.execute({ id: dto.id, dayOfMonth: 15 });

    expect(updated.dayOfMonth).toBe(15);
    expect(updated.name).toBe(dto.name); // inalterado
    expect(updated.estimatedAmountCents).toBe(dto.estimatedAmountCents); // inalterado
  });

  it("lança RecurrenceNotFoundError para id inexistente", async () => {
    const { update } = make();
    await expect(update.execute({ id: "nao-existe", name: "X" })).rejects.toThrow(RecurrenceNotFoundError);
  });

  it("lança RecurrenceClosedError ao actualizar recorrência fechada", async () => {
    const { create, update, close } = make();
    const dto = await create.execute(BASE_CMD);
    await close.execute(dto.id);

    await expect(update.execute({ id: dto.id, name: "Nova" })).rejects.toThrow(RecurrenceClosedError);
  });

  it("mantém requireInvoice=true para variable_invoice mesmo que se tente forçar false", async () => {
    const { create, update } = make();
    const dto = await create.execute({ ...BASE_CMD, type: "variable_invoice" });

    const updated = await update.execute({ id: dto.id, requireInvoice: false, autoCreatePayable: true });

    expect(updated.requireInvoice).toBe(true);
    expect(updated.autoCreatePayable).toBe(false);
  });

  it("rejeita estimatedAmountCents <= 0", async () => {
    const { create, update } = make();
    const dto = await create.execute(BASE_CMD);

    await expect(update.execute({ id: dto.id, estimatedAmountCents: 0 })).rejects.toThrow();
  });

  it("rejeita dayOfMonth fora do intervalo 1-31", async () => {
    const { create, update } = make();
    const dto = await create.execute(BASE_CMD);

    await expect(update.execute({ id: dto.id, dayOfMonth: 32 })).rejects.toThrow();
  });
});
