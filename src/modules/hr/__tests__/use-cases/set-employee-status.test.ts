import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { SetEmployeeStatusUseCase } from "../../application/use-cases/set-employee-status.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

describe("SetEmployeeStatusUseCase", () => {
  it("desativa e define endedAt", async () => {
    const employees = new FakeEmployeeRepository();
    const auditLog = new FakeHrAuditLog();
    const e = Employee.create({ fullName: "Andres Silva" });
    employees.seed(ORG, e);

    const useCase = new SetEmployeeStatusUseCase(employees, auditLog);
    const result = await useCase.execute({ organizationId: ORG, actor: "a@b.com", id: e.id, status: "inactive" });

    expect(result.status).toBe("inactive");
    expect(result.endedAt).not.toBeNull();
    expect(auditLog.entries[0]!.action).toBe("employee_status_changed");
  });

  it("reativa sem apagar endedAt", async () => {
    const employees = new FakeEmployeeRepository();
    const auditLog = new FakeHrAuditLog();
    const e = Employee.create({ fullName: "Andres Silva" }).deactivate();
    employees.seed(ORG, e);

    const useCase = new SetEmployeeStatusUseCase(employees, auditLog);
    const result = await useCase.execute({ organizationId: ORG, actor: "a@b.com", id: e.id, status: "active" });

    expect(result.status).toBe("active");
    expect(result.endedAt).toBe(e.endedAt);
  });
});
