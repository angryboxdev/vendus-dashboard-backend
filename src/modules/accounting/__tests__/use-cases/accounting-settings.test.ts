import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetAccountingSettingsUseCase } from "../../application/use-cases/get-accounting-settings.use-case.js";
import { UpdateAccountingSettingsUseCase } from "../../application/use-cases/update-accounting-settings.use-case.js";
import { InvalidVatPeriodicityError } from "../../domain/errors.js";
import { FakeAccountingSettingsRepository } from "../fakes/fake-accounting-settings-repository.js";

const ORG = mintOrganizationId("org-test");

describe("GetAccountingSettingsUseCase", () => {
  it("por omissão devolve periodicidade trimestral", async () => {
    const repository = new FakeAccountingSettingsRepository();
    const useCase = new GetAccountingSettingsUseCase(repository);
    expect(await useCase.execute({ organizationId: ORG })).toEqual({ vatPeriodicity: "quarterly" });
  });
});

describe("UpdateAccountingSettingsUseCase", () => {
  it("guarda a nova periodicidade", async () => {
    const repository = new FakeAccountingSettingsRepository();
    const useCase = new UpdateAccountingSettingsUseCase(repository);
    const dto = await useCase.execute({ organizationId: ORG, vatPeriodicity: "monthly" });
    expect(dto.vatPeriodicity).toBe("monthly");
    expect(await repository.get(ORG)).toEqual({ vatPeriodicity: "monthly" });
  });

  it("rejeita uma periodicidade inválida", async () => {
    const repository = new FakeAccountingSettingsRepository();
    const useCase = new UpdateAccountingSettingsUseCase(repository);
    await expect(useCase.execute({ organizationId: ORG, vatPeriodicity: "yearly" })).rejects.toThrow(InvalidVatPeriodicityError);
  });
});
