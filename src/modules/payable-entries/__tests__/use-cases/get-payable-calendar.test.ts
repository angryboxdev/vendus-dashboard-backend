import { CreatePayableEntryUseCase } from "../../application/use-cases/create-payable-entry.use-case.js";
import { GetPayableCalendarUseCase } from "../../application/use-cases/get-payable-calendar.use-case.js";
import { FakePayableEntryRepository } from "../fakes/fake-payable-entry-repository.js";

describe("GetPayableCalendarUseCase", () => {
  it("groups entries by day within range", async () => {
    const repo = new FakePayableEntryRepository();
    const create = new CreatePayableEntryUseCase(repo);

    await create.execute({ supplierName: "A", description: "D", amount: 5000, dueDate: "2026-07-10" });
    await create.execute({ supplierName: "B", description: "D", amount: 3000, dueDate: "2026-07-10" });
    await create.execute({ supplierName: "C", description: "D", amount: 8000, dueDate: "2026-07-20" });
    await create.execute({ supplierName: "D", description: "D", amount: 9000, dueDate: "2026-08-01" }); // outside range

    const uc = new GetPayableCalendarUseCase(repo);
    const days = await uc.execute({ from: "2026-07-01", to: "2026-07-31" });

    expect(days).toHaveLength(2);
    expect(days[0].date).toBe("2026-07-10");
    expect(days[0].totalAmount).toBe(8000);
    expect(days[0].entries).toHaveLength(2);
    expect(days[1].date).toBe("2026-07-20");
    expect(days[1].totalAmount).toBe(8000);
  });
});
