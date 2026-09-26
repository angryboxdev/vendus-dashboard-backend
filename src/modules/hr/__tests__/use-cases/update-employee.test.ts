import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { UpdateEmployeeUseCase } from "../../application/use-cases/update-employee.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { EmployeeNotFoundError } from "../../domain/errors.js";

const ORG = mintOrganizationId("org-test");

describe("UpdateEmployeeUseCase", () => {
  it("lança EmployeeNotFoundError para id inexistente", async () => {
    const useCase = new UpdateEmployeeUseCase(new FakeEmployeeRepository(), new FakeHrAuditLog());
    await expect(
      useCase.execute({ organizationId: ORG, actor: "a@b.com", id: "x", data: {} }),
    ).rejects.toThrow(EmployeeNotFoundError);
  });

  it("atualiza e regista before/after na auditoria", async () => {
    const employees = new FakeEmployeeRepository();
    const auditLog = new FakeHrAuditLog();
    const e = Employee.create({ fullName: "Andres Silva", phone: "919000000" });
    employees.seed(ORG, e);

    const useCase = new UpdateEmployeeUseCase(employees, auditLog);
    const result = await useCase.execute({
      organizationId: ORG,
      actor: "gerencia@fonsat.pt",
      id: e.id,
      data: { phone: "919123456" },
    });

    expect(result.phone).toBe("919123456");
    expect(auditLog.entries[0]!.before).toMatchObject({ phone: "919000000" });
    expect(auditLog.entries[0]!.after).toMatchObject({ phone: "919123456" });
  });
});
