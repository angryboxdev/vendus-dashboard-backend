import { CreateSupplierUseCase } from "../../application/use-cases/create-supplier.use-case.js";
import { ToggleSupplierStatusUseCase } from "../../application/use-cases/toggle-supplier-status.use-case.js";
import { FakeSupplierRepository } from "../fakes/fake-supplier-repository.js";
import { SupplierNotFoundError } from "../../domain/errors.js";

describe("ToggleSupplierStatusUseCase", () => {
  let repo: FakeSupplierRepository;
  let create: CreateSupplierUseCase;
  let toggle: ToggleSupplierStatusUseCase;

  beforeEach(() => {
    repo = new FakeSupplierRepository();
    create = new CreateSupplierUseCase(repo);
    toggle = new ToggleSupplierStatusUseCase(repo);
  });

  it("desactiva um fornecedor activo", async () => {
    const created = await create.execute({ name: "Makro" });

    const result = await toggle.execute({ id: created.id, status: "inactive" });
    expect(result.status).toBe("inactive");
  });

  it("reactiva um fornecedor inactivo", async () => {
    const created = await create.execute({ name: "Makro" });
    await toggle.execute({ id: created.id, status: "inactive" });

    const result = await toggle.execute({ id: created.id, status: "active" });
    expect(result.status).toBe("active");
  });

  it("persiste o novo estado no repositório", async () => {
    const created = await create.execute({ name: "EDP" });

    await toggle.execute({ id: created.id, status: "inactive" });

    const saved = await repo.findById(created.id);
    expect(saved!.status).toBe("inactive");
  });

  it("lança SupplierNotFoundError para id inexistente", async () => {
    await expect(
      toggle.execute({ id: "nao-existe", status: "inactive" }),
    ).rejects.toThrow(SupplierNotFoundError);
  });
});
