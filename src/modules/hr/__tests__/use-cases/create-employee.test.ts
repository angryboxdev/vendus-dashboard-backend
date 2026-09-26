import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateEmployeeUseCase } from "../../application/use-cases/create-employee.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

describe("CreateEmployeeUseCase", () => {
  it("cria o colaborador e regista auditoria com actor real (corrige a lacuna do legacy)", async () => {
    const employees = new FakeEmployeeRepository();
    const auditLog = new FakeHrAuditLog();
    const useCase = new CreateEmployeeUseCase(employees, auditLog);

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "gerencia@fonsat.pt",
      fullName: "Andres Silva",
    });

    expect(result.fullName).toBe("Andres Silva");
    expect(await employees.findById(ORG, result.id)).not.toBeNull();
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]!.actor).toBe("gerencia@fonsat.pt");
    expect(auditLog.entries[0]!.action).toBe("employee_created");
  });
});
