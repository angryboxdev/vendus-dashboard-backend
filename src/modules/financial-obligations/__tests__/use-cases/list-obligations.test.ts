import { describe, it, expect, beforeEach } from "@jest/globals";
import { ListObligationsUseCase } from "../../application/use-cases/list-obligations.use-case.js";
import { FakeObligationRepository } from "../fakes/fake-obligation-repository.js";
import { FinancialObligation } from "../../domain/entities/financial-obligation.js";

function makeObligation(overrides: Partial<Parameters<typeof FinancialObligation.create>[0]> = {}) {
  return FinancialObligation.create({
    source: "manual",
    supplierName: "Fornecedor A",
    description: "Renda mensal",
    amountCents: 50000,
    dueDate: new Date("2026-08-15"),
    ...overrides,
  });
}

describe("ListObligationsUseCase", () => {
  let repo: FakeObligationRepository;
  let useCase: ListObligationsUseCase;

  beforeEach(() => {
    repo = new FakeObligationRepository();
    useCase = new ListObligationsUseCase(repo);
  });

  it("retorna lista vazia quando não há obrigações", async () => {
    const result = await useCase.execute();
    expect(result).toEqual([]);
  });

  it("retorna todas as obrigações ordenadas por due_date", async () => {
    const o1 = makeObligation({ dueDate: new Date("2026-08-20") });
    const o2 = makeObligation({ dueDate: new Date("2026-08-10") });
    await repo.save(o1);
    await repo.save(o2);

    const result = await useCase.execute();
    expect(result).toHaveLength(2);
    expect(result[0].dueDate).toBe("2026-08-10");
    expect(result[1].dueDate).toBe("2026-08-20");
  });

  it("filtra por período (from/to)", async () => {
    const o1 = makeObligation({ dueDate: new Date("2026-07-01") });
    const o2 = makeObligation({ dueDate: new Date("2026-08-15") });
    const o3 = makeObligation({ dueDate: new Date("2026-09-01") });
    await repo.save(o1);
    await repo.save(o2);
    await repo.save(o3);

    const result = await useCase.execute({ from: "2026-08-01", to: "2026-08-31" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(o2.id);
  });

  it("filtra por source", async () => {
    const manual = makeObligation({ source: "manual" });
    const recurrence = makeObligation({ source: "recurrence" });
    await repo.save(manual);
    await repo.save(recurrence);

    const result = await useCase.execute({ source: "manual" });
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("manual");
  });

  it("filtra por status", async () => {
    const pending = makeObligation();
    const anotherObligation = makeObligation(); // id diferente
    const paid = anotherObligation.markPaid(new Date());
    await repo.save(pending);
    await repo.save(paid);

    const result = await useCase.execute({ status: "pending" });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("pending");
  });

  it("mapeia para DTO com amountCents e datas como string", async () => {
    await repo.save(makeObligation());

    const result = await useCase.execute();
    expect(result[0].amountCents).toBe(50000);
    expect(result[0].dueDate).toBe("2026-08-15");
    expect(result[0].paidAt).toBeNull();
    expect(result[0].source).toBe("manual");
  });
});
