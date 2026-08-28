import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";

const organizationId = mintOrganizationId("org-a");

const BASE_CMD = {
  organizationId,
  name: "Renda da loja",
  supplierName: "Proprietário Lda",
  type: "fixed_contract" as const,
  estimatedAmountCents: 120000,
  dayOfMonth: 5,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

describe("CreateRecurrenceUseCase", () => {
  function make() {
    const repo = new FakeRecurrenceRepository();
    const useCase = new CreateRecurrenceUseCase(repo);
    return { repo, useCase };
  }

  it("persiste e retorna a recorrência criada", async () => {
    const { repo, useCase } = make();
    const dto = await useCase.execute(BASE_CMD);

    expect(dto.status).toBe("active");
    expect(dto.name).toBe("Renda da loja");
    expect(dto.type).toBe("fixed_contract");
    expect(dto.requireInvoice).toBe(false);

    const saved = await repo.findById(organizationId, dto.id);
    expect(saved).not.toBeNull();
  });

  it("retorna datas em formato string YYYY-MM-DD", async () => {
    const { useCase } = make();
    const dto = await useCase.execute(BASE_CMD);
    expect(dto.startDate).toBe("2026-01-01");
    expect(dto.endDate).toBeNull();
  });

  it("propaga erro de domínio sem persistir", async () => {
    const { repo, useCase } = make();
    await expect(useCase.execute({ ...BASE_CMD, name: "" })).rejects.toThrow("Recurrence name is required");
    expect(await repo.findAll(organizationId)).toHaveLength(0);
  });

  it("força requireInvoice=true para variable_invoice", async () => {
    const { useCase } = make();
    const dto = await useCase.execute({ ...BASE_CMD, type: "variable_invoice" });
    expect(dto.requireInvoice).toBe(true);
    expect(dto.autoCreatePayable).toBe(false);
  });
});
