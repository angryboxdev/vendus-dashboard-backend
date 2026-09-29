import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetBaseScheduleUseCase } from "../../application/use-cases/get-base-schedule.use-case.js";
import { UpsertBaseScheduleCellUseCase } from "../../application/use-cases/upsert-base-schedule-cell.use-case.js";
import { FakeBaseScheduleRepository } from "../fakes/fake-base-schedule-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

describe("GetBaseScheduleUseCase / UpsertBaseScheduleCellUseCase", () => {
  it("cria uma célula de dia de trabalho e devolve-a na leitura", async () => {
    const repo = new FakeBaseScheduleRepository();
    const auditLog = new FakeHrAuditLog();
    const upsert = new UpsertBaseScheduleCellUseCase(repo, auditLog);
    const get = new GetBaseScheduleUseCase(repo);

    await upsert.execute({
      organizationId: ORG,
      actor: "manager",
      employeeId: "emp-1",
      weekday: 0,
      isDayOff: false,
      startTime: "08:00",
      endTime: "17:00",
      locationId: "loc-1",
    });

    const cells = await get.execute({ organizationId: ORG, employeeId: "emp-1" });
    expect(cells).toHaveLength(1);
    expect(cells[0]!.startTime).toBe("08:00");
  });

  it("cria uma célula de folga sem horário", async () => {
    const repo = new FakeBaseScheduleRepository();
    const auditLog = new FakeHrAuditLog();
    const upsert = new UpsertBaseScheduleCellUseCase(repo, auditLog);

    const cell = await upsert.execute({ organizationId: ORG, actor: "manager", employeeId: "emp-1", weekday: 6, isDayOff: true });

    expect(cell.isDayOff).toBe(true);
    expect(cell.startTime).toBeNull();
  });

  it("upsert substitui a célula existente do mesmo dia da semana", async () => {
    const repo = new FakeBaseScheduleRepository();
    const auditLog = new FakeHrAuditLog();
    const upsert = new UpsertBaseScheduleCellUseCase(repo, auditLog);
    const get = new GetBaseScheduleUseCase(repo);

    await upsert.execute({ organizationId: ORG, actor: "manager", employeeId: "emp-1", weekday: 0, isDayOff: false, startTime: "08:00", endTime: "17:00", locationId: "loc-1" });
    await upsert.execute({ organizationId: ORG, actor: "manager", employeeId: "emp-1", weekday: 0, isDayOff: true });

    const cells = await get.execute({ organizationId: ORG, employeeId: "emp-1" });
    expect(cells).toHaveLength(1);
    expect(cells[0]!.isDayOff).toBe(true);
  });
});
