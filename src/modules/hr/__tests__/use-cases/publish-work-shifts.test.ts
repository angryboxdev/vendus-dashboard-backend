import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { PublishWorkShiftsUseCase } from "../../application/use-cases/publish-work-shifts.use-case.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

describe("PublishWorkShiftsUseCase", () => {
  it("publica em lote só os que ainda estão em rascunho", async () => {
    const workShifts = new FakeWorkShiftRepository();
    const employees = new FakeEmployeeRepository();
    const auditLog = new FakeHrAuditLog();
    const useCase = new PublishWorkShiftsUseCase(workShifts, employees, auditLog);
    const employee = Employee.create({ fullName: "Andres Silva" });
    employees.seed(ORG, employee);

    const draft = WorkShift.create({
      employeeId: employee.id,
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });
    const alreadyPublished = WorkShift.create({
      employeeId: employee.id,
      workDate: "2026-08-11",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
      status: "published",
    });
    workShifts.seed(ORG, draft);
    workShifts.seed(ORG, alreadyPublished);

    const result = await useCase.execute({ organizationId: ORG, actor: "manager", ids: [draft.id, alreadyPublished.id, "inexistente"] });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(draft.id);
    expect(result[0]!.status).toBe("published");
    expect(auditLog.entries).toHaveLength(1);
  });
});
