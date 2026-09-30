import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ListSupplierDeliverySchedulesUseCase } from "../../application/use-cases/list-supplier-delivery-schedules.use-case.js";
import { UpsertSupplierDeliveryScheduleUseCase } from "../../application/use-cases/upsert-supplier-delivery-schedule.use-case.js";
import { FakeSupplierDeliveryScheduleRepository } from "../fakes/fake-supplier-delivery-schedule-repository.js";

const ORG = mintOrganizationId("org-test");

describe("UpsertSupplierDeliveryScheduleUseCase", () => {
  it("cria um novo calendário quando não existe nenhum para o par fornecedor×loja", async () => {
    const repository = new FakeSupplierDeliveryScheduleRepository();
    const useCase = new UpsertSupplierDeliveryScheduleUseCase(repository);

    const dto = await useCase.execute({
      organizationId: ORG,
      supplierId: "sup-1",
      locationId: "loc-1",
      weekdays: [2, 5],
      cutoffTime: "12:00",
    });

    expect(dto.weekdays).toEqual([2, 5]);
    expect(dto.active).toBe(true);
    expect(repository.schedules.size).toBe(1);
  });

  it("atualiza o calendário existente em vez de criar um segundo, para o mesmo par", async () => {
    const repository = new FakeSupplierDeliveryScheduleRepository();
    const useCase = new UpsertSupplierDeliveryScheduleUseCase(repository);

    await useCase.execute({ organizationId: ORG, supplierId: "sup-1", locationId: "loc-1", weekdays: [1] });
    await useCase.execute({ organizationId: ORG, supplierId: "sup-1", locationId: "loc-1", weekdays: [1, 3], active: false });

    expect(repository.schedules.size).toBe(1);
    const [schedule] = [...repository.schedules.values()];
    expect(schedule?.toProps().weekdays).toEqual([1, 3]);
    expect(schedule?.toProps().active).toBe(false);
  });

  it("rejeita dias da semana inválidos", async () => {
    const repository = new FakeSupplierDeliveryScheduleRepository();
    const useCase = new UpsertSupplierDeliveryScheduleUseCase(repository);
    await expect(
      useCase.execute({ organizationId: ORG, supplierId: "sup-1", locationId: "loc-1", weekdays: [0, 9] }),
    ).rejects.toThrow();
  });
});

describe("ListSupplierDeliverySchedulesUseCase", () => {
  it("lista todos os calendários de um fornecedor, em todas as lojas", async () => {
    const repository = new FakeSupplierDeliveryScheduleRepository();
    const upsert = new UpsertSupplierDeliveryScheduleUseCase(repository);
    await upsert.execute({ organizationId: ORG, supplierId: "sup-1", locationId: "loc-1", weekdays: [2] });
    await upsert.execute({ organizationId: ORG, supplierId: "sup-1", locationId: "loc-2", weekdays: [4] });
    await upsert.execute({ organizationId: ORG, supplierId: "sup-2", locationId: "loc-1", weekdays: [1] });

    const listUseCase = new ListSupplierDeliverySchedulesUseCase(repository);
    const result = await listUseCase.execute({ organizationId: ORG, supplierId: "sup-1" });

    expect(result).toHaveLength(2);
  });
});
