import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetEmployeeHistoryUseCase } from "../../application/use-cases/get-employee-history.use-case.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

describe("GetEmployeeHistoryUseCase", () => {
  it("devolve entradas de auditoria do colaborador, paginadas", async () => {
    const auditLog = new FakeHrAuditLog();
    await auditLog.record({
      organizationId: ORG,
      actor: "rh@angrybox.com",
      entityType: "employee",
      entityId: "e1",
      employeeId: "e1",
      action: "employee_created",
      description: "Colaborador criado",
      correlationId: "c1",
    });
    await auditLog.record({
      organizationId: ORG,
      actor: "rh@angrybox.com",
      entityType: "employee_document",
      entityId: "d1",
      employeeId: "e1",
      action: "document_created",
      description: "Documento enviado",
      correlationId: "c2",
    });

    const useCase = new GetEmployeeHistoryUseCase(auditLog);
    const result = await useCase.execute({ organizationId: ORG, id: "e1", page: 1, pageSize: 10 });

    expect(result.total).toBe(2);
    expect(result.items[0]!.action).toBe("document_created"); // mais recente primeiro
    expect(result.items[0]!.actor).toBe("rh@angrybox.com");
  });
});
