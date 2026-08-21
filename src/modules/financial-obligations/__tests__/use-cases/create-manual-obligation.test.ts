import { describe, it, expect, beforeEach } from "@jest/globals";
import { CreateManualObligationUseCase } from "../../application/use-cases/create-manual-obligation.use-case.js";
import { FakeObligationRepository } from "../fakes/fake-obligation-repository.js";

describe("CreateManualObligationUseCase", () => {
  let repo: FakeObligationRepository;
  let useCase: CreateManualObligationUseCase;

  beforeEach(() => {
    repo = new FakeObligationRepository();
    useCase = new CreateManualObligationUseCase(repo);
  });

  it("cria obrigação manual e devolve DTO", async () => {
    const result = await useCase.execute({
      supplierName: "Água e Luz",
      description: "Fatura água agosto",
      amountCents: 8750,
      dueDate: "2026-08-20",
    });

    expect(result.id).toBeDefined();
    expect(result.source).toBe("manual");
    expect(result.supplierName).toBe("Água e Luz");
    expect(result.description).toBe("Fatura água agosto");
    expect(result.amountCents).toBe(8750);
    expect(result.dueDate).toBe("2026-08-20");
    expect(result.status).toBe("pending");
    expect(result.paidAt).toBeNull();
  });

  it("persiste a obrigação no repositório", async () => {
    const result = await useCase.execute({
      supplierName: "Renda",
      description: "Renda setembro",
      amountCents: 120000,
      dueDate: "2026-09-01",
    });

    const found = await repo.findById(result.id);
    expect(found).not.toBeNull();
    expect(found!.amountCents).toBe(120000);
  });

  it("define costCenterId e paymentMethod quando fornecidos", async () => {
    const result = await useCase.execute({
      supplierName: "Fornecedor",
      description: "Despesa",
      amountCents: 5000,
      dueDate: "2026-08-25",
      costCenterId: "cc-uuid-1",
      paymentMethod: "transfer",
    });

    expect(result.costCenterId).toBe("cc-uuid-1");
    expect(result.paymentMethod).toBe("transfer");
  });

  it("rejeita amount zero ou negativo", async () => {
    await expect(
      useCase.execute({
        supplierName: "X",
        description: "Desc",
        amountCents: 0,
        dueDate: "2026-08-01",
      }),
    ).rejects.toThrow("Amount must be greater than zero");
  });

  it("rejeita description vazia", async () => {
    await expect(
      useCase.execute({
        supplierName: "X",
        description: "  ",
        amountCents: 1000,
        dueDate: "2026-08-01",
      }),
    ).rejects.toThrow("Description is required");
  });
});
