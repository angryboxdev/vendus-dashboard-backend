import { CreatePayableEntryUseCase } from "../../application/use-cases/create-payable-entry.use-case.js";
import { ListPayableEntriesUseCase } from "../../application/use-cases/list-payable-entries.use-case.js";
import { FakePayableEntryRepository } from "../fakes/fake-payable-entry-repository.js";

describe("ListPayableEntriesUseCase", () => {
  async function setup() {
    const repo = new FakePayableEntryRepository();
    const create = new CreatePayableEntryUseCase(repo);
    await create.execute({ supplierName: "EDP", description: "Eletricidade", amount: 10000, dueDate: "2026-07-10", supplierId: "s1" });
    await create.execute({ supplierName: "NOS", description: "Internet", amount: 5000, dueDate: "2026-07-20", supplierId: "s2" });
    return { repo, list: new ListPayableEntriesUseCase(repo) };
  }

  it("returns all entries with no filter", async () => {
    const { list } = await setup();
    const result = await list.execute();
    expect(result).toHaveLength(2);
  });

  it("filters by supplierId", async () => {
    const { list } = await setup();
    const result = await list.execute({ supplierId: "s1" });
    expect(result).toHaveLength(1);
    expect(result[0].supplierName).toBe("EDP");
  });

  it("filters by date range", async () => {
    const { list } = await setup();
    const result = await list.execute({ from: "2026-07-15", to: "2026-07-31" });
    expect(result).toHaveLength(1);
    expect(result[0].supplierName).toBe("NOS");
  });
});
