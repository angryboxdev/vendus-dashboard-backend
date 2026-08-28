import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateSupplierUseCase } from "../../application/use-cases/create-supplier.use-case.js";
import { UpdateSupplierUseCase } from "../../application/use-cases/update-supplier.use-case.js";
import { FakeSupplierRepository } from "../fakes/fake-supplier-repository.js";
import { SupplierNotFoundError } from "../../domain/errors.js";

const ORG_ID = mintOrganizationId("org-test");

describe("UpdateSupplierUseCase", () => {
  let repo: FakeSupplierRepository;
  let create: CreateSupplierUseCase;
  let update: UpdateSupplierUseCase;

  beforeEach(() => {
    repo = new FakeSupplierRepository();
    create = new CreateSupplierUseCase(repo);
    update = new UpdateSupplierUseCase(repo);
  });

  it("actualiza o nome do fornecedor", async () => {
    const created = await create.execute({ organizationId: ORG_ID, name: "Makro Portugal" });

    const result = await update.execute({
      organizationId: ORG_ID,
      id: created.id,
      data: { name: "Makro Lda" },
    });
    expect(result.name).toBe("Makro Lda");
  });

  it("actualiza campos opcionais", async () => {
    const created = await create.execute({ organizationId: ORG_ID, name: "EDP" });

    const result = await update.execute({
      organizationId: ORG_ID,
      id: created.id,
      data: {
        nif: "500697256",
        email: "faturas@edp.pt",
        paymentTermsDays: 30,
        iban: "PT50000201231234567890154",
      },
    });
    expect(result.nif).toBe("500697256");
    expect(result.email).toBe("faturas@edp.pt");
    expect(result.paymentTermsDays).toBe(30);
    expect(result.iban).toBe("PT50000201231234567890154");
  });

  it("persiste a alteração no repositório", async () => {
    const created = await create.execute({ organizationId: ORG_ID, name: "Britos" });

    await update.execute({ organizationId: ORG_ID, id: created.id, data: { name: "Britos & Filhos" } });

    const saved = await repo.findById(ORG_ID, created.id);
    expect(saved!.name).toBe("Britos & Filhos");
  });

  it("lança SupplierNotFoundError para id inexistente", async () => {
    await expect(
      update.execute({ organizationId: ORG_ID, id: "nao-existe", data: { name: "X" } }),
    ).rejects.toThrow(SupplierNotFoundError);
  });
});
